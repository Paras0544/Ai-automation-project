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

// Amazon pages have no JSON-LD price, so read their HTML directly.
function fromAmazon(html) {
  if (/validateCaptcha|Enter the characters you see below/i.test(html)) throw new Error("Amazon showed a captcha (try again later)");
  const whole = (html.match(/class="a-price-whole">([\d,]+)/) || [])[1];
  const amount = (html.match(/"priceAmount"\s*:\s*([\d.]+)/) || [])[1];
  const price = Math.round(Number((whole || "").replace(/,/g, "")) || Number(amount) || 0) || undefined;
  let image = (html.match(/id="landingImage"[^>]*data-old-hires="([^"]+)"/) || html.match(/data-old-hires="([^"]+)"[^>]*id="landingImage"/) || [])[1];
  if (!image) {
    const dyn = (html.match(/data-a-dynamic-image="([^"]+)"/) || [])[1];
    if (dyn) image = (dyn.replace(/&quot;/g, '"').match(/"(https:[^"]+)"/) || [])[1];
  }
  const name = ((html.match(/id="productTitle"[^>]*>([\s\S]*?)</) || [])[1] || "").trim();
  const avail = ((html.match(/id="availability"[\s\S]{0,400}?<span[^>]*>([\s\S]*?)</) || [])[1] || "").trim();
  return { price, image, name, inStock: !/unavailable|out of stock/i.test(avail) };
}

export async function scrape(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": UA, "Accept-Language": "en-IN,en;q=0.9" },
    redirect: "follow",
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`page returned ${res.status}`);
  const html = await res.text();
  const ld = /amazon\.in/.test(res.url) ? fromAmazon(html) : fromJsonLd(html);
  const price = ld.price || Math.round(Number(meta(html, "product:price:amount") || meta(html, "price") || 0)) || undefined;
  // Shopify and others give "//cdn…" or "/files/…" image links: make them full URLs
  let image = ld.image || meta(html, "og:image");
  // Myntra sometimes hides the photo from servers: look for its image CDN link anywhere in the page
  if (!image) image = (html.match(/https?:\/\/assets\.myntassets\.com\/[^"'\s\\]+?\.(?:jpe?g|webp|png)/i) || [])[0];
  if (image) {
    try {
      image = new URL(image.replace(/&amp;/g, "&"), res.url).toString();
    } catch {
      image = undefined;
    }
  }
  return {
    finalUrl: res.url,
    price,
    image,
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
