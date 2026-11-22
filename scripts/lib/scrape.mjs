// Reads a product page: real name, price and main image. Best effort: some stores block bots.
import fs from "node:fs";
import path from "node:path";

export const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";

const meta = (html, prop) => {
  const re = new RegExp(`<meta[^>]+(?:property|name|itemprop)=["']${prop}["'][^>]*content=["']([^"']+)["']`, "i");
  const re2 = new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name|itemprop)=["']${prop}["']`, "i");
  return (html.match(re) || html.match(re2) || [])[1];
};

function fromJsonLd(html) {
  for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const data = JSON.parse(m[1]);
      const nodes = Array.isArray(data) ? data : [data, ...(data["@graph"] || [])];
      for (const n of nodes) {
        const offers = n?.offers && (Array.isArray(n.offers) ? n.offers[0] : n.offers);
        const p = offers?.price ?? offers?.lowPrice;
        if (p) {
          return {
            price: Math.round(Number(p)),
            image: Array.isArray(n.image) ? n.image[0] : n.image?.url || n.image,
            name: n.name,
            inStock: !/OutOfStock/i.test(offers?.availability || ""),
          };
        }
      }
    } catch {}
  }
  return {};
}

export async function scrape(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": UA, "Accept-Language": "en-IN,en;q=0.9" },
    redirect: "follow",
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`page returned ${res.status}`);
  const html = await res.text();
  const ld = fromJsonLd(html);
  const price = ld.price || Math.round(Number(meta(html, "product:price:amount") || meta(html, "price") || 0)) || undefined;
  return {
    finalUrl: res.url,
    price,
    image: ld.image || meta(html, "og:image"),
    name: (ld.name || meta(html, "og:title") || "").trim(),
    inStock: ld.inStock ?? true,
  };
}

export async function download(src, dest) {
  const res = await fetch(src, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`image returned ${res.status}`);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
