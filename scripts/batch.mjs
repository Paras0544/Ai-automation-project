// npm run batch -- 7
// Plans the next N looks from data/ideas.txt (one idea per line: "occasion | budget").
// Used ideas are moved to data/ideas-done.txt so they never repeat.
import fs from "node:fs";
import path from "node:path";
import { paths } from "./lib/env.mjs";
import { planLook } from "./lib/plan.mjs";

const n = Number(process.argv[2] || 7);
const lines = fs.existsSync(paths.ideas) ? fs.readFileSync(paths.ideas, "utf8").split(/\r?\n/) : [];
const ideas = lines.map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
if (ideas.length === 0) {
  console.log("No ideas left in data/ideas.txt. Add lines like: Delhi winter date | 5000");
  process.exit(1);
}

const done = path.join(path.dirname(paths.ideas), "ideas-done.txt");
const take = ideas.slice(0, n);
let planned = 0;

for (const line of take) {
  const [occasion, budget = "4000"] = line.split("|").map((s) => s.trim());
  try {
    const look = await planLook(occasion, budget.replace(/[^\d]/g, "") || "4000");
    console.log(`✓ ${look.id}  (${look.items.length} items, ~₹${look.items.reduce((s, i) => s + i.price, 0)})`);
    fs.appendFileSync(done, `${line}  ->  ${look.id}\n`);
    planned++;
  } catch (e) {
    console.error(`✗ ${occasion}: ${e.message}`);
    break; // stop on API errors so ideas aren't lost
  }
  await new Promise((r) => setTimeout(r, 4000)); // stay well inside free-tier per-minute limits
}

const remaining = ideas.slice(planned);
fs.writeFileSync(paths.ideas, remaining.join("\n") + (remaining.length ? "\n" : ""));
console.log(`\nPlanned ${planned}. ${remaining.length} ideas left. Run "npm run status" to see what each look still needs.`);
