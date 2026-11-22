// npm run auto -- 7
// Autopilot: for the next N ideas in data/ideas.txt
//   plan (Gemini) → find real products (Gemini + Google Search) → pick the best checked option
//   → quality checks → render reel + caption → write a review report.
// Looks that fail a quality check are NOT rendered; the report says why.
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { paths } from "./lib/env.mjs";
import { planLook } from "./lib/plan.mjs";
import { findProducts } from "./find.mjs";
import { pickProducts } from "./pick.mjs";
import { missing } from "./lib/next-steps.mjs";

const n = Number(process.argv[2] || 7);
const MIN_ITEMS = 3;
const PRICE_DRIFT = 0.4; // an item may cost up to 40% more or less than planned
const BUDGET_OVER = 0.3; // the whole look may go up to 30% over budget

const lines = fs.existsSync(paths.ideas) ? fs.readFileSync(paths.ideas, "utf8").split(/\r?\n/) : [];
const ideas = lines.map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
if (ideas.length === 0) {
  console.log("No ideas left in data/ideas.txt. Add lines like: Delhi winter date | 5000");
  process.exitCode = 1;
} else {
  const doneFile = path.join(path.dirname(paths.ideas), "ideas-done.txt");
  const results = [];
  let used = 0;

  for (const line of ideas.slice(0, n)) {
    const [occasion, budgetRaw = "4000"] = line.split("|").map((s) => s.trim());
    const budget = Number(budgetRaw.replace(/[^\d]/g, "")) || 4000;
    console.log(`\n=== ${occasion} (₹${budget}) ===`);
    let id;
    try {
      const look = await planLook(occasion, budget);
      id = look.id;
      used++;
      fs.appendFileSync(doneFile, `${line}  ->  ${id}\n`);
      await findProducts(id);
      await pickProducts(id, ["auto"]);
      results.push(qualityCheck(id));
    } catch (e) {
      console.log(`✗ stopped: ${e.message}`);
      if (id) results.push({ id, occasion, ok: false, flags: [`error: ${e.message.split("\n")[0]}`], look: readLook(id) });
      break; // API limits or errors: stop so the remaining ideas stay in the queue
    }
  }

  // remove used ideas from the queue
  const remaining = ideas.slice(used);
  fs.writeFileSync(paths.ideas, remaining.join("\n") + (remaining.length ? "\n" : ""));

  // render every look that passed and has no video yet
  const passed = results.filter((r) => r.ok).map((r) => r.id);
  if (passed.length) {
    console.log(`\nRendering ${passed.length} reel(s)…`);
    for (const id of passed) {
      spawnSync(process.execPath, [path.join(paths.root, "scripts", "render-all.mjs"), id], { stdio: "inherit", env: process.env });
    }
  }

  const report = writeReport(results, remaining.length);
  console.log(`\n${passed.length}/${results.length} reels made. Review: ${report}`);
}

function readLook(id) {
  return JSON.parse(fs.readFileSync(path.join(paths.looks, `${id}.json`), "utf8"));
}

// Decides if a look is good enough to publish without a human, and fixes what it safely can.
function qualityCheck(id) {
  const file = path.join(paths.looks, `${id}.json`);
  const look = readLook(id);
  const flags = [];

  // drop items with no usable product, as long as enough items remain
  const exists = (it) => fs.existsSync(path.join(paths.public, it.image));
  const good = look.items.filter(exists);
  const dropped = look.items.filter((it) => !exists(it));
  if (dropped.length && good.length >= MIN_ITEMS) {
    look.items = good;
    flags.push(`dropped ${dropped.map((d) => d.name).join(", ")} (no real product found)`);
  }

  for (const it of look.items) {
    const target = it.targetPrice ?? it.price;
    if (target && Math.abs(it.price - target) / target > PRICE_DRIFT) {
      flags.push(`${it.name}: real price ₹${it.price} vs planned ₹${target}`);
    }
  }
  const total = look.items.reduce((s, i) => s + (i.price || 0), 0);
  const overBudget = total > look.budget * (1 + BUDGET_OVER);
  if (overBudget) flags.push(`total ₹${total} is over budget ₹${look.budget}`);

  const stillMissing = missing(look);
  const ok = look.items.length >= MIN_ITEMS && stillMissing.length === 0 && !overBudget;
  if (!ok && stillMissing.length) flags.push(`missing ${stillMissing.length} product photo(s)`);
  if (look.items.length < MIN_ITEMS) flags.push(`only ${look.items.length} items`);

  look.status = ok ? "ready" : "needs-attention";
  look.flags = flags;
  fs.writeFileSync(file, JSON.stringify(look, null, 2) + "\n");
  console.log(ok ? `✓ ${id} passed checks${flags.length ? ` (${flags.length} note(s))` : ""}` : `✗ ${id} needs attention: ${flags.join("; ")}`);
  return { id, occasion: look.occasion, ok, flags, look };
}

function writeReport(results, left) {
  fs.mkdirSync(paths.out, { recursive: true });
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
  const file = path.join(paths.out, `report-${stamp}.md`);
  const rows = [];
  rows.push(`# Autopilot report ${stamp}`, "");
  rows.push(`${results.filter((r) => r.ok).length} of ${results.length} reels made. ${left} ideas left in the queue.`, "");
  rows.push("While the system is new, open each video and check: does every product match its photo and price? Note anything wrong in data/feedback.md.", "");
  for (const r of results) {
    const look = r.look || readLook(r.id);
    const total = look.items.reduce((s, i) => s + (i.price || 0), 0);
    rows.push(`## ${r.ok ? "✅" : "⚠️"} ${look.occasion}  \`${r.id}\``);
    rows.push(`Hook: "${look.hook}" · Total ₹${total.toLocaleString("en-IN")} (budget ₹${look.budget.toLocaleString("en-IN")})`);
    rows.push(r.ok ? `Video: out/${r.id}.mp4 · Caption: out/${r.id}.caption.txt` : "Not rendered.");
    rows.push("", "| Item | Real product | Price | Store | Link |", "| --- | --- | --- | --- | --- |");
    for (const it of look.items) {
      rows.push(`| ${it.name} | ${(it.productTitle || "—").replace(/\|/g, "/")} | ₹${it.price} | ${it.store} | ${it.url ? `[open](${it.url})` : "none"} |`);
    }
    if (r.flags.length) rows.push("", ...r.flags.map((f) => `- ${f}`));
    rows.push("");
  }
  fs.writeFileSync(file, rows.join("\n"));
  return file;
}
