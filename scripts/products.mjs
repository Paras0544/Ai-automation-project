// npm run products -- <look-id>
// For every item with a "url", reads the real product name, price and main image from the
// product page, saves the image to public/, and updates the look file.
// Best effort: some stores block automated requests. If one fails, save the photo yourself
// at the path it prints and type the real price into the JSON.
import fs from "node:fs";
import path from "node:path";
import { paths } from "./lib/env.mjs";
import { missing, printNextSteps } from "./lib/next-steps.mjs";
import { scrape, download, sleep } from "./lib/scrape.mjs";

export async function fetchProducts(id) {
  const file = path.join(paths.looks, `${id}.json`);
  const look = JSON.parse(fs.readFileSync(file, "utf8"));

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
      console.log(`✓ item ${i + 1}: ${it.name}  ₹${it.price}${p.price ? "" : " (price not found, check it)"}${p.inStock ? "" : "  ⚠ looks OUT OF STOCK"}`);
    } catch (e) {
      console.log(`✗ item ${i + 1} (${it.name}): ${e.message}\n    Save the product photo yourself as public/${it.image} and type the real price into the JSON.`);
    }
    await sleep(1500);
  }

  look.status = missing(look).length ? "needs-products" : "ready";
  fs.writeFileSync(file, JSON.stringify(look, null, 2) + "\n");
  printNextSteps(look);
}

if (process.argv[1]?.endsWith("products.mjs")) {
  const id = process.argv[2];
  if (!id) {
    console.log("Usage: npm run products -- <look-id>");
    process.exitCode = 1;
  } else {
    await fetchProducts(id);
  }
}
