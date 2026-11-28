// Renders every look in data/looks/*.json to out/<id>.mp4
// Usage:  npm run render            (all looks)
//         npm run render -- office-day1   (one look by id)
import { bundle } from "@remotion/bundler";
import { renderMedia, renderStill, selectComposition } from "@remotion/renderer";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const looksDir = path.join(root, "data", "looks");
const publicDir = path.join(root, "public");
const outDir = path.join(root, "out");
fs.mkdirSync(outDir, { recursive: true });

const only = process.argv[2];
// Optional: use an installed Chrome instead of letting Remotion download one
const browserExecutable = process.env.BROWSER_EXECUTABLE || null;
const files = fs
  .readdirSync(looksDir)
  .filter((f) => f.endsWith(".json"))
  .filter((f) => !only || f === `${only}.json`);

if (files.length === 0) {
  console.error(only ? `No look called ${only}.json in data/looks` : "No looks in data/looks");
  process.exit(1);
}

// Catch mistakes before spending time rendering
function check(look, file) {
  const problems = [];
  for (const key of ["id", "hook", "cta"]) if (!look[key]) problems.push(`missing "${key}"`);
  if (!Array.isArray(look.items) || look.items.length < 1) problems.push("needs at least 1 item");
  if (look.fitImages && !Array.isArray(look.fitImages)) problems.push('"fitImages" must be a list');
  const images = [...(look.fitImages || []), ...(look.items || []).map((i) => i.image)];
  for (const img of images) {
    if (!img || !fs.existsSync(path.join(publicDir, img))) problems.push(`image not found in public/: ${img}`);
  }
  for (const it of look.items || []) if (typeof it.price !== "number") problems.push(`price must be a number: ${it.name}`);
  if (problems.length) {
    console.error(`\n✗ ${file} is not ready:\n  - ${problems.join("\n  - ")}\n  (run "npm run status" to see what each look needs)`);
    return false;
  }
  return true;
}

// Caption file ready to paste into Instagram/Pinterest, with disclosure and AI label included
function writeCaption(look) {
  const tags = (look.hashtags || []).map((h) => "#" + h).join(" ");
  const total = look.items.reduce((s, i) => s + i.price, 0);
  const finds = look.kind && look.kind !== "outfit";
  const checked = new Date(look.pricesCheckedAt || Date.now()).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });
  const lines = [
    look.caption || look.hook,
    "",
    ...look.items.map((i, n) => `${finds ? `${n + 1}.` : "•"} ${i.name} – ₹${i.price.toLocaleString("en-IN")}${i.wasPrice ? ` (was ₹${i.wasPrice.toLocaleString("en-IN")} on ${i.wasDate})` : ""} (${i.store})`),
    look.kind === "steal" ? `Full look: ₹${total.toLocaleString("en-IN")} · prices checked ${checked}` : finds ? `Prices checked ${checked}; they can change.` : `Total: ₹${total.toLocaleString("en-IN")}`,
    "",
    look.cta,
    "🔔 Daily price drops & new finds on Telegram: t.me/wellpricedfit (link in bio)",
    "",
    "#affiliate · I may earn a small commission from these links.",
    ...((look.fitImages || []).length ? ["Images created using AI. Products are real."] : []),
    tags,
  ];
  const dest = path.join(outDir, `${look.id}.caption.txt`);
  fs.writeFileSync(dest, lines.join("\n").trim() + "\n");
  console.log(`✓ ${dest}`);
}

console.log("Bundling…");
const serveUrl = await bundle({ entryPoint: path.join(root, "src", "index.ts"), publicDir });

// Background music: drop royalty-free tracks (licensed for commercial social use) into public/music/.
// Each reel gets one, picked from its id so re-renders keep the same track.
const tracks = fs.existsSync(path.join(publicDir, "music")) ? fs.readdirSync(path.join(publicDir, "music")).filter((f) => /\.(mp3|m4a|wav)$/i.test(f)).sort() : [];
// the learning loop picks the track (better-scoring tracks more often, new ones still tried)
const { pickVariant } = await import("./lib/strategy.mjs");
const pickTrack = () => (tracks.length ? `music/${pickVariant("music", tracks)}` : undefined);

for (const file of files) {
  const look = JSON.parse(fs.readFileSync(path.join(looksDir, file), "utf8"));
  if (!look.music && tracks.length && look.kind && look.kind !== "outfit") look.music = pickTrack();
  if (!check(look, file)) continue;
  const composition = await selectComposition({ serveUrl, id: "Reel", inputProps: look, browserExecutable });
  const outputLocation = path.join(outDir, `${look.id}.mp4`);
  console.log(`Rendering ${look.id} (${(composition.durationInFrames / composition.fps).toFixed(1)}s)…`);
  await renderMedia({
    composition,
    serveUrl,
    codec: "h264",
    inputProps: look,
    outputLocation,
    browserExecutable,
    onProgress: ({ progress }) => process.stdout.write(`\r  ${Math.round(progress * 100)}%`),
  });
  console.log(`\n✓ ${outputLocation}`);
  // cover image for Pinterest: the last frames show every piece and the total
  const coverFrame = Math.max(0, composition.durationInFrames - 20);
  try {
    await renderStill({ composition, serveUrl, inputProps: look, output: path.join(outDir, `${look.id}.cover.jpg`), frame: coverFrame, imageFormat: "jpeg", browserExecutable });
    look.coverSeconds = Number((coverFrame / composition.fps).toFixed(2));
    fs.writeFileSync(path.join(looksDir, file), JSON.stringify(look, null, 2));
  } catch (e) {
    console.log(`  (cover image skipped: ${e.message.split("\n")[0]})`);
  }
  // visual quality check: hook, first product, end grid; failed reels are never posted
  if (look.kind && look.kind !== "outfit") {
    try {
      const { qcReel } = await import("./lib/qc.mjs");
      const f = (sec) => Math.round(sec * composition.fps);
      const frames = [
        [f(1.0), path.join(outDir, `${look.id}.qc-hook.jpg`)],
        [f(1.7 + (look.kind === "guess" ? 2.2 : 1.4)), path.join(outDir, `${look.id}.qc-card.jpg`)],
      ];
      for (const [frame, output] of frames) await renderStill({ composition, serveUrl, inputProps: look, output, frame, imageFormat: "jpeg", jpegQuality: 70, browserExecutable });
      const qc = await qcReel(look, [...frames.map(([, o]) => o), path.join(outDir, `${look.id}.cover.jpg`)]);
      look.qc = { ...qc, at: new Date().toISOString() };
      fs.writeFileSync(path.join(looksDir, file), JSON.stringify(look, null, 2));
      fs.mkdirSync(path.join(root, "data", "learning"), { recursive: true });
      fs.appendFileSync(path.join(root, "data", "learning", "qc.jsonl"), JSON.stringify({ id: look.id, kind: look.kind, type: look.type, ...look.qc }) + "\n");
      console.log(`  QC ${qc.pass ? "passed" : "FAILED"}${qc.score ? ` (${qc.score}/10)` : ""}${qc.issues?.length ? ": " + qc.issues.join("; ") : ""}`);
    } catch (e) {
      console.log(`  (QC skipped: ${e.message.split("\n")[0]})`);
    }
  }
  writeCaption(look);
}
