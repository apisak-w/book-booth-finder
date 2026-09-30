# Booth Finder v2: SvelteKit migration, multi-event, ingestion pipeline

Date: 2026-09-30 · Status: draft for review · Branch: `v2`

## 1. Intent

The app today serves one event (54th National Book Fair & 24th BKKIBF 2026) at QSNCC Level LG, Halls 5–8. v2 makes it serve many events, each with its own booth map, on venues described as data. Only QSNCC exists for now, but a new venue must not need app code changes. v2 also adds a pipeline that turns an organiser's floor plan and exhibitor list into a ready event.

What the owner said:

- A book fair is one event among many. Only the venue is fixed for now.
- Keep in mind the venue could be somewhere else later.
- Each event has its own booth map.
- Each event has its own URL. The root lists events.
- A developer adds events as repo folders. The conversion from organiser input should be automated.
- Organiser input format is unknown. Design for a raster floor-plan image (worst case).
- Migrate the whole app to Svelte (map included), with Bun, TypeScript, oxlint and oxfmt.
- One spec covers migration, multi-event and pipeline.
- No verbose code comments.

Assumptions (confirm or correct during review):

- Categories, zones, stage, info desks, foyer zones, charge spots and aisle letter positions change per event. Walls, doors, walkable areas, area (hall) boundaries, scale, time zone, MRT, doors and toilets belong to the venue.
- A second venue is authored by hand as `venues/<id>/venue.json` against its own reference image. A venue authoring tool is out of scope.
- The app keeps its current look, fonts, tokens, languages (th default, en) and guest flow.
- Hosting stays on Cloudflare Pages via its Git integration.

Success criteria:

1. `/e/bkkibf-2026/` matches the current live site in behaviour (search, start point, route, steps, share links, pan/zoom, dark mode, reduced motion) on phone and desktop.
2. `/` lists every event in `events/` with live/upcoming/past status.
3. Old links `/#to=…&from=…` still land on the 2026 event.
4. Adding an event needs only a new `events/<id>/` folder, and adding a venue only a new `venues/<id>/` folder; no app code changes.
5. The pipeline, run on the 2026 plan with the committed corrections, reproduces today's `booths.json` (identical codes, rectangles within ±2 px).
6. Lint, format check, `svelte-check` and all tests pass in CI.

## 2. Stack

| Concern | Choice |
|---|---|
| Framework | SvelteKit, Svelte 5 runes, `@sveltejs/adapter-static`, every route prerendered |
| Runtime, packages, scripts, tests | Bun (`bun test`) |
| Language | TypeScript, strict |
| Lint / format | oxlint (script blocks of `.svelte` too), oxfmt (supports `.svelte`) |
| Template and type checks | `svelte-check` |
| Schemas | Zod, used at build time and in the pipeline only (not shipped to guests) |
| Image processing | `sharp` plus hand-written morphology on raw buffers |
| OCR | `tesseract.js` (downloads English traineddata on first run) |
| Spreadsheets | `read-excel-file`; CSV via the existing parser |
| End-to-end | Playwright (Chromium) smoke tests against `vite preview` |
| Hosting | Cloudflare Pages Git integration. Build `bun run build`, output `build` |

Scripts: `dev`, `build`, `preview`, `test`, `lint`, `fmt`, `fmt:check`, `check`, `event:new`, `event:review`, `event:build`, `event:exhibitors`.

Code style: no verbose comments. A short note only where the code cannot say it.

## 3. Repository layout

```
venues/<id>/
  venue.json            venue geometry and landmarks (schema in §4.1)
  reference.jpg         reference plan defining the coordinate space. Never published
events/<id>/
  event.json            event metadata and content (schema in §4)
  booths.json           booths and pillars
  exhibitors.csv        booth,name_th,name_en
  source/               plan image, pipeline intermediates, corrections.json. Never published
src/
  app.html
  routes/
    +layout.svelte      fonts, theme tokens, lang provider
    +page.svelte        event list
    +page.ts            event summaries for the list
    e/[id]/+page.svelte finder
    e/[id]/+page.ts     loads one event; entries() yields every events/* id
  lib/
    core/               pure TS: types, geometry, grid, routing, search, directions, csv, codes, prepare, hash, status, panzoom
    server/             Zod schemas and the catalog loader for venues/ and events/ (build time only)
    map/                FloorMap.svelte, layer components, viewport gestures
    ui/                 Header, LangToggle, Sheet, SearchBox, Results, IdleView, ResultCard, StartPicker, Toast, EventCard
    i18n/               app strings th/en, lang state
    styles/             tokens and global CSS carried over from styles.css
static/                 favicon, _headers if needed
tools/pipeline/         ingestion CLI (§7)
tests/                  bun tests (§9)
.github/workflows/ci.yml
```

`tools/digitize/`, `index.html`, `src/*.js`, `data/` and `src/styles.css` are removed once their replacements pass the parity and reproduction checks.

## 4. Data model

### 4.1 Venue (`venues/<id>/venue.json`)

Each venue has its own coordinate space: pixels of its `reference.jpg`. Every event on that venue uses the same space.

```ts
type Point = [number, number];
type Box = [number, number, number, number];   // x0, y0, x1, y1

type VenueFile = {
  id: string;                               // equals folder name, never renamed
  name: I18n;
  timezone: string;                         // IANA, e.g. "Asia/Bangkok"
  reference: { width: number; height: number };
  view: Rect;                               // fully zoomed-out viewBox
  overview: { narrow: { box: Box; pad: number }; wide: { box: Box; pad: number } };
  metersPerPx: number;
  gridCell?: number;                        // routing cell size in px, default 6
  walls: Point[][];                         // polygons drawn as the building outline
  floor: { op: 'add' | 'remove'; box: Box }[];   // applied in order to build the walkable floor
  areas: { id: string; name: I18n; label: { x: number; y: number; text: string }; bounds: Point[] }[];
  outside: I18n;                            // label for points in no area
  doors: { id: string; area: string; punch: Box; gap: Box }[];
  depth?: {                                 // aisle position phrasing
    back: number; front: number;            // y of the back and front walls
    text: { back: I18n; mid: I18n; front: I18n };
    aisleHint: I18n;
  };
  landmarks: Landmark[];                    // same shape as event landmarks
  origin: string;                           // landmark id used as the reachability root in tests
};
```

- `areas` replace `HALL_SPLITS`. A point's area is the polygon that contains it. Directions say "Go to <area name>" using the venue's names, so nothing says "Hall" in code.
- `floor` reproduces today's walkable set exactly, including the recess pockets in the lakeside wall.
- Each door has a `punch` box (opened and tagged in the routing grid) and a `gap` box (drawn over the wall). Door landmarks share the door id. This removes today's hard-coded gap coordinates and the `west` special case; the west door's landmark uses a `doorSide` icon.
- Venue-specific wording ("back wall", "lakeside") lives in `depth.text` and `depth.aisleHint`, not in app strings.
- Walking speed (55 m/min) is an app constant, not venue data.

`venues/qsncc-lg-5-8/` is migrated from `config.js`, `routing.js`, `directions.js`, `map.js` and the venue part of `LANDMARKS` with identical behaviour: `VIEW`, the two overview boxes, `M_PER_PX`, `GRID_CELL`, `HALL_OUTLINE` as `walls`, `WALKABLE` plus `RECESSES` as ordered `floor` ops, `HALL_SPLITS`, the side-bay rule and `HALL_LABELS` as four `areas` (Hall 5–8), `DOORS` with punch and gap boxes, depth 284–1460 with the back/mid/front and aisle-letter phrases, landmarks `mrt`, `west`, `door5`–`door8`, `wc1`–`wc6`, `lift`, `origin: "mrt"`, timezone `Asia/Bangkok`. `reference.jpg` is the 2026 plan (2560 × 1932).

### 4.2 Event (`events/<id>/event.json`)

```ts
type I18n = { th: string; en: string };
type Rect = { x: number; y: number; w: number; h: number };

type Landmark = I18n & {
  id: string;
  group: 'entry' | 'wc' | 'info' | 'charge' | 'stage' | 'other';
  x: number; y: number;
  icon: string;                             // one of the map's icon set
};

type EventFile = {
  id: string;                               // equals folder name, [a-z0-9-]+, never renamed
  name: I18n;
  subtitle?: I18n;
  dates: { start: string; end: string };    // YYYY-MM-DD in the venue's timezone
  venue: string;                            // venues/<id>
  categories: Record<string, I18n & { color: string; darkText?: boolean }>;
  zones: Record<string, I18n & { short?: string }>;   // keyed by booth code
  foyerZones: (Rect & { c: string; vertical?: boolean })[];
  obstacles: (Rect & { kind: 'stage' | 'info' | 'other'; note?: string })[];
  aisles?: { signY: number; boothMinY: number; x: Record<string, number> };  // letter -> x
  text?: Partial<Record<'ph' | 'searchLabel' | 'exhibitors', I18n>>;          // overrides generic wording
  landmarks: Landmark[];
  quickPicks: (['booth', string] | ['place', string])[];
  codePattern?: string;                     // regex, default "^[A-Z]\\d{2}$"
  allowedDuplicateCodes?: string[];         // e.g. ["H31"]
  notes?: string[];                         // known data issues for this event
};
```

### 4.3 Booths (`events/<id>/booths.json`)

Same shape as today without `hall`:

```ts
type BoothsFile = {
  booths: (Rect & { c: string; cat: string; extra?: Rect[] })[];
  pillars: (Rect & { cat: string; inner: Rect })[];
};
```

`area` is computed from the venue `areas` in `prepare`. Foyer zones become booths with `cat: 'special'`, `area: null`, `foyer: true`, as today.

### 4.4 Rules

- Landmark ids are one namespace across venue and event. Existing ids keep their values.
- Share links: `/e/<id>/#to=<code|landmarkId>&from=<landmarkId>&n=<index>`.
- Storage: `bf:lang` (falls back to reading `bf26:lang` once), `bf:<eventId>:from`. All access in try/catch.
- Every user-facing string has `th` and `en`.
- Booth codes must match the event's `codePattern`. When a code starts with a letter found in `aisles`, directions say "Turn into aisle X". Otherwise they omit the aisle phrase. OCR whitelist and consistency checks derive from the same pattern.
- If an event has `foyerZones`, it must define a `special` category.
- App strings are generic ("exhibitor"). The 2026 event sets `text` to keep its "publisher" wording.
- v1 behaviour is pinned by a golden snapshot taken from the v1 code before porting (routes, steps in both languages, search results, hall lookup). v2 must match it exactly for the 2026 event.

### 4.5 Migration of the 2026 event

`events/bkkibf-2026/` receives:

- `booths.json` from `data/booths.json` minus `hall`
- `venue: "qsncc-lg-5-8"`
- `exhibitors.csv` from `data/exhibitors.csv`
- in `event.json`: name and subtitle from `STRINGS`, dates 2026-03-26 to 2026-04-06, `CATEGORIES`, `ZONES`, `FOYER_ZONES`, `STAGE` and `INFO_DESKS` as obstacles, `AISLE_X`, event landmarks (`info1`–`info5`, `ch1`–`ch4`, `stage`), `QUICK_PICKS`, `allowedDuplicateCodes: ["H31"]`, and the known-issue notes from `CLAUDE.md`
- `source/floorplan.jpg` and `source/corrections.json` converted once from `labels.txt`, `MANUAL_CELLS`, `RECT_OVERRIDES` and `EXTRA_PARTS`

## 5. App

### 5.1 Routes

**`/` event list.** Header with app name and language toggle. One card per event: name, venue name, dates, status badge, link. Sorted live, upcoming (soonest first), past (latest first). Prerendered with all events. Status is computed in the browser in the venue's timezone, so a stale build still shows the right badge. If the URL hash contains `to` or `from`, the page redirects to `/e/bkkibf-2026/` with the same hash (`LEGACY_EVENT` constant).

**`/e/[id]/` finder.** Same flow and layout as today, plus a back link to `/`. `<title>` and meta description come from the event; the theme colour is the app's navy. Event data is inlined at prerender, so there are no runtime fetches. `entries()` lists every folder in `events/`. An unknown id is a 404 page with a link to `/`. A past event shows an "ended on <date>" note and otherwise works.

### 5.2 State

One finder state object (Svelte 5 runes) per page: `event`, `lang`, `from`, `dest`, `query`, `sheetOpen`. A single sync module maps it to the URL hash and to storage. `route` is `$derived` from `from` and `dest`. The routing grid is built once per event, lazily on first route request, and cached.

### 5.3 UI components

`Header`, `LangToggle`, `Sheet` (bottom sheet below 900 px capped at 46vh with Less/More, 400 px side panel at 900 px and above), `SearchBox`, `Results`, `IdleView` (quick picks, landmark groups), `ResultCard` (large booth code, distance, time, steps, share), `StartPicker` (native `<select>`), `Toast`, `EventCard`.

Accessibility carried over: real buttons, labelled search, `aria-live` results area, `:focus-visible`, `aria-pressed` language buttons. Fonts Mitr and Anuphan. Design tokens and dark mode carried over from `styles.css`.

### 5.4 Map

- `Map.svelte` owns the `<svg>` and viewBox. The viewBox aspect ratio always equals the element's (`clamp`). `vb.h` is never set on its own.
- Layers as components, ids unchanged: `#layer-base` (venue walls, door gaps, area labels, aisle signs, event obstacles), `#layer-booths`, `#layer-zones`, `#layer-marks`, `#layer-route`, `#layer-pins`.
- `panzoom.ts` is pure: clamp, zoom at point, fit box, overview, easing. Unit tested.
- A `panzoom` action wires pointer drag, pinch and wheel. It writes the viewBox attribute directly during gestures rather than through reactive state, and commits to state at gesture end.
- Taps are recorded at `pointerdown` under pointer capture.
- Labels hidden below 0.42 screen px per map unit (`labels-off` class).
- Framing after selection waits one `requestAnimationFrame` for the sheet to settle.
- Route draws once, pin pulses. Both respect `prefers-reduced-motion`. Route is yellow in dark mode.
- Booth fills come from event categories. Venue shapes use CSS tokens only.
- Booths render as keyed static markup with no per-booth reactive state.

## 6. Core modules (`src/lib/core/`)

Ported to TypeScript with behaviour unchanged, but parameterised by venue and event instead of importing globals:

- `grid.ts`: `buildGrid(venue, obstacles)` where obstacles are booths, pillars and event obstacles; doors tagged from venue data
- `routing.ts`: A*, clearance cost, string-pulling, `route(grid, from, dest)` returning `{P, len, meters, minutes, doorsUsed, areas} | {same: true} | {fail: true}`; `areaAt(venue, x, y)` by polygon containment
- `search.ts`: over booth codes, zone names, exhibitors, landmarks
- `directions.ts`: route to written steps, using venue area names, venue doors and event `aisles`. The aisle phrase applies when the booth is inside an area and its code starts with a letter in `aisles` (replaces today's `y > 340` check)
- `csv.ts`, `codes.ts` (`normCode`), `prepare.ts` (adds `i`, `cx`, `cy`, `area`, `byCode`, foyer booths, exhibitors)
- `types.ts`: shared TypeScript types. The Zod schemas live in `src/lib/server/schema.ts` (and `corrections.json`'s in the pipeline) so Zod never reaches the client

Performance budget stays as today: grid build about 40 ms and route about 6 ms average on a laptop.

## 7. Ingestion pipeline (`tools/pipeline/`)

TypeScript on Bun. Each stage reads and writes files under `events/<id>/source/`, so any stage can be rerun alone.

```bash
bun run event:new <id> --plan plan.jpg --name-th … --name-en … --start YYYY-MM-DD --end YYYY-MM-DD
bun run event:review <id>
bun run event:build <id>
bun run event:exhibitors <id> <file.csv|file.xlsx> [--map booth=Col,th=Col,en=Col]
```

### 7.1 Init

Creates `events/<id>/`, copies the plan to `source/plan.<ext>`, writes an `event.json` skeleton with name, dates and venue filled in and every content field empty.

### 7.2 Register

Maps plan pixels to the event venue's coordinates. Detects the floor region and fits scale and offset so its outline matches the venue `walls`. Writes `source/registration.json` with the transform and a fit score. Below a score threshold, `event:review` asks for four clicks on matching wall corners in the plan and the venue reference, and computes the transform from them. All later stages work in venue coordinates.

### 7.3 Detect

Port of `detect_cells.py`: colour-distance mask from the floor colour, connected components for booth islands, long thin openings to extract white dividers, split islands into cells, classify small white squares without text as pillars. Output `source/cells.json`, sorted by `(x, y)`.

### 7.4 Read

For each cell, crop, upscale 4×, run `tesseract.js` with a character whitelist `A-Z0-9` and single-word mode. Keep results matching the event's `codePattern` with confidence. A consistency pass checks each code against its column neighbours (same letter, numbers in sequence) and flags conflicts, missing reads and duplicates. It never rewrites a code on its own. Output `source/reads.json`.

### 7.5 Categorise

Samples each cell's fill, clusters colours, and maps clusters to `event.json` categories by nearest colour when defined. Otherwise creates placeholder categories (`cat1`…) with the sampled colour for naming in review.

### 7.6 Review

A small Vite + Svelte app in `tools/pipeline/review/`, started by `bun run event:review <id>`. It imports the app's map components through the `$lib` alias and saves through a Vite dev-server middleware. It is outside `src/routes`, so production builds never include it. It reuses the map components on top of the plan image and shows cells coloured by read confidence and flags. Actions:

- edit a code, mark as pillar, merge, split, draw a missed cell, delete a false cell
- register via four corner clicks when needed
- draw event obstacles (stage, info, other) and foyer zones
- place landmarks with id, group, icon and names
- name categories and zones in th and en

Saves to `source/corrections.json` through a dev-only endpoint. The file is the only hand-edited pipeline input and is committed.

### 7.7 Build

Corrections are keyed by points in venue coordinates (a correction applies to the detected cell containing its point), so they survive detector changes. Applies corrections to cells and reads. Writes `booths.json`. Fills `event.json`: categories, zones, foyer zones, obstacles, landmarks and aisle letters computed from booth island columns (letter from the booths' codes, x of the aisle left of the island). Validates with the schemas and runs the per-event checks from §9. Exits non-zero with a readable list on failure.

### 7.8 Exhibitors

Reads CSV or XLSX. Guesses columns from headers (`booth`, `บูธ`, `name`, `ชื่อ`, `th`, `en` and similar), overridable with `--map`. Normalises codes, expands `K16, K18` and `K16–K20` to one row per booth, trims names. Unknown booth codes stop the run with a list. Writes `exhibitors.csv`.

### 7.9 Not in scope

Vector PDF input (Detect accepts cells from any source, so it can be added later). Venue authoring tooling (venues are hand-written JSON checked by schema and tests). Organiser self-service or any backend.

## 8. Error handling

- Build fails on any schema or integrity error in any event, naming the event, file and field.
- An unknown event id renders a 404 page linking to `/`.
- Route failure shows the existing "no route" message with the next step.
- Storage failures are ignored. The app works with storage blocked.
- Pipeline stages fail with a list of problems and never write partial output files.

## 9. Testing

All with `bun test`. CI runs `lint`, `fmt:check`, `check`, `test`, then `build` and the build smoke test.

- Per event, for every folder in `events/`: schema valid; codes match `codePattern` (foyer zones included); duplicates only from `allowedDuplicateCodes`; no booth overlaps; venue exists; every booth and landmark reachable from the venue `origin`; exhibitor rows point at existing booths; booth categories defined; landmark ids unique across venue and event; landmark icons exist in the map icon set; `special` defined when foyer zones exist; quick picks resolve.
- Per venue, for every folder in `venues/`: schema valid; `origin` is a venue landmark; every door lies on a wall and inside a walkable rect after punching; every area label is inside its bounds; areas don't overlap; the grid builds and every venue landmark is reachable from `origin`.
- QSNCC regression: walkable aisles at least 4 cells wide after padding; `areaAt` gives the same hall as today's `HALL_SPLITS` for every 2026 booth.
- Core: search, directions, CSV, `normCode`, `prepare`, `panzoom`. The 14 current tests are ported and pass.
- i18n: app strings th/en key parity; every event `I18n` field has both.
- Pipeline: morphology helpers, column guessing, range expansion, registration on the 2026 plan, and the 2026 reproduction test (§1 criterion 5).
- Golden parity: v2 routes, steps (th and en), search results and area lookup equal the v1 snapshot.
- End-to-end (Playwright): finder deep link renders card and steps; tapping a booth selects it; language toggle; share link round-trip; event list; legacy redirect; unknown event 404.
- Build smoke: `build/index.html` and `build/e/bkkibf-2026/index.html` exist; nothing from `events/*/source/`, `venues/*/reference.jpg` or `tools/` appears in `build/`; Zod is not in the client bundle.

## 10. Rollout

Work on branch `v2`. Cloudflare Pages builds a preview for it automatically. Production stays on the current app until the last step.

1. Scaffold SvelteKit, Bun, TS, oxlint, oxfmt, `svelte-check`, CI.
2. Port core to TS with the venue split. Tests green.
3. Create `venues/qsncc-lg-5-8/`, `events/bkkibf-2026/` and build-time loading.
4. Port UI and map to Svelte.
5. Parity checkpoint against the live site on phone and desktop, light and dark.
6. Event list page and legacy redirect.
7. Pipeline stages and the 2026 reproduction test. Retire `tools/digitize/`.
8. Change Cloudflare build settings to `bun run build` / `build`, rewrite `README.md` and `CLAUDE.md`, merge to `main`.

## 11. Docs

- `CLAUDE.md` rewritten for v2: structure, commands, venue vs event, per-venue coordinate systems, how to add a venue by hand, gotchas carried over, per-event known issues living in each `event.json` `notes`.
- `README.md`: run, test, add an event, add a venue, deploy.
- `tools/pipeline/README.md`: new-event walkthrough.
