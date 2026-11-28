// One look = one reel. This is the JSON you fill in for every video.
export type Item = {
  name: string; // "Light blue oxford shirt"
  store: string; // "Myntra"
  price: number; // 1299 (rupees)
  image: string; // real product photo, path inside /public, e.g. "looks/office-day1/shirt.jpg"
  why?: string; // one-line reason it works, shown on the item card
  url?: string; // product page link (you paste it; "npm run products" reads it)
  searchUrl?: string; // store search link the planner suggests
  productTitle?: string; // real title read from the product page
  wasPrice?: number; // price drops: highest price we recorded in the last 30 days
  wasDate?: string;
  dropPct?: number;
};

export type Look = {
  kind?: "outfit" | "finds" | "guess" | "pricedrop"; // non-outfit kinds: product-type reels, every item under `budget`
  id: string; // "office-day1" — also the output file name
  hook: string; // first 2 seconds, max ~8 words
  subhook?: string; // small line under the hook, e.g. "kitne ka fit?"
  fitImages?: string[]; // optional AI fit images; empty = outfit board of real product photos
  items: Item[]; // 3–5 real products
  cta: string; // "Comment FIT for links"
  status?: "needs-products" | "ready" | "needs-attention";
  mode?: "board" | "ai-fits";
  occasion?: string;
  budget?: number;
  caption?: string; // goes into out/<id>.caption.txt
  hashtags?: string[];
  fitPrompt?: string; // prompt for your try-on / image tool
};
