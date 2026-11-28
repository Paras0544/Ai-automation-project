// Comment-to-DM: when someone comments the keyword (default LINK) on one of our reels, send them a private
// reply (Instagram DM) with every product link from that reel, plus a short public reply so others see it works.
// Runs hourly in the cloud (.github/workflows/dm.yml). Instagram allows one private reply per comment, within 7 days.
// State: data/learning/dm.json (comments already handled, counts per reel for the learning loop).
import fs from "node:fs";
import path from "node:path";
import { paths } from "./lib/env.mjs";
import { affiliateUrl, affiliateConfig } from "./lib/affiliate.mjs";

const token = (process.env.IG_ACCESS_TOKEN || "").trim();
const igLogin = /^IG/.test(token);
const API = process.env.IG_API_BASE || (igLogin ? "https://graph.instagram.com/v23.0" : "https://graph.facebook.com/v23.0");
const IG_USER = process.env.IG_USER_ID || (igLogin ? "me" : "");
const stateFile = path.join(paths.root, "data", "learning", "dm.json");
const postedFile = path.join(paths.root, "data", "learning", "posted.json");
const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return d; } };
const inr = (n) => "₹" + Number(n).toLocaleString("en-IN");

async function ig(method, url, params = {}) {
  const u = new URL(url);
  const opts = { method };
  if (method === "GET") for (const [k, v] of Object.entries({ ...params, access_token: token })) u.searchParams.set(k, v);
  else {
    opts.headers = { "Content-Type": "application/json" };
    opts.body = JSON.stringify(params);
    u.searchParams.set("access_token", token);
  }
  const res = await fetch(u, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) throw new Error(data.error?.message || `HTTP ${res.status}`);
  return data;
}

// keyword match: "link", "LINK pls", "links?", "🔗" … (also the reel's own keyword if it has one)
export const wantsLink = (text, kw = "LINK") => new RegExp(`(^|\\W)(${kw}|links?|🔗)(\\W|$)`, "i").test(String(text || ""));

export function dmText(look, cfg = affiliateConfig()) {
  const lines = look.items.map((it, n) => `${n + 1}. ${it.name}: ${inr(it.price)}\n${affiliateUrl(it.url, cfg, `dm-${look.id}`)}`);
  return [`Here are the links from "${look.hook}" 👇`, "", ...lines, "", "Prices were checked when the reel went live; the store's price is final.", "(Affiliate links: we may earn a small commission at no cost to you.)"].join("\n").slice(0, 1000);
}

if (!token || !IG_USER) {
  console.log("DM: no Instagram token, skipping.");
} else {
  const state = readJson(stateFile, { handled: {}, perReel: {}, errors: [] });
  const posted = readJson(postedFile, {});
  const cfg = affiliateConfig();
  const weekAgo = Date.now() - 7 * 864e5;
  let sent = 0, seen = 0;
  for (const [lookId, p] of Object.entries(posted)) {
    const mediaId = p.instagram?.id;
    if (!mediaId || Date.parse(p.instagram.at) < weekAgo) continue; // private replies only allowed for 7 days
    const lookFile = path.join(paths.looks, `${lookId}.json`);
    if (!fs.existsSync(lookFile)) continue;
    const look = readJson(lookFile, null);
    let comments = [];
    try {
      comments = (await ig("GET", `${API}/${mediaId}/comments`, { fields: "id,text,timestamp,username,from", limit: 50 })).data || [];
    } catch (e) {
      console.log(`  ${lookId}: couldn't read comments (${e.message})`);
      continue;
    }
    for (const c of comments) {
      seen++;
      if (state.handled[c.id] || !wantsLink(c.text, look.dmKeyword || "LINK")) continue;
      const r = (state.perReel[lookId] ||= { asked: 0, sent: 0, failed: 0 });
      r.asked++;
      try {
        await ig("POST", `${API}/${IG_USER}/messages`, { recipient: { comment_id: c.id }, message: { text: dmText(look, cfg) } });
        r.sent++;
        sent++;
        state.handled[c.id] = { ok: true, at: new Date().toISOString(), look: lookId };
        // short public reply: shows others the bot works (and adds engagement)
        await ig("POST", `${API}/${c.id}/replies`, { message: "Sent you the links in DM 📩 (check Requests if you don't follow us yet)" }).catch(() => {});
        console.log(`✓ DM sent for a comment on ${lookId}`);
      } catch (e) {
        r.failed++;
        state.handled[c.id] = { ok: false, at: new Date().toISOString(), look: lookId, error: e.message.slice(0, 200) };
        state.errors = [...(state.errors || []), { at: new Date().toISOString(), error: e.message.slice(0, 200) }].slice(-20);
        console.log(`✗ DM failed on ${lookId}: ${e.message}`);
      }
    }
  }
  fs.mkdirSync(path.dirname(stateFile), { recursive: true });
  fs.writeFileSync(stateFile, JSON.stringify(state, null, 2) + "\n");
  console.log(`DM: ${seen} comments checked, ${sent} DMs sent.`);
}
