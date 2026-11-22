// npm run products -- <look-id>
// For every item with a "url", tries to read the real product name, price and main image
// from the product page, saves the image to public/, and updates the look file.
// Best effort: some stores block automated requests. If one fails, save the photo yourself
// at the path it prints and type the real price into the JSON.
import fs from "node:fs";
import path from "node:path";
import { paths } from "./lib/env.mjs";
import { missing, printNextSteps } from "./lib/next-steps.mjs";

const id = process.argv[2];
if (!id) {
  console.log("Usage: npm run products -- <look-id>");
  process.exit(1);
}
const file = path.join(paths.looks, `${id}.json`);
const look = JSON.parse(fs.readFileSync(file, "utf8"));

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";

const meta = (html, prop) => {
  const re = new RegExp(`<meta[^>]+(?:property|name|itemprop)=["']${prop}["'][^>]*content=["']([^"']+)["']`, "i");
  const re2 = new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name|itemprop)=["']${prop}["']`, "i");
  return (html.match(re) || html.match(re2) || [])[1];
};

function priceFromJsonLd(html) {
  for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const data = JSON.parse(m[1]);
      const nodes = Array.isArray(data) ? data : [data, ...(data["@graph"] || [])];
      for (const n of nodes) {
        const offers = n?.offers && (Array.isArray(n.offers) ? n.offers[0] : n.offers);
        const p = offers?.price ?? offers?.lowPrice;
        if (p) return { price: Math.round(Number(p)), image: Array.isArray(n.image) ? n.image[0] : n.image, name: n.name };
      }
    } catch {}
  }
  return {};
}

async function scrape(url) {
  const res = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "en-IN,en;q=0.9" }, redirect: "follow" });
  if (!res.ok) throw new Error(`page returned ${res.status}`);
  const html = await res.text();
  const ld = priceFromJsonLd(html);
  const price = ld.price || Math.round(Number(meta(html, "product:price:amount") || meta(html, "price") || 0)) || undefined;
  const image = ld.image || meta(html, "og:image");
  const name = (ld.name || meta(html, "og:title") || "").trim();
  return { price, image, name };
}

async function download(src, dest) {
  const res = await fetch(src, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`image returned ${res.status}`);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
}

for (const [i, it] of look.items.entries()) {
  const dest = path.join(paths.public, it.image);
  if (fs.existsSync(dest)) continue;
  if (!it.url) {
    console.log(`- item ${i + 1} (${it.name}): no url yet`);
    continue;
  }
  try {
    const p = await scrape(it.url);
    if (!p.image) throw new Error("no product image found on the page");
    await download(p.image, dest);
    if (p.price) it.price = p.price; // always show the real price
    if (p.name) it.productTitle = p.name;
    console.log(`✓ item ${i + 1}: ${it.name}  ₹${it.price}${p.price ? "" : " (price not found, check it)"}`);
  } catch (e) {
    console.log(`✗ item ${i + 1} (${it.name}): ${e.message}\n    Save the product photo yourself as public/${it.image} and type the real price into the JSON.`);
  }
  await new Promise((r) => setTimeout(r, 1500));
}

look.status = missing(look).length ? "needs-products" : "ready";
fs.writeFileSync(file, JSON.stringify(look, null, 2) + "\n");
printNextSteps(look);
