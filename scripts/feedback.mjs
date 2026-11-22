// npm run feedback -- <look-id or "general"> [score 1-5] "what was off"
// e.g. npm run feedback -- delhi-winter-first-date-2 3 "hook too long, loafers look cheap"
import { addFeedback, syncPush } from "./lib/learning.mjs";

const [id, ...rest] = process.argv.slice(2);
let score = "";
if (/^[1-5]$/.test(rest[0] || "")) score = rest.shift();
const text = rest.join(" ").trim();
if (!id || !text) {
  console.log('Usage: npm run feedback -- <look-id or general> [1-5] "what was off"');
  process.exitCode = 1;
} else {
  addFeedback(id, score, text);
  console.log("Saved. Claude's weekly review will turn this into rules.");
  syncPush(`feedback: ${id}`);
}
