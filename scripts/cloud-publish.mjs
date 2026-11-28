// Cloud step: make sure every ready look has a video, upload videos + covers to the "reels"
// GitHub Release (free public hosting), and record the links in each look (site shows them).
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { paths } from "./lib/env.mjs";

const repo = process.env.GITHUB_REPOSITORY || "Paras0544/Ai-automation-project";
const MAX_RENDER = Number(process.env.MAX_BACKFILL ?? 6);
const run = (cmd, args) => spawnSync(cmd, args, { cwd: paths.root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

if (run("gh", ["release", "view", "reels"]).status !== 0) {
  run("gh", ["release", "create", "reels", "--title", "Reels", "--notes", "Rendered Well Priced reels (uploaded automatically)."]);
}

const looks = fs
  .readdirSync(paths.looks)
  .filter((f) => f.endsWith(".json"))
  .map((f) => ({ file: path.join(paths.looks, f), look: JSON.parse(fs.readFileSync(path.join(paths.looks, f), "utf8")) }))
  .filter(({ look }) => look.status === "ready" && look.kind && look.kind !== "outfit" && look.items?.length && look.items.every((i) => i.url) && !look.videoUrl);

let rendered = 0;
for (const { file, look } of looks) {
  const mp4 = path.join(paths.out, `${look.id}.mp4`);
  if (!fs.existsSync(mp4)) {
    if (rendered >= MAX_RENDER) continue;
    console.log(`Rendering missing video for ${look.id}…`);
    const r = spawnSync("node", ["scripts/render-all.mjs", look.id], { cwd: paths.root, stdio: "inherit" });
    rendered++;
    if (r.status !== 0 || !fs.existsSync(mp4)) continue;
  }
  const fresh = JSON.parse(fs.readFileSync(file, "utf8")); // render may have added coverSeconds
  const assets = [mp4];
  const cover = path.join(paths.out, `${look.id}.cover.jpg`);
  if (fs.existsSync(cover)) assets.push(cover);
  const up = run("gh", ["release", "upload", "reels", ...assets, "--clobber"]);
  if (up.status !== 0) {
    console.log(`✗ upload failed for ${look.id}: ${(up.stderr || "").trim().split("\n")[0]}`);
    continue;
  }
  const base = `https://github.com/${repo}/releases/download/reels`;
  fresh.videoUrl = `${base}/${look.id}.mp4`;
  if (fs.existsSync(cover)) fresh.coverUrl = `${base}/${look.id}.cover.jpg`;
  const cap = path.join(paths.out, `${look.id}.caption.txt`);
  if (fs.existsSync(cap)) fresh.postCaption = fs.readFileSync(cap, "utf8").trim();
  fresh.publishedAt = fresh.publishedAt || new Date().toISOString();
  fs.writeFileSync(file, JSON.stringify(fresh, null, 2));
  console.log(`✓ ${look.id} → ${fresh.videoUrl}`);
}
