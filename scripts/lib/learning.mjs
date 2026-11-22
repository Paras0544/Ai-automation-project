// The project's memory: learned rules (read by the planner), your feedback, and a log of every run.
// data/rules.md          rules the planner follows (Claude's weekly review keeps it up to date)
// data/feedback.md       your notes on reels (npm run feedback)
// data/learning/runs.jsonl   one line per look the autopilot tried
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { paths } from "./env.mjs";

const dataDir = path.join(paths.root, "data");
export const files = {
  rules: path.join(dataDir, "rules.md"),
  feedback: path.join(dataDir, "feedback.md"),
  runs: path.join(dataDir, "learning", "runs.jsonl"),
};

// Rules as plain lines for the prompt (only "- " lines, max ~40 so the prompt stays small)
export function rulesForPrompt() {
  if (!fs.existsSync(files.rules)) return "";
  const lines = fs.readFileSync(files.rules, "utf8").split(/\r?\n/).filter((l) => /^\s*-\s+\S/.test(l)).slice(0, 40);
  return lines.length ? `\n\nHouse rules learned from past reels (follow them):\n${lines.join("\n")}` : "";
}

export function logRun(entry) {
  fs.mkdirSync(path.dirname(files.runs), { recursive: true });
  fs.appendFileSync(files.runs, JSON.stringify({ at: new Date().toISOString(), ...entry }) + "\n");
}

export function addFeedback(id, score, text) {
  const date = new Date().toISOString().slice(0, 10);
  const clean = (s) => String(s ?? "").replace(/\|/g, "/").replace(/\r?\n/g, " ").trim();
  fs.appendFileSync(files.feedback, `| ${date} | ${clean(id)} | ${clean(score) || "-"} | ${clean(text)} |\n`);
}

// git helpers: quiet, never fatal. Keeps the laptop and Claude's weekly review in sync.
function git(args) {
  const r = spawnSync("git", args, { cwd: paths.root, encoding: "utf8" });
  return { ok: r.status === 0, out: `${r.stdout || ""}${r.stderr || ""}`.trim() };
}

export function syncPull() {
  if (process.env.SYNC === "0" || !fs.existsSync(path.join(paths.root, ".git"))) return;
  const r = git(["pull", "--rebase", "--autostash", "-q"]);
  console.log(r.ok ? "Synced latest updates from GitHub." : `(Couldn't pull updates: ${r.out.split("\n")[0]})`);
}

export function syncPush(message) {
  if (process.env.SYNC === "0" || !fs.existsSync(path.join(paths.root, ".git"))) return;
  git(["add", "data"]);
  if (git(["diff", "--cached", "--quiet"]).ok) return; // nothing new
  git(["commit", "-q", "-m", message]);
  let r = git(["push", "-q"]);
  if (!r.ok) {
    git(["pull", "--rebase", "--autostash", "-q"]);
    r = git(["push", "-q"]);
  }
  console.log(r.ok ? "Shared this run's results with GitHub (for the weekly review)." : `(Couldn't push results: ${r.out.split("\n")[0]}. They'll go next run.)`);
}
