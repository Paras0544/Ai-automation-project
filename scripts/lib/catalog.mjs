// The product catalog: your curated list of real products that looks are built from.
//   data/catalog.csv   — YOUR list (edit in Excel/Notepad): url, category, tags, notes, price
//   data/catalog.json  — the machine's cache: real name, price, stock, photo, usage (don't edit)
//   public/catalog/    — downloaded product photos
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { paths } from "./env.mjs";
import { scrape, download, sleep } from "./scrape.mjs";
import { generateJson } from "./gemini.mjs";

export const CATEGORIES = ["top", "bottom", "outerwear", "footwear", "ethnic", "accessory"];
export const TAGS = [
  "office", "casual", "date", "party", "wedding", "festive", "winter", "summer", "monsoon",
  "travel", "gym", "old-money", "streetwear", "smart-casual", "basics",
];
export const MIN_CATALOG = 12; // below this, looks can't be varied enough
const STALE_DAYS = 3; // re-check price/stock if older than this

const csvPath = () => path.join(paths.root, "data", "catalog.csv");
const jsonPath = () => path.join(paths.root, "data", "catalog.json");
export const idOf = (url) => crypto.createHash("sha1").update(url.trim()).digest("hex").slice(0, 10);
const storeOf = (url) => {
  const h = (() => { try { return new URL(url).hostname; } catch { return ""; } })();
  if (h.endsWith("myntra.com")) return "Myntra";
  if (h.endsWith("amazon.in") || h.endsWith("amzn.in")) return "Amazon";
  if (h.endsWith("ajio.com")) return "Ajio";
  return h.replace(/^www\./, "") || "Store";
};

// --- tiny CSV reader/writer (handles quotes and commas inside quotes) ---
function parseCsv(text) {
  const rows = [];
  let row = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim()));
}
const esc = (v) => (/[",\n]/.test(String(v ?? "")) ? `"${String(v).replace(/"/g, '""')}"` : String(v ?? ""));
const HEADER = ["url", "category", "tags", "notes", "price"];

export function readCsv() {
  if (!fs.existsSync(csvPath())) return [];
  const rows = parseCsv(fs.readFileSync(csvPath(), "utf8").replace(/^﻿/, ""));
  const head = rows.shift()?.map((h) => h.trim().toLowerCase()) || HEADER;
  return rows
    .map((r) => Object.fromEntries(head.map((h, i) => [h, (r[i] || "").trim()])))
    .filter((r) => r.url && /^https?:\/\//.test(r.url));
}
export function writeCsv(rows) {
  const lines = [HEADER.join(","), ...rows.map((r) => HEADER.map((h) => esc(r[h])).join(","))];
  fs.writeFileSync(csvPath(), lines.join("\n") + "\n");
}
export function readCache() {
  return fs.existsSync(jsonPath()) ? JSON.parse(fs.readFileSync(jsonPath(), "utf8")) : {};
}
export function writeCache(cache) {
  fs.writeFileSync(jsonPath(), JSON.stringify(cache, null, 2) + "\n");
}

// --- Gemini (free text model) labels a product from its title ---
const labelSchema = {
  type: "OBJECT",
  properties: {
    name: { type: "STRING", description: "Short clean product name, max 5 words, e.g. 'Navy slim-fit chinos'" },
    category: { type: "STRING", enum: CATEGORIES },
    colour: { type: "STRING", description: "Main colour, one or two words" },
    tags: { type: "ARRAY", items: { type: "STRING", enum: TAGS }, description: "2 to 5 occasions/styles it suits" },
  },
  required: ["name", "category", "colour", "tags"],
};
async function label(title, url) {
  if (process.env.MOCK_AI === "1") {
    const t = title.toLowerCase();
    const category = /shoe|sneaker|boot|loafer/.test(t) ? "footwear" : /chino|jean|trouser|pant/.test(t) ? "bottom" : /jacket|bomber|blazer|coat/.test(t) ? "outerwear" : /kurta/.test(t) ? "ethnic" : /belt|watch/.test(t) ? "accessory" : "top";
    return { name: title.slice(0, 40), category, colour: "navy", tags: ["casual", "office", "date"] };
  }
  return generateJson(
    `Label this men's fashion product for an Indian menswear page.\nProduct title: "${title}"\nURL: ${url}`,
    labelSchema,
    { temperature: 0.2 },
  );
}

// Add product links. Reads each page, labels it, saves photo. Returns counts.
export async function addProducts(urls) {
  const rows = readCsv();
  const known = new Set(rows.map((r) => idOf(r.url)));
  let added = 0;
  for (const url of urls) {
    if (known.has(idOf(url))) { console.log(`- already in catalog: ${url}`); continue; }
    rows.push({ url, category: "", tags: "", notes: "", price: "" });
    known.add(idOf(url));
    added++;
  }
  writeCsv(rows);
  await refreshCatalog({ only: urls.map(idOf), force: true });
  return added;
}

// Re-checks name, price, stock and photo for every product (or only stale ones).
export async function refreshCatalog({ force = false, only = null } = {}) {
  const rows = readCsv();
  const cache = readCache();
  let csvChanged = false;
  const now = Date.now();
  for (const row of rows) {
    const id = idOf(row.url);
    if (only && !only.includes(id)) continue;
    const c = cache[id] || { id, url: row.url, timesUsed: 0 };
    const fresh = c.checkedAt && now - Date.parse(c.checkedAt) < STALE_DAYS * 864e5;
    if (fresh && !force && c.image && fs.existsSync(path.join(paths.public, c.image))) continue;

    process.stdout.write(`Checking ${row.url.slice(0, 70)}… `);
    try {
      const p = await scrape(row.url);
      c.title = p.name || c.title;
      c.price = p.price || Number(row.price) || c.price;
      c.inStock = p.inStock !== false;
      if (p.image) {
        const rel = `catalog/${id}.jpg`;
        await download(p.image, path.join(paths.public, rel));
        c.image = rel;
      }
      c.error = undefined;
      console.log(`₹${c.price ?? "?"}${c.inStock ? "" : " OUT OF STOCK"}`);
    } catch (e) {
      // store blocked us: keep any earlier data, fall back to your manual price/photo
      c.error = e.message;
      if (row.price) c.price = Number(row.price);
      const manual = `catalog/${id}.jpg`;
      if (fs.existsSync(path.join(paths.public, manual))) c.image = manual;
      console.log(`couldn't read the page (${e.message}). Add a price in catalog.csv and save the photo as public/${manual}`);
    }
    c.store = storeOf(row.url);
    c.url = row.url;

    // label with Gemini (free) if you didn't set category/tags yourself
    if (!row.category || !row.tags) {
      try {
        const l = await label(c.title || row.notes || row.url, row.url);
        c.name = l.name;
        c.colour = l.colour;
        if (!row.category) { row.category = l.category; csvChanged = true; }
        if (!row.tags) { row.tags = l.tags.join(" "); csvChanged = true; }
      } catch (e) {
        console.log(`  (couldn't auto-label: ${e.message.split("\n")[0]})`);
      }
    }
    c.name = c.name || (c.title || "").slice(0, 40);
    c.category = row.category;
    c.tags = row.tags.split(/[\s;|]+/).filter(Boolean);
    c.notes = row.notes;
    c.checkedAt = new Date().toISOString();
    cache[id] = c;
    writeCache(cache);
    await sleep(1200);
  }
  // forget products you deleted from the CSV
  const live = new Set(rows.map((r) => idOf(r.url)));
  for (const id of Object.keys(cache)) if (!live.has(id)) delete cache[id];
  writeCache(cache);
  if (csvChanged) writeCsv(rows);
}

// Products the planner may use right now.
export function usableProducts() {
  return Object.values(readCache()).filter(
    (c) => c.inStock !== false && c.price && c.image && c.category && fs.existsSync(path.join(paths.public, c.image)),
  );
}

export function markUsed(ids) {
  const cache = readCache();
  for (const id of ids) if (cache[id]) { cache[id].timesUsed = (cache[id].timesUsed || 0) + 1; cache[id].lastUsed = new Date().toISOString(); }
  writeCache(cache);
}
