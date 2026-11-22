// Renders every look in data/looks/*.json to out/<id>.mp4
// Usage:  npm run render            (all looks)
//         npm run render -- office-day1   (one look by id)
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
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
  if (!Array.isArray(look.fitImages)) problems.push('"fitImages" must be a list');
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
  const lines = [
    look.caption || look.hook,
    "",
    ...look.items.map((i) => `• ${i.name} – ₹${i.price.toLocaleString("en-IN")} (${i.store})`),
    `Total: ₹${total.toLocaleString("en-IN")}`,
    "",
    look.cta,
    "",
    "#affiliate · I may earn a small commission from these links.",
    "Images created using AI. Products are real.",
    tags,
  ];
  const dest = path.join(outDir, `${look.id}.caption.txt`);
  fs.writeFileSync(dest, lines.join("\n").trim() + "\n");
  console.log(`✓ ${dest}`);
}

console.log("Bundling…");
const serveUrl = await bundle({ entryPoint: path.join(root, "src", "index.ts"), publicDir });

for (const file of files) {
  const look = JSON.parse(fs.readFileSync(path.join(looksDir, file), "utf8"));
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
  writeCaption(look);
}
