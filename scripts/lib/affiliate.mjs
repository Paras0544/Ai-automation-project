// Turns a plain product link into your affiliate link, using data/affiliate.json.
// No settings yet = the plain link (still works, just earns nothing).
import fs from "node:fs";
import path from "node:path";
import { paths } from "./env.mjs";

export function affiliateConfig() {
  try {
    return JSON.parse(fs.readFileSync(path.join(paths.root, "data", "affiliate.json"), "utf8"));
  } catch {
    return { templates: {}, amazonTag: "", siteUrl: "" };
  }
}

export function affiliateUrl(url, cfg = affiliateConfig(), subid = "") {
  if (!url) return url;
  let host;
  try {
    host = new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
  if (/amazon\.in$/.test(host) && cfg.amazonTag) {
    const u = new URL(url);
    u.searchParams.set("tag", cfg.amazonTag);
    return u.toString();
  }
  const key = Object.keys(cfg.templates || {}).find((k) => host.endsWith(k) && cfg.templates[k]);
  if (!key) return url;
  let out = cfg.templates[key].replaceAll("{url_encoded}", encodeURIComponent(url)).replaceAll("{url}", url);
  // Cuelinks reports earnings per subid: tag each link with the look it came from
  if (subid && /linksredirect\.com/.test(out) && !/[?&]subid=/.test(out)) out += `&subid=${encodeURIComponent(subid.slice(0, 60))}`;
  return out;
}

export const isEarning = (url, cfg = affiliateConfig()) => affiliateUrl(url, cfg) !== url;
