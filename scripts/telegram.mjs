// Posts each new product reel to the Well Priced Telegram channel: cover image + every item with its price and buy link.
// Needs GitHub secrets TELEGRAM_BOT_TOKEN (from @BotFather) and TELEGRAM_CHAT_ID (e.g. @wellpricedfit).
// Links carry subid "tg-<look id>" so Cuelinks reports show what Telegram earned separately from Instagram/site.
// Only reels that already passed QC and the live price check (i.e. were posted to Instagram) go out.
import fs from "node:fs";
import path from "node:path";
import { paths } from "./lib/env.mjs";
import { affiliateUrl, affiliateConfig } from "./lib/affiliate.mjs";
import { liveProduct } from "./lib/shopify.mjs";

const token = (process.env.TELEGRAM_BOT_TOKEN || "").trim();
const chat = (process.env.TELEGRAM_CHAT_ID || "").trim();
const postedFile = path.join(paths.root, "data", "learning", "posted.json");
const esc = (t) => String(t ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const inr = (n) => "₹" + Number(n).toLocaleString("en-IN");

async function tg(method, body) {
  const res = await fetch(`${process.env.TELEGRAM_API || "https://api.telegram.org"}/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!data.ok) throw new Error(data.description || `HTTP ${res.status}`);
  return data.result;
}

if (!token || !chat) {
  console.log("Telegram: not set up (TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID), skipping.");
} else {
  const cfg = affiliateConfig();
  const posted = fs.existsSync(postedFile) ? JSON.parse(fs.readFileSync(postedFile, "utf8")) : {};
  const perRun = Number(process.env.TG_POSTS_PER_RUN || 2);
  const queue = Object.entries(posted)
    .filter(([, p]) => p.instagram && !p.telegram)
    .sort((a, b) => String(b[1].instagram.at).localeCompare(String(a[1].instagram.at)))
    .slice(0, perRun);
  for (const [id] of queue) {
    const f = path.join(paths.looks, `${id}.json`);
    if (!fs.existsSync(f)) continue;
    const look = JSON.parse(fs.readFileSync(f, "utf8"));
    // same accuracy rule as Instagram: re-check every price now
    let bad = null;
    for (const it of look.items) {
      try {
        const live = await liveProduct(it.url);
        if (!live.inStock || live.price !== it.price) { bad = `${it.name}: now ${live.inStock ? inr(live.price) : "sold out"}`; break; }
      } catch (e) { bad = `${it.name}: ${e.message}`; break; }
    }
    if (bad) {
      console.log(`- Telegram skip ${id}: ${bad}`);
      posted[id].telegram = { skipped: bad, at: new Date().toISOString() };
      continue;
    }
    const lines = look.items.map((it, n) => `${n + 1}. <a href="${esc(affiliateUrl(it.url, cfg, `tg-${id}`))}">${esc(it.name)}</a>: <b>${inr(it.price)}</b>${it.wasPrice ? ` (was ${inr(it.wasPrice)})` : ""}`);
    const caption = [
      `<b>${esc(look.hook)}</b>`,
      "",
      ...lines,
      "",
      `Prices checked today · ${esc([...new Set(look.items.map((i) => i.store))].join(", "))}`,
      `<i>#affiliate: we may earn a small commission</i>`,
    ].join("\n").slice(0, 1024);
    try {
      const msg = look.coverUrl
        ? await tg("sendPhoto", { chat_id: chat, photo: look.coverUrl, caption, parse_mode: "HTML" })
        : await tg("sendMessage", { chat_id: chat, text: caption, parse_mode: "HTML", disable_web_page_preview: true });
      posted[id].telegram = { id: msg.message_id, at: new Date().toISOString() };
      console.log(`✓ Telegram: posted ${id}`);
    } catch (e) {
      console.log(`✗ Telegram ${id}: ${e.message}`);
      process.exitCode = 1;
    }
  }
  fs.writeFileSync(postedFile, JSON.stringify(posted, null, 2) + "\n");
}
