// Turns "occasion + budget" into a full look file using Gemini.
import fs from "node:fs";
import path from "node:path";
import { generateJson } from "./gemini.mjs";
import { paths, slugify } from "./env.mjs";
import { usableProducts, markUsed, MIN_CATALOG } from "./catalog.mjs";

const S = (type, extra = {}) => ({ type, ...extra });

const schema = S("OBJECT", {
  properties: {
    hook: S("STRING", { description: "First 2 seconds on screen. Max 8 words. Names the occasion." }),
    subhook: S("STRING", { description: "Short Hinglish line in lowercase, e.g. 'kitne ka fit?'" }),
    ctaKeyword: S("STRING", { description: "One UPPERCASE word people comment to get links, e.g. FIT, DATE, SHAADI" }),
    caption: S("STRING", { description: "Max 2 short lines, Hinglish ok, no hashtags" }),
    hashtags: S("ARRAY", { items: S("STRING"), description: "5 hashtags without #" }),
    fitPrompt: S("STRING", {
      description:
        "Prompt for an AI try-on/image tool: the brand's recurring Indian male model (early 20s, fit, short side-swept hair, neutral expression) wearing exactly these items, Indian setting matching the occasion, vertical 9:16, natural light, editorial menswear photo",
    }),
    items: S("ARRAY", {
      minItems: 3,
      maxItems: 5,
      items: S("OBJECT", {
        properties: {
          name: S("STRING", { description: "Short product name, e.g. 'Cream cable-knit sweater'" }),
          why: S("STRING", { description: "One line, max 6 words, why it works" }),
          store: S("STRING", { enum: ["Myntra", "Amazon", "Ajio"] }),
          targetPrice: S("INTEGER", { description: "Realistic Indian price in rupees" }),
          searchQuery: S("STRING", { description: "What to type in the store's search box to find it" }),
        },
        required: ["name", "why", "store", "targetPrice", "searchQuery"],
      }),
    }),
  },
  required: ["hook", "subhook", "ctaKeyword", "caption", "hashtags", "fitPrompt", "items"],
});

function prompt(occasion, budget) {
  return `You are the stylist behind "The Measured Man", a classy, honest men's fashion page for Indian guys aged 20-30.
Plan ONE outfit for this occasion: "${occasion}". Total budget: about ₹${budget}.

Rules:
- 3 to 5 items that are realistically sold on Myntra, Amazon India or Ajio; target prices must add up to roughly the budget.
- Suit Indian weather, culture and the specific occasion. Clean, put-together, not flashy.
- Never mention celebrities or real people. Never claim anyone wore or tested anything.
- Hook: confident, specific, max 8 words. Subhook: Hinglish, lowercase.
- Caption: 1-2 short lines; do not include hashtags or disclosures (added automatically).`;
}

function mock(occasion, budget) {
  const b = Number(budget);
  return {
    hook: `${occasion}. Sorted.`,
    subhook: "kitne ka fit?",
    ctaKeyword: "FIT",
    caption: `${occasion} ke liye clean fit, budget mein.`,
    hashtags: ["mensfashion", "indianmen", "outfitideas", "menswear", "styletips"],
    fitPrompt: `Indian male model wearing the outfit for ${occasion}, vertical 9:16, editorial`,
    items: [
      { name: "Oxford shirt", why: "Crisp, never stiff", store: "Myntra", targetPrice: Math.round(b * 0.3), searchQuery: "men light blue oxford shirt" },
      { name: "Slim chinos", why: "Goes with everything", store: "Myntra", targetPrice: Math.round(b * 0.3), searchQuery: "men navy slim chinos" },
      { name: "White sneakers", why: "Clean finish", store: "Amazon", targetPrice: Math.round(b * 0.4), searchQuery: "men white leather sneakers" },
    ],
  };
}

const searchUrl = (store, q) => {
  const e = encodeURIComponent(q);
  if (store === "Amazon") return `https://www.amazon.in/s?k=${e}`;
  if (store === "Ajio") return `https://www.ajio.com/search/?text=${e}`;
  return `https://www.myntra.com/${q.trim().toLowerCase().replace(/\s+/g, "-")}`;
};

function newId(occasion) {
  let id = slugify(occasion) || "look";
  while (fs.existsSync(path.join(paths.looks, `${id}.json`))) id = id.replace(/(-\d+)?$/, (m) => `-${(Number(m.slice(1)) || 1) + 1}`);
  return id;
}

// Uses your catalog when it has enough products (free); otherwise searches the web (needs paid Gemini).
export async function planLook(occasion, budget) {
  if (usableProducts().length >= MIN_CATALOG) return planFromCatalog(occasion, budget);
  return planFromWeb(occasion, budget);
}

// ---------- catalog planner ----------
const catalogSchema = S("OBJECT", {
  properties: {
    hook: schema.properties.hook,
    subhook: schema.properties.subhook,
    ctaKeyword: schema.properties.ctaKeyword,
    caption: schema.properties.caption,
    hashtags: schema.properties.hashtags,
    fitPrompt: schema.properties.fitPrompt,
    items: S("ARRAY", {
      minItems: 3,
      maxItems: 5,
      items: S("OBJECT", {
        properties: {
          id: S("STRING", { description: "Product id copied exactly from the catalog list" }),
          why: S("STRING", { description: "One line, max 6 words, why it works" }),
        },
        required: ["id", "why"],
      }),
    }),
  },
  required: ["hook", "subhook", "ctaKeyword", "caption", "hashtags", "fitPrompt", "items"],
});

function catalogPrompt(occasion, budget, products, feedback) {
  const list = products
    .map((p) => `${p.id} | ${p.category} | ${p.name} | ${p.colour || ""} | ₹${p.price} | ${(p.tags || []).join(" ")} | used ${p.timesUsed || 0}x`)
    .join("\n");
  return `You are the stylist behind "The Measured Man", a classy, honest men's fashion page for Indian guys aged 20-30.
Build ONE outfit for: "${occasion}". Budget: about ₹${budget} (total must not exceed ₹${Math.round(budget * 1.25)}).

Choose 3 to 5 products ONLY from this catalog (id | category | name | colour | price | suits | times used):
${list}

Rules:
- A complete, wearable outfit: one top OR one ethnic piece, one bottom (unless the ethnic piece is a full set), footwear if available; outerwear/accessories only if they suit the occasion and weather.
- Never two items from the same category, except accessories.
- Colours must work together. Suit Indian weather and the occasion.
- Prefer products used fewer times, so the page stays varied.
- Never mention celebrities. Never claim anyone wore or tested anything.
- Hook: confident, max 8 words. Subhook: Hinglish, lowercase. Caption: 1-2 lines, no hashtags.${feedback ? `\n\nYour previous answer was rejected: ${feedback}. Fix it.` : ""}`;
}

function mockCatalogPick(products, budget) {
  const pick = [];
  for (const cat of ["top", "bottom", "footwear", "outerwear"]) {
    const p = products.filter((x) => x.category === cat).sort((a, b) => (a.timesUsed || 0) - (b.timesUsed || 0) || a.price - b.price)[0];
    if (p && pick.reduce((s, x) => s + x.price, 0) + p.price <= budget * 1.25) pick.push(p);
  }
  return pick.map((p) => ({ id: p.id, why: "Clean and easy" }));
}

function validate(items, byId, budget) {
  if (!Array.isArray(items) || items.length < 3) return "pick at least 3 products";
  const seen = new Set();
  for (const it of items) {
    const p = byId.get(it.id);
    if (!p) return `"${it.id}" is not an id from the catalog`;
    if (p.category !== "accessory" && seen.has(p.category)) return `two items from category "${p.category}"`;
    seen.add(p.category);
  }
  const total = items.reduce((s, it) => s + byId.get(it.id).price, 0);
  if (total > budget * 1.25) return `total ₹${total} is over the ₹${Math.round(budget * 1.25)} limit`;
  if (!seen.has("top") && !seen.has("ethnic")) return "no top or ethnic piece";
  return null;
}

export async function planFromCatalog(occasion, budget) {
  budget = Number(budget);
  const products = usableProducts();
  const byId = new Map(products.map((p) => [p.id, p]));
  let ai, problem = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (process.env.MOCK_AI === "1") {
      ai = { ...mock(occasion, budget), items: mockCatalogPick(products, budget) };
    } else {
      ai = await generateJson(catalogPrompt(occasion, budget, products, problem), catalogSchema, { temperature: 0.8 });
    }
    problem = validate(ai.items, byId, budget);
    if (!problem) break;
    console.log(`  planner retry: ${problem}`);
  }
  if (problem) throw new Error(`Couldn't build a valid outfit from the catalog for "${occasion}": ${problem}. Add more products for this occasion or budget.`);

  const id = newId(occasion);
  const look = {
    id,
    source: "catalog",
    status: "ready",
    occasion,
    budget,
    hook: ai.hook,
    subhook: ai.subhook,
    cta: `Comment ${ai.ctaKeyword.toUpperCase()} for links`,
    caption: ai.caption,
    hashtags: ai.hashtags.map((h) => h.replace(/^#/, "")),
    fitPrompt: ai.fitPrompt,
    mode: "board",
    fitImages: [],
    items: ai.items.map((it) => {
      const p = byId.get(it.id);
      return { catalogId: p.id, name: p.name, why: it.why, store: p.store, price: p.price, targetPrice: p.price, image: p.image, url: p.url, productTitle: p.title };
    }),
  };
  fs.mkdirSync(paths.looks, { recursive: true });
  fs.writeFileSync(path.join(paths.looks, `${id}.json`), JSON.stringify(look, null, 2) + "\n");
  markUsed(look.items.map((i) => i.catalogId));
  return look;
}

// ---------- web planner (needs Google Search via paid Gemini to find products) ----------
export async function planFromWeb(occasion, budget) {
  const ai = process.env.MOCK_AI === "1" ? mock(occasion, budget) : await generateJson(prompt(occasion, budget), schema);

  const id = newId(occasion);

  const dir = `looks/${id}`;
  fs.mkdirSync(path.join(paths.public, dir), { recursive: true });

  const look = {
    id,
    status: "needs-products",
    occasion,
    budget: Number(budget),
    hook: ai.hook,
    subhook: ai.subhook,
    cta: `Comment ${ai.ctaKeyword.toUpperCase()} for links`,
    caption: ai.caption,
    hashtags: ai.hashtags.map((h) => h.replace(/^#/, "")),
    fitPrompt: ai.fitPrompt,
    // Default: outfit board of real product photos (no AI images). Set FITS_MODE=ai in .env to add AI model shots.
    mode: process.env.FITS_MODE === "ai" ? "ai-fits" : "board",
    fitImages: process.env.FITS_MODE === "ai" ? [`${dir}/fit-1.jpg`, `${dir}/fit-2.jpg`] : [],
    items: ai.items.map((it, i) => ({
      name: it.name,
      why: it.why,
      store: it.store,
      price: it.targetPrice,
      image: `${dir}/item-${i + 1}.jpg`,
      url: "",
      searchUrl: searchUrl(it.store, it.searchQuery),
    })),
  };

  fs.mkdirSync(paths.looks, { recursive: true });
  fs.writeFileSync(path.join(paths.looks, `${id}.json`), JSON.stringify(look, null, 2) + "\n");
  return look;
}
