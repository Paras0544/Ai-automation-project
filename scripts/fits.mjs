// npm run fits -- <look-id>          make fit-1.jpg and fit-2.jpg from the real product photos
// npm run fits -- <look-id> --force  regenerate even if they already exist
//
// Free: Cloudflare Workers AI (FLUX.2 [klein] 4B, Apache-2.0). Up to 4 product photos are sent
// as references. If public/brand/model.jpg exists and there is room (3 or fewer items), it is
// sent too, so the same model face appears across reels.
//
// ALWAYS look at the results before posting: the clothes must match the real products
// (colour, pattern, cut). If they don't, regenerate or make them by hand in AI Studio.
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { paths } from "./lib/env.mjs";
import { generateImage, FITS_MODEL } from "./lib/cloudflare.mjs";
import { printNextSteps } from "./lib/next-steps.mjs";

const SHOTS = [
  "full-body shot, standing facing the camera, relaxed confident pose",
  "three-quarter shot, walking slightly to the side, natural candid moment",
];

// Resize to fit inside 504x504 (the model needs references smaller than 512x512), on white.
async function toRef(file) {
  const buffer = await sharp(file)
    .resize(504, 504, { fit: "contain", background: "#ffffff" })
    .flatten({ background: "#ffffff" })
    .jpeg({ quality: 90 })
    .toBuffer();
  return { buffer, mime: "image/jpeg" };
}

function buildPrompt(look, items, withModelRef, shot) {
  const list = items.map((it, i) => `reference image ${i + 1}: ${it.productTitle || it.name}`).join("; ");
  const modelLine = withModelRef
    ? `The man is the person in reference image ${items.length + 1}.`
    : "The man is an Indian man in his early 20s, fit build, short side-swept black hair, neutral confident expression.";
  return [
    `Editorial menswear photograph, vertical 9:16. ${modelLine}`,
    `He is wearing exactly these garments, reproducing each one faithfully — same colour, pattern, fabric texture, collar, buttons and fit: ${list}.`,
    `Do not invent extra clothing, logos or text. ${shot}.`,
    `Setting: ${look.occasion || "a city street"} in India, natural light, realistic photo, sharp focus on the outfit.`,
    look.fitPrompt ? `Style notes: ${look.fitPrompt}` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

const [id, flag] = process.argv.slice(2);
if (!id) {
  console.log("Usage: npm run fits -- <look-id> [--force]");
  process.exitCode = 1;
} else {
  const file = path.join(paths.looks, `${id}.json`);
  const look = JSON.parse(fs.readFileSync(file, "utf8"));

  const withPhoto = look.items.filter((it) => fs.existsSync(path.join(paths.public, it.image)));
  if (withPhoto.length < look.items.length) {
    console.log(`Only ${withPhoto.length}/${look.items.length} product photos are in place. Run "npm run pick" or "npm run products" first.`);
    process.exitCode = 1;
  } else {
    if (look.items.length > 4) console.log("Note: the model takes 4 references max, so the last item is described in text only.");
    const items = look.items.slice(0, 4);
    const refs = [];
    for (const it of items) refs.push(await toRef(path.join(paths.public, it.image)));

    const modelRef = path.join(paths.public, "brand", "model.jpg");
    const withModelRef = items.length < 4 && fs.existsSync(modelRef);
    if (withModelRef) refs.push(await toRef(modelRef));

    if (!look.fitImages || look.fitImages.length === 0) {
      // this look was planned as an outfit board; switch it to AI model shots
      const dir = path.dirname(look.items[0].image);
      look.fitImages = [`${dir}/fit-1.jpg`, `${dir}/fit-2.jpg`];
      look.mode = "ai-fits";
      fs.writeFileSync(file, JSON.stringify(look, null, 2) + "\n");
    }
    console.log(`Generating with ${FITS_MODEL()} (${refs.length} reference image(s))…`);
    for (const [n, target] of look.fitImages.entries()) {
      const dest = path.join(paths.public, target);
      if (fs.existsSync(dest) && flag !== "--force") {
        console.log(`- ${target} already exists (use --force to redo)`);
        continue;
      }
      try {
        const img = await generateImage({
          prompt: buildPrompt(look, items, withModelRef, SHOTS[n % SHOTS.length]),
          refs,
          seed: Math.floor(Math.random() * 1e9),
        });
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        // the renderer crops to 1080x1920; save as high-quality JPEG
        await sharp(img).jpeg({ quality: 92 }).toFile(dest);
        console.log(`✓ public/${target}`);
      } catch (e) {
        console.log(`✗ ${target}: ${e.message}`);
        break;
      }
    }
    console.log("\nOpen the images and compare them with the product photos before rendering.");
    printNextSteps(look);
  }
}
