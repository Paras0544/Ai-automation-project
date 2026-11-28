// Imports products straight from stores' own live feeds (Shopify /products.json).
// Prices and stock come from the store itself, refreshed every run, so reels never show stale prices.
// Products land in data/catalog.json with source:"shopify" and a finds `type` (jacket, hoodie, …).
// Photos are NOT downloaded here (that would be hundreds of files); planFinds downloads only the ones it uses.
import fs from "node:fs";
import path from "node:path";
import { paths } from "./env.mjs";
import { UA, download, sleep } from "./scrape.mjs";
import { readCache, writeCache, recordPrice } from "./catalog.mjs";

const MACRO = {
  jacket: "outerwear", hoodie: "outerwear", sweatshirt: "outerwear", sweater: "outerwear", shacket: "outerwear",
  flannel: "top", "overshirt-linen": "top", oxford: "top", polo: "top", "oversized-tee": "top", "co-ord": "top",
  cargo: "bottom", jeans: "bottom", trouser: "bottom", sneaker: "footwear", loafer: "footwear",
};
export const sourcesFile = () => path.join(paths.root, "data", "sources.json");
export const readSources = () => (fs.existsSync(sourcesFile()) ? JSON.parse(fs.readFileSync(sourcesFile(), "utf8")) : { shopify: [] });

// "Black Regular Fit Pleated Formal Trousers with Tab Waist" -> "Black pleated formal trousers"
export function shortName(s) {
  let t = String(s || "")
    .replace(/\b(men'?s|for men|mens|regular|slim|relaxed|oversized|boxy|straight|tapered|comfort)\s+fit\b/gi, "")
    .replace(/\b(men'?s|mens|for men|casual|premium|pure)\b/gi, "")
    .replace(/\bwith\b.*$/i, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  const words = t.split(" ");
  if (words.length > 5) {
    // keep the leading colour words + the garment at the end: "Green & Grey … Checked Flannel Shirt"
    const colourish = /^(&|and|light|dark|off|navy|black|white|cream|beige|blue|green|olive|brown|tan|grey|gray|charcoal|maroon|red|pink|purple|lilac|yellow|mustard|orange|rust|teal|khaki|camel|ecru|sage|sky|wine|stone|sand|indigo)$/i;
    const lead = [];
    for (const w of words) { if (colourish.test(w) && lead.length < 3) lead.push(w); else break; }
    const tail = words.slice(-3).filter((w) => !lead.includes(w));
    t = [...lead, ...tail].join(" ");
  }
  return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
}

async function getJson(url) {
  const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

// one product's live state (used again right before posting)
export function summarize(p, minSizes = 3) {
  const vars = p.variants || [];
  const avail = vars.filter((v) => v.available);
  const prices = (avail.length ? avail : vars).map((v) => Number(v.price)).filter(Boolean);
  return {
    price: prices.length ? Math.round(Math.min(...prices)) : null,
    sizesInStock: avail.length,
    inStock: avail.length >= Math.min(minSizes, vars.length || 1),
    image: p.images?.[0]?.src || p.image?.src || null,
    name: p.vendor && p.vendor.split(" ").length >= 3 ? p.vendor : p.title, // Bear House keeps the readable name in "vendor"
  };
}

export async function liveProduct(url) {
  // https://store.com/products/<handle>  ->  https://store.com/products/<handle>.js (Shopify, public)
  const u = new URL(url);
  const data = await getJson(`${u.origin}${u.pathname.replace(/\/$/, "")}.js`);
  // .js format uses cents and `available`
  const vars = (data.variants || []).map((v) => ({ price: v.price / 100, available: v.available }));
  return summarize({ ...data, variants: vars, images: (data.images || []).map((s) => ({ src: s.startsWith("//") ? "https:" + s : s })) });
}

export async function importShopify({ log = console.log } = {}) {
  const { shopify = [] } = readSources();
  const cache = readCache();
  const seen = new Set();
  let added = 0, updated = 0;
  for (const src of shopify) {
    for (const [type, handle] of Object.entries(src.collections || {})) {
      let list = [];
      try {
        list = (await getJson(`https://${src.domain}/collections/${handle}/products.json?limit=250`)).products || [];
      } catch (e) {
        log(`  ${src.store}/${handle}: couldn't read (${e.message})`);
        continue;
      }
      let kept = 0;
      for (const p of list) {
        if (kept >= (src.perCollection || 30)) break;
        const s = summarize(p, src.minSizes || 3);
        if (!s.price || !s.image || !s.inStock || s.price > (src.maxPrice || 99999)) continue;
        const id = `${src.domain.split(".")[0]}-${p.handle}`.slice(0, 60);
        if (seen.has(id)) continue; // same product in two collections: first type wins
        seen.add(id);
        const c = cache[id] || { id, timesUsed: 0, source: "shopify" };
        if (!cache[id]) added++; else updated++;
        Object.assign(c, {
          source: "shopify",
          url: `https://${src.domain}/products/${p.handle}`,
          store: src.store,
          title: s.name,
          name: shortName(s.name),
          type,
          category: MACRO[type] || "top",
          tags: [type],
          price: s.price,
          sizesInStock: s.sizesInStock,
          inStock: true,
          imageUrl: s.image.startsWith("//") ? "https:" + s.image : s.image,
          checkedAt: new Date().toISOString(),
        });
        cache[id] = c;
        recordPrice(id, c);
        kept++;
      }
      log(`  ${src.store} · ${type}: ${kept} in stock under ₹${src.maxPrice}`);
      await sleep(800);
    }
  }
  // products that dropped out of every feed (sold out / delisted / now too pricey) stop being used
  for (const c of Object.values(cache)) if (c.source === "shopify" && !seen.has(c.id)) c.inStock = false;
  writeCache(cache);
  return { added, updated, live: seen.size };
}

// download a product photo the first time a reel uses it
export async function ensureImage(c) {
  const rel = c.image || `catalog/${c.id}.jpg`;
  const abs = path.join(paths.public, rel);
  if (!fs.existsSync(abs)) {
    if (!c.imageUrl) throw new Error(`no photo for ${c.id}`);
    const tmp = abs + ".src";
    await download(c.imageUrl, tmp);
    const sharp = (await import("sharp")).default; // webp/png -> small jpg the renderer always handles
    await sharp(tmp).resize({ width: 900, withoutEnlargement: true }).flatten({ background: "#ffffff" }).jpeg({ quality: 84 }).toFile(abs);
    fs.rmSync(tmp, { force: true });
  }
  return rel;
}
