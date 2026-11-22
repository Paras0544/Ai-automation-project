// npm run pinterest:login  — one-time: opens Pinterest's consent screen and saves the login to .env.
// In the Pinterest app settings, add this redirect URI exactly: http://localhost:8085/
import http from "node:http";
import { spawn } from "node:child_process";
import { SCOPES, exchangeToken, me } from "./lib/pinterest.mjs";

const REDIRECT = "http://localhost:8085/";
const id = process.env.PINTEREST_APP_ID;
if (!id || !process.env.PINTEREST_APP_SECRET) {
  console.log("First add PINTEREST_APP_ID and PINTEREST_APP_SECRET to .env (developers.pinterest.com → My apps → your app).");
  process.exit(1);
}
const state = Math.random().toString(36).slice(2);
const url = `https://www.pinterest.com/oauth/?client_id=${id}&redirect_uri=${encodeURIComponent(REDIRECT)}&response_type=code&scope=${SCOPES}&state=${state}`;

const server = http.createServer(async (req, res) => {
  const q = new URL(req.url, REDIRECT).searchParams;
  if (!q.get("code") && !q.get("error")) return res.end();
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  try {
    if (q.get("state") !== state) throw new Error("state mismatch, run the login again");
    if (q.get("error")) throw new Error(q.get("error"));
    await exchangeToken({ grant_type: "authorization_code", code: q.get("code"), redirect_uri: REDIRECT });
    const acct = await me().catch(() => ({}));
    res.end(`<h2 style="font-family:sans-serif">Pinterest connected${acct.username ? ` as ${acct.username}` : ""}. You can close this tab.</h2>`);
    console.log(`✓ Pinterest connected${acct.username ? ` as ${acct.username}` : ""}. Login saved to .env.`);
  } catch (e) {
    res.end(`<h2 style="font-family:sans-serif">Login failed: ${String(e.message).replace(/</g, "&lt;")}</h2>`);
    console.log(`✗ ${e.message}`);
  }
  server.close();
});
server.listen(8085, () => {
  console.log("Opening Pinterest login in your browser… If it doesn't open, paste this link:\n" + url);
  const opener = process.platform === "win32" ? ["cmd", ["/c", "start", "", url]] : process.platform === "darwin" ? ["open", [url]] : ["xdg-open", [url]];
  try {
    spawn(opener[0], opener[1], { stdio: "ignore", detached: true }).on("error", () => {});
  } catch {}
});
