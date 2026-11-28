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
const isProduct = (l) => l.kind && l.kind !== "outfit";
// "More like this on Amazon": a tagged Amazon search link, no Amazon prices shown (Amazon only allows prices from its own API)
const AMAZON_Q = { "oversized-tee": "oversized t-shirt", "overshirt-linen": "linen shirt", "co-ord": "co-ord set", flannel: "flannel shirt", oxford: "oxford shirt" };
function amazonMore(l) {
  const tag = cfg.amazonTag;
  if (!tag || !l.type || l.type === "any") return "";
  const q = `men ${AMAZON_Q[l.type] || l.type}`;
  const u = new URL("https://www.amazon.in/s");
  u.searchParams.set("k", q);
  if (l.budget && l.kind !== "pricedrop") u.searchParams.set("rh", `p_36:-${l.budget * 100}`);
  u.searchParams.set("tag", tag);
  return `<p style="margin-top:14px"><a class="buy" rel="sponsored nofollow" target="_blank" href="${esc(u.toString())}">More ${esc(q.replace(/^men /, ""))}s on Amazon${l.budget && l.kind !== "pricedrop" ? ` under ${inr(l.budget)}` : ""} →</a></p>`;
}
// "each under ₹1,499" for product reels, "₹4,200 total" for old outfit looks
const priceTag = (l) => (isProduct(l) ? (l.kind === "pricedrop" ? "price drops" : `each under ${inr(l.budget)}`) : inr(total(l)));
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
<title>${esc(title)}</title><meta name="p:domain_verify" content="2c59aa332c6afb144bc63d5fdeb52ffc"/><meta name="google-site-verification" content="EoDFCu0W-gHgRXJYsT1iUOzaAC0_rTg1bAypEUpJi_8" /><meta name="description" content="${esc(desc)}"><meta name="robots" content="index,follow">
<style>${css}</style></head><body><main>${body}
<p class="note"><a href="/">Home</a> · <a href="/guides/">Guides</a> · <a href="/tools/">Tools</a> · <a href="/prices/">Price tracker</a> · <a href="/about/">About</a> · <a href="/privacy/">Privacy Policy</a></p>
<p class="note">#affiliate · Links on this page earn Well Priced a small commission, at no extra cost to you. Prices change; the store's price at checkout is final.</p>
</main></body></html>`;

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

// once product reels exist, the home page shows only those (old full-outfit looks stay reachable by link)
const shown = looks.some(isProduct) ? looks.filter(isProduct) : looks;
const list = shown.length
  ? shown
      .map((l) => `<a class="card" href="/l/${l.id}/"><h2>${esc(l.hook)}</h2><div class="meta">${esc(l.occasion)} · ${l.items.length} ${isProduct(l) ? "picks" : "pieces"} · <span class="accent">${priceTag(l)}</span></div></a>`)
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
      `<a class="back" href="/">← All looks</a><h1>${esc(l.hook)}</h1><p class="sub">${esc(l.subhook || l.occasion)}</p>${l.videoUrl ? `<video src="${esc(l.videoUrl)}" ${l.coverUrl ? `poster="${esc(l.coverUrl)}"` : ""} controls playsinline preload="none" style="width:100%;border-radius:14px;margin-bottom:14px;background:#ebe3d6"></video>` : ""}${items}${isProduct(l) ? `<p class="meta" style="margin-top:10px">Prices checked ${esc(new Date(l.pricesCheckedAt || l.publishedAt || Date.now()).toISOString().slice(0, 10))}; they can change.</p>${amazonMore(l)}` : `<div class="total"><span>Total</span><span class="accent">${inr(total(l))}</span></div>`}`,
      `${l.occasion}: ${l.items.map((i) => i.name).join(", ")}`,
    ),
  );
}
// ---- posting queue (for posting from your phone until auto-posting is approved) ----
{
  const postedLog = (() => {
    try {
      return JSON.parse(fs.readFileSync(path.join(paths.root, "data", "learning", "posted.json"), "utf8"));
    } catch {
      return {};
    }
  })();
  const queue = looks.filter((l) => l.videoUrl);
  const rows = queue
    .map(
      (l) => `<div class="card" data-id="${esc(l.id)}"><h2>${esc(l.hook)}</h2><div class="meta">${esc(l.occasion)} · ${priceTag(l)}${postedLog[l.id]?.instagram ? ' · <span class="accent">✓ auto-posted to Instagram</span>' : ""}</div>
<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">
<a class="buy" href="${esc(l.videoUrl)}" download>Download video</a>
<button class="buy" onclick="copyCap(this)">Copy Instagram caption</button>
<button class="buy" onclick="copyYt(this)">Copy YouTube title</button>
<button class="buy" style="background:#B5603A" onclick="done(this)">Mark posted</button></div>
<input class="yt" readonly style="position:absolute;left:-9999px" value="${esc((l.hook + (isProduct(l) ? "" : " | Full look " + inr(total(l))) + " #shorts").slice(0, 100))}">
<textarea readonly style="position:absolute;left:-9999px">${esc(l.postCaption || `${l.hook}\n\nShop every piece: link in bio.\n#affiliate`)}</textarea></div>`,
    )
    .join("\n");
  fs.mkdirSync(path.join(outDir, "post"), { recursive: true });
  fs.writeFileSync(
    path.join(outDir, "post", "index.html"),
    page(
      "Posting queue — Well Priced",
      `<a class="back" href="/">← Home</a><h1>Posting queue</h1><p class="sub">Download → post on Instagram (add a trending sound, paste caption) and YouTube Shorts (paste title, caption as description) → Mark posted. Oldest first.</p>
${rows || '<p class="meta">Nothing to post yet.</p>'}
<script>
const KEY="wp-posted";const get=()=>{try{return JSON.parse(localStorage.getItem(KEY)||"[]")}catch{return[]}};
function hide(){const p=get();document.querySelectorAll("[data-id]").forEach(c=>{if(p.includes(c.dataset.id))c.style.display="none"})}
function done(b){const id=b.closest("[data-id]").dataset.id;const p=get();p.push(id);try{localStorage.setItem(KEY,JSON.stringify(p))}catch{}hide()}
async function copyCap(b){const t=b.closest("[data-id]").querySelector("textarea").value;try{await navigator.clipboard.writeText(t)}catch{const a=b.closest("[data-id]").querySelector("textarea");a.select();document.execCommand("copy")}b.textContent="Copied ✓"}
async function copyYt(b){const t=b.closest("[data-id]").querySelector(".yt").value;try{await navigator.clipboard.writeText(t)}catch{}b.textContent="Copied ✓"}
hide();
</script>`,
      "Posting queue",
    ).replace('<meta name="robots" content="index,follow">', '<meta name="robots" content="noindex">'),
  );
}

// ---- buying guides (written weekly by Claude into data/guides/*.json) ----
const guidesDir = path.join(paths.root, "data", "guides");
const guides = fs.existsSync(guidesDir)
  ? fs.readdirSync(guidesDir).filter((f) => f.endsWith(".json")).map((f) => JSON.parse(fs.readFileSync(path.join(guidesDir, f), "utf8"))).sort((a, b) => String(b.updated).localeCompare(String(a.updated)))
  : [];
for (const g of guides) {
  const body = (g.sections || [])
    .map(
      (sec) => `<h2 style="font-weight:normal;font-size:21px;margin:24px 0 8px">${esc(sec.heading)}</h2>${sec.text ? `<p class="sub" style="font-size:15px;line-height:1.6;color:#2B2B2B">${esc(sec.text)}</p>` : ""}
${(sec.items || [])
  .map(
    (i) => `<div class="item">${i.image ? `<img src="${esc(i.image)}" alt="${esc(i.name)}" loading="lazy" referrerpolicy="no-referrer">` : ""}<div class="info"><div class="name">${esc(i.name)}</div>${i.why ? `<div class="why">${esc(i.why)}</div>` : ""}
<div class="row"><span>${i.price ? inr(i.price) + " · " : ""}${esc(i.store || "")}</span><a class="buy" href="${esc(affiliateUrl(i.url, cfg, "guide-" + g.slug))}" rel="sponsored nofollow noopener" target="_blank">Shop</a></div></div></div>`,
  )
  .join("\n")}`,
    )
    .join("\n");
  const dir = path.join(outDir, "guides", g.slug);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, "index.html"),
    page(
      `${g.title} — Well Priced`,
      `<a class="back" href="/guides/">← All guides</a><h1>${esc(g.title)}</h1><p class="sub">Updated ${esc(g.updated || "")}. Prices checked when written; the store's price is final.</p><p style="font:15px/1.6 system-ui,sans-serif;margin-bottom:8px">${esc(g.intro || "")}</p>${body}`,
      g.description || g.intro || g.title,
    ),
  );
}
fs.mkdirSync(path.join(outDir, "guides"), { recursive: true });
fs.writeFileSync(
  path.join(outDir, "guides", "index.html"),
  page(
    "Buying guides — Well Priced",
    `<a class="back" href="/">← Home</a><h1>Buying guides</h1><p class="sub">Honest picks for Indian men, with real prices.</p>${
      guides.map((g) => `<a class="card" href="/guides/${g.slug}/"><h2>${esc(g.title)}</h2><div class="meta">${esc(g.description || "")}</div></a>`).join("\n") || '<p class="meta">First guides coming this week.</p>'
    }`,
    "Buying guides for Indian men's fashion, with real prices",
  ),
);
// ---- price history pages (real daily prices = unique data Google rewards) ----
const history = (() => {
  try {
    return JSON.parse(fs.readFileSync(path.join(paths.root, "data", "price-history.json"), "utf8"));
  } catch {
    return {};
  }
})();
const priceItems = Object.values(cache)
  .filter((c) => c.name && c.price && history[c.id]?.length)
  .map((c) => {
    const pts = history[c.id];
    const prices = pts.map((p) => p[1]);
    const low = Math.min(...prices), high = Math.max(...prices);
    const recent = pts.filter((p) => Date.now() - Date.parse(p[0]) < 31 * 864e5).map((p) => p[1]);
    const ref = Math.max(...(recent.length ? recent : prices));
    const slug = `${String(c.name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60)}-${c.id.slice(0, 4)}`;
    return { ...c, pts, low, high, drop: ref ? (ref - c.price) / ref : 0, slug };
  });
const spark = (pts) => {
  if (pts.length < 2) return "";
  const w = 320, h = 90, ps = pts.map((p) => p[1]), lo = Math.min(...ps), hi = Math.max(...ps), span = hi - lo || 1;
  const xy = pts.map((p, i) => `${(i / (pts.length - 1)) * w},${h - 8 - ((p[1] - lo) / span) * (h - 16)}`).join(" ");
  return `<svg viewBox="0 0 ${w} ${h}" style="width:100%;height:auto;margin:6px 0 12px" role="img" aria-label="Price history chart"><polyline fill="none" stroke="#B5603A" stroke-width="2.5" points="${xy}"/></svg>`;
};
for (const p of priceItems) {
  const atLow = p.price <= p.low * 1.03;
  const verdict = p.inStock === false ? "Out of stock right now." : p.pts.length < 5 ? "We started tracking this recently; check back for a fuller history." : atLow ? "Good time to buy: it's at or near its lowest price we've seen." : `It has been ${inr(p.low)} before. Wait if you're not in a hurry.`;
  const dir = path.join(outDir, "prices", p.slug);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, "index.html"),
    page(
      `${p.name} price history — Well Priced`,
      `<a class="back" href="/prices/">← Price tracker</a><h1>${esc(p.name)}: price history</h1><p class="sub">${esc(p.store || "")} · tracked daily since ${esc(p.pts[0][0])}</p>
<div class="item">${p.imageUrl ? `<img src="${esc(p.imageUrl)}" alt="${esc(p.name)}" referrerpolicy="no-referrer">` : ""}<div class="info"><div class="name">Now ${inr(p.price)}</div><div class="why">Lowest ${inr(p.low)} · highest ${inr(p.high)}</div>
<div class="row"><span>${esc(verdict)}</span></div><div class="row"><span></span><a class="buy" href="${esc(affiliateUrl(p.url, cfg, "price-" + p.id))}" rel="sponsored nofollow noopener" target="_blank">Check price</a></div></div></div>
${spark(p.pts)}<p class="meta">Prices are checked once a day and can change any time; the store's price at checkout is final.</p>`,
      `${p.name} price history: now ${inr(p.price)}, lowest ${inr(p.low)}. Tracked daily.`,
    ),
  );
}
{
  const drops = priceItems.filter((p) => p.drop >= 0.05 && p.inStock !== false).sort((a, b) => b.drop - a.drop).slice(0, 20);
  const list = (arr) => arr.map((p) => `<a class="card" href="/prices/${p.slug}/"><h2>${esc(p.name)}</h2><div class="meta">${inr(p.price)}${p.drop >= 0.05 ? ` · <span class="accent">${Math.round(p.drop * 100)}% below its 30-day high</span>` : ` · lowest ${inr(p.low)}`}</div></a>`).join("\n");
  fs.mkdirSync(path.join(outDir, "prices"), { recursive: true });
  fs.writeFileSync(
    path.join(outDir, "prices", "index.html"),
    page(
      "Men's fashion price tracker — Well Priced",
      `<a class="back" href="/">← Home</a><h1>Price tracker</h1><p class="sub">Daily prices for ${priceItems.length} men's fashion products. Buy at the low, not the hype.</p>
<h2 style="font-weight:normal;font-size:20px;margin:18px 0 10px">Biggest drops right now</h2>${list(drops) || '<p class="meta">No big drops today. We check every day.</p>'}
<h2 style="font-weight:normal;font-size:20px;margin:22px 0 10px">All tracked products</h2>${list([...priceItems].sort((a, b) => a.name.localeCompare(b.name)))}`,
      "Daily price history for men's fashion on Myntra, The Bear House and more",
    ),
  );
}

// ---- free tools (tools/*.html bodies, wrapped in the site layout) ----
const toolsSrc = path.join(paths.root, "tools");
const tools = fs.existsSync(toolsSrc)
  ? fs.readdirSync(toolsSrc).filter((f) => f.endsWith(".html")).map((f) => {
      const html = fs.readFileSync(path.join(toolsSrc, f), "utf8");
      const meta = JSON.parse((html.match(/<!--meta (\{.*?\}) -->/) || [, "{}"])[1]);
      return { ...meta, html: html.replace(/<!--meta .*? -->\n?/, "") };
    })
  : [];
for (const t of tools) {
  const dir = path.join(outDir, "tools", t.slug);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "index.html"), page(`${t.title} — Well Priced`, `<a class="back" href="/tools/">← All tools</a>${t.html}`, t.description));
}
fs.mkdirSync(path.join(outDir, "tools"), { recursive: true });
fs.writeFileSync(
  path.join(outDir, "tools", "index.html"),
  page("Free money tools — Well Priced", `<a class="back" href="/">← Home</a><h1>Free tools</h1><p class="sub">Simple calculators for your first salary.</p>${tools.map((t) => `<a class="card" href="/tools/${t.slug}/"><h2>${esc(t.title)}</h2><div class="meta">${esc(t.description)}</div></a>`).join("\n")}`, "Free salary and SIP calculators for India"),
);

// sitemap so Google finds every page
{
  const base = (cfg.siteUrl || "https://wellpriced.pages.dev").replace(/\/$/, "");
  const urls = ["/", "/guides/", "/tools/", "/prices/", "/about/", ...priceItems.map((p) => `/prices/${p.slug}/`), ...tools.map((t) => `/tools/${t.slug}/`), ...looks.map((l) => `/l/${l.id}/`), ...guides.map((g) => `/guides/${g.slug}/`)];
  fs.writeFileSync(path.join(outDir, "sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map((u) => `<url><loc>${base}${u}</loc></url>`).join("")}</urlset>\n`);
  fs.writeFileSync(path.join(outDir, "robots.txt"), `User-agent: *\nAllow: /\nDisallow: /post/\nSitemap: ${base}/sitemap.xml\n`);
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
fs.writeFileSync(path.join(outDir, "google6b60ae15a0959df0.html"), "google-site-verification: google6b60ae15a0959df0.html");
fs.writeFileSync(path.join(outDir, "_headers"), "/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n");
const earning = looks.flatMap((l) => l.items).filter((i) => affiliateUrl(i.url, cfg) !== i.url).length;
const allItems = looks.reduce((s, l) => s + l.items.length, 0);
console.log(`Built site/ with ${looks.length} look page(s). ${earning}/${allItems} links are affiliate links${earning < allItems ? " (fill data/affiliate.json after Cuelinks approval)" : ""}.`);
