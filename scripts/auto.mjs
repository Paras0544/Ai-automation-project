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
import { refreshCatalog, usableProducts, MIN_CATALOG, readCsv, readCache } from "./lib/catalog.mjs";
import { logRun, syncPush } from "./lib/learning.mjs";
import { pinPending } from "./pin.mjs";

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

  // Keep catalog prices and stock current before building looks from it
  if (readCsv().length) {
    console.log("Checking catalog prices and stock…");
    await refreshCatalog();
    const n2 = usableProducts().length;
    console.log(n2 >= MIN_CATALOG ? `Catalog: ${n2} usable products.` : `Catalog has only ${n2} usable products (need ${MIN_CATALOG}); falling back to web search, which needs paid Gemini.`);
  }
  const results = [];
  let used = 0;

  // 1) Finish looks that were planned before but not completed (e.g. a run stopped on an API error)
  // (web-search looks need paid Gemini; skip resuming them while the catalog is in use)
  const catalogActive = usableProducts().length >= MIN_CATALOG;
  const unfinished = catalogActive ? [] : fs
    .readdirSync(paths.looks)
    .filter((f) => f.endsWith(".json"))
    .map((f) => readLook(f.replace(/\.json$/, "")))
    .filter((l) => l.status === "needs-products" && l.source !== "catalog" && !fs.existsSync(path.join(paths.out, `${l.id}.mp4`)))
    .slice(0, n);
  let stopped = false;
  for (const look of unfinished) {
    console.log(`\n=== Resuming ${look.occasion} (₹${look.budget}) ===`);
    try {
      await findProducts(look.id);
      await pickProducts(look.id, ["auto"]);
      results.push(qualityCheck(look.id));
    } catch (e) {
      console.log(`✗ stopped: ${e.message}`);
      results.push({ id: look.id, occasion: look.occasion, ok: false, flags: [`error: ${e.message.split("\n")[0]}`], look: readLook(look.id) });
      stopped = true;
      break;
    }
  }

  // 2) Then new ideas, up to N looks in total
  for (const line of stopped ? [] : ideas.slice(0, Math.max(0, n - unfinished.length))) {
    const [occasion, budgetRaw = "4000"] = line.split("|").map((s) => s.trim());
    const budget = Number(budgetRaw.replace(/[^\d]/g, "")) || 4000;
    console.log(`\n=== ${occasion} (₹${budget}) ===`);
    let id;
    try {
      const look = await planLook(occasion, budget);
      id = look.id;
      used++;
      fs.appendFileSync(doneFile, `${line}  ->  ${id}\n`);
      if (look.source !== "catalog") {
        await findProducts(id);
        await pickProducts(id, ["auto"]);
      }
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

  // learning log: one line per look, plus catalog health, for the weekly review
  for (const r of results) {
    const look = r.look || (fs.existsSync(path.join(paths.looks, `${r.id}.json`)) ? readLook(r.id) : null);
    logRun({
      id: r.id,
      occasion: r.occasion || look?.occasion,
      budget: look?.budget,
      ok: r.ok,
      rendered: r.ok && fs.existsSync(path.join(paths.out, `${r.id}.mp4`)),
      flags: r.flags,
      hook: look?.hook,
      total: look?.items?.reduce((s, i) => s + (i.price || 0), 0),
      items: (look?.items || []).map((i) => ({ id: i.catalogId, name: i.name, price: i.price, store: i.store })),
    });
  }
  const cache = Object.values(readCache());
  logRun({
    type: "catalog",
    usable: usableProducts().length,
    total: cache.length,
    outOfStock: cache.filter((c) => c.inStock === false).map((c) => c.url),
    blocked: cache.filter((c) => c.error).map((c) => ({ url: c.url, error: c.error })),
  });

  // Pinterest (only once you've run "npm run pinterest:login")
  let pinnedNow = [];
  const perRun = Number(process.env.PINS_PER_RUN ?? 2);
  if (process.env.PINTEREST_ACCESS_TOKEN && perRun > 0) {
    console.log("\nPosting to Pinterest…");
    pinnedNow = await pinPending(perRun);
  }
  if (pinnedNow.length) logRun({ type: "pinterest", pinned: pinnedNow });

  const report = writeReport(results, remaining.length);
  console.log(`\n${passed.length}/${results.length} reels made. Review: ${report}`);
  console.log('Tell me what you think: npm run feedback -- <look-id> [1-5] "what was off"');
  syncPush(`autopilot run: ${passed.length}/${results.length} reels`);
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
  rows.push("While the system is new, open each video and check: does every product match its photo and price? Note anything off with: npm run feedback -- <look-id> [1-5] \"what was off\"", "");
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
