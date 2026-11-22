// Loads .env (GEMINI_API_KEY etc.) into process.env. Node 20.12+ has this built in.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

const envPath = path.join(root, ".env");
const envTxt = path.join(root, ".env.txt"); // Windows Notepad often saves ".env" as ".env.txt"
// Simple, forgiving parser: ignores a BOM, spaces, quotes and Windows line endings.
function load(file) {
  const text = fs.readFileSync(file, "utf8").replace(/^﻿/, "");
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    const value = m[2].replace(/^(['"])(.*)\1$/, "$2").trim();
    if (value && !process.env[m[1]]) process.env[m[1]] = value;
  }
}

if (fs.existsSync(envPath)) {
  load(envPath);
} else if (fs.existsSync(envTxt)) {
  console.warn('Note: using ".env.txt". Rename it to ".env" (PowerShell: Rename-Item .env.txt .env).');
  load(envTxt);
}
export const envFileFound = fs.existsSync(envPath) || fs.existsSync(envTxt);
export const envFilePath = envPath;

export const paths = {
  root,
  looks: path.join(root, "data", "looks"),
  ideas: path.join(root, "data", "ideas.txt"),
  public: path.join(root, "public"),
  out: path.join(root, "out"),
};

export const slugify = (s) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
