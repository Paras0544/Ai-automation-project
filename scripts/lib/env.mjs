// Loads .env (GEMINI_API_KEY etc.) into process.env. Node 20.12+ has this built in.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

const envPath = path.join(root, ".env");
const envTxt = path.join(root, ".env.txt"); // Windows Notepad often saves ".env" as ".env.txt"
if (fs.existsSync(envPath)) {
  process.loadEnvFile(envPath);
} else if (fs.existsSync(envTxt)) {
  console.warn('Note: using ".env.txt". Rename it to ".env" (PowerShell: Rename-Item .env.txt .env).');
  process.loadEnvFile(envTxt);
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
