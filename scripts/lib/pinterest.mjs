// Pinterest API v5: login tokens, boards, video upload, pins.
// .env: PINTEREST_APP_ID, PINTEREST_APP_SECRET, PINTEREST_ACCESS_TOKEN, PINTEREST_REFRESH_TOKEN
// (the last two are written by "npm run pinterest:login"). PINTEREST_API_BASE overrides the API host (tests/sandbox).
import fs from "node:fs";
import { envFilePath } from "./env.mjs";

export const API = () => process.env.PINTEREST_API_BASE || "https://api.pinterest.com/v5";
export const SCOPES = "boards:read,boards:write,pins:read,pins:write,user_accounts:read";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// write/replace KEY=value lines in .env (never printed)
export function saveEnv(values) {
  let text = fs.existsSync(envFilePath) ? fs.readFileSync(envFilePath, "utf8") : "";
  for (const [k, v] of Object.entries(values)) {
    const line = `${k}=${v}`;
    const re = new RegExp(`^${k}=.*$`, "m");
    text = re.test(text) ? text.replace(re, line) : `${text.replace(/\s*$/, "")}\n${line}\n`;
    process.env[k] = v;
  }
  fs.writeFileSync(envFilePath, text);
}

function basicAuth() {
  const { PINTEREST_APP_ID: id, PINTEREST_APP_SECRET: secret } = process.env;
  if (!id || !secret) throw new Error("Add PINTEREST_APP_ID and PINTEREST_APP_SECRET to .env (from developers.pinterest.com → My apps).");
  return "Basic " + Buffer.from(`${id}:${secret}`).toString("base64");
}

export async function exchangeToken(params) {
  const res = await fetch(`${API()}/oauth/token`, {
    method: "POST",
    headers: { Authorization: basicAuth(), "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params).toString(),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Pinterest login failed (${res.status}): ${body.message || JSON.stringify(body)}`);
  saveEnv({
    PINTEREST_ACCESS_TOKEN: body.access_token,
    ...(body.refresh_token ? { PINTEREST_REFRESH_TOKEN: body.refresh_token } : {}),
  });
  return body;
}

async function refresh() {
  if (!process.env.PINTEREST_REFRESH_TOKEN) throw new Error('Pinterest login expired. Run: npm run pinterest:login');
  await exchangeToken({ grant_type: "refresh_token", refresh_token: process.env.PINTEREST_REFRESH_TOKEN });
}

async function api(method, path, body, retried = false) {
  if (!process.env.PINTEREST_ACCESS_TOKEN) throw new Error("Not logged in to Pinterest. Run: npm run pinterest:login");
  const res = await fetch(`${API()}${path}`, {
    method,
    headers: { Authorization: `Bearer ${process.env.PINTEREST_ACCESS_TOKEN}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401 && !retried) {
    await refresh();
    return api(method, path, body, true);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Pinterest ${method} ${path} → ${res.status}: ${data.message || JSON.stringify(data)}`);
  return data;
}

export async function me() {
  return api("GET", "/user_account");
}

const boardCache = {};
export async function boardId(name, description = "") {
  if (boardCache[name]) return boardCache[name];
  let bookmark;
  do {
    const page = await api("GET", `/boards?page_size=100${bookmark ? `&bookmark=${bookmark}` : ""}`);
    for (const b of page.items || []) boardCache[b.name] = b.id;
    bookmark = page.bookmark;
  } while (bookmark && !boardCache[name]);
  if (!boardCache[name]) boardCache[name] = (await api("POST", "/boards", { name, description, privacy: "PUBLIC" })).id;
  return boardCache[name];
}

// video: register → upload to Pinterest's storage → wait until processed
export async function uploadVideo(file) {
  const reg = await api("POST", "/media", { media_type: "video" });
  const form = new FormData();
  for (const [k, v] of Object.entries(reg.upload_parameters || {})) form.append(k, v);
  form.append("file", new Blob([fs.readFileSync(file)], { type: "video/mp4" }), "reel.mp4");
  const up = await fetch(reg.upload_url, { method: "POST", body: form });
  if (!up.ok && up.status !== 204) throw new Error(`Video upload failed: ${up.status}`);
  for (let i = 0; i < 60; i++) {
    const st = await api("GET", `/media/${reg.media_id}`);
    if (st.status === "succeeded") return reg.media_id;
    if (st.status === "failed") throw new Error("Pinterest couldn't process the video");
    await sleep(5000);
  }
  throw new Error("Pinterest video processing timed out");
}

export async function createPin({ board, title, description, link, altText, videoFile, coverSeconds, imageFile }) {
  let media_source;
  if (videoFile) {
    const media_id = await uploadVideo(videoFile);
    media_source = { source_type: "video_id", media_id, cover_image_key_frame_time: coverSeconds ?? 1 };
  } else {
    media_source = { source_type: "image_base64", content_type: "image/jpeg", data: fs.readFileSync(imageFile).toString("base64") };
  }
  return api("POST", "/pins", {
    board_id: board,
    title: title.slice(0, 100),
    description: description.slice(0, 500),
    link,
    alt_text: (altText || title).slice(0, 500),
    media_source,
  });
}
