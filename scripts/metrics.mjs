// Pulls Instagram numbers for every auto-posted reel and scores it (data/learning/metrics.json),
// then refreshes the per-format / per-type scores the planner learns from (data/learning/arms.json).
// Runs in the daily cloud workflow after posting. Reels are scored once they're 48h old and re-scored up to day 7.
import fs from "node:fs";
import path from "node:path";
import { paths } from "./lib/env.mjs";
import { reelScore, updateArms } from "./lib/strategy.mjs";

const token = (process.env.IG_ACCESS_TOKEN || "").trim();
const API = process.env.IG_API_BASE || (/^IG/.test(token) ? "https://graph.instagram.com/v23.0" : "https://graph.facebook.com/v23.0");
const postedFile = path.join(paths.root, "data", "learning", "posted.json");
const metricsFile = path.join(paths.root, "data", "learning", "metrics.json");
const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return d; } };

async function get(url, params) {
  const u = new URL(url);
  for (const [k, v] of Object.entries({ ...params, access_token: token })) u.searchParams.set(k, v);
  const res = await fetch(u);
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) throw new Error(data.error?.message || `HTTP ${res.status}`);
  return data;
}

async function insights(mediaId) {
  const out = {};
  // ask for the full set; if one metric isn't supported, retry with the core ones
  for (const metric of ["views,reach,saved,shares,likes,comments,total_interactions,ig_reels_avg_watch_time", "reach,saved,shares,likes,comments", "reach,likes,comments"]) {
    try {
      const d = await get(`${API}/${mediaId}/insights`, { metric });
      for (const m of d.data || []) out[m.name] = m.values?.[0]?.value ?? m.total_value?.value;
      return out;
    } catch (e) {
      out._error = e.message;
    }
  }
  // no insights permission: fall back to public counts on the media itself
  try {
    const d = await get(`${API}/${mediaId}`, { fields: "like_count,comments_count" });
    return { likes: d.like_count, comments: d.comments_count, _limited: true, _error: out._error };
  } catch (e) {
    return { _error: e.message };
  }
}

if (!token) {
  console.log("Metrics: no IG_ACCESS_TOKEN, skipping.");
} else {
  const posted = readJson(postedFile, {});
  const metrics = readJson(metricsFile, {});
  let n = 0;
  for (const [lookId, p] of Object.entries(posted)) {
    const ig = p.instagram;
    if (!ig?.id) continue;
    const ageH = (Date.now() - Date.parse(ig.at)) / 36e5;
    const m = (metrics[lookId] ||= { mediaId: ig.id, postedAt: ig.at, snapshots: [] });
    if (ageH > 24 * 8 && m.final) continue; // done after a week
    const lookFile = path.join(paths.looks, `${lookId}.json`);
    const look = readJson(lookFile, {});
    Object.assign(m, { format: look.kind || look.format, type: look.type, hook: look.hook, cap: look.budget, items: look.items?.length });
    const snap = { at: new Date().toISOString(), ageH: Math.round(ageH), ...(await insights(ig.id)) };
    m.snapshots.push(snap);
    if (m.snapshots.length > 12) m.snapshots.splice(1, m.snapshots.length - 12);
    const durationSec = look.durationSec || (look.items?.length || 4) * 2.2 + 5.8;
    if (ageH >= 48 && !snap._limited) m.score = reelScore(snap, durationSec);
    if (ageH >= 24 * 7) m.final = true;
    n++;
    console.log(`  ${lookId}: ${["views", "reach", "likes", "shares", "saved"].map((k) => `${k} ${snap[k] ?? "-"}`).join(" · ")}${m.score != null ? ` · score ${m.score}` : ""}${snap._error ? ` (${snap._error.slice(0, 80)})` : ""}`);
  }
  fs.mkdirSync(path.dirname(metricsFile), { recursive: true });
  fs.writeFileSync(metricsFile, JSON.stringify(metrics, null, 2) + "\n");
  const arms = updateArms();
  console.log(`Metrics: ${n} reel(s) updated. Format scores: ${Object.entries(arms.formats).map(([k, a]) => `${k} ${a.mean} (n=${a.n})`).join(", ") || "none yet"}`);
}
