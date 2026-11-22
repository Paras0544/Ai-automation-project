// npm run pick -- <look-id> 1:2 2:1 3:3     choose candidate 2 for item 1, candidate 1 for item 2…
// npm run pick -- <look-id> auto            first checked, in-stock candidate for every item
// Then fetches the real price and photo for each chosen product.
import fs from "node:fs";
import path from "node:path";
import { paths } from "./lib/env.mjs";
import { fetchProducts } from "./products.mjs";

const [id, ...choices] = process.argv.slice(2);
if (!id || choices.length === 0) {
  console.log("Usage: npm run pick -- <look-id> 1:2 2:1 …   or   npm run pick -- <look-id> auto");
  process.exitCode = 1;
} else {
  const file = path.join(paths.looks, `${id}.json`);
  const look = JSON.parse(fs.readFileSync(file, "utf8"));

  const picks = new Map();
  if (choices[0] === "auto") {
    look.items.forEach((it, i) => {
      const best = (it.candidates || []).findIndex((c) => c.verified && c.inStock !== false);
      if (best >= 0) picks.set(i, best);
    });
  } else {
    for (const c of choices) {
      const [item, cand] = c.split(":").map(Number);
      if (item && cand) picks.set(item - 1, cand - 1);
    }
  }

  for (const [i, n] of picks) {
    const item = look.items[i];
    const c = item?.candidates?.[n];
    if (!c) {
      console.log(`✗ item ${i + 1}: no candidate ${n + 1}`);
      continue;
    }
    if (item.url !== c.url) {
      // new choice: drop the old photo so the new product's photo is fetched
      const old = path.join(paths.public, item.image);
      if (fs.existsSync(old)) fs.rmSync(old);
    }
    item.url = c.url;
    item.store = c.store || item.store;
    console.log(`✓ item ${i + 1}: ${c.title}`);
  }
  fs.writeFileSync(file, JSON.stringify(look, null, 2) + "\n");
  console.log("");
  await fetchProducts(id);
}
