// npm run catalog -- add <link> [<link> …]   add products (reads the page, labels it, saves the photo)
// npm run catalog                            re-check prices, stock and photos (only ones older than 3 days)
// npm run catalog -- refresh                 re-check everything now
// npm run catalog -- list                    show what's in the catalog by category
import { addProducts, refreshCatalog, readCache, usableProducts, CATEGORIES, MIN_CATALOG } from "./lib/catalog.mjs";

const [cmd, ...rest] = process.argv.slice(2);

if (cmd === "add") {
  const urls = rest.filter((u) => /^https?:\/\//.test(u));
  if (!urls.length) {
    console.log("Usage: npm run catalog -- add https://www.myntra.com/... https://www.amazon.in/...");
  } else {
    const n = await addProducts(urls);
    console.log(`\nAdded ${n} product(s).`);
    summary();
  }
} else if (cmd === "list") {
  summary(true);
} else {
  await refreshCatalog({ force: cmd === "refresh" });
  summary();
}

function summary(detailed = false) {
  const all = Object.values(readCache());
  const usable = usableProducts();
  console.log(`\nCatalog: ${usable.length} usable of ${all.length} products (need ${MIN_CATALOG}+ for varied looks).`);
  for (const cat of CATEGORIES) {
    const items = usable.filter((p) => p.category === cat);
    console.log(`  ${cat.padEnd(10)} ${String(items.length).padStart(3)}`);
    if (detailed) for (const p of items) console.log(`      ₹${String(p.price).padEnd(6)} ${p.name}  [${p.store}]  used ${p.timesUsed || 0}x`);
  }
  const usableIds = new Set(usable.map((p) => p.id));
  const problems = all.filter((p) => !usableIds.has(p.id));
  if (problems.length) {
    console.log(`\n  Not usable right now (${problems.length}):`);
    for (const p of problems) console.log(`    ${p.inStock === false ? "out of stock" : p.error ? "page blocked" : "missing data"}: ${p.url}`);
  }
}
