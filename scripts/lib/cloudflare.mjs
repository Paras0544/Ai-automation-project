// Cloudflare Workers AI image generation (free tier: 10,000 neurons/day, no card needed).
// Uses FLUX.2 [klein] 4B, which takes up to 4 reference images (each must be under 512x512).
// .env needs CF_ACCOUNT_ID and CF_API_TOKEN.
import "./env.mjs";

export const FITS_MODEL = () => process.env.FITS_MODEL || "@cf/black-forest-labs/flux-2-klein-4b";
const BASE = () => process.env.CF_API_BASE || "https://api.cloudflare.com/client/v4";

function creds() {
  const account = process.env.CF_ACCOUNT_ID;
  const token = process.env.CF_API_TOKEN;
  if (!account || !token) {
    throw new Error(
      "Cloudflare is not set up. Add these two lines to .env:\n  CF_ACCOUNT_ID=your-account-id\n  CF_API_TOKEN=your-workers-ai-token\n(see README: Free AI fit images)",
    );
  }
  return { account, token };
}

// refs: array of { buffer, mime }  (max 4, each already resized under 512x512)
export async function generateImage({ prompt, refs = [], width = 768, height = 1344, seed }) {
  const { account, token } = creds();
  const form = new FormData();
  form.append("prompt", prompt);
  form.append("width", String(width));
  form.append("height", String(height));
  if (seed !== undefined) form.append("seed", String(seed));
  refs.slice(0, 4).forEach((r, i) => form.append(`input_image_${i}`, new Blob([r.buffer], { type: r.mime }), `ref${i}.jpg`));

  const res = await fetch(`${BASE()}/accounts/${account}/ai/run/${FITS_MODEL()}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
    signal: AbortSignal.timeout(120000),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.success === false) {
    const msg = (body.errors || []).map((e) => e.message).join("; ") || res.statusText;
    if (res.status === 401 || res.status === 403) throw new Error(`Cloudflare rejected the token (${res.status}). Check CF_API_TOKEN has Workers AI permission.\n${msg}`);
    if (res.status === 429 || /neuron|limit|quota/i.test(msg)) throw new Error(`Daily free limit reached on Cloudflare. It resets daily.\n${msg}`);
    throw new Error(`Cloudflare error ${res.status}: ${msg}`);
  }
  const b64 = body?.result?.image;
  if (!b64) throw new Error("Cloudflare returned no image");
  return Buffer.from(b64, "base64");
}
