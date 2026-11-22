// Minimal Gemini client over REST (no SDK), asking for JSON that matches a schema.
// Set GEMINI_API_KEY in .env. Optional: GEMINI_MODEL (default below), MOCK_AI=1 to skip the API.
import { envFileFound, envFilePath } from "./env.mjs";

const BASE = "https://generativelanguage.googleapis.com/v1beta";
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

export async function generateJson(prompt, schema, { temperature = 0.9 } = {}) {
  const res = await fetch(`${BASE}/models/${model()}:generateContent`, {
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
    if (res.status === 404) throw new Error(`Model "${model()}" not found. Run "npm run models" and set GEMINI_MODEL in .env.\n${msg}`);
    if (res.status === 429) throw new Error(`Free-tier limit hit, wait a minute and retry.\n${msg}`);
    throw new Error(`Gemini error ${res.status}: ${msg}`);
  }
  const text = body?.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") || "";
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("Gemini did not return valid JSON:\n" + text.slice(0, 500));
  }
}

export async function listModels() {
  const res = await fetch(`${BASE}/models?pageSize=200`, { headers: { "x-goog-api-key": key() } });
  const body = await res.json();
  if (!res.ok) throw new Error(body?.error?.message || res.statusText);
  return (body.models || [])
    .filter((m) => (m.supportedGenerationMethods || []).includes("generateContent"))
    .map((m) => m.name.replace("models/", ""));
}
