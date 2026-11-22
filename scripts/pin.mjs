// npm run pin -- [N]   post up to N reels (default 1) that aren't on Pinterest yet.
// Also called by the autopilot after rendering (PINS_PER_RUN, default 2; set 0 to turn off).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { paths } from "./lib/env.mjs";
import { boardId, createPin } from "./lib/pinterest.mjs";
import { affiliateConfig } from "./lib/affiliate.mjs";

const pinnedFile = path.join(paths.root, "data", "learning", "pinned.json");
const readPinned = () => (fs.existsSync(pinnedFile) ? JSON.parse(fs.readFileSync(pinnedFile, "utf8")) : {});

// boards people actually search for
const BOARDS = [
  [/wedding|mehendi|sangeet|reception|shaadi|haldi/i, "Wedding Guest Outfits for Men", "Indian wedding guest looks for men, with real prices."],
  [/diwali|festive|puja|eid|holi|rakhi|navratri/i, "Festive Outfits for Men India", "Festive looks for Indian men, every piece linked with its price."],
  [/office|interview|work|meeting|presentation/i, "Office Outfits for Men", "Smart office looks for Indian men, under budget."],
  [/date|dinner|anniversary/i, "Date Night Outfits for Men", "First date and dinner outfits for men, with real prices."],
  [/winter|cold|delhi winter|december|january/i, "Winter Outfits for Men", "Winter layering for Indian men, every piece linked."],
  [/travel|trip|goa|vacation|holiday|beach/i, "Travel Outfits for Men", "Trip and vacation outfits for men, with real prices."],
  [/.*/, "Budget Outfits for Men", "Full outfits for Indian men that look expensive but aren't."],
];
const boardFor = (occasion) => BOARDS.find(([re]) => re.test(occasion || ""));
const inr = (n) => "₹" + Number(n || 0).toLocaleString("en-IN");

export function pinContent(look, siteUrl) {
  const total = look.items.reduce((s, i) => s + (i.price || 0), 0);
  const list = look.items.map((i) => `${i.name} ${inr(i.price)}`).join(" · ");
  const link = siteUrl ? `${siteUrl.replace(/\/$/, "")}/l/${look.id}/?utm_source=pinterest` : undefined;
  return {
    title: `${look.hook} | Full look ${inr(total)}`,
    description: `${look.caption || look.occasion}\n\n${list}\nTotal ${inr(total)}. Tap to shop every piece.\n\n#mensfashion #outfitideas #indianmenswear #affiliate`,
    altText: `Men's outfit for ${look.occasion}: ${look.items.map((i) => i.name).join(", ")}`,
    link,
  };
}

export async function pinPending(max = 1) {
  if (!max) return [];
  const cfg = affiliateConfig();
  const pinned = readPinned();
  const looks = fs
    .readdirSync(paths.looks)
    .filter((f) => f.endsWith(".json"))
    .map((f) => JSON.parse(fs.readFileSync(path.join(paths.looks, f), "utf8")))
    .filter((l) => !pinned[l.id] && fs.existsSync(path.join(paths.out, `${l.id}.mp4`)) && l.items?.every((i) => i.url))
    .sort((a, b) => fs.statSync(path.join(paths.out, `${a.id}.mp4`)).mtimeMs - fs.statSync(path.join(paths.out, `${b.id}.mp4`)).mtimeMs)
    .slice(0, max);
  const done = [];
  for (const look of looks) {
    const [, boardName, boardDesc] = boardFor(look.occasion);
    process.stdout.write(`Pinning ${look.id} → "${boardName}"… `);
    try {
      const c = pinContent(look, cfg.siteUrl);
      const cover = path.join(paths.out, `${look.id}.cover.jpg`);
      const pin = await createPin({
        board: await boardId(boardName, boardDesc),
        ...c,
        videoFile: path.join(paths.out, `${look.id}.mp4`),
        coverSeconds: look.coverSeconds,
        imageFile: fs.existsSync(cover) ? cover : undefined,
      });
      pinned[look.id] = { pinId: pin.id, board: boardName, at: new Date().toISOString() };
      fs.mkdirSync(path.dirname(pinnedFile), { recursive: true });
      fs.writeFileSync(pinnedFile, JSON.stringify(pinned, null, 2));
      console.log(`✓ pin ${pin.id}`);
      done.push(look.id);
    } catch (e) {
      console.log(`✗ ${e.message.split("\n")[0]}`);
      if (/login|logged in|401|403|APP_ID/i.test(e.message)) break;
    }
  }
  return done;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const n = Number(process.argv[2] || 1);
  const done = await pinPending(n);
  console.log(done.length ? `\nPosted ${done.length} pin(s).` : "\nNothing new to pin (every rendered reel is already on Pinterest).");
}
