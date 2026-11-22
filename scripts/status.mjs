// npm run status   — shows every look and what it still needs
// npm run models   — lists Gemini models your key can use (when run with "models")
import fs from "node:fs";
import path from "node:path";
import { paths } from "./lib/env.mjs";
import { missing } from "./lib/next-steps.mjs";
import { listModels, model } from "./lib/gemini.mjs";

if (process.argv[2] === "models") {
  const names = await listModels();
  console.log(`Current GEMINI_MODEL: ${model()}${names.includes(model()) ? "  (available)" : "  (NOT available, pick one below)"}\nAvailable:`);
  for (const n of names) console.log("  " + n);
  // No process.exit() here: exiting while a network handle is closing crashes Node on Windows.
} else {
  showStatus();
}

function showStatus() {
const files = fs.existsSync(paths.looks) ? fs.readdirSync(paths.looks).filter((f) => f.endsWith(".json")) : [];
for (const f of files) {
  const look = JSON.parse(fs.readFileSync(path.join(paths.looks, f), "utf8"));
  const m = missing(look);
  const rendered = fs.existsSync(path.join(paths.out, `${look.id}.mp4`));
  const state = rendered ? "rendered" : m.length ? `needs ${m.filter((x) => x.kind === "product").length} product photo(s), ${m.filter((x) => x.kind === "fit").length} fit image(s)` : "ready to render";
  console.log(`${look.id.padEnd(42)} ${state}`);
}
}
