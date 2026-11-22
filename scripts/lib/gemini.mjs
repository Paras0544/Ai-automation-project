// Minimal Gemini client over REST (no SDK), asking for JSON that matches a schema.
// Set GEMINI_API_KEY in .env. Optional: GEMINI_MODEL (default below), MOCK_AI=1 to skip the API.
import { envFileFound, envFilePath } from "./env.mjs";

const BASE = process.env.GEMINI_BASE || "https://generativelanguage.googleapis.com/v1beta";
export const model = () => process.env.GEMINI_MODEL || "gemini-3.5-flash";

function key() {
  const k = process.env.GEMINI_API_KEY;
  if (!k) {
    throw new Error(
      envFileFound
        ? `Found the .env file but GEMINI_API_KEY is empty. Open it (notepad .env), put your key after GEMINI_API_KEY= and save.`
        : `No .env file at ${envFilePath}\nCreate it in PowerShell:\n  Copy-Item .env.example .env\n  notepad .env\nthen put your key after GEMINI_API_KEY= and save.`,
    );
  }
  return k;
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let fallback; // a backup model, picked automatically if the main one stays overloaded

// Busy servers (503/500) or a per-minute limit: wait and retry, then try a backup model.
// A daily quota ("quota"/"billing") is not retried.
export async function generateJson(prompt, schema, opts = {}) {
  const delays = [5000, 15000, 30000, 60000];
  let lastErr;
  for (let i = 0; i <= delays.length; i++) {
    const m = i >= 2 && fallback ? fallback : model();
    try {
      return await callJson(m, prompt, schema, opts);
    } catch (e) {
      lastErr = e;
      if (!e.retry || i === delays.length) break;
      if (i === 1 && !fallback) fallback = await pickFallback().catch(() => undefined);
      console.log(`  (Gemini busy: ${e.status}. Retrying in ${delays[i] / 1000}s${i >= 1 && fallback ? ` with ${fallback}` : ""}…)`);
      await wait(delays[i]);
    }
  }
  throw lastErr;
}

async function pickFallback() {
  const all = await listModels();
  const ok = all.filter((n) => /flash/i.test(n) && !/image|tts|audio|live|embed|preview|exp/i.test(n) && n !== model());
  return ok.find((n) => /lite/i.test(n)) || ok[0];
}

async function callJson(m, prompt, schema, { temperature = 0.9 } = {}) {
  const res = await fetch(`${BASE}/models/${m}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key() },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature, responseMimeType: "application/json", responseSchema: schema },
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = body?.error?.message || res.statusText;
    if (res.status === 404) throw new Error(`Model "${m}" not found. Run "npm run models" and set GEMINI_MODEL in .env.\n${msg}`);
    const err = new Error(res.status === 429 ? `Free-tier limit hit, wait a minute and retry.\n${msg}` : `Gemini error ${res.status}: ${msg}`);
    err.status = res.status;
    err.retry = [500, 502, 503, 504].includes(res.status) || (res.status === 429 && !/per day|daily|billing/i.test(msg));
    throw err;
  }
  const text = body?.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") || "";
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("Gemini did not return valid JSON:\n" + text.slice(0, 500));
  }
}

// Asks Gemini with Google Search turned on, so answers come from live web pages.
// Returns parsed JSON from the answer plus the source URLs Google used.
export async function searchJson(prompt) {
  const res = await fetch(`${BASE}/models/${model()}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key() },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      tools: [{ google_search: {} }],
      generationConfig: { temperature: 0.2 },
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = body?.error?.message || res.statusText;
    if (res.status === 429) {
      throw new Error(
        /quota|billing/i.test(msg)
          ? "Google Search via Gemini is not included in the free tier. Turn on billing in AI Studio (5,000 searches/month stay free) and set a monthly spend cap, then run again. Unfinished looks resume automatically.\n" + msg
          : `Search limit hit, wait a minute and retry.\n${msg}`,
      );
    }
    throw new Error(`Gemini search error ${res.status}: ${msg}`);
  }
  const cand = body?.candidates?.[0];
  const text = cand?.content?.parts?.map((p) => p.text || "").join("") || "";
  const sources = (cand?.groundingMetadata?.groundingChunks || []).map((c) => c.web?.uri).filter(Boolean);
  const jsonText = (text.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, text])[1];
  const start = jsonText.search(/[[{]/);
  let data = null;
  try {
    data = JSON.parse(jsonText.slice(start));
  } catch {
    const arr = jsonText.slice(start).match(/\[[\s\S]*\]/);
    try {
      data = arr ? JSON.parse(arr[0]) : null;
    } catch {}
  }
  return { data, sources, text };
}

export async function listModels() {
  const res = await fetch(`${BASE}/models?pageSize=200`, { headers: { "x-goog-api-key": key() } });
  const body = await res.json();
  if (!res.ok) throw new Error(body?.error?.message || res.statusText);
  return (body.models || [])
    .filter((m) => (m.supportedGenerationMethods || []).includes("generateContent"))
    .map((m) => m.name.replace("models/", ""));
}
