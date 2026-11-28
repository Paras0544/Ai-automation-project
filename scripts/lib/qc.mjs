// Visual quality check on a rendered reel before it can be posted.
// An AI looks at a few frames (hook, first product, end grid) and checks them against data/principles.md.
// A failed reel is never posted; the reasons are logged so the reviews can fix the cause.
import fs from "node:fs";
import path from "node:path";
import { generateJson } from "./gemini.mjs";
import { paths } from "./env.mjs";

const S = (type, extra = {}) => ({ type, ...extra });
const schema = S("OBJECT", {
  properties: {
    pass: S("BOOLEAN"),
    score: S("INTEGER", { description: "1-10: how good and scroll-stopping this reel looks for the audience" }),
    issues: S("ARRAY", { items: S("STRING"), description: "Concrete problems, each one line. Empty if none." }),
    improvements: S("ARRAY", { items: S("STRING"), description: "Up to 3 specific ideas that would make this reel perform better next time" }),
  },
  required: ["pass", "score", "issues", "improvements"],
});

export async function qcReel(look, framePaths) {
  if (process.env.MOCK_AI === "1") return { pass: true, score: 7, issues: [], improvements: [], mock: true };
  const images = framePaths
    .filter((f) => fs.existsSync(f))
    .map((f) => ({ mimeType: "image/jpeg", data: fs.readFileSync(f).toString("base64") }));
  if (!images.length) return { pass: true, score: null, issues: ["no frames to check"], improvements: [] };
  const principles = fs.existsSync(path.join(paths.root, "data", "principles.md")) ? fs.readFileSync(path.join(paths.root, "data", "principles.md"), "utf8") : "";
  const items = look.items.map((i, n) => `#${n + 1} "${i.name}" ₹${i.price} (store title: "${i.productTitle || i.name}")`).join("\n");
  const prompt = `You are the strict quality checker for "Well Priced" (@wellpriced.fit), an Instagram reel page for budget menswear in India.
These images are frames from ONE reel (in order: hook screen, first product card, final grid). Reel format: ${look.kind}. Hook: "${look.hook}". Price cap shown: ₹${look.budget}.
Products as listed in the data:
${items}

FAIL the reel (pass=false) if ANY of these is true:
- any text is cut off, overlapping, unreadable, or misspelled in a way a viewer would notice
- a product photo is blank, broken, a placeholder, badly cropped (e.g. product mostly out of frame), or clearly not the garment type named
- a label's colour or garment type clearly doesn't match its photo
- a price shown on screen is above the price cap, or prices/labels are missing
- it looks cheap, cluttered or spammy, or breaks the brand standards below
Otherwise pass=true. Be strict but don't invent problems you can't see.

Brand standards:
${principles.slice(0, 3000)}`;
  try {
    return await generateJson(prompt, schema, { temperature: 0.2, images });
  } catch (e) {
    // a QC outage shouldn't stop posting; the pre-post live price check still runs
    return { pass: true, score: null, issues: [`QC unavailable: ${e.message.split("\n")[0]}`], improvements: [], unavailable: true };
  }
}
