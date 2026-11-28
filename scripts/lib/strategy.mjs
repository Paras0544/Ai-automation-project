// Decides what to make next and learns from results.
//   data/strategy.json            — formats, price caps, seasonal boosts (edited by the weekly review)
//   data/learning/metrics.json    — Instagram numbers per reel (scripts/metrics.mjs)
//   data/learning/arms.json       — running score per format and per product type (computed here)
// Picking: Thompson-style sampling. Arms with good scores get picked more; untested arms still get tried.
import fs from "node:fs";
import path from "node:path";
import { paths } from "./env.mjs";
import { candidatesFor, minFor, FORMATS } from "./finds.mjs";

const file = (rel) => path.join(paths.root, "data", rel);
const readJson = (rel, d) => { try { return JSON.parse(fs.readFileSync(file(rel), "utf8")); } catch { return d; } };
const inr = (n) => "₹" + Number(n).toLocaleString("en-IN");
export const readStrategy = () => readJson("strategy.json", { formats: { finds: { weight: 1 } }, caps: {}, typeBoost: {}, explore: 0.3 });
export const readArms = () => readJson("learning/arms.json", { formats: {}, types: {}, updatedAt: null });

// One number per reel, 0..1. Built from the signals Instagram says matter most for Reels:
// watch time, sends (shares) per reach, likes per reach; saves for "I'll buy this later" intent.
export function reelScore(m, durationSec) {
  const reach = Math.max(1, m.reach || m.views || 0);
  const watch = m.ig_reels_avg_watch_time ? Math.min(1, m.ig_reels_avg_watch_time / 1000 / Math.max(1, durationSec)) : null;
  const sends = Math.min(1, ((m.shares || 0) / reach) * 25); // 4% sends/reach = max
  const saves = Math.min(1, ((m.saved || 0) / reach) * 25);
  const likes = Math.min(1, ((m.likes || 0) / reach) * 12);
  const parts = watch == null ? [[sends, 0.4], [saves, 0.3], [likes, 0.3]] : [[watch, 0.4], [sends, 0.25], [saves, 0.2], [likes, 0.15]];
  return Number(parts.reduce((s, [v, w]) => s + v * w, 0).toFixed(4));
}

// Rebuild arm stats from every scored reel (cheap; a few hundred reels at most).
export function updateArms() {
  const metrics = readJson("learning/metrics.json", {});
  const arms = { formats: {}, types: {}, updatedAt: new Date().toISOString() };
  for (const [id, m] of Object.entries(metrics)) {
    if (m.score == null) continue;
    const add = (bucket, key) => {
      if (!key) return;
      const a = (bucket[key] ||= { n: 0, sum: 0, reels: [] });
      a.n++; a.sum += m.score; a.mean = Number((a.sum / a.n).toFixed(4));
      a.reels.push(id);
    };
    add(arms.formats, m.format);
    add(arms.types, m.type);
  }
  fs.mkdirSync(path.dirname(file("learning/arms.json")), { recursive: true });
  fs.writeFileSync(file("learning/arms.json"), JSON.stringify(arms, null, 2) + "\n");
  return arms;
}

// approx. Thompson sample: mean pulled toward a prior, noise shrinks as evidence grows
function sample(a, prior = 0.35, n0 = 2) {
  const n = a?.n || 0;
  const mean = (prior * n0 + (a?.sum || 0)) / (n0 + n);
  const g = Math.sqrt(-2 * Math.log(Math.random() || 1e-9)) * Math.cos(2 * Math.PI * Math.random());
  return mean + (g * 0.25) / Math.sqrt(n0 + n);
}

function recentTypes(days) {
  const since = Date.now() - days * 864e5;
  const out = new Set();
  for (const f of fs.existsSync(paths.looks) ? fs.readdirSync(paths.looks) : []) {
    if (!f.endsWith(".json")) continue;
    try {
      const l = JSON.parse(fs.readFileSync(path.join(paths.looks, f), "utf8"));
      if (l.kind && l.kind !== "outfit" && Date.parse(l.createdAt || l.pricesCheckedAt || 0) > since) out.add(l.type);
    } catch {}
  }
  return out;
}

const fill = (tpl, type, cap) => {
  const name = { "oversized-tee": "oversized tees", "overshirt-linen": "linen shirts", "co-ord": "co-ord sets", flannel: "flannel shirts", oxford: "oxford shirts" }[type] || (type.endsWith("s") ? type : `${type}s`);
  const T = name.charAt(0).toUpperCase() + name.slice(1);
  return tpl.replace("{Type}", T).replace("{type}", name).replace("{cap}", inr(cap));
};

// Returns idea lines in the ideas.txt format: "topic | type | cap | format"
export function nextIdeas(count = 1) {
  const st = readStrategy();
  const arms = readArms();
  const avoid = recentTypes(st.noRepeatDays ?? 3);
  const ideas = [];
  for (let k = 0; k < count; k++) {
    const options = [];
    for (const format of FORMATS) {
      const fw = st.formats?.[format]?.weight ?? 0;
      if (fw <= 0) continue;
      const fScore = sample(arms.formats[format]);
      if (format === "pricedrop") {
        const n = candidatesFor("pricedrop", "any", 99999).length;
        if (n >= minFor("pricedrop")) options.push({ format, type: "any", cap: 99999, score: fScore * fw * 1.2 });
        continue;
      }
      for (const [type, cap] of Object.entries(st.caps || {})) {
        if (avoid.has(type) || ideas.some((i) => i.type === type)) continue;
        const n = candidatesFor(format, type, cap).length;
        if (n < minFor(format) + 1) continue; // need a little choice, not just the minimum
        const boost = st.typeBoost?.[type] ?? 1;
        const explore = Math.random() < (st.explore ?? 0.3);
        const tScore = explore ? Math.random() : sample(arms.types[type]);
        options.push({ format, type, cap, score: fScore * fw * tScore * boost });
      }
    }
    if (!options.length) break;
    const best = options.sort((a, b) => b.score - a.score)[0];
    const topic = fill(st.formats[best.format]?.topic || "{Type} under {cap}", best.type, best.cap);
    ideas.push({ ...best, line: `${topic} | ${best.type} | ${best.cap} | ${best.format}` });
  }
  return ideas.map((i) => i.line);
}
