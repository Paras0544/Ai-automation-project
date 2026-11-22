// npm run find -- <look-id>
// For each item that has no product link yet, Gemini (with Google Search) finds up to 3 real
// product pages near the target price. Each link is opened to check it exists and to read the
// real price. Results are saved as "candidates" in the look file. Then pick with:
//   npm run pick -- <look-id> 1:2 2:1 3:1 4:3     (item:candidate)
//   npm run pick -- <look-id> auto                 (first good candidate for every item)
import fs from "node:fs";
import path from "node:path";
import { paths } from "./lib/env.mjs";
import { searchJson } from "./lib/gemini.mjs";
import { scrape, sleep } from "./lib/scrape.mjs";

const STORES = ["myntra.com", "ajio.com", "amazon.in"];
const storeOf = (url) => {
  try {
    const host = new URL(url).hostname;
    return STORES.find((s) => host.endsWith(s));
  } catch {
    return undefined;
  }
};

function prompt(item, look) {
  return `Find 3 real, currently listed product pages for this men's item, for an Indian shopper.
Item: ${item.name}
Occasion: ${look.occasion}
Target price: about ₹${item.price} (stay within ±30%)
Preferred store: ${item.store}. Also allowed: Myntra, Ajio, Amazon.in.

Use Google Search. Only return product detail pages (not search or category pages) on myntra.com, ajio.com or amazon.in.
Answer with ONLY a JSON array, no other text:
[{"title": "...", "store": "Myntra|Ajio|Amazon", "url": "https://...", "price": 1299}]`;
}

function mockCandidates(item) {
  const base = process.env.MOCK_SHOP || "http://127.0.0.1:8765";
  return [1, 2, 3].map((n) => ({ title: `${item.name} option ${n}`, store: item.store, url: `${base}/item${n}.html`, price: item.price }));
}

async function verify(c) {
  try {
    const p = await scrape(c.url);
    const url = p.finalUrl || c.url;
    if (!p.price && !p.image) return { ...c, url, verified: false, note: "page has no product data" };
    return { ...c, url, title: p.name || c.title, price: p.price || c.price, inStock: p.inStock, verified: true };
  } catch (e) {
    // Store blocked the check: keep it, but mark it so you look at it yourself
    return { ...c, verified: false, note: e.message };
  }
}

const id = process.argv[2];
if (!id) {
  console.log("Usage: npm run find -- <look-id>");
  process.exitCode = 1;
} else {
  const file = path.join(paths.looks, `${id}.json`);
  const look = JSON.parse(fs.readFileSync(file, "utf8"));

  for (const [i, item] of look.items.entries()) {
    if (item.url) continue;
    process.stdout.write(`Searching item ${i + 1}: ${item.name}… `);
    let raw = [];
    try {
      if (process.env.MOCK_AI === "1") {
        raw = mockCandidates(item);
      } else {
        const { data } = await searchJson(prompt(item, look));
        raw = Array.isArray(data) ? data : [];
      }
    } catch (e) {
      console.log(`\n  ✗ ${e.message}`);
      break;
    }
    // keep only product links on allowed stores (mock mode allows the local test shop)
    const allowed = raw.filter((c) => c?.url && (process.env.MOCK_AI === "1" || storeOf(c.url))).slice(0, 3);
    const checked = [];
    for (const c of allowed) {
      checked.push(await verify(c));
      await sleep(1000);
    }
    // real, in-stock, closest to target price first
    checked.sort(
      (a, b) =>
        Number(b.verified && b.inStock !== false) - Number(a.verified && a.inStock !== false) ||
        Math.abs((a.price || 1e9) - item.price) - Math.abs((b.price || 1e9) - item.price),
    );
    item.candidates = checked;
    console.log(checked.length ? `${checked.length} found` : "none found, use the search link instead");
    checked.forEach((c, n) => {
      const flag = c.verified ? (c.inStock === false ? "out of stock" : "checked") : `not checked: ${c.note}`;
      console.log(`   ${n + 1}. ₹${c.price ?? "?"}  ${c.title}  [${c.store}] (${flag})\n      ${c.url}`);
    });
    fs.writeFileSync(file, JSON.stringify(look, null, 2) + "\n"); // save as we go
    await sleep(4000); // free-tier friendly
  }

  console.log(`\nOpen the links you like, then pick, e.g.:\n  npm run pick -- ${id} ${look.items.map((_, i) => `${i + 1}:1`).join(" ")}\nor take the top option for every item:\n  npm run pick -- ${id} auto`);
}
