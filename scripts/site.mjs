// npm run site  ->  builds the shop website into site/ (one page per reel, every item with a buy link)
// Cloudflare Pages runs this automatically on every push: build command "node scripts/site.mjs", output "site".
import fs from "node:fs";
import path from "node:path";
import { paths } from "./lib/env.mjs";
import { affiliateUrl, affiliateConfig } from "./lib/affiliate.mjs";

const outDir = path.join(paths.root, "site");
const cfg = affiliateConfig();
const cache = (() => {
  try {
    return JSON.parse(fs.readFileSync(path.join(paths.root, "data", "catalog.json"), "utf8"));
  } catch {
    return {};
  }
})();

// looks that failed in the run log are left out; every other "ready" look with links is shown
const failed = new Set();
const rendered = new Set();
const runsFile = path.join(paths.root, "data", "learning", "runs.jsonl");
if (fs.existsSync(runsFile)) {
  for (const line of fs.readFileSync(runsFile, "utf8").split("\n")) {
    try {
      const r = JSON.parse(line);
      if (r.rendered) rendered.add(r.id), failed.delete(r.id);
      else if (r.id && r.ok === false) failed.add(r.id);
    } catch {}
  }
}

const looks = fs
  .readdirSync(paths.looks)
  .filter((f) => f.endsWith(".json"))
  .map((f) => JSON.parse(fs.readFileSync(path.join(paths.looks, f), "utf8")))
  .filter((l) => l.items?.length && l.items.every((i) => i.url) && !failed.has(l.id) && (rendered.has(l.id) || l.status === "ready"))
  .map((l) => ({ ...l, mtime: fs.statSync(path.join(paths.looks, `${l.id}.json`)).mtimeMs }))
  .sort((a, b) => b.mtime - a.mtime);

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const inr = (n) => "₹" + Number(n || 0).toLocaleString("en-IN");
const total = (l) => l.items.reduce((s, i) => s + (i.price || 0), 0);
const imgOf = (i) => (i.catalogId && cache[i.catalogId]?.imageUrl) || (/^https?:/.test(i.image || "") ? i.image : "");

const css = `
*{box-sizing:border-box;margin:0}body{background:#F4EFE6;color:#2B2B2B;font:16px/1.5 Georgia,'Times New Roman',serif;-webkit-font-smoothing:antialiased}
a{color:inherit}main{max-width:560px;margin:0 auto;padding:28px 18px 56px}
header{text-align:center;margin-bottom:28px}header .brand{font-size:28px;letter-spacing:.04em}header p{font:14px/1.4 system-ui,sans-serif;color:#6b6259;margin-top:6px}
.card{display:block;background:#fffdf9;border:1px solid #e4dccf;border-radius:14px;padding:16px 18px;margin-bottom:12px;text-decoration:none}
.card h2{font-size:19px;font-weight:normal}.meta{font:13px system-ui,sans-serif;color:#6b6259;margin-top:4px}
.accent{color:#B5603A}.back{font:14px system-ui,sans-serif;text-decoration:none;color:#6b6259}
h1{font-size:26px;font-weight:normal;margin:14px 0 4px}.sub{font:15px system-ui,sans-serif;color:#6b6259;margin-bottom:20px}
.item{display:flex;gap:14px;align-items:center;background:#fffdf9;border:1px solid #e4dccf;border-radius:14px;padding:12px;margin-bottom:10px}
.item img{color:transparent;font-size:0}
.item img,.item .ph{width:84px;height:104px;object-fit:cover;border-radius:10px;background:#ebe3d6;flex:none}
.item .info{flex:1;min-width:0}.item .name{font-size:17px}.item .why{font:13px/1.35 system-ui,sans-serif;color:#6b6259;margin-top:2px}
.item .row{display:flex;justify-content:space-between;align-items:center;margin-top:8px;font:14px system-ui,sans-serif}
.buy{background:#2B2B2B;color:#F4EFE6;text-decoration:none;padding:8px 14px;border-radius:999px;font:600 13px system-ui,sans-serif}
.total{display:flex;justify-content:space-between;font-size:20px;border-top:1px solid #d9cfbf;padding-top:14px;margin-top:6px}
.note{font:12px/1.5 system-ui,sans-serif;color:#8a8076;margin-top:24px;text-align:center}`;

const page = (title, body, desc = "Real outfits for Indian men, with real prices.") => `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><meta name="p:domain_verify" content="2c59aa332c6afb144bc63d5fdeb52ffc"/><meta name="description" content="${esc(desc)}"><meta name="robots" content="index,follow">
<style>${css}</style></head><body><main>${body}
<p class="note"><a href="/">Home</a> · <a href="/about/">About</a> · <a href="/privacy/">Privacy Policy</a></p>
<p class="note">#affiliate · Links on this page earn Well Priced a small commission, at no extra cost to you. Prices change; the store's price at checkout is final.</p>
</main></body></html>`;

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

const list = looks.length
  ? looks
      .map((l) => `<a class="card" href="/l/${l.id}/"><h2>${esc(l.hook)}</h2><div class="meta">${esc(l.occasion)} · ${l.items.length} pieces · <span class="accent">${inr(total(l))}</span></div></a>`)
      .join("\n")
  : `<p class="meta" style="text-align:center">New looks are added every week. Follow <a href="https://www.instagram.com/wellpriced.fit/">@wellpriced.fit</a> on Instagram to see them first.</p>`;
fs.writeFileSync(
  path.join(outDir, "index.html"),
  page("Well Priced — shop the looks", `<header><div class="brand">Well Priced</div><p>@wellpriced.fit · Looks expensive. Isn't.</p></header>
<div class="card" style="font:15px/1.6 system-ui,sans-serif"><b style="font:18px Georgia,serif">Full outfits for Indian men, with real prices.</b><br>
Every week we put together complete looks for real occasions (office days, first dates, weddings, winter in Delhi) using products you can actually buy today. Each look shows every piece, its current price and the total, so you know exactly what it costs before you shop.</div>
<h2 style="font-weight:normal;font-size:20px;margin:22px 0 10px">Latest looks</h2>${list}`),
);

for (const l of looks) {
  const items = l.items
    .map((i) => {
      const img = imgOf(i);
      return `<div class="item">${img ? `<img src="${esc(img)}" alt="${esc(i.name)}" loading="lazy" referrerpolicy="no-referrer">` : `<div class="ph"></div>`}
<div class="info"><div class="name">${esc(i.name)}</div>${i.why ? `<div class="why">${esc(i.why)}</div>` : ""}
<div class="row"><span>${inr(i.price)} · ${esc(i.store)}</span><a class="buy" href="${esc(affiliateUrl(i.url, cfg, l.id))}" rel="sponsored nofollow noopener" target="_blank">Shop</a></div></div></div>`;
    })
    .join("\n");
  const dir = path.join(outDir, "l", l.id);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, "index.html"),
    page(
      `${l.hook} — Well Priced`,
      `<a class="back" href="/">← All looks</a><h1>${esc(l.hook)}</h1><p class="sub">${esc(l.subhook || l.occasion)}</p>${items}<div class="total"><span>Total</span><span class="accent">${inr(total(l))}</span></div>`,
      `${l.occasion}: ${l.items.map((i) => i.name).join(", ")}`,
    ),
  );
}
fs.mkdirSync(path.join(outDir, "privacy"), { recursive: true });
fs.writeFileSync(
  path.join(outDir, "privacy", "index.html"),
  page(
    "Privacy Policy — Well Priced",
    `<a class="back" href="/">← All looks</a><h1>Privacy Policy</h1><div class="sub" style="font-size:14px;line-height:1.6">
<p>Well Priced (@wellpriced.fit) publishes outfit ideas with links to online stores. This site does not use accounts, forms, or tracking cookies of its own and does not collect personal information.</p><br>
<p>Shop links go to partner stores through affiliate networks (such as Cuelinks), which may set their own cookies to credit a purchase; their privacy policies apply on those sites.</p><br>
<p>Our automation connects only to our own social media accounts (Instagram, Facebook, Pinterest) to publish our posts and reply to comments on them. Access tokens are stored privately and never shared or sold. We do not collect or store data about other users beyond what is needed to send a reply someone asked for, such as a product link after a comment.</p><br>
<p><b>Pinterest, Instagram and Facebook data.</b> Our publishing tool uses the official Pinterest and Meta APIs only for our own business accounts: to create our own boards and posts, read our own posts and their performance, and reply to comments on our posts. We do not sell, rent or share this data, and we do not use it for advertising profiles.</p><br>
<p><b>Data retention and deletion.</b> Access tokens are kept only on our own computer and can be revoked at any time from the account's settings. Comment-reply data is kept for at most 30 days. To ask about or delete any data related to you, message @wellpriced.fit on Instagram and we will respond within 30 days.</p><br>
<p><b>Children.</b> This site is not directed at children under 13.</p><br>
<p><b>Changes.</b> We will update this page if our practices change.</p><br>
<p>Operator: Paras Miglani (Well Priced), Haryana, India. Contact: Instagram @wellpriced.fit. Last updated: 22 November 2026.</p></div>`,
    "Privacy Policy for Well Priced (wellpriced.pages.dev)",
  ),
);
fs.mkdirSync(path.join(outDir, "about"), { recursive: true });
fs.writeFileSync(
  path.join(outDir, "about", "index.html"),
  page(
    "About — Well Priced",
    `<a class="back" href="/">← All looks</a><h1>About Well Priced</h1><div class="sub" style="font-size:15px;line-height:1.6">
<p>Well Priced is an independent men's style page from India, run by Paras Miglani. The idea is simple: show complete outfits for real occasions that look expensive but aren't, with every piece and its real price.</p><br>
<p>We publish looks as short videos on Instagram (<a href="https://www.instagram.com/wellpriced.fit/">@wellpriced.fit</a>) and Pinterest, and every look has a page here listing each product with a link to buy it.</p><br>
<p>Some links are affiliate links: if you buy through them, we may earn a small commission at no extra cost to you. It never changes which products we pick.</p></div>`,
    "About Well Priced, men's outfits with real prices",
  ),
);
fs.writeFileSync(path.join(outDir, "_headers"), "/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n");
const earning = looks.flatMap((l) => l.items).filter((i) => affiliateUrl(i.url, cfg) !== i.url).length;
const allItems = looks.reduce((s, l) => s + l.items.length, 0);
console.log(`Built site/ with ${looks.length} look page(s). ${earning}/${allItems} links are affiliate links${earning < allItems ? " (fill data/affiliate.json after Cuelinks approval)" : ""}.`);
