// "Finds" reels: ONE kind of product (jackets, hoodies, cargos…), 4-5 picks, every one under a price cap.
// Products, prices and stock come from the stores' live feeds (shopify.mjs), so what the reel shows is what the link sells.
// Idea line format (data/ideas.txt):   Hoodies under ₹1,499 | hoodie | 1499
import fs from "node:fs";
import path from "node:path";
import { generateJson } from "./gemini.mjs";
import { paths, slugify } from "./env.mjs";
import { readCache, markUsed, readHistory } from "./catalog.mjs";
import { rulesForPrompt } from "./learning.mjs";
import { ensureImage, shortName } from "./shopify.mjs";
import { pickVariant, readStrategy } from "./strategy.mjs";

const HOOK_STYLE = {
  question: "Write the hook as a direct question to the viewer.",
  "bold-claim": "Write the hook as a bold, confident claim (true, no exaggeration).",
  pov: 'Write the hook as a "POV:" line the viewer relates to.',
  number: "Start the hook with the number of picks or the price cap.",
};

export const MIN_FINDS = 4;
const MAX_FINDS = 5;
const inr = (n) => "₹" + Number(n).toLocaleString("en-IN");
const COLOURS = /\b(black|white|off-white|cream|beige|navy|blue|light blue|sky|green|olive|sage|brown|tan|grey|gray|charcoal|maroon|red|pink|purple|lilac|yellow|mustard|orange|rust|teal|khaki|camel|ecru)\b/gi;

// same design in another colour = same style (Bear House: jude-cr, jude-bk…); one per style keeps reels varied
const styleKey = (c) => (c.title || "").toLowerCase().replace(COLOURS, "").replace(/\b(men|mens|&|and)\b/g, "").replace(/[^a-z]+/g, " ").trim();

function onePerStyle(list) {
  const seen = new Set();
  return list.filter((c) => {
    const k = styleKey(c);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export function findsCandidates(types, cap) {
  const want = new Set(String(types).split(/[,\s]+/).filter(Boolean));
  const any = want.has("any") || want.size === 0;
  return onePerStyle(
    Object.values(readCache())
      .filter((c) => c.source === "shopify" && c.inStock !== false && (any || want.has(c.type)) && c.price && c.price <= cap && c.imageUrl)
      .sort((a, b) => (a.timesUsed || 0) - (b.timesUsed || 0) || a.price - b.price),
  );
}

// Real price drops from OUR OWN daily price history: today's price vs the highest price we saw in the last 30 days.
export function priceDrops(minPct = 10, days = 30) {
  const h = readHistory();
  const since = new Date(Date.now() - days * 864e5).toISOString().slice(0, 10);
  const out = [];
  for (const c of Object.values(readCache())) {
    if (c.source !== "shopify" || c.inStock === false || !c.price || !c.imageUrl) continue;
    const pts = (h[c.id] || []).filter((p) => p[0] >= since && p[2] !== 0);
    if (pts.length < 2) continue;
    const top = pts.reduce((m, p) => (p[1] > m[1] ? p : m), pts[0]);
    const pct = Math.round(((top[1] - c.price) / top[1]) * 100);
    if (pct >= minPct && top[1] > c.price) out.push({ ...c, wasPrice: top[1], wasDate: top[0], dropPct: pct, trackedSince: pts[0][0] });
  }
  return onePerStyle(out.sort((a, b) => b.dropPct - a.dropPct));
}

const S = (type, extra = {}) => ({ type, ...extra });
const schema = S("OBJECT", {
  properties: {
    hook: S("STRING", { description: "On-screen hook, max 8 words. Specific and confident. No numbers except the price cap." }),
    subhook: S("STRING", { description: "Short Hinglish line, lowercase, max 6 words" }),
    caption: S("STRING", { description: "1 short line, Hinglish ok, no prices, no hashtags" }),
    hashtags: S("ARRAY", { items: S("STRING"), description: "5 hashtags without #" }),
    picks: S("ARRAY", {
      minItems: MIN_FINDS,
      maxItems: MAX_FINDS,
      items: S("OBJECT", {
        properties: {
          id: S("STRING", { description: "Product id copied exactly from the list" }),
          label: S("STRING", { description: "Display name, max 5 words, made ONLY from words in the product's name (shorten it; never add colours, fabrics or features)" }),
          why: S("STRING", { description: "Max 5 words on how to wear it or why it looks good. Styling only: never claim fabric, warmth, quality, fit or features." }),
        },
        required: ["id", "label", "why"],
      }),
    }),
  },
  required: ["hook", "subhook", "caption", "hashtags", "picks"],
});

const FORMAT_BRIEF = {
  finds: (topic, cap) => `Make ONE "finds" reel: "${topic}". Every product must cost at most ${inr(cap)}. The reel shows each product with its price, then all of them together.`,
  guess: (topic, cap) => `Make ONE "guess the price" reel: "${topic}". Each product appears with "guess the price?" before its real price is revealed. Pick products that LOOK more expensive than they are (clean, premium-looking), with DIFFERENT prices so guessing is fun. The hook should dare viewers to guess. Every product costs at most ${inr(cap)}.`,
  steal: (topic, cap) => `Make ONE "steal the look" reel: "${topic}". Build ONE complete outfit in that aesthetic from 3 or 4 pieces, exactly one per category (top, bottom, footwear, and optionally a layer/outerwear). The pieces must go together (colours, vibe). Total of all pieces must be at most ${inr(cap)}: add up the prices before answering (the list is sorted cheapest first). The hook should make the look feel aspirational and the price feel like a steal.`,
  pricedrop: (topic) => `Make ONE "price drop" reel: "${topic}". These products are cheaper today than the highest price we recorded in the last 30 days (shown as "was"). The hook should create urgency without exaggerating.`,
};

function prompt(topic, cap, list, problem, format = "finds", hook = null) {
  return `You run "Well Priced" (@wellpriced.fit), an honest Indian menswear page for guys aged 18-28 on a budget. Promise: looks expensive, costs little.
${FORMAT_BRIEF[format](topic, cap)}${hook && HOOK_STYLE[hook] ? `\nHook style: ${HOOK_STYLE[hook]}` : ""}

Pick ${MIN_FINDS} to ${MAX_FINDS} products ONLY from this list (id | name | price | sizes in stock | times used before):
${list}

Rules:
- Pick the ones a stylish 22-year-old would actually want right now: trendy but wearable, clean colours, no loud slogans or cartoon prints.
- Make the set varied: different colours AND visibly different styles (never 3 near-identical items), and prefer products used fewer times.
- Labels: shorten the product name; keep EVERY colour in it and never invent colours, fabrics or features that aren't in the name.
- Never mention celebrities. Never claim you wore or tested anything. Don't state prices in the hook other than "under ${inr(cap)}".${rulesForPrompt()}${problem ? `\n\nYour previous answer was rejected: ${problem}. Fix it.` : ""}`;
}

function validate(ai, byId, cap, need = MIN_FINDS, format = "finds") {
  const picks = ai?.picks || [];
  if (picks.length < need) return `pick at least ${need} products`;
  if (format === "steal") {
    const cats = picks.map((p) => byId.get(p.id)?.category);
    if (new Set(cats).size !== cats.length) return "use exactly one piece per category";
    if (!cats.includes("top") || !cats.includes("bottom") || !cats.includes("footwear")) return "the look needs a top, a bottom and footwear";
    const total = picks.reduce((s, p) => s + (byId.get(p.id)?.price || 0), 0);
    if (total > cap) return `the pieces add up to ${inr(total)}, over ${inr(cap)}`;
    return null;
  }
  const seen = new Set();
  for (const p of picks) {
    const c = byId.get(p.id);
    if (!c) return `"${p.id}" is not an id from the list`;
    if (seen.has(p.id)) return `"${p.id}" picked twice`;
    seen.add(p.id);
    if (format !== "steal" && c.price > cap) return `${p.id} costs ${inr(c.price)}, over ${inr(cap)}`;
  }
  return null;
}

// keep the AI's label only if its colours exactly match the product name's (none added, none dropped)
function safeLabel(label, title) {
  const has = new Set((title.match(COLOURS) || []).map((x) => x.toLowerCase()));
  const got = new Set((label.match(COLOURS) || []).map((x) => x.toLowerCase()));
  const adds = [...got].some((x) => !has.has(x)) || [...has].some((x) => !got.has(x));
  const tooLong = label.split(/\s+/).length > 6;
  return !label || adds || tooLong ? shortName(title) : label.charAt(0).toUpperCase() + label.slice(1);
}

export const FORMATS = ["finds", "guess", "pricedrop", "steal"];
export const minFor = (format) => (format === "guess" || format === "pricedrop" || format === "steal" ? 3 : MIN_FINDS);

export function candidatesFor(format, types, cap) {
  if (format === "pricedrop") return priceDrops().filter((c) => c.price <= cap).slice(0, 25);
  if (format === "steal") {
    // a few options per category; each piece must leave room for the others
    const all = findsCandidates("any", Math.min(Math.round(cap / 2.6), 2499)).sort((a, b) => a.price - b.price || (a.timesUsed || 0) - (b.timesUsed || 0));
    const by = {};
    for (const c of all) (by[c.category] ||= []).length < 8 && by[c.category].push(c);
    return ["top", "bottom", "footwear", "outerwear"].flatMap((k) => by[k] || []);
  }
  return findsCandidates(types, cap).slice(0, 25);
}

export async function planFinds(topic, types, cap, format = "finds") {
  cap = Number(cap);
  if (!FORMATS.includes(format)) throw new Error(`unknown format "${format}"`);
  const need = minFor(format);
  const cands = candidatesFor(format, types, cap);
  if (cands.length < need) throw new Error(`only ${cands.length} usable products for ${format} "${types}" under ${inr(cap)} right now`);
  const byId = new Map(cands.map((c) => [c.id, c]));
  const list = cands.map((c) => `${c.id} | ${format === "steal" ? `[${c.category}] ` : ""}${c.title} | ${inr(c.price)}${c.wasPrice ? ` (was ${inr(c.wasPrice)}, -${c.dropPct}%)` : ""} | ${c.sizesInStock ?? "?"} sizes | used ${c.timesUsed || 0}x`).join("\n");

  const hookStyle = pickVariant("hook");
  const hashtagStyle = pickVariant("hashtags");
  const voiceover = pickVariant("voiceover") || "off";
  let ai, problem = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    ai = process.env.MOCK_AI === "1"
      ? { hook: `${topic}.`, subhook: "sab budget mein", caption: "Save karo, baad mein kaam aayega.", hashtags: ["mensfashion", "budgetfashion", "indianmen", "winterfashion", "outfitideas"], picks: (format === "steal" ? ["top", "bottom", "footwear"].map((k) => cands.find((c) => c.category === k)).filter(Boolean) : cands.slice(0, format === "guess" ? 4 : 5)).map((c) => ({ id: c.id, label: c.name, why: "Layer it over a tee" })) }
      : await generateJson(prompt(topic, cap, list, problem, format, hookStyle), schema, { temperature: 0.7 });
    problem = validate(ai, byId, cap, need, format);
    if (!problem) break;
    console.log(`  finds retry: ${problem}`);
  }
  if (problem && format === "steal") {
    // fall back to the cheapest valid look (one per category) so the series doesn't skip a day
    const pick = ["top", "bottom", "footwear"].map((k) => cands.filter((c) => c.category === k).sort((a, b) => a.price - b.price)[0]);
    if (pick.every(Boolean) && pick.reduce((t, c) => t + c.price, 0) <= cap) {
      ai = { ...(ai || {}), picks: pick.map((c) => ({ id: c.id, label: c.name, why: "" })) };
      ai.hook ||= topic; ai.subhook ||= ""; ai.caption ||= topic; ai.hashtags ||= ["mensfashion", "budgetfashion", "stealthelook"];
      problem = null;
      console.log("  steal: used the cheapest valid combination");
    }
  }
  if (problem) throw new Error(`couldn't plan "${topic}": ${problem}`);

  const items = [];
  for (const p of ai.picks.slice(0, format === "guess" ? 4 : MAX_FINDS)) {
    const c = byId.get(p.id);
    try {
      const image = await ensureImage(c);
      items.push({
        catalogId: c.id, name: safeLabel(p.label, c.title), why: p.why, store: c.store, price: c.price, image, url: c.url, productTitle: c.title, type: c.type,
        category: c.category, sizesInStock: c.sizesInStock, ...(c.mrp && c.mrp > c.price ? { mrp: c.mrp } : {}),
        ...(c.wasPrice ? { wasPrice: c.wasPrice, wasDate: c.wasDate, dropPct: c.dropPct } : {}),
      });
    } catch (e) {
      console.log(`  skipped ${c.id}: ${e.message}`);
    }
  }
  if (items.length < need) throw new Error(`only ${items.length} product photos downloaded for "${topic}"`);

  let id = slugify(topic) || "finds";
  while (fs.existsSync(path.join(paths.looks, `${id}.json`))) id = id.replace(/(-\d+)?$/, (m) => `-${(Number(m.slice(1)) || 1) + 1}`);
  const stores = [...new Set(items.map((i) => i.store))];
  const look = {
    id,
    kind: format,
    format,
    source: "catalog",
    status: "ready",
    occasion: topic,
    type: types,
    budget: cap, // per-item cap
    hook: ai.hook,
    subhook: ai.subhook,
    ...(() => {
      const dm = readStrategy().dm || {};
      const kw = (dm.keyword || "LINK").toUpperCase();
      if (dm.enabled) return { dmKeyword: kw, cta: format === "guess" ? `Guessed right? Comment ${kw} for every link` : `Comment ${kw} for every link` };
      return { cta: format === "guess" ? "How many did you guess right? 👇" : `Links in bio · ${stores.join(" & ")}` };
    })(),
    caption: ai.caption,
    hashtags: (() => {
      const tags = ai.hashtags.map((h) => h.replace(/^#/, "").replace(/\s+/g, ""));
      const broad = ["mensfashion", "menswear", "budgetfashion"];
      if (hashtagStyle === "none") return [];
      if (hashtagStyle === "niche-3") return tags.filter((t) => !broad.includes(t.toLowerCase())).slice(0, 3);
      return tags.slice(0, 5);
    })(),
    hookStyle,
    hashtagStyle,
    voiceover,
    mode: "board",
    fitImages: [],
    pricesCheckedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    items,
  };
  fs.mkdirSync(paths.looks, { recursive: true });
  fs.writeFileSync(path.join(paths.looks, `${id}.json`), JSON.stringify(look, null, 2) + "\n");
  markUsed(items.map((i) => i.catalogId));
  return look;
}
