# Booth Finder: National Book Fair 2026, QSNCC

A mobile-first web app that helps visitors find a booth at the 54th National Book Fair & 24th Bangkok International Book Fair (Queen Sirikit National Convention Center, Level LG, Halls 5–8) and walk there.

Guests can search by booth code (`K16`), publisher name or place (toilets, stages, information desks). They pick where they are and the map draws a walking route along the aisles, with a distance, a walking time and short written directions. The app works in Thai and English.

It is a static site with no build step and no dependencies at runtime: plain HTML, CSS and ES modules.

## Run it locally

ES modules and `fetch()` need a web server, so opening `index.html` straight from disk won't work.

```bash
npm run dev          # serves on http://localhost:5173 (uses npx serve)
# or, with no Node:
python3 -m http.server 5173
```

## Test

```bash
npm test             # Node 18+, uses the built-in test runner
```

The tests check the booth data, search, routing (every booth must be reachable from the MRT entrance) and the written directions.

## Add the exhibitor list

Publisher search reads `data/exhibitors.csv`:

```csv
booth,name_th,name_en
K16,สำนักพิมพ์ตัวอย่าง,Example Press
K16,สำนักพิมพ์ที่สอง,
A42,,Another Publisher
```

- One row per publisher. A booth can have several rows, and a publisher with several booths gets one row per booth.
- `booth` is case-insensitive, and `k7` becomes `K07`.
- Either name column can be empty. Fields with commas need double quotes, which spreadsheet exports add for you.
- Lines starting with `#` are ignored.

When you run `npm test`, it fails if a row points at a booth code that isn't on the map.

## Share links and QR codes

Each view has its own address:

```
https://<your-site>/#to=K16&from=door6
```

- `to` takes a booth code or a place id. Place ids are listed in `src/content.js` under `LANDMARKS`, for example `stage`, `wc2` or `info1`.
- `from` takes a place id and sets the starting point.
- `n=1` picks the second booth when a code appears twice on the map.

Print a QR code for `#from=<id>` at each door or information desk. Guests who scan it only have to search for their booth.

## Deploy to Cloudflare Pages

The workflow in `.github/workflows/deploy.yml` runs the tests on every push and pull request. On `main` it publishes `index.html`, `src/` and `data/` to the Cloudflare Pages project `book-booth-finder`, and creates the project on the first run.

It needs two repository secrets (**Settings → Secrets and variables → Actions**):

- `CLOUDFLARE_API_TOKEN`: an API token with the **Account → Cloudflare Pages → Edit** permission.
- `CLOUDFLARE_ACCOUNT_ID`: shown on the Cloudflare dashboard overview.

To deploy from your own machine, run `npx wrangler login` once and then:

```bash
npm run deploy
```

Any other static host works too. Upload `index.html`, `src/` and `data/`.

## Things to check before the fair

- **Hall boundaries** are inferred from the plan and not confirmed. They're set in `src/config.js` as `HALL_SPLITS`.
- **Booth H31 appears twice** on the printed plan. The printed plan also shows B44 and D15 twice; these were renamed to D44 and E15 by column position.
- **Walking distances are estimates**, based on about 3 m per booth width and 55 m per minute.

`CLAUDE.md` has the full list of known issues.

## Reuse for a new fair

The booth layout was traced from the official floor-plan image with the scripts in `tools/digitize/`. The steps for a new plan are in `tools/digitize/README.md`.

## Credits

The floor plan belongs to the Publishers and Booksellers Association of Thailand (PUBAT). `tools/digitize/source/` holds a copy for re-tracing. Check that you have permission before making the repository public, or remove the image and keep it locally.
