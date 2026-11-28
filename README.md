# Well Priced (@wellpriced.fit) — reel pipeline

Plans outfit reels with Gemini, pulls real product details from the links you pick, and renders
1080x1920 reels in the brand style with a ready-to-paste caption.

```
idea ──► npm run batch ──► look file (hook, items, caption, try-on prompt)
                              │
          you pick products ──┤ paste links ──► npm run products (real price + photo)
          you make AI fits  ──┘ in your try-on tool, using the prompt
                              │
                         npm run render ──► out/<id>.mp4 + out/<id>.caption.txt
```

## Setup on Windows (one time)

1. Install **Node.js LTS** (nodejs.org) and **Git** (git-scm.com)
2. In PowerShell:
   ```
   git clone https://github.com/Paras0544/Ai-automation-project.git
   cd Ai-automation-project
   npm install
   Copy-Item .env.example .env
   notepad .env
   ```
3. Paste your Gemini key after `GEMINI_API_KEY=` and save. `.env` is git-ignored, so the key never goes to GitHub.
4. Check which models your key can use: `npm run models`. If `gemini-3.5-flash` isn't listed, put one that is into `GEMINI_MODEL` in `.env`.

## Product catalog (free mode — how looks get their products)

Looks are built from YOUR catalog of real products, so everything stays free and every product
is one you chose once. Aim for 60–100 products across categories; minimum 12.

**Add products** (copy links from the Myntra / Amazon / Ajio app or site):
```
npm run catalog -- add https://www.myntra.com/... https://www.amazon.in/... 
```
Each page is read for the real name, price, stock and photo; Gemini (free) labels its category
(top, bottom, outerwear, footwear, ethnic, accessory), colour and occasions. You can also paste links
straight into `data/catalog.csv` (one per line, in the `url` column) and run `npm run catalog`.

**Check it:** `npm run catalog -- list` shows products by category, how often each was used, and any that are
out of stock or whose page couldn't be read.

**If a store blocks the page:** type the price in the `price` column of `data/catalog.csv` and save the
product photo as `public/catalog/<id>.jpg` (the list command shows which).

Autopilot re-checks prices and stock before every run and skips sold-out products. Products used less
often are preferred so the page stays varied. To remove a product, delete its line from `catalog.csv`.

## Autopilot (one command)

```
npm run auto -- 7
```

For the next 7 ideas in `data/ideas.txt` it: refreshes catalog prices and stock → builds each look from the
catalog with Gemini (free) → runs quality checks → renders the reel and caption → writes `out/report-<date>.md`.
(With fewer than 12 usable catalog products it falls back to web search, which needs paid Gemini.)

**Quality checks** (a look that fails is not rendered; the report says why):
- at least 3 items with a real product photo (items with no product are dropped if 3 remain)
- total within 30% of the budget
- items more than 40% off their planned price are flagged

**Default style: outfit board.** The reel shows the real product photos only, so it is always accurate and needs no
AI images. To add AI model shots instead, set `FITS_MODE=ai` in `.env` and set up Cloudflare (below).

**Feedback loop:** in the first weeks, watch each video, read the report, and write anything wrong in
`data/feedback.md`. Those notes are used to fix prompts and checks.

## Step by step (when you want control)

| Step | Command | What happens |
| --- | --- | --- |
| 1. Plan 7 looks | `npm run batch -- 7` | Takes the next 7 lines of `data/ideas.txt`, Gemini writes each look file with hook, items, target prices, caption, hashtags, try-on prompt and store search links |
| 2. Find products | `npm run find -- <id>` | Gemini + Google Search finds up to 3 real product pages per item near the target price; each link is opened to check it exists, its real price and stock |
| 3. Pick | `npm run pick -- <id> 1:2 2:1 3:1` or `npm run pick -- <id> auto` | Choose one option per item (item:option). This also fetches each product's real price and photo. If a store blocks it, it tells you where to save the photo yourself. |
| 4. Make AI fits | `npm run fits -- <id>` | Free on Cloudflare (setup below). Sends the real product photos as references and saves `fit-1.jpg` and `fit-2.jpg`. **Always compare them with the product photos before rendering**; redo with `--force`, or make them by hand in Google AI Studio using the `fitPrompt` |
| 5. Check | `npm run status` | Lists every look and what it still needs |
| 6. Render | `npm run render` | Renders every ready look into `out/` with its caption file |

One-off look: `npm run new -- "first date in Delhi winter" 5000`

Prefer to choose products yourself? Paste links into `"url"` in the look file and run `npm run products -- <id>`.

## Free AI fit images (Cloudflare Workers AI)

Uses FLUX.2 [klein] 4B (Apache-2.0 licence, so commercial use is fine). Free allocation: 10,000 neurons/day, no card.

1. Create a free account at dash.cloudflare.com
2. Go to **AI → Workers AI**, choose **Use REST API**, and create a **Workers AI API token**. Copy the token and your **Account ID** from the same page.
3. Add to `.env`:
   ```
   CF_ACCOUNT_ID=your-account-id
   CF_API_TOKEN=your-token
   ```
4. Optional: put a photo of your brand's AI model at `public/brand/model.jpg`. For looks with 3 or fewer items it is sent as a reference so the same face appears in every reel.

Limits: 4 reference images max (a 5th item is described in text only). Each reference is resized to under 512x512 automatically.

## Rules the pipeline enforces
- Prices shown are the real prices read from the product page (planner prices are only targets)
- "AI-generated look" label on screen for the whole reel
- Real product photos and total at the end
- Caption always includes `#affiliate`, a commission note and "Images created using AI"
- No celebrities or real people in prompts; no "I wore this" claims

## Design
Colours, fonts, timing, labels: `src/brand.ts`. Live preview: `npm run studio`.

## Files

| Path | What it is |
| --- | --- |
| `data/ideas.txt` | Idea queue: `occasion \| budget` per line |
| `data/looks/*.json` | One file per reel |
| `scripts/lib/plan.mjs` | Gemini prompt + schema for planning a look |
| `scripts/products.mjs` | Reads price, title, photo from product links |
| `scripts/render-all.mjs` | Checks and renders looks, writes captions |
| `src/` | The video design (Remotion) |

## Testing without an API key
`set MOCK_AI=1` in PowerShell (`$env:MOCK_AI="1"`) makes the planner return a fixed sample instead of calling Gemini.

## Next
- AI fit images generated automatically (paid image API, once the format is proven)
- Telegram approval bot
- Auto-publish to Instagram and Pinterest

## Self-learning loop

1. **You** (2 min, optional): after watching reels, `npm run feedback -- <look-id> [1-5] "what was off"`.
2. **Every autopilot run** logs each look and catalog health to `data/learning/runs.jsonl`, then pushes `data/` to GitHub automatically. `npm run auto` also pulls the latest fixes first, so no more `git pull`.
3. **Claude's weekly review** (scheduled, Sundays): reads feedback + run logs, updates `data/rules.md` (the planner follows these rules), replaces sold-out catalog items, fixes recurring errors, tests, and pushes. You get a short summary.

Set `SYNC=0` in `.env` to stop the automatic pull/push.

## Shop website (link in bio)

`npm run site` builds `site/`: a home page listing every reel and one page per look, with prices and buy links.
Links become affiliate links automatically once `data/affiliate.json` is filled in (after Cuelinks approval).

Hosting (free, allows affiliate/commercial use): Cloudflare Pages → Create → Connect to Git → this repo.
Build command `node scripts/site.mjs`, output directory `site`, environment variable `SKIP_DEPENDENCY_INSTALL=1`.
Every autopilot run pushes new looks to GitHub, so the site updates by itself.

## Pinterest auto-posting

1. developers.pinterest.com → My apps → Connect app. Redirect URI: `http://localhost:8085/`. Privacy policy: `https://wellpriced.pages.dev/privacy/`.
2. Put the App ID and secret in `.env` as `PINTEREST_APP_ID` / `PINTEREST_APP_SECRET`.
3. `npm run pinterest:login` once (opens Pinterest's consent screen, saves the login).
4. From then on `npm run auto` pins up to `PINS_PER_RUN` (default 2) new reels as video pins, each on a matching board, linking to its shop page. `npm run pin -- 3` posts manually.

Trial access = pins visible only to you. For public pins, request Standard access with a screen recording of steps 3 and 4.

## Cloud mode (no laptop)

`.github/workflows/daily.yml` runs every day at ~09:17 IST on GitHub's free runners:
plans and renders new reels, renders any look that has no video yet, uploads videos to the **reels** GitHub Release,
saves results and the site rebuilds. Setup once: repo → Settings → Secrets and variables → Actions →
New secret `GEMINI_API_KEY`. Optional variable `REELS_PER_DAY` (default 3).

- Posting from your phone: https://wellpriced.pages.dev/post/ (download, copy caption, mark posted).
- Buying guides: `data/guides/*.json` (written weekly by Claude) → /guides/ on the site.

## Price tracker
The cloud checks every catalog price daily (`CATALOG_STALE_DAYS=1`) and appends to `data/price-history.json`.
The site publishes `/prices/` (biggest drops) and one history page per product, with earning links.

## Instagram auto-posting (no Facebook Page needed)
Daily workflow posts 1 reel (`IG_POSTS_PER_RUN`) via the Instagram API with Instagram Login.
Secrets: `IG_ACCESS_TOKEN` (Meta app → Instagram → API setup with Instagram login → Generate token) and optional
`GH_SECRETS_TOKEN` (fine-grained GitHub token with "Secrets: read and write" on this repo) so the 60-day token renews itself.
