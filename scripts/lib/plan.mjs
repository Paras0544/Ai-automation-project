// Turns "occasion + budget" into a full look file using Gemini.
import fs from "node:fs";
import path from "node:path";
import { generateJson } from "./gemini.mjs";
import { paths, slugify } from "./env.mjs";

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

export async function planLook(occasion, budget) {
  const ai = process.env.MOCK_AI === "1" ? mock(occasion, budget) : await generateJson(prompt(occasion, budget), schema);

  let id = slugify(occasion) || "look";
  while (fs.existsSync(path.join(paths.looks, `${id}.json`))) id = id.replace(/(-\d+)?$/, (m) => `-${(Number(m.slice(1)) || 1) + 1}`);

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
    fitImages: [`${dir}/fit-1.jpg`, `${dir}/fit-2.jpg`],
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
