// Posts the next unposted reel to Instagram (Instagram API with Instagram Login: no Facebook Page needed).
// Needs IG_ACCESS_TOKEN (from Meta app dashboard → Instagram → API setup → Generate token).
// Runs in the daily cloud workflow: IG_POSTS_PER_RUN (default 1). Records posts in data/learning/posted.json.
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { paths } from "./lib/env.mjs";

const token = (process.env.IG_ACCESS_TOKEN || "").trim();
// Instagram-login tokens start with "IG" and use graph.instagram.com + /me.
// Facebook / system-user tokens (Unified login) use graph.facebook.com + the IG account id.
const igLogin = /^IG/.test(token);
const API = process.env.IG_API_BASE || (igLogin ? "https://graph.instagram.com/v23.0" : "https://graph.facebook.com/v23.0");
const RUPLOAD = process.env.IG_RUPLOAD_BASE || "https://rupload.facebook.com/ig-api-upload/v23.0";
let igUser = process.env.IG_USER_ID || (igLogin ? "me" : "");

// find the Instagram account id for a Facebook-style token
async function resolveUser() {
  if (igUser) return igUser;
  const tries = [
    async () => (await ig("GET", `${API}/me/accounts`, { fields: "instagram_business_account" })).data?.find((p) => p.instagram_business_account)?.instagram_business_account.id,
    async () => {
      const biz = (await ig("GET", `${API}/me/businesses`, {})).data || [];
      for (const b of biz) {
        const a = (await ig("GET", `${API}/${b.id}/owned_instagram_accounts`, { fields: "id,username" })).data?.[0]
          || (await ig("GET", `${API}/${b.id}/instagram_business_accounts`, { fields: "id,username" })).data?.[0];
        if (a) return a.id;
      }
    },
  ];
  for (const t of tries) {
    try { const id = await t(); if (id) return (igUser = id); } catch {}
  }
  throw new Error("couldn't find the Instagram account id: set IG_USER_ID secret");
}
const perRun = Number(process.env.IG_POSTS_PER_RUN ?? 1);
const postedFile = path.join(paths.root, "data", "learning", "posted.json");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function ig(method, url, params) {
  const u = new URL(url);
  const opts = { method };
  if (method === "GET") {
    for (const [k, v] of Object.entries({ ...params, access_token: token })) u.searchParams.set(k, v);
  } else {
    opts.body = new URLSearchParams({ ...params, access_token: token });
  }
  const res = await fetch(u, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) throw new Error(`Instagram ${res.status}: ${data.error?.message || JSON.stringify(data)}`);
  return data;
}

export async function postNext() {
  if (!token) return console.log("Instagram: no IG_ACCESS_TOKEN set, skipping auto-post.");
  const posted = fs.existsSync(postedFile) ? JSON.parse(fs.readFileSync(postedFile, "utf8")) : {};
  const queue = fs
    .readdirSync(paths.looks)
    .filter((f) => f.endsWith(".json"))
    .map((f) => JSON.parse(fs.readFileSync(path.join(paths.looks, f), "utf8")))
    .filter((l) => l.videoUrl && !posted[l.id]?.instagram)
    .sort((a, b) => String(a.publishedAt || "").localeCompare(String(b.publishedAt || "")))
    .slice(0, perRun);
  if (!queue.length) return console.log("Instagram: nothing new to post.");
  let user;
  try { user = await resolveUser(); } catch (e) { console.log(`✗ Instagram: ${e.message}`); process.exitCode = 1; return; }

  for (const look of queue) {
    try {
      // 1) download the video (hosted on the GitHub release)
      const res = await fetch(look.videoUrl);
      if (!res.ok) throw new Error(`couldn't download video (${res.status})`);
      const bytes = Buffer.from(await res.arrayBuffer());
      const caption = (look.postCaption || `${look.hook}\n\nShop every piece: link in bio.\n#affiliate`).slice(0, 2200);
      // 2) create a resumable reel container, upload bytes to Meta
      const c = await ig("POST", `${API}/${user}/media`, { media_type: "REELS", upload_type: "resumable", caption, share_to_feed: "true" });
      const up = await fetch(`${RUPLOAD}/${c.id}`, {
        method: "POST",
        headers: { Authorization: `OAuth ${token}`, offset: "0", file_size: String(bytes.length) },
        body: bytes,
      });
      if (!up.ok) throw new Error(`upload failed (${up.status}): ${(await up.text()).slice(0, 200)}`);
      // 3) wait for Instagram to process, then publish
      let status = "IN_PROGRESS";
      for (let i = 0; i < 40 && status !== "FINISHED"; i++) {
        await sleep(i ? 15000 : 5000);
        status = (await ig("GET", `${API}/${c.id}`, { fields: "status_code" })).status_code;
        if (status === "ERROR" || status === "EXPIRED") throw new Error(`Instagram couldn't process the video (${status})`);
      }
      if (status !== "FINISHED") throw new Error("Instagram processing timed out");
      const pub = await ig("POST", `${API}/${user}/media_publish`, { creation_id: c.id });
      posted[look.id] = { ...(posted[look.id] || {}), instagram: { id: pub.id, at: new Date().toISOString() } };
      fs.mkdirSync(path.dirname(postedFile), { recursive: true });
      fs.writeFileSync(postedFile, JSON.stringify(posted, null, 2));
      console.log(`✓ Instagram: posted ${look.id} (${pub.id})`);
    } catch (e) {
      console.log(`✗ Instagram: ${look.id}: ${e.message}`);
      process.exitCode = 1;
      break;
    }
  }
}

// keep the 60-day token alive; prints the new token only to a file for the workflow to store as a secret
export async function refreshToken() {
  if (!token || !igLogin) return; // Facebook/system-user tokens don't use this refresh
  try {
    const d = await ig("GET", `${API.replace(/\/v[\d.]+$/, "")}/refresh_access_token`, { grant_type: "ig_refresh_token" });
    if (d.access_token) fs.writeFileSync(path.join(os.tmpdir(), "ig_token"), d.access_token);
    console.log("Instagram token refreshed (valid ~60 days).");
  } catch (e) {
    console.log(`(token refresh skipped: ${e.message.split("\n")[0]})`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  if (process.argv[2] === "refresh") await refreshToken();
  else await postNext();
}
