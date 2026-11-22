import fs from "node:fs";
import path from "node:path";
import { paths } from "./env.mjs";

const exists = (rel) => fs.existsSync(path.join(paths.public, rel));

// What is still missing before this look can be rendered.
export function missing(look) {
  const m = [];
  look.items.forEach((it, i) => {
    if (!exists(it.image)) m.push({ kind: "product", i, it });
  });
  look.fitImages.forEach((f) => {
    if (!exists(f)) m.push({ kind: "fit", file: f });
  });
  return m;
}

export function printNextSteps(look) {
  const m = missing(look);
  if (m.length === 0) {
    console.log(`  Ready. Render with: npm run render -- ${look.id}`);
    return;
  }
  console.log(`\n  Next steps for ${look.id}:`);
  const products = m.filter((x) => x.kind === "product");
  if (products.length) {
    console.log(`  1. Pick real products. Paste each product link into "url" in data/looks/${look.id}.json, then run: npm run products -- ${look.id}`);
    for (const { i, it } of products) console.log(`     item ${i + 1}: ${it.name} (~₹${it.price}, ${it.store})  search: ${it.searchUrl}`);
  }
  const fits = m.filter((x) => x.kind === "fit");
  if (fits.length) {
    console.log(`  2. Make the AI fit images in your try-on tool using the real product photos, and save them as:`);
    for (const f of fits) console.log(`     public/${f.file}`);
    console.log(`     Prompt: ${look.fitPrompt}`);
  }
  console.log(`  3. Render: npm run render -- ${look.id}`);
}
