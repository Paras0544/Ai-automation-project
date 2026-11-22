# The Measured Man — reel pipeline

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

## Weekly routine (one Saturday block)

| Step | Command | What happens |
| --- | --- | --- |
| 1. Plan 7 looks | `npm run batch -- 7` | Takes the next 7 lines of `data/ideas.txt`, Gemini writes each look file with hook, items, target prices, caption, hashtags, try-on prompt and store search links |
| 2. Pick products | open the search links it prints | Choose a real product for each item, paste its link into `"url"` in `data/looks/<id>.json` |
| 3. Fetch product details | `npm run products -- <id>` | Reads the real price, title and photo from each link and saves the photo. If a store blocks it, it tells you exactly where to save the photo yourself. |
| 4. Make AI fits | your try-on tool | Use the real product photos + the `fitPrompt` from the look file. Save as `public/looks/<id>/fit-1.jpg` and `fit-2.jpg` |
| 5. Check | `npm run status` | Lists every look and what it still needs |
| 6. Render | `npm run render` | Renders every ready look into `out/` with its caption file |

One-off look: `npm run new -- "first date in Delhi winter" 5000`

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
