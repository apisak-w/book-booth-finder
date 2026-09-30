# CLAUDE.md

Handover notes for Claude Code (and humans) working on this repo.

## What this is

This is a bilingual (Thai/English), mobile-first booth finder for the **54th National Book Fair & 24th Bangkok International Book Fair 2026** at **QSNCC, Level LG, Halls 5–8**. A guest does three things:

1. Searches for a booth code, publisher or place, or taps the map.
2. Picks where they are now.
3. Gets a walking route drawn on an SVG floor plan, with distance, time and written steps.

The users are fair visitors on their phones, in a crowded hall, often on poor mobile data. Keep it fast, legible and usable with one hand.

## Commands

```bash
npm run dev     # static server on :5173 (npx serve). `python3 -m http.server 5173` also works
npm test        # node --test, Node 18+, zero dependencies
npm run build   # copies index.html, src/, data/ into _site/ (Cloudflare Pages build command)
```

- There is no bundler or framework. `npm run build` only copies files into `_site/`. Don't add a real build step unless asked.
- Opening `index.html` from `file://` fails because ES modules and `fetch` need http.
- Run `npm test` after any change to `data/`, `src/config.js`, `src/content.js` or `src/routing.js`.

## File map

```
index.html            HTML shell. All text comes from STRINGS through data-t / data-aria attributes
src/main.js           entry: state, bottom-sheet/side-panel UI, language toggle, share links (#to=&from=)
src/map.js            SVG drawing, pan/zoom (drag, pinch, wheel, buttons), route and pin overlay. DOM only
src/routing.js        walking grid + A* + string-pulling. NO DOM, so tests import it
src/directions.js     route -> written steps. NO DOM
src/search.js         search over booth codes, zone names, exhibitors, landmarks. NO DOM
src/data.js           loads data/booths.json + data/exhibitors.csv, CSV parser, prepareData() (pure)
src/config.js         venue geometry: walls, doors, walkable rects, halls, aisles, stage, scale
src/content.js        everything a guest reads: STRINGS (th/en), CATEGORIES, ZONES, LANDMARKS, QUICK_PICKS
src/styles.css        design tokens on :root, dark theme, layout (mobile sheet / desktop side panel)
data/booths.json      369 booths + 16 pillar cells, traced from the official plan
data/exhibitors.csv   booth,name_th,name_en. EMPTY: waiting for the official exhibitor list
tests/core.test.js    data integrity, search, routing reachability, directions
tools/digitize/       Python/OpenCV pipeline that produced booths.json (see its README)
.github/workflows/    tests on every push/PR. Cloudflare Pages Git integration deploys main (output: _site)
```

Keep the pure/DOM split. Anything a test should cover goes in a DOM-free module.

## Coordinate system

All geometry uses **pixels on the official floor-plan image** (`tools/digitize/source/floorplan-2026.jpg`, 2560 × 1932). This applies to `booths.json`, `config.js` and `LANDMARKS`.

- The SVG `viewBox` uses the same units. `VIEW` in `config.js` is the fully zoomed-out view.
- "Back wall" is the top of the image (y ≈ 280). The toilets and the aisle letter signs are there.
- "Lakeside" is the bottom (y ≈ 1464). The doors to the foyer and the exhibitions are there.
- The MRT corridor is on the left (x < 446).
- Scale: `M_PER_PX = 3 / 29.5`, since one standard booth is about 3 m. Walking speed is `WALK_M_PER_MIN = 55`.

To add or move something, measure it on the source image. Crop and zoom with OpenCV/PIL rather than guessing from a downscaled view.

## Data model

A booth in `booths.json`:

```json
{ "c": "K16", "x": 1409, "y": 939, "w": 59, "h": 151, "cat": "general", "hall": 7 }
```

- `c`: booth code, `[A-T]\d\d`. Foyer zones `U01`–`U11` are added at runtime from `FOYER_ZONES` in `config.js`.
- `cat`: one of `kids fiction bl intl rare general comic nonbook special`. These keys match `CATEGORIES` in `content.js`.
- `hall`: 5–8, or null for the foyer. It's baked in at build time from the same splits as `HALL_SPLITS`.
- `extra`: optional additional rectangles for L-shaped booths. D30 is the only one.

`prepareData()` adds `i` (index), `cx`/`cy` (centre) and `byCode` (code → booths[]; this is a list because of duplicates).

Pillars are building columns inside booth blocks. They are drawn and block routing, but they aren't booths.

Letters and aisles: the aisle letters along the back wall (`AISLE_X`) sit in the aisle to the left of each booth island. A booth's letter is usually the aisle it faces, so the directions say "Turn into aisle K". A few printed codes break this pattern, for example D30 and M11. The route itself stays correct because it targets the booth rectangle.

## Routing (`src/routing.js`)

1. **Grid.** The map is split into 6 px cells, about 372 × 237. Walkable areas come from `WALKABLE` (hall, side bays, MRT corridor, foyer). Obstacles are booths, pillars, info desks and the stage, each padded by 2 px. Door cells are opened through the walls and tagged, so the directions can say which door is used.
2. **Clearance.** Each cell stores its BFS distance to the nearest obstacle. Cells hugging booths cost extra, which keeps routes in the middle of aisles.
3. **Search.** 8-way A* with no corner cutting. The goal is any walkable cell within 16 px of the booth, widening to 30 and then 48 px if the booth is boxed in.
4. **Smoothing.** String-pulling with a line-of-sight test that also requires clearance ≥ 2.
5. **Result.** `{P, len, meters, minutes, doorsUsed, halls}`, `{same:true}` or `{fail:true}`.

On a laptop in Node, building the grid takes about 40 ms and a route averages about 6 ms (worst about 40 ms). Phones will be slower, so profile on a mid-range device before adding work to the hot path. If you change the grid size, re-check aisle widths: aisles are about 32 px, so they should stay at least 4 cells wide after padding.

## Content and i18n rules

- Every string in `STRINGS.th` must exist in `STRINGS.en` with the same keys, and a test enforces this. Every `ZONES` and `LANDMARKS` entry needs both `th` and `en`.
- Landmark `id`s appear in share links and printed QR codes. **Never rename an existing id.** Add new ones instead.
- Thai is the default language. The choice is stored in `localStorage` under `bf26:lang`, and the start point under `bf26:from`. All storage access is wrapped in try/catch because the app must work with storage blocked.
- Copy style: plain verbs, sentence case, no exclamation marks. Errors say what to do next.

## Design

- **Fonts:** Mitr for display (booth codes, headings) and Anuphan for body text. Both are from Google Fonts, both cover Thai and Latin, and both have system fallbacks.
- **Tokens:** these are on `:root` in `styles.css`. The core ones are `--ink #13306B` (fair navy), `--sun #FFD23F` (destination and active aisle), `--blue #2F7FD1`, and `--floor`/`--outside` for the map ground. Dark mode redefines the tokens under `prefers-color-scheme` and `[data-theme]`. In dark mode the route turns yellow.
- **Category colours** match the printed legend and live only in `CATEGORIES`. International (yellow) booths use dark label text for contrast.
- **The large booth code** on the result card is the signature element. Keep the rest of the UI quiet.
- **Motion:** the route draws once and the destination pin pulses. Both respect `prefers-reduced-motion`.
- **Layout:** below 900 px there is a bottom sheet capped at 46vh with a Less/More toggle. At 900 px and above there is a 400 px side panel.
- **Accessibility:** real buttons, a labelled search field, a native `<select>` for the start point, visible `:focus-visible`, and an `aria-live` results area.

## Known data issues and assumptions

Check these with the organiser (PUBAT) before the fair. Don't silently "fix" them.

1. **Hall boundaries are inferred.** `HALL_SPLITS` is x = 749 / 1300 / 1852, which gives A–C, D–I, J–O and P–T. They come from the wall recesses and door positions on the plan. The printed plan shows hall names but no dividing lines. If you change them, update `config.js`, `HALL_SPLITS` in `tools/digitize/build_booths.py`, and then rebuild `booths.json` (`hall` is baked in).
2. **Duplicate printed codes.**
   - `H31` appears twice (x 1072 next to G32, and x 1133) and is left as-is. The test `only known duplicate codes exist` pins this.
   - The printed second `B44` was renamed `D44`, and the second `D15` became `E15`, both by column position.
3. **`M11`** sits where the column pattern predicts `N11`. It is kept as printed.
4. **Zone names read from small print.** U04 and U06 have placeholder names. A10 and A15 are best-effort readings.
5. **The exhibitor list is missing.** `data/exhibitors.csv` has only a header. The official list (https://www.thailandbookfair.com/publisher-bkkibf2026/) loads in a way that couldn't be scraped, so get it as a CSV or spreadsheet from the organiser.
6. **Toilets on the back wall** are modelled as destinations just inside the wall. The exact door positions to the toilet corridors are unknown.
7. **The fair already ran,** 26 March – 6 April 2026. For a later fair, re-trace the new plan (see `tools/digitize/README.md`) and replace `ZONES`, `LANDMARKS` and possibly `config.js` geometry.

## Common tasks

- **Load the exhibitor list:** convert whatever the organiser sends into `data/exhibitors.csv` (`booth,name_th,name_en`, one row per publisher per booth) and run `npm test`. A test fails if a code isn't on the map. Don't invent names.
- **Add a landmark:** add an `L(...)` entry in `LANDMARKS` with a new unique id and a group from `GROUP_ORDER`. Use an existing `icon`, or add a drawer to `ICONS` in `map.js`. Make sure the point is walkable or next to a walkable area; `nearestWalkable` snaps within about 40 cells.
- **Add a booth by hand:** add a line to `booths.json` (or to `MANUAL_CELLS` in the pipeline, then rebuild). Run the tests, which check overlaps and reachability.
- **Change strings:** edit `STRINGS` in both languages.
- **Change the look:** edit tokens in `styles.css`. Map shapes take colours from tokens or `CATEGORIES`, never from hard-coded hex values in `map.js` beyond the few dark fills.

## Gotchas

- Map layers are `<g id="layer-base|booths|zones|marks|route|pins">`. The CSS for the route targets `#layer-route`. If you rename a layer, update the CSS too, or the route renders as a filled black polygon.
- `map.frame()` waits one animation frame before measuring, because the sheet height changes after render. Keep that `requestAnimationFrame`.
- The viewBox aspect ratio is kept equal to the element's aspect ratio (`clamp()`), which keeps pan and zoom maths exact. Don't set `vb.h` independently.
- Pointer capture sends all events to the `<svg>`. Tap targets are recorded at `pointerdown` (`down.target`).
- `labels.txt` indices depend on the sort order in `detect_cells.py`. If you change detection, regenerate the sheets and re-read the labels.
- Booth text is hidden below 0.42 screen px per map unit (`labels-off`) to avoid unreadable clutter when zoomed out.

## Possible next steps

These haven't been asked for yet. Confirm with the owner before building any of them.

- Exhibitor data, then the publisher detail on the card (logo, promotions).
- A "nearest toilet / info / charge spot" shortcut.
- Offline support (service worker) for weak signal inside the halls.
- An admin-friendly way to update exhibitors, such as a Google Sheet published as CSV.
