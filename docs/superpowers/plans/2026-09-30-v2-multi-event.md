# Booth Finder v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the booth finder as a SvelteKit + Bun + TypeScript static site that serves many events on venues described as data, with a TypeScript pipeline that turns an organiser's floor-plan image and exhibitor list into an event folder.

**Architecture:** Venues (`venues/<id>/venue.json`) and events (`events/<id>/`) are JSON files validated by Zod at build time on the server side of SvelteKit and prerendered into one static page per event (`/e/<id>/`) plus an event list (`/`). Pure TypeScript core modules (grid, routing, search, directions, prepare) are ported from v1 and pinned to v1 behaviour by a golden snapshot. The map is Svelte components for drawing plus a small imperative viewport module for gestures. The pipeline is a Bun CLI plus a Vite + Svelte review tool.

**Tech Stack:** Bun, SvelteKit (Svelte 5 runes, `@sveltejs/adapter-static`), TypeScript strict, Zod, oxlint, oxfmt, svelte-check, Playwright, sharp, tesseract.js, read-excel-file.

**Spec:** `docs/superpowers/specs/2026-09-30-v2-multi-event-design.md`

## Global Constraints

- No verbose code comments. At most a one-line note where the code cannot say it. No JSDoc blocks.
- TypeScript `strict: true` everywhere. No `any` except at JSON parse boundaries before Zod.
- Every guest-facing string exists in `th` and `en`. Thai is the default language.
- Copy style: plain verbs, sentence case, no exclamation marks. Errors say what to do next.
- Storage keys: `bf:lang`, `bf:<eventId>:from`. Read `bf26:lang` once as a fallback. All storage access in try/catch.
- Landmark ids and event ids are never renamed. Existing ids keep their values.
- Share links: `/e/<id>/#to=<code|landmarkId>&from=<landmarkId>&n=<index>`.
- Map layer ids: `layer-base`, `layer-booths`, `layer-zones`, `layer-marks`, `layer-route`, `layer-pins`. CSS for the route targets `#layer-route`.
- Walking speed `WALK_M_PER_MIN = 55` is an app constant.
- Core modules under `src/lib/core/` import nothing from the DOM, Svelte or Zod at runtime (type-only imports allowed) and use relative imports only.
- Zod is used only in `src/lib/server/`, `tools/` and tests. It must not reach the client bundle.
- Breakpoint 900 px: bottom sheet (max 46vh, Less/More) below, 400 px side panel at or above.
- Booth labels hidden below 0.42 screen px per map unit.
- Respect `prefers-reduced-motion` for the route draw and pin pulse.
- Work on branch `v2`. Pushing `v2` is fine (Cloudflare builds it as a preview). Do not push or merge to `main` until Task 19.

## Review Focus

- Storage blocked (private mode, `localStorage` throws): the finder loads, language defaults to Thai, start point is not remembered, nothing errors. Test in Task 8 (`storage.test.ts`).
- Hash with an unknown `to`, unknown `from`, lowercase code (`#to=k16`) or out-of-range `n`: unknown values are ignored, lowercase codes resolve, `n` falls back to the first booth. Test in Task 10 (`hash.test.ts`).
- Event folder whose `id` differs from the folder name, or whose `venue` does not exist: the build fails naming the file and field. Test in Task 5 (`catalog.test.ts`).
- Event status near midnight: an event ending 2026-04-06 is still `live` at 2026-04-06 23:30 Bangkok time (16:30 UTC) and `past` at 2026-04-07 00:10 Bangkok time. Test in Task 12 (`status.test.ts`).
- Exhibitor spreadsheet with a BOM, Thai headers (`บูธ`, `ชื่อ`) and an en dash range `K16–K20`: columns are detected and the range expands to K16, K17, …, K20 only for codes that exist; unknown codes stop the run. Test in Task 18 (`exhibitors.test.ts`).

---

## File structure

```
legacy/                               v1 app, moved in Task 1, deleted in Task 19
tools/golden/snapshot-v1.mjs          Task 1: writes tests/golden/v1.json from legacy code
tests/golden/v1.json                  Task 1: routes, steps, search, hall lattice

package.json, bun.lock                Task 2
svelte.config.js, vite.config.ts      Task 2
tsconfig.json, .oxlintrc.json, .oxfmtrc.json   Task 2
playwright.config.ts                  Task 11
.github/workflows/ci.yml              Task 2 (replaces test.yml)
src/app.html, src/app.d.ts            Task 2
src/routes/+layout.svelte             Task 8
src/routes/+page.svelte, +page.server.ts        Task 12
src/routes/e/[id]/+page.svelte, +page.server.ts Task 10
src/routes/e/[id]/+error.svelte       Task 12

src/lib/core/types.ts                 Task 3: shared TS types (no runtime)
src/lib/core/geometry.ts              Task 4: pointInPolygon, areaAt
src/lib/core/csv.ts, codes.ts         Task 5
src/lib/core/prepare.ts               Task 5
src/lib/core/grid.ts, routing.ts      Task 6
src/lib/core/search.ts, directions.ts Task 7
src/lib/core/panzoom.ts               Task 9
src/lib/core/hash.ts                  Task 10
src/lib/core/status.ts                Task 12
src/lib/server/schema.ts              Task 3: Zod schemas
src/lib/server/catalog.ts             Task 5: reads venues/ and events/
src/lib/i18n/strings.ts               Task 7
src/lib/i18n/lang.svelte.ts           Task 8
src/lib/storage.ts                    Task 8
src/lib/styles/app.css                Task 8
src/lib/ui/*.svelte                   Tasks 8, 10, 12
src/lib/map/*.svelte, labels.ts, viewport.ts    Task 9

venues/qsncc-lg-5-8/venue.json, reference.jpg   Task 4
events/bkkibf-2026/event.json, booths.json, exhibitors.csv, source/   Task 5
tools/migrate/v1-to-v2.ts             Tasks 4–5: one-off conversion from legacy

tools/pipeline/lib/image.ts           Task 13
tools/pipeline/lib/register.ts        Task 14
tools/pipeline/lib/detect.ts          Task 14
tools/pipeline/lib/corrections.ts     Task 15
tools/pipeline/lib/build.ts           Task 15
tools/pipeline/lib/read.ts            Task 16
tools/pipeline/lib/categorise.ts      Task 16
tools/pipeline/lib/exhibitors.ts      Task 18
tools/pipeline/cli.ts                 Tasks 15–18
tools/pipeline/review/                Task 17
tools/pipeline/README.md              Task 19

tests/*.test.ts                       bun tests, one file per module
tests/e2e/*.spec.ts                   Playwright
```

---

### Task 1: Move v1 to `legacy/` and capture the golden snapshot

**Files:**
- Move: `index.html`, `src/`, `data/`, `tests/core.test.js` → `legacy/index.html`, `legacy/src/`, `legacy/data/`, `legacy/tests/core.test.js`
- Create: `tools/golden/snapshot-v1.mjs`
- Create: `tests/golden/v1.json`
- Modify: `package.json` (v1 scripts point at `legacy/`)

**Interfaces:**
- Produces: `tests/golden/v1.json` with shape
  ```ts
  type Golden = {
    lattice: { x0: number; y0: number; step: number; cols: number; rows: number; halls: string }; // one char per cell: '0' none, '5'..'8'
    routes: {
      from: string;                       // landmark id
      to: string;                         // "booth:<code>#<n>" or "place:<id>"
      r: { same: true } | { fail: true } | { P: [number, number][]; len: number; meters: number; minutes: number; doors: string[]; halls: number[] };
      en?: string[]; th?: string[];       // steps, only when r has P
    }[];
    search: { q: string; hits: string[] }[];   // "booth:<code>#<n>", "exh:<code>#<n>:<name>", "place:<id>"
    boothHalls: Record<string, number | null>; // "<code>#<n>" -> hall
  };
  ```

- [ ] **Step 1: Move v1 files**

```bash
mkdir -p legacy/tests
git mv index.html legacy/index.html
git mv src legacy/src
git mv data legacy/data
git mv tests/core.test.js legacy/tests/core.test.js
```

- [ ] **Step 2: Point v1 scripts at `legacy/`**

Replace the `scripts` block in `package.json`:

```json
"scripts": {
  "dev": "npx --yes serve@14 -l 5173 legacy",
  "test": "node --test legacy/tests",
  "build": "rm -rf _site && mkdir _site && cp -r legacy/index.html legacy/src legacy/data _site/"
}
```

- [ ] **Step 3: Run the v1 tests from the new location**

Run: `node --test legacy/tests`
Expected: `pass 14`, `fail 0`.

- [ ] **Step 4: Write the snapshot script**

`tools/golden/snapshot-v1.mjs`:

```js
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { prepareData, parseCSV } from '../../legacy/src/data.js';
import { createGrid, findRoute, hallAt } from '../../legacy/src/routing.js';
import { buildSteps } from '../../legacy/src/directions.js';
import { createSearch } from '../../legacy/src/search.js';
import { STRINGS, LANDMARKS } from '../../legacy/src/content.js';
import { VIEW, GRID_CELL, DOORS } from '../../legacy/src/config.js';

const root = new URL('../../legacy/', import.meta.url);
const raw = JSON.parse(readFileSync(new URL('data/booths.json', root)));
const data = prepareData(raw, parseCSV(readFileSync(new URL('data/exhibitors.csv', root), 'utf8')));
const grid = createGrid(data);
const key = (b) => `${b.c}#${data.byCode[b.c].indexOf(b)}`;
const round = (v) => Math.round(v * 10) / 10;

const cols = Math.ceil(VIEW.w / GRID_CELL), rows = Math.ceil(VIEW.h / GRID_CELL);
let halls = '';
for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
  const h = hallAt(VIEW.x + (c + 0.5) * GRID_CELL, VIEW.y + (r + 0.5) * GRID_CELL);
  halls += h ? String(h) : '0';
}

const routes = [];
const record = (from, dest) => {
  const r = findRoute(grid, from, dest);
  const to = dest.kind === 'booth' ? `booth:${key(dest.b)}` : `place:${dest.lm.id}`;
  if (!r.P) { routes.push({ from: from.id, to, r }); return; }
  routes.push({
    from: from.id, to,
    r: { P: r.P.map(([x, y]) => [round(x), round(y)]), len: round(r.len), meters: r.meters, minutes: r.minutes, doors: r.doorsUsed.map((k) => DOORS[k].id), halls: r.halls },
    en: buildSteps(r, from, dest, STRINGS.en, (o) => o.en),
    th: buildSteps(r, from, dest, STRINGS.th, (o) => o.th),
  });
};
const lm = (id) => LANDMARKS.find((l) => l.id === id);
for (const id of ['mrt', 'door6', 'info4']) for (const b of data.booths) record(lm(id), { kind: 'booth', b });
const sample = ['A42', 'D20', 'G16', 'K16', 'P16', 'T02', 'A31', 'U07', 'C17', 'E20', 'D30', 'H31'];
for (const from of LANDMARKS) for (const c of sample) for (const b of data.byCode[c]) record(from, { kind: 'booth', b });
for (const from of LANDMARKS) for (const to of LANDMARKS) record(from, { kind: 'place', lm: to });

const search = createSearch(data);
const queries = ['K16', 'k 16', 'k1', 'k', 'a0', 'author', 'ห้องน้ำ', 'stage', 'เวที', 'info', 'u07', 'h31', 't', 'legend', 'mrt', 'door', 'ประตู', 'charge', 'ชาร์จ', 'xyz', 'hall', 'read the'];
const hitKey = (it) => it.type === 'place' ? `place:${it.lm.id}` : it.type === 'exh' ? `exh:${key(it.b)}:${it.ex.en || it.ex.th}` : `booth:${key(it.b)}`;

const boothHalls = Object.fromEntries(data.booths.map((b) => [key(b), b.hall]));
mkdirSync(new URL('../../tests/golden/', import.meta.url), { recursive: true });
writeFileSync(new URL('../../tests/golden/v1.json', import.meta.url), JSON.stringify({
  lattice: { x0: VIEW.x, y0: VIEW.y, step: GRID_CELL, cols, rows, halls },
  routes,
  search: queries.map((q) => ({ q, hits: search(q).map(hitKey) })),
  boothHalls,
}));
console.log(`${routes.length} routes, ${queries.length} queries`);
```

- [ ] **Step 5: Generate the snapshot**

Run: `node tools/golden/snapshot-v1.mjs`
Expected: prints roughly `2000 routes, 22 queries` (exact count depends on booth count; about 3×385 + 23×13 + 23×23). `tests/golden/v1.json` exists.

- [ ] **Step 6: Commit**

```bash
git add -A legacy tools/golden tests/golden package.json
git commit -m "Move v1 to legacy/ and capture golden snapshot"
```

---

### Task 2: Scaffold SvelteKit + Bun + TypeScript + Oxc and CI

**Files:**
- Replace: `package.json`
- Create: `svelte.config.js`, `vite.config.ts`, `tsconfig.json`, `.oxlintrc.json`, `.oxfmtrc.json`, `src/app.html`, `src/app.d.ts`, `src/routes/+page.svelte` (placeholder, replaced in Task 12), `src/routes/+layout.ts`, `static/favicon.svg`
- Replace: `.github/workflows/test.yml` → `.github/workflows/ci.yml`
- Modify: `.gitignore`, `.editorconfig`
- Test: `tests/smoke.test.ts`

**Interfaces:**
- Produces: scripts `dev`, `build`, `preview`, `test`, `test:e2e`, `lint`, `fmt`, `fmt:check`, `check`, `legacy:test`; path alias `$lib` → `src/lib`.

- [ ] **Step 1: Write `package.json`**

```json
{
  "name": "booth-finder",
  "version": "2.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite dev",
    "build": "vite build",
    "preview": "vite preview",
    "test": "bun test tests",
    "test:e2e": "playwright test",
    "lint": "oxlint",
    "fmt": "oxfmt",
    "fmt:check": "oxfmt --check",
    "check": "svelte-kit sync && svelte-check --tsconfig ./tsconfig.json",
    "legacy:test": "node --test legacy/tests"
  }
}
```

- [ ] **Step 2: Install dependencies**

```bash
bun add -d @sveltejs/kit @sveltejs/adapter-static @sveltejs/vite-plugin-svelte svelte vite typescript svelte-check oxlint oxfmt @types/bun zod
```

Expected: `bun.lock` created, no errors.

- [ ] **Step 3: Write config files**

`svelte.config.js`:

```js
import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

export default {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter({ pages: '_site', assets: '_site', fallback: undefined, strict: true }),
    prerender: { entries: ['*'], handleHttpError: 'fail' },
  },
};
```

`vite.config.ts`:

```ts
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({ plugins: [sveltekit()] });
```

`tsconfig.json`:

```json
{
  "extends": "./.svelte-kit/tsconfig.json",
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": false,
    "moduleResolution": "bundler",
    "module": "esnext",
    "target": "es2022",
    "allowJs": false,
    "checkJs": false,
    "skipLibCheck": true,
    "types": ["bun"]
  },
  "exclude": ["legacy", "_site", "node_modules", "tools/golden", "tools/migrate"]
}
```

`.oxlintrc.json`:

```json
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "categories": { "correctness": "error", "suspicious": "warn" },
  "ignorePatterns": ["legacy/**", "_site/**", ".svelte-kit/**", "tools/golden/**", "tools/migrate/**"]
}
```

`.oxfmtrc.json`:

```json
{
  "printWidth": 120,
  "singleQuote": true,
  "ignorePatterns": ["legacy/**", "_site/**", ".svelte-kit/**", "tests/golden/**", "events/**/booths.json"]
}
```

`src/app.html`:

```html
<!doctype html>
<html lang="th">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <link rel="icon" href="%sveltekit.assets%/favicon.svg" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Mitr:wght@400;500;600&family=Anuphan:wght@400;500;600&display=swap" rel="stylesheet" />
    %sveltekit.head%
  </head>
  <body data-sveltekit-preload-data="hover">
    <div style="display: contents">%sveltekit.body%</div>
    <noscript><p style="padding: 16px">This map needs JavaScript. / แผนที่นี้ต้องเปิด JavaScript</p></noscript>
  </body>
</html>
```

`src/app.d.ts`:

```ts
declare global {
  namespace App {}
}
export {};
```

`src/routes/+layout.ts`:

```ts
export const prerender = true;
export const trailingSlash = 'always';
```

`src/routes/+page.svelte`:

```svelte
<h1>Booth Finder</h1>
```

`static/favicon.svg`:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">📚</text></svg>
```

- [ ] **Step 4: Update ignore files**

Append to `.gitignore` (`_site/` is already there):

```
.svelte-kit/
test-results/
playwright-report/
events/*/source/*.tmp.*
```

Append to `.editorconfig`:

```
[*.svelte]
indent_size = 2
```

- [ ] **Step 5: Write the smoke test**

`tests/smoke.test.ts`:

```ts
import { test, expect } from 'bun:test';
import { existsSync } from 'node:fs';

test('golden snapshot is present', () => {
  expect(existsSync('tests/golden/v1.json')).toBe(true);
});
```

- [ ] **Step 6: Run every script once**

Run: `bun run test && bun run lint && bun run fmt && bun run check && bun run build && bun run legacy:test`
Expected: all succeed; `_site/index.html` exists; legacy tests still `pass 14`.

- [ ] **Step 7: Replace CI**

Delete `.github/workflows/test.yml`. Create `.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
  pull_request:
  workflow_dispatch:

permissions:
  contents: read

jobs:
  ci:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun install --frozen-lockfile
      - run: bun run lint
      - run: bun run fmt:check
      - run: bun run check
      - run: bun run test
      - run: bun run build
```

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "Scaffold SvelteKit, Bun, TypeScript, oxlint, oxfmt and CI"
```

If oxfmt rejects a key in `.oxfmtrc.json`, check `bunx oxfmt --help` for the current ignore option and use that instead; the ignore list itself must stay the same.

---

### Task 3: Shared types and Zod schemas

**Files:**
- Create: `src/lib/core/types.ts`
- Create: `src/lib/server/schema.ts`
- Test: `tests/schema.test.ts`

**Interfaces:**
- Produces (types, `src/lib/core/types.ts`): `I18n`, `Rect`, `Box`, `Point`, `LandmarkGroup`, `IconName`, `Landmark`, `Venue`, `EventFile`, `BoothRaw`, `Pillar`, `BoothsFile`, `ExhibitorRow`, `Booth`, `Exhibitor`, `EventData`, `Dest`, `RouteOk`, `RouteResult`, `GROUP_ORDER`, `ICON_NAMES`, `WALK_M_PER_MIN`.
- Produces (runtime, `src/lib/server/schema.ts`): `VenueSchema`, `EventSchema`, `BoothsFileSchema`, `formatIssues(err: z.ZodError): string`.

- [ ] **Step 1: Write the types**

`src/lib/core/types.ts`:

```ts
export type I18n = { th: string; en: string };
export type Rect = { x: number; y: number; w: number; h: number };
export type Box = [number, number, number, number];
export type Point = [number, number];

export const GROUP_ORDER = ['entry', 'wc', 'info', 'charge', 'stage', 'other'] as const;
export type LandmarkGroup = (typeof GROUP_ORDER)[number];

export const ICON_NAMES = ['mrt', 'door', 'doorSide', 'wc', 'info', 'charge', 'stage', 'lift'] as const;
export type IconName = (typeof ICON_NAMES)[number];

export const WALK_M_PER_MIN = 55;

export type Landmark = I18n & { id: string; group: LandmarkGroup; x: number; y: number; icon: IconName };

export type Area = { id: string; name: I18n; label: { x: number; y: number; text: string }; bounds: Point[] };
export type Door = { id: string; area: string; punch: Box; gap: Box };

export type Venue = {
  id: string;
  name: I18n;
  timezone: string;
  reference: { width: number; height: number };
  view: Rect;
  overview: { narrow: { box: Box; pad: number }; wide: { box: Box; pad: number } };
  metersPerPx: number;
  gridCell: number;
  walls: Point[][];
  floor: { op: 'add' | 'remove'; box: Box }[];
  areas: Area[];
  outside: I18n;
  doors: Door[];
  depth?: { back: number; front: number; text: { back: I18n; mid: I18n; front: I18n }; aisleHint: I18n };
  landmarks: Landmark[];
  origin: string;
};

export type Category = I18n & { color: string; darkText?: boolean };
export type Obstacle = Rect & { kind: 'stage' | 'info' | 'other'; note?: string };
export type FoyerZone = Rect & { c: string; vertical?: boolean };
export type QuickPick = ['booth', string] | ['place', string];
export type TextKey = 'ph' | 'searchLabel' | 'exhibitors';

export type EventFile = {
  id: string;
  name: I18n;
  subtitle?: I18n;
  dates: { start: string; end: string };
  venue: string;
  codePattern: string;
  categories: Record<string, Category>;
  zones: Record<string, I18n & { short?: string }>;
  foyerZones: FoyerZone[];
  obstacles: Obstacle[];
  aisles?: { signY: number; boothMinY: number; x: Record<string, number> };
  landmarks: Landmark[];
  quickPicks: QuickPick[];
  allowedDuplicateCodes: string[];
  notes: string[];
  text?: Partial<Record<TextKey, I18n>>;
};

export type BoothRaw = Rect & { c: string; cat: string; extra?: Rect[] };
export type Pillar = Rect & { cat: string; inner: Rect };
export type BoothsFile = { booths: BoothRaw[]; pillars: Pillar[] };
export type ExhibitorRow = Record<string, string>;

export type Booth = BoothRaw & { i: number; cx: number; cy: number; area: string | null; foyer?: true };
export type Exhibitor = { booth: string; th: string; en: string };

export type EventData = {
  venue: Venue;
  event: EventFile;
  booths: Booth[];
  pillars: Pillar[];
  byCode: Record<string, Booth[]>;
  exhibitors: Exhibitor[];
  unknownExhibitorBooths: string[];
  landmarks: Landmark[];
  landmarkById: Record<string, Landmark>;
};

export type Dest = { kind: 'booth'; b: Booth } | { kind: 'place'; lm: Landmark };

export type RouteOk = {
  P: Point[];
  len: number;
  meters: number;
  minutes: number;
  doorsUsed: number[];
  areas: string[];
};
export type RouteResult = RouteOk | { same: true } | { fail: true };
export const isRouteOk = (r: RouteResult | null | undefined): r is RouteOk => !!r && 'P' in r;
```

- [ ] **Step 2: Write the failing schema test**

`tests/schema.test.ts`:

```ts
import { test, expect } from 'bun:test';
import { EventSchema, VenueSchema, BoothsFileSchema, formatIssues } from '../src/lib/server/schema';

const i18n = { th: 'ก', en: 'a' };
const minimalEvent = {
  id: 'demo-2027',
  name: i18n,
  dates: { start: '2027-01-01', end: '2027-01-03' },
  venue: 'qsncc-lg-5-8',
  categories: { general: { ...i18n, color: '#1F84C6' } },
  zones: {},
  foyerZones: [],
  obstacles: [],
  landmarks: [],
  quickPicks: [],
};

test('event defaults fill optional fields', () => {
  const e = EventSchema.parse(minimalEvent);
  expect(e.codePattern).toBe('^[A-Z]\\d{2}$');
  expect(e.allowedDuplicateCodes).toEqual([]);
  expect(e.notes).toEqual([]);
});

test('event rejects end before start and a bad colour', () => {
  expect(EventSchema.safeParse({ ...minimalEvent, dates: { start: '2027-01-03', end: '2027-01-01' } }).success).toBe(false);
  expect(EventSchema.safeParse({ ...minimalEvent, categories: { general: { ...i18n, color: 'blue' } } }).success).toBe(false);
});

test('landmark needs both languages and a known icon', () => {
  const lm = { id: 'x', group: 'wc', x: 1, y: 1, icon: 'wc', th: 'ก', en: 'a' };
  expect(EventSchema.safeParse({ ...minimalEvent, landmarks: [lm] }).success).toBe(true);
  expect(EventSchema.safeParse({ ...minimalEvent, landmarks: [{ ...lm, en: '' }] }).success).toBe(false);
  expect(EventSchema.safeParse({ ...minimalEvent, landmarks: [{ ...lm, icon: 'rocket' }] }).success).toBe(false);
});

test('booths file parses pillars with inner rect', () => {
  const f = BoothsFileSchema.parse({
    booths: [{ c: 'A01', x: 0, y: 0, w: 10, h: 10, cat: 'general' }],
    pillars: [{ x: 0, y: 0, w: 10, h: 10, cat: 'general', inner: { x: 2, y: 2, w: 5, h: 5 } }],
  });
  expect(f.pillars[0].inner.w).toBe(5);
});

test('formatIssues names the path', () => {
  const r = VenueSchema.safeParse({ id: 'v' });
  expect(r.success).toBe(false);
  if (!r.success) expect(formatIssues(r.error)).toContain('name');
});
```

- [ ] **Step 3: Run it to see it fail**

Run: `bun test tests/schema.test.ts`
Expected: FAIL, cannot resolve `../src/lib/server/schema`.

- [ ] **Step 4: Write the schemas**

`src/lib/server/schema.ts`:

```ts
import { z } from 'zod';
import { GROUP_ORDER, ICON_NAMES } from '../core/types';
import type { Venue, EventFile, BoothsFile } from '../core/types';

const num = z.number().finite();
const slug = z.string().regex(/^[a-z0-9][a-z0-9-]*$/);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const hex = z.string().regex(/^#[0-9A-Fa-f]{6}$/);
const i18n = z.object({ th: z.string().min(1), en: z.string().min(1) });
const rect = z.object({ x: num, y: num, w: num.positive(), h: num.positive() });
const box = z.tuple([num, num, num, num]);
const point = z.tuple([num, num]);

const landmark = i18n.extend({
  id: z.string().regex(/^[a-z][a-z0-9-]*$/),
  group: z.enum(GROUP_ORDER),
  x: num,
  y: num,
  icon: z.enum(ICON_NAMES),
});

export const VenueSchema: z.ZodType<Venue, z.ZodTypeDef, unknown> = z.object({
  id: slug,
  name: i18n,
  timezone: z.string().min(1),
  reference: z.object({ width: num.positive(), height: num.positive() }),
  view: rect,
  overview: z.object({
    narrow: z.object({ box, pad: num }),
    wide: z.object({ box, pad: num }),
  }),
  metersPerPx: num.positive(),
  gridCell: z.number().int().positive().default(6),
  walls: z.array(z.array(point).min(3)).min(1),
  floor: z.array(z.object({ op: z.enum(['add', 'remove']), box })).min(1),
  areas: z.array(
    z.object({
      id: slug,
      name: i18n,
      label: z.object({ x: num, y: num, text: z.string().min(1) }),
      bounds: z.array(point).min(3),
    }),
  ),
  outside: i18n,
  doors: z.array(z.object({ id: z.string().min(1), area: slug, punch: box, gap: box })),
  depth: z
    .object({
      back: num,
      front: num,
      text: z.object({ back: i18n, mid: i18n, front: i18n }),
      aisleHint: i18n,
    })
    .optional(),
  landmarks: z.array(landmark),
  origin: z.string().min(1),
});

export const EventSchema: z.ZodType<EventFile, z.ZodTypeDef, unknown> = z
  .object({
    id: slug,
    name: i18n,
    subtitle: i18n.optional(),
    dates: z.object({ start: isoDate, end: isoDate }),
    venue: slug,
    codePattern: z.string().default('^[A-Z]\\d{2}$'),
    categories: z.record(z.string(), i18n.extend({ color: hex, darkText: z.boolean().optional() })),
    zones: z.record(z.string(), i18n.extend({ short: z.string().optional() })),
    foyerZones: z.array(rect.extend({ c: z.string(), vertical: z.boolean().optional() })),
    obstacles: z.array(rect.extend({ kind: z.enum(['stage', 'info', 'other']), note: z.string().optional() })),
    aisles: z
      .object({ signY: num, boothMinY: num, x: z.record(z.string().regex(/^[A-Z]$/), num) })
      .optional(),
    landmarks: z.array(landmark),
    quickPicks: z.array(
      z.union([z.tuple([z.literal('booth'), z.string()]), z.tuple([z.literal('place'), z.string()])]),
    ),
    allowedDuplicateCodes: z.array(z.string()).default([]),
    notes: z.array(z.string()).default([]),
    text: z
      .object({ ph: i18n.optional(), searchLabel: i18n.optional(), exhibitors: i18n.optional() })
      .optional(),
  })
  .refine((e) => e.dates.start <= e.dates.end, { message: 'dates.end is before dates.start', path: ['dates'] });

export const BoothsFileSchema: z.ZodType<BoothsFile, z.ZodTypeDef, unknown> = z.object({
  booths: z.array(rect.extend({ c: z.string().min(1), cat: z.string().min(1), extra: z.array(rect).optional() })),
  pillars: z.array(rect.extend({ cat: z.string().min(1), inner: rect })),
});

export const formatIssues = (err: z.ZodError) =>
  err.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ');
```

If the installed Zod major version is 4 and `z.ZodTypeDef` does not exist, drop the explicit `z.ZodType<…>` annotations and add `export type` checks instead: `const _v: Venue = {} as z.infer<typeof VenueSchema>;` for each schema. The runtime schema content stays the same.

- [ ] **Step 5: Run the test**

Run: `bun test tests/schema.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 6: Commit**

```bash
git add src/lib/core/types.ts src/lib/server/schema.ts tests/schema.test.ts
git commit -m "Add shared types and Zod schemas for venues, events and booths"
```

---

### Task 4: QSNCC venue as data, and area lookup

**Files:**
- Create: `tools/migrate/v1-to-v2.ts` (venue part)
- Create: `venues/qsncc-lg-5-8/venue.json` (generated)
- Move: `legacy/../tools/digitize/source/floorplan-2026.jpg` copy → `venues/qsncc-lg-5-8/reference.jpg`
- Create: `src/lib/core/geometry.ts`
- Test: `tests/geometry.test.ts`

**Interfaces:**
- Consumes: `Venue`, `Point` from Task 3.
- Produces:
  - `pointInPolygon(x: number, y: number, poly: Point[]): boolean` (half-open: a point on a left or bottom-to-top edge counts as inside the polygon to its right, matching v1's `x < maxX`)
  - `areaAt(venue: Venue, x: number, y: number): string | null`
  - `areaName(venue: Venue, id: string | null): I18n` (returns `venue.outside` for null)
  - `venues/qsncc-lg-5-8/venue.json` valid under `VenueSchema`

- [ ] **Step 1: Write the venue half of the migration script**

`tools/migrate/v1-to-v2.ts`:

```ts
import { writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import * as C from '../../legacy/src/config.js';
import { LANDMARKS } from '../../legacy/src/content.js';

const VENUE_IDS = ['mrt', 'west', 'door5', 'door6', 'door7', 'door8', 'wc1', 'wc2', 'wc3', 'wc4', 'wc5', 'wc6', 'lift'];
const W = C.WALKABLE;
const floor: { op: 'add' | 'remove'; box: number[] }[] = [{ op: 'add', box: W.hall }];
for (const [a, b] of C.RECESSES) {
  floor.push({ op: 'remove', box: [a, 1436, b, 1470] });
  floor.push({ op: 'add', box: [a, 1446, b, 1470] });
}
for (const r of W.sideBays) floor.push({ op: 'add', box: r });
for (const r of W.mrtCorridor) floor.push({ op: 'add', box: r });
floor.push({ op: 'add', box: W.foyer });

const x1 = C.VIEW.x + C.VIEW.w;
const hall = (n: number, x0: number, xe: number) => ({
  id: `hall${n}`,
  name: { th: `ฮอลล์ ${n}`, en: `Hall ${n}` },
  label: { x: C.HALL_LABELS.find((l: number[]) => l[2] === n)[0], y: 1424, text: `HALL ${n}` },
  bounds: [[x0, C.VIEW.y], [xe, C.VIEW.y], [xe, 1466], [x0, 1466]],
});
const hall5 = {
  ...hall(5, 446, 749),
  bounds: [
    [446, C.VIEW.y], [749, C.VIEW.y], [749, 1466], [446, 1466], [446, 1205], [C.VIEW.x, 1205], [C.VIEW.x, 976],
    [446, 976], [446, 772], [C.VIEW.x, 772], [C.VIEW.x, 556], [446, 556],
  ],
};

const doors = C.DOORS.map((d: { id: string; x: number; hall: number }) =>
  d.id === 'west'
    ? { id: d.id, area: `hall${d.hall}`, punch: [436, 848, 456, 912], gap: [442, 852, 450, 908] }
    : { id: d.id, area: `hall${d.hall}`, punch: [d.x - 30, 1430, d.x + 30, 1474], gap: [d.x - 28, 1436, d.x + 28, 1444] },
);

const landmarks = LANDMARKS.filter((l: { id: string }) => VENUE_IDS.includes(l.id)).map(
  (l: { id: string; icon: string }) => ({ ...l, icon: l.id === 'west' ? 'doorSide' : l.icon }),
);

const venue = {
  id: 'qsncc-lg-5-8',
  name: { th: 'ศูนย์ฯ สิริกิติ์ ชั้น LG ฮอลล์ 5–8', en: 'QSNCC Level LG, Halls 5–8' },
  timezone: 'Asia/Bangkok',
  reference: { width: 2560, height: 1932 },
  view: C.VIEW,
  overview: { narrow: { box: [380, 270, 2400, 1560], pad: 10 }, wide: { box: [190, 250, 2400, 1650], pad: 20 } },
  metersPerPx: C.M_PER_PX,
  gridCell: C.GRID_CELL,
  walls: [C.HALL_OUTLINE],
  floor,
  areas: [hall5, hall(6, 749, 1300), hall(7, 1300, 1852), hall(8, 1852, x1)],
  outside: { th: 'หน้าฮอลล์', en: 'Outside the halls' },
  doors,
  depth: {
    back: 284,
    front: 1460,
    text: {
      back: { th: 'บูธอยู่ช่วงท้ายทางเดิน ใกล้ผนังด้านใน', en: 'The booth is near the back-wall end of the aisle.' },
      mid: { th: 'บูธอยู่ประมาณกลางทางเดิน', en: 'The booth is about halfway along the aisle.' },
      front: { th: 'บูธอยู่ช่วงต้นทางเดิน ใกล้ประตูฝั่งทะเลสาบ', en: 'The booth is near the lakeside end of the aisle.' },
    },
    aisleHint: { th: '(ตัวอักษรตามแนวผนังด้านใน)', en: 'Aisle letters run along the back wall.' },
  },
  landmarks,
  origin: 'mrt',
};

mkdirSync('venues/qsncc-lg-5-8', { recursive: true });
writeFileSync('venues/qsncc-lg-5-8/venue.json', JSON.stringify(venue, null, 2) + '\n');
copyFileSync('tools/digitize/source/floorplan-2026.jpg', 'venues/qsncc-lg-5-8/reference.jpg');
console.log('venue written');
```

- [ ] **Step 2: Generate the venue**

Run: `bun tools/migrate/v1-to-v2.ts`
Expected: `venue written`; `venues/qsncc-lg-5-8/venue.json` and `reference.jpg` exist.

- [ ] **Step 3: Write the failing geometry test**

`tests/geometry.test.ts`:

```ts
import { test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { pointInPolygon, areaAt, areaName } from '../src/lib/core/geometry';
import { VenueSchema } from '../src/lib/server/schema';

const venue = VenueSchema.parse(JSON.parse(readFileSync('venues/qsncc-lg-5-8/venue.json', 'utf8')));
const golden = JSON.parse(readFileSync('tests/golden/v1.json', 'utf8'));

test('pointInPolygon is half-open on the right edge', () => {
  const sq: [number, number][] = [[0, 0], [10, 0], [10, 10], [0, 10]];
  expect(pointInPolygon(0, 5, sq)).toBe(true);
  expect(pointInPolygon(10, 5, sq)).toBe(false);
  expect(pointInPolygon(5, 5, sq)).toBe(true);
  expect(pointInPolygon(-1, 5, sq)).toBe(false);
});

test('areaAt matches v1 hallAt on every grid cell centre', () => {
  const { x0, y0, step, cols, rows, halls } = golden.lattice;
  const bad: string[] = [];
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const x = x0 + (c + 0.5) * step, y = y0 + (r + 0.5) * step;
      const want = halls[r * cols + c] === '0' ? null : `hall${halls[r * cols + c]}`;
      const got = areaAt(venue, x, y);
      if (got !== want && bad.length < 10) bad.push(`${x},${y}: ${got} != ${want}`);
    }
  expect(bad).toEqual([]);
});

test('areaName falls back to outside', () => {
  expect(areaName(venue, 'hall7').en).toBe('Hall 7');
  expect(areaName(venue, null).en).toBe('Outside the halls');
});
```

- [ ] **Step 4: Run it to see it fail**

Run: `bun test tests/geometry.test.ts`
Expected: FAIL, cannot resolve `../src/lib/core/geometry`.

- [ ] **Step 5: Write the geometry module**

`src/lib/core/geometry.ts`:

```ts
import type { I18n, Point, Venue } from './types';

export function pointInPolygon(x: number, y: number, poly: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function areaAt(venue: Venue, x: number, y: number): string | null {
  for (const a of venue.areas) if (pointInPolygon(x, y, a.bounds)) return a.id;
  return null;
}

export function areaName(venue: Venue, id: string | null): I18n {
  return venue.areas.find((a) => a.id === id)?.name ?? venue.outside;
}
```

With this rule a point exactly on `x = 749` lies outside Hall 5 and inside Hall 6, which is v1's `x < maxX`. A point on the left edge `x = 446` is inside Hall 5.

- [ ] **Step 6: Run the test**

Run: `bun test tests/geometry.test.ts`
Expected: PASS. If the lattice test lists mismatches, they are at polygon edges; adjust `bounds` in the migration script (not `pointInPolygon`) and regenerate with Step 2 until the list is empty.

- [ ] **Step 7: Commit**

```bash
git add tools/migrate venues src/lib/core/geometry.ts tests/geometry.test.ts
git commit -m "Describe QSNCC as venue data and add area lookup"
```

---

### Task 5: 2026 event folder, catalog loader and data preparation

**Files:**
- Modify: `tools/migrate/v1-to-v2.ts` (append event part)
- Create: `events/bkkibf-2026/event.json`, `events/bkkibf-2026/booths.json`, `events/bkkibf-2026/exhibitors.csv` (generated)
- Create: `src/lib/core/csv.ts`, `src/lib/core/codes.ts`, `src/lib/core/prepare.ts`
- Create: `src/lib/server/catalog.ts`
- Test: `tests/csv.test.ts`, `tests/prepare.test.ts`, `tests/catalog.test.ts`

**Interfaces:**
- Consumes: types from Task 3; `VenueSchema`, `EventSchema`, `BoothsFileSchema`, `formatIssues` from Task 3; `areaAt` from Task 4.
- Produces:
  - `parseCSV(text: string): Record<string, string>[]`
  - `normCode(s: string): string`
  - `prepareData(venue: Venue, event: EventFile, file: BoothsFile, rows: ExhibitorRow[]): EventData`
  - `type EventBundle = { venue: Venue; event: EventFile; booths: BoothsFile; exhibitors: ExhibitorRow[] }`
  - `type EventSummary = { id: string; name: I18n; subtitle?: I18n; dates: { start: string; end: string }; venueName: I18n; timezone: string }`
  - `class CatalogError extends Error`
  - `listVenueIds(root?: string): string[]`, `listEventIds(root?: string): string[]`
  - `loadVenue(id: string, root?: string): Venue`
  - `loadEvent(id: string, root?: string): EventBundle`
  - `eventSummaries(root?: string): EventSummary[]`
  - `loadData(bundle: EventBundle): EventData` (convenience: `prepareData(bundle.venue, bundle.event, bundle.booths, bundle.exhibitors)`, exported from `prepare.ts`)

- [ ] **Step 1: Append the event part to the migration script**

Add to the imports at the top of `tools/migrate/v1-to-v2.ts`:

```ts
import { readFileSync } from 'node:fs';
import { STRINGS, CATEGORIES, ZONES, QUICK_PICKS } from '../../legacy/src/content.js';
```

Append at the end:

```ts
const raw = JSON.parse(readFileSync('legacy/data/booths.json', 'utf8'));
const rectOf = ([x, y, w, h]: number[]) => ({ x, y, w, h });
const booths = {
  booths: raw.booths.map(({ hall: _hall, extra, ...b }: { hall: number; extra?: number[][] }) =>
    extra ? { ...b, extra: extra.map(rectOf) } : b,
  ),
  pillars: raw.pillars.map(({ px, py, pw, ph, ...p }: Record<string, number | string>) => ({
    ...p,
    inner: { x: px, y: py, w: pw, h: ph },
  })),
};

const [sx, sy, sw, sh] = C.STAGE;
const event = {
  id: 'bkkibf-2026',
  name: {
    th: 'สัปดาห์หนังสือแห่งชาติ ครั้งที่ 54 และสัปดาห์หนังสือนานาชาติ ครั้งที่ 24',
    en: '54th National Book Fair & 24th Bangkok International Book Fair',
  },
  subtitle: { th: STRINGS.th.subtitle, en: STRINGS.en.subtitle },
  dates: { start: '2026-03-26', end: '2026-04-06' },
  venue: 'qsncc-lg-5-8',
  codePattern: '^[A-U]\\d{2}$',
  categories: CATEGORIES,
  zones: ZONES,
  foyerZones: C.FOYER_ZONES.map(([c, x, y, w, h, vertical]: [string, number, number, number, number, boolean?]) =>
    vertical ? { c, x, y, w, h, vertical: true } : { c, x, y, w, h },
  ),
  obstacles: [
    ...C.INFO_DESKS.map(([x, y, w, h]: number[]) => ({ kind: 'info', x, y, w, h })),
    { kind: 'stage', x: sx, y: sy, w: sw, h: sh, note: 'Interview Area' },
  ],
  aisles: { signY: C.AISLE_SIGN_Y, boothMinY: 340, x: C.AISLE_X },
  landmarks: LANDMARKS.filter((l: { id: string }) => !VENUE_IDS.includes(l.id)),
  quickPicks: QUICK_PICKS,
  allowedDuplicateCodes: ['H31'],
  notes: [
    'Hall boundaries are inferred from wall recesses and door positions (x = 749 / 1300 / 1852). Confirm with PUBAT.',
    'H31 appears twice on the printed plan. The second B44 was renamed D44 and the second D15 became E15 by column position.',
    'M11 sits where the column pattern predicts N11. Kept as printed.',
    'U04 and U06 have placeholder names. A10 and A15 are best-effort readings of small print.',
    'The exhibitor list is empty. Get it from the organiser as a spreadsheet.',
    'Toilet door positions on the back wall are approximate.',
  ],
  text: {
    ph: { th: STRINGS.th.ph, en: STRINGS.en.ph },
    searchLabel: { th: STRINGS.th.searchLabel, en: STRINGS.en.searchLabel },
    exhibitors: { th: STRINGS.th.publishers, en: STRINGS.en.publishers },
  },
};

mkdirSync('events/bkkibf-2026/source', { recursive: true });
writeFileSync('events/bkkibf-2026/event.json', JSON.stringify(event, null, 2) + '\n');
const line = (o: unknown) => '    ' + JSON.stringify(o);
writeFileSync(
  'events/bkkibf-2026/booths.json',
  '{\n  "booths": [\n' + booths.booths.map(line).join(',\n') + '\n  ],\n  "pillars": [\n' +
    booths.pillars.map(line).join(',\n') + '\n  ]\n}\n',
);
copyFileSync('legacy/data/exhibitors.csv', 'events/bkkibf-2026/exhibitors.csv');
copyFileSync('tools/digitize/source/floorplan-2026.jpg', 'events/bkkibf-2026/source/plan.jpg');
console.log('event written');
```

- [ ] **Step 2: Generate the event**

Run: `bun tools/migrate/v1-to-v2.ts`
Expected: `venue written` then `event written`. `events/bkkibf-2026/booths.json` has 369 booths and 16 pillars, no `hall` keys.

- [ ] **Step 3: Write the failing CSV test**

`tests/csv.test.ts`:

```ts
import { test, expect } from 'bun:test';
import { parseCSV } from '../src/lib/core/csv';
import { normCode } from '../src/lib/core/codes';

test('parseCSV handles quotes, commas, BOM and comments', () => {
  const rows = parseCSV('﻿booth,name_th,name_en\r\n# note\r\nk16,"สำนักพิมพ์ ""ก""","Pub, Inc."\n');
  expect(rows).toEqual([{ booth: 'k16', name_th: 'สำนักพิมพ์ "ก"', name_en: 'Pub, Inc.' }]);
});

test('parseCSV returns [] for header-only or empty input', () => {
  expect(parseCSV('booth,name_th,name_en\n')).toEqual([]);
  expect(parseCSV('')).toEqual([]);
});

test('normCode pads and uppercases', () => {
  expect(normCode(' k 7 ')).toBe('K07');
  expect(normCode('K16')).toBe('K16');
  expect(normCode('1A-01')).toBe('1A-01');
});
```

- [ ] **Step 4: Run it to see it fail**

Run: `bun test tests/csv.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 5: Port CSV and code helpers**

`src/lib/core/csv.ts`:

```ts
export function parseCSV(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [], field = '', quoted = false;
  const src = text.replace(/^﻿/, '');
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"' && field === '') quoted = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += ch;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  const lines = rows.filter((r) => r.some((c) => c.trim() !== '') && !r[0].trim().startsWith('#'));
  if (!lines.length) return [];
  const head = lines[0].map((h) => h.trim().toLowerCase());
  return lines.slice(1).map((r) => Object.fromEntries(head.map((h, k) => [h, (r[k] ?? '').trim()])));
}
```

`src/lib/core/codes.ts`:

```ts
export function normCode(s: string): string {
  const m = /^([A-Za-z])\s*0*(\d{1,2})$/.exec(String(s).trim());
  return m ? m[1].toUpperCase() + m[2].padStart(2, '0') : String(s).trim().toUpperCase();
}
```

- [ ] **Step 6: Run the CSV test**

Run: `bun test tests/csv.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 7: Write the failing prepare and catalog tests**

`tests/prepare.test.ts`:

```ts
import { test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { loadEvent } from '../src/lib/server/catalog';
import { loadData, prepareData } from '../src/lib/core/prepare';
import { parseCSV } from '../src/lib/core/csv';

const bundle = loadEvent('bkkibf-2026');
const data = loadData(bundle);
const golden = JSON.parse(readFileSync('tests/golden/v1.json', 'utf8'));
const V1_LANDMARK_ORDER = [
  'mrt', 'west', 'door5', 'door6', 'door7', 'door8', 'wc1', 'wc2', 'wc3', 'wc4', 'wc5', 'wc6',
  'info1', 'info2', 'info3', 'info4', 'info5', 'ch1', 'ch2', 'ch3', 'ch4', 'stage', 'lift',
];

test('booths include foyer zones with no area', () => {
  expect(data.booths.length).toBe(369 + 11);
  const u07 = data.byCode.U07[0];
  expect(u07.foyer).toBe(true);
  expect(u07.area).toBeNull();
  expect(u07.cat).toBe('special');
});

test('booth areas match v1 halls', () => {
  const bad = data.booths
    .map((b) => {
      const key = `${b.c}#${data.byCode[b.c].indexOf(b)}`;
      const want = golden.boothHalls[key];
      const got = b.area ? Number(b.area.slice(4)) : null;
      return got === want ? null : `${key}: ${got} != ${want}`;
    })
    .filter(Boolean);
  expect(bad).toEqual([]);
});

test('landmarks merge venue and event in v1 order', () => {
  expect(data.landmarks.map((l) => l.id)).toEqual(V1_LANDMARK_ORDER);
  expect(data.landmarkById.stage.group).toBe('stage');
});

test('exhibitors normalise codes and report unknown booths', () => {
  const d = prepareData(bundle.venue, bundle.event, bundle.booths, parseCSV('booth,name_th,name_en\nk16,ก,Test\nZ99,ข,Nope\n'));
  expect(d.exhibitors[0]).toEqual({ booth: 'K16', th: 'ก', en: 'Test' });
  expect(d.unknownExhibitorBooths).toEqual(['Z99']);
});
```

`tests/catalog.test.ts`:

```ts
import { test, expect, beforeAll, afterAll } from 'bun:test';
import { mkdtempSync, mkdirSync, writeFileSync, cpSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { listEventIds, listVenueIds, loadEvent, eventSummaries, CatalogError } from '../src/lib/server/catalog';

let root = '';
beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'bf-'));
  cpSync('venues', join(root, 'venues'), { recursive: true });
  cpSync('events/bkkibf-2026', join(root, 'events/bkkibf-2026'), { recursive: true });
});
afterAll(() => rmSync(root, { recursive: true, force: true }));

const writeEvent = (folder: string, patch: Record<string, unknown>) => {
  const base = JSON.parse(readFileSync('events/bkkibf-2026/event.json', 'utf8'));
  mkdirSync(join(root, 'events', folder), { recursive: true });
  writeFileSync(join(root, 'events', folder, 'event.json'), JSON.stringify({ ...base, ...patch }));
  writeFileSync(join(root, 'events', folder, 'booths.json'), '{"booths":[],"pillars":[]}');
};

test('lists repo venues and events', () => {
  expect(listVenueIds()).toEqual(['qsncc-lg-5-8']);
  expect(listEventIds()).toContain('bkkibf-2026');
});

test('loads the 2026 event with its venue', () => {
  const b = loadEvent('bkkibf-2026');
  expect(b.venue.id).toBe('qsncc-lg-5-8');
  expect(b.booths.booths.length).toBe(369);
  expect(b.exhibitors).toEqual([]);
});

test('rejects an event whose id differs from its folder', () => {
  writeEvent('wrong-folder', { id: 'something-else' });
  expect(() => loadEvent('wrong-folder', root)).toThrow(CatalogError);
  expect(() => loadEvent('wrong-folder', root)).toThrow(/events\/wrong-folder\/event.json: id/);
});

test('rejects an event whose venue does not exist', () => {
  writeEvent('no-venue', { id: 'no-venue', venue: 'nowhere' });
  expect(() => loadEvent('no-venue', root)).toThrow(/venue "nowhere"/);
});

test('summaries carry venue name and timezone', () => {
  const s = eventSummaries().find((e) => e.id === 'bkkibf-2026');
  expect(s?.venueName.en).toBe('QSNCC Level LG, Halls 5–8');
  expect(s?.timezone).toBe('Asia/Bangkok');
});
```

- [ ] **Step 8: Run them to see them fail**

Run: `bun test tests/prepare.test.ts tests/catalog.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 9: Write `prepare.ts`**

`src/lib/core/prepare.ts`:

```ts
import { areaAt } from './geometry';
import { normCode } from './codes';
import { GROUP_ORDER } from './types';
import type { Booth, BoothRaw, BoothsFile, EventData, EventFile, Exhibitor, ExhibitorRow, Landmark, Venue } from './types';

export function prepareData(venue: Venue, event: EventFile, file: BoothsFile, rows: ExhibitorRow[]): EventData {
  const booths: Booth[] = [];
  const byCode: Record<string, Booth[]> = {};
  const add = (raw: BoothRaw, foyer: boolean) => {
    const cx = raw.x + raw.w / 2, cy = raw.y + raw.h / 2;
    const b: Booth = { ...raw, i: booths.length, cx, cy, area: foyer ? null : areaAt(venue, cx, cy) };
    if (foyer) b.foyer = true;
    booths.push(b);
    (byCode[b.c] ||= []).push(b);
  };
  for (const b of file.booths) add(b, false);
  for (const z of event.foyerZones) if (!byCode[z.c]) add({ c: z.c, x: z.x, y: z.y, w: z.w, h: z.h, cat: 'special' }, true);

  const exhibitors: Exhibitor[] = rows
    .map((r) => ({ booth: normCode(r.booth || ''), th: r.name_th || '', en: r.name_en || '' }))
    .filter((e) => e.booth && (e.th || e.en));
  const unknownExhibitorBooths = [...new Set(exhibitors.filter((e) => !byCode[e.booth]).map((e) => e.booth))];

  const rank = (l: Landmark) => GROUP_ORDER.indexOf(l.group);
  const landmarks = [...venue.landmarks, ...event.landmarks]
    .map((l, k) => ({ l, k }))
    .sort((a, b) => rank(a.l) - rank(b.l) || a.k - b.k)
    .map(({ l }) => l);
  const landmarkById = Object.fromEntries(landmarks.map((l) => [l.id, l]));

  return { venue, event, booths, pillars: file.pillars, byCode, exhibitors, unknownExhibitorBooths, landmarks, landmarkById };
}

export const loadData = (b: { venue: Venue; event: EventFile; booths: BoothsFile; exhibitors: ExhibitorRow[] }) =>
  prepareData(b.venue, b.event, b.booths, b.exhibitors);
```

- [ ] **Step 10: Write `catalog.ts`**

`src/lib/server/catalog.ts`:

```ts
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { z } from 'zod';
import { BoothsFileSchema, EventSchema, VenueSchema, formatIssues } from './schema';
import { parseCSV } from '../core/csv';
import type { BoothsFile, EventFile, ExhibitorRow, I18n, Venue } from '../core/types';

export type EventBundle = { venue: Venue; event: EventFile; booths: BoothsFile; exhibitors: ExhibitorRow[] };
export type EventSummary = {
  id: string;
  name: I18n;
  subtitle?: I18n;
  dates: { start: string; end: string };
  venueName: I18n;
  timezone: string;
};

export class CatalogError extends Error {}

const cwd = () => process.cwd();

function parseFile<T>(schema: z.ZodType<T, z.ZodTypeDef, unknown>, path: string, root: string): T {
  const rel = relative(root, path);
  if (!existsSync(path)) throw new CatalogError(`${rel}: file is missing`);
  let json: unknown;
  try {
    json = JSON.parse(readFileSync(path, 'utf8'));
  } catch (e) {
    throw new CatalogError(`${rel}: not valid JSON (${(e as Error).message})`);
  }
  const r = schema.safeParse(json);
  if (!r.success) throw new CatalogError(`${rel}: ${formatIssues(r.error)}`);
  return r.data;
}

const dirsWith = (dir: string, file: string) =>
  existsSync(dir)
    ? readdirSync(dir, { withFileTypes: true })
        .filter((d) => d.isDirectory() && existsSync(join(dir, d.name, file)))
        .map((d) => d.name)
        .sort()
    : [];

export const listVenueIds = (root = cwd()) => dirsWith(join(root, 'venues'), 'venue.json');
export const listEventIds = (root = cwd()) => dirsWith(join(root, 'events'), 'event.json');

export function loadVenue(id: string, root = cwd()): Venue {
  const venue = parseFile(VenueSchema, join(root, 'venues', id, 'venue.json'), root);
  if (venue.id !== id) throw new CatalogError(`venues/${id}/venue.json: id "${venue.id}" must equal the folder name`);
  return venue;
}

export function loadEvent(id: string, root = cwd()): EventBundle {
  const dir = join(root, 'events', id);
  const event = parseFile(EventSchema, join(dir, 'event.json'), root);
  if (event.id !== id) throw new CatalogError(`events/${id}/event.json: id "${event.id}" must equal the folder name`);
  if (!listVenueIds(root).includes(event.venue))
    throw new CatalogError(`events/${id}/event.json: venue "${event.venue}" has no venues/${event.venue}/venue.json`);
  const venue = loadVenue(event.venue, root);
  const booths = parseFile(BoothsFileSchema, join(dir, 'booths.json'), root);
  const csvPath = join(dir, 'exhibitors.csv');
  const exhibitors = existsSync(csvPath) ? parseCSV(readFileSync(csvPath, 'utf8')) : [];
  return { venue, event, booths, exhibitors };
}

export function eventSummaries(root = cwd()): EventSummary[] {
  return listEventIds(root).map((id) => {
    const { event, venue } = loadEvent(id, root);
    return { id, name: event.name, subtitle: event.subtitle, dates: event.dates, venueName: venue.name, timezone: venue.timezone };
  });
}
```

Match `parseFile`'s schema parameter type to whatever form Task 3 settled on for the Zod version (if Task 3 dropped the `ZodTypeDef` annotations, type this parameter as `z.ZodType<T>`).

- [ ] **Step 11: Run the tests**

Run: `bun test tests/prepare.test.ts tests/catalog.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 12: Commit**

```bash
git add tools/migrate events src/lib/core src/lib/server tests
git commit -m "Add 2026 event folder, catalog loader and data preparation"
```

---

### Task 6: Routing grid and A* ported to TypeScript, pinned to v1

**Files:**
- Create: `src/lib/core/grid.ts`
- Create: `src/lib/core/routing.ts`
- Test: `tests/routing.test.ts`

**Interfaces:**
- Consumes: `Venue`, `Rect`, `Box`, `Dest`, `Landmark`, `EventData`, `RouteResult`, `WALK_M_PER_MIN` (Task 3); `areaAt` (Task 4); `loadEvent` (Task 5); `loadData` (Task 5).
- Produces:
  - `type Grid = { walk: Uint8Array; clear: Uint8Array; doorCell: Int16Array; gw: number; gh: number; x0: number; y0: number; g: number }`
  - `type Blocker = Rect & { extra?: Rect[] }`
  - `forCells(grid: Grid, x0: number, y0: number, x1: number, y1: number, fn: (i: number) => void): void`
  - `createGrid(venue: Venue, blockers: Blocker[]): Grid`
  - `obstaclesOf(data: EventData): Blocker[]`
  - `cellOf(grid: Grid, x: number, y: number): number`, `cellXY(grid: Grid, i: number): [number, number]`
  - `nearestWalkable(grid: Grid, x: number, y: number): number`
  - `findRoute(grid: Grid, venue: Venue, start: Landmark, dest: Dest): RouteResult`

- [ ] **Step 1: Write the failing routing test**

`tests/routing.test.ts`:

```ts
import { test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { loadEvent } from '../src/lib/server/catalog';
import { loadData } from '../src/lib/core/prepare';
import { createGrid, obstaclesOf } from '../src/lib/core/grid';
import { findRoute } from '../src/lib/core/routing';
import type { Dest } from '../src/lib/core/types';

const data = loadData(loadEvent('bkkibf-2026'));
const grid = createGrid(data.venue, obstaclesOf(data));
const golden = JSON.parse(readFileSync('tests/golden/v1.json', 'utf8'));
const round = (v: number) => Math.round(v * 10) / 10;

const destOf = (to: string): Dest => {
  const [kind, rest] = to.split(':');
  if (kind === 'place') return { kind: 'place', lm: data.landmarkById[rest] };
  const [code, n] = rest.split('#');
  return { kind: 'booth', b: data.byCode[code][Number(n)] };
};

test('every golden route matches v1', () => {
  const bad: string[] = [];
  for (const g of golden.routes) {
    const r = findRoute(grid, data.venue, data.landmarkById[g.from], destOf(g.to));
    const got =
      'P' in r
        ? {
            P: r.P.map(([x, y]) => [round(x), round(y)]),
            len: round(r.len),
            meters: r.meters,
            minutes: r.minutes,
            doors: r.doorsUsed.map((k) => data.venue.doors[k].id),
            halls: r.areas.map((a) => Number(a.slice(4))),
          }
        : r;
    if (JSON.stringify(got) !== JSON.stringify(g.r) && bad.length < 5) bad.push(`${g.from} -> ${g.to}`);
  }
  expect(bad).toEqual([]);
});

test('same start and destination is reported, not routed', () => {
  const wc2 = data.landmarkById.wc2;
  expect(findRoute(grid, data.venue, wc2, { kind: 'place', lm: wc2 })).toEqual({ same: true });
});

test('grid builds in under 200 ms', () => {
  const t = performance.now();
  createGrid(data.venue, obstaclesOf(data));
  expect(performance.now() - t).toBeLessThan(200);
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `bun test tests/routing.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 3: Write `grid.ts`**

`src/lib/core/grid.ts`:

```ts
import type { EventData, Rect, Venue } from './types';

export type Grid = { walk: Uint8Array; clear: Uint8Array; doorCell: Int16Array; gw: number; gh: number; x0: number; y0: number; g: number };
export type Blocker = Rect & { extra?: Rect[] };

const PAD = 2;
const MAX_CLEAR = 6;

export function forCells(grid: Grid, x0: number, y0: number, x1: number, y1: number, fn: (i: number) => void) {
  const { g, gw, gh } = grid;
  const c0 = Math.max(0, Math.ceil((x0 - grid.x0) / g - 0.5)), c1 = Math.min(gw - 1, Math.floor((x1 - grid.x0) / g - 0.5));
  const r0 = Math.max(0, Math.ceil((y0 - grid.y0) / g - 0.5)), r1 = Math.min(gh - 1, Math.floor((y1 - grid.y0) / g - 0.5));
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) fn(r * gw + c);
}

export function cellOf(grid: Grid, x: number, y: number) {
  const c = Math.max(0, Math.min(grid.gw - 1, Math.round((x - grid.x0) / grid.g - 0.5)));
  const r = Math.max(0, Math.min(grid.gh - 1, Math.round((y - grid.y0) / grid.g - 0.5)));
  return r * grid.gw + c;
}

export function cellXY(grid: Grid, i: number): [number, number] {
  const r = (i / grid.gw) | 0, c = i - r * grid.gw;
  return [grid.x0 + (c + 0.5) * grid.g, grid.y0 + (r + 0.5) * grid.g];
}

export const obstaclesOf = (d: EventData): Blocker[] => [...d.booths, ...d.pillars, ...d.event.obstacles];

export function createGrid(venue: Venue, blockers: Blocker[]): Grid {
  const g = venue.gridCell, v = venue.view;
  const gw = Math.ceil(v.w / g), gh = Math.ceil(v.h / g), n = gw * gh;
  const grid: Grid = { walk: new Uint8Array(n), clear: new Uint8Array(n), doorCell: new Int16Array(n).fill(-1), gw, gh, x0: v.x, y0: v.y, g };
  const set = (b: number[], val: number) => forCells(grid, b[0], b[1], b[2], b[3], (i) => { grid.walk[i] = val; });
  const block = (r: Rect) => set([r.x - PAD, r.y - PAD, r.x + r.w + PAD, r.y + r.h + PAD], 0);

  for (const f of venue.floor) set(f.box, f.op === 'add' ? 1 : 0);
  venue.doors.forEach((d, k) => forCells(grid, ...d.punch, (i) => { grid.walk[i] = 1; grid.doorCell[i] = k; }));
  for (const o of blockers) { block(o); for (const e of o.extra ?? []) block(e); }

  const q = new Int32Array(n);
  let head = 0, tail = 0;
  grid.clear.fill(255);
  for (let i = 0; i < n; i++) if (!grid.walk[i]) { grid.clear[i] = 0; q[tail++] = i; }
  while (head < tail) {
    const i = q[head++], d = grid.clear[i];
    if (d >= MAX_CLEAR) continue;
    const r = (i / gw) | 0, c = i - r * gw;
    for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const rr = r + dr, cc = c + dc;
      if (rr < 0 || cc < 0 || rr >= gh || cc >= gw) continue;
      const j = rr * gw + cc;
      if (grid.clear[j] > d + 1) { grid.clear[j] = d + 1; q[tail++] = j; }
    }
  }
  return grid;
}

export function nearestWalkable(grid: Grid, x: number, y: number): number {
  const s = cellOf(grid, x, y);
  if (grid.walk[s]) return s;
  const r0 = (s / grid.gw) | 0, c0 = s % grid.gw;
  for (let rad = 1; rad < 40; rad++) {
    let best = -1, bd = Infinity;
    for (let r = r0 - rad; r <= r0 + rad; r++)
      for (let c = c0 - rad; c <= c0 + rad; c++) {
        if (r < 0 || c < 0 || r >= grid.gh || c >= grid.gw) continue;
        const j = r * grid.gw + c;
        if (!grid.walk[j]) continue;
        const [jx, jy] = cellXY(grid, j), d = (jx - x) ** 2 + (jy - y) ** 2;
        if (d < bd) { bd = d; best = j; }
      }
    if (best >= 0) return best;
  }
  return -1;
}
```

v1 used `Int8Array` for `doorCell`; `Int16Array` allows more than 127 doors and changes nothing else.

- [ ] **Step 4: Write `routing.ts`**

`src/lib/core/routing.ts`:

```ts
import { areaAt } from './geometry';
import { cellOf, cellXY, forCells, nearestWalkable, type Grid } from './grid';
import { WALK_M_PER_MIN, type Dest, type Landmark, type Point, type RouteResult, type Venue } from './types';

function goalCells(grid: Grid, dest: Dest): Set<number> {
  const set = new Set<number>();
  if (dest.kind === 'booth') {
    const b = dest.b;
    for (const e of [16, 30, 48]) {
      forCells(grid, b.x - e, b.y - e, b.x + b.w + e, b.y + b.h + e, (i) => { if (grid.walk[i]) set.add(i); });
      if (set.size) break;
    }
  } else {
    const i = nearestWalkable(grid, dest.lm.x, dest.lm.y);
    if (i >= 0) set.add(i);
  }
  return set;
}

function astar(grid: Grid, start: number, goals: Set<number>): number[] | null {
  const { walk, clear, gw, gh, g: G } = grid, n = gw * gh;
  const g = new Float32Array(n).fill(Infinity), came = new Int32Array(n).fill(-1), closed = new Uint8Array(n);
  let targets = [...goals].map((i) => cellXY(grid, i));
  if (targets.length > 40) {
    const xs = targets.map((t) => t[0]), ys = targets.map((t) => t[1]);
    const [ax, bx, ay, by] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    targets = [[ax, ay], [bx, by], [ax, by], [bx, ay]];
  }
  const h = (i: number) => {
    const [x, y] = cellXY(grid, i);
    let m = Infinity;
    for (const [tx, ty] of targets) {
      const dx = Math.abs(tx - x) / G, dy = Math.abs(ty - y) / G;
      m = Math.min(m, Math.max(dx, dy) + 0.4142 * Math.min(dx, dy));
    }
    return m;
  };
  const cost = (i: number) => 1 + Math.max(0, 3 - clear[i]) * 0.9;
  const heap: [number, number][] = [];
  const push = (f: number, i: number) => {
    heap.push([f, i]);
    let k = heap.length - 1;
    while (k > 0) {
      const p = (k - 1) >> 1;
      if (heap[p][0] <= heap[k][0]) break;
      [heap[p], heap[k]] = [heap[k], heap[p]];
      k = p;
    }
  };
  const pop = () => {
    const top = heap[0], last = heap.pop()!;
    if (heap.length) {
      heap[0] = last;
      let k = 0;
      for (;;) {
        const l = 2 * k + 1, r = l + 1;
        let m = k;
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
        if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
        if (m === k) break;
        [heap[m], heap[k]] = [heap[k], heap[m]];
        k = m;
      }
    }
    return top;
  };
  g[start] = 0;
  push(h(start), start);
  while (heap.length) {
    const [, i] = pop();
    if (closed[i]) continue;
    closed[i] = 1;
    if (goals.has(i)) {
      const path: number[] = [];
      for (let k = i; k >= 0; k = came[k]) path.push(k);
      return path.reverse();
    }
    const r = (i / gw) | 0, c = i - r * gw;
    for (let dr = -1; dr <= 1; dr++)
      for (let dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue;
        const rr = r + dr, cc = c + dc;
        if (rr < 0 || cc < 0 || rr >= gh || cc >= gw) continue;
        const j = rr * gw + cc;
        if (!walk[j] || closed[j]) continue;
        if (dr && dc && (!walk[r * gw + cc] || !walk[rr * gw + c])) continue;
        const ng = g[i] + (dr && dc ? Math.SQRT2 : 1) * cost(j);
        if (ng < g[j]) { g[j] = ng; came[j] = i; push(ng + h(j), j); }
      }
  }
  return null;
}

function lineOfSight(grid: Grid, [ax, ay]: Point, [bx, by]: Point) {
  const n = Math.ceil(Math.hypot(bx - ax, by - ay) / (grid.g / 2));
  for (let k = 1; k < n; k++) {
    const i = cellOf(grid, ax + ((bx - ax) * k) / n, ay + ((by - ay) * k) / n);
    if (!grid.walk[i] || grid.clear[i] < 2) return false;
  }
  return true;
}

function stringPull(grid: Grid, pts: Point[]): Point[] {
  if (pts.length < 3) return pts;
  const out = [pts[0]];
  let a = 0;
  while (a < pts.length - 1) {
    let b = pts.length - 1;
    while (b > a + 1 && !lineOfSight(grid, pts[a], pts[b])) b--;
    out.push(pts[b]);
    a = b;
  }
  return out;
}

export function findRoute(grid: Grid, venue: Venue, start: Landmark, dest: Dest): RouteResult {
  if (dest.kind === 'place' && dest.lm.id === start.id) return { same: true };
  const s = nearestWalkable(grid, start.x, start.y), goals = goalCells(grid, dest);
  if (s < 0 || !goals.size) return { fail: true };
  const path = astar(grid, s, goals);
  if (!path) return { fail: true };

  const doorsUsed: number[] = [], areas: string[] = [];
  for (const i of path) {
    const k = grid.doorCell[i];
    if (k >= 0 && !doorsUsed.includes(k)) doorsUsed.push(k);
    const a = areaAt(venue, ...cellXY(grid, i));
    if (a && areas[areas.length - 1] !== a) areas.push(a);
  }
  const P = stringPull(grid, path.map((i) => cellXY(grid, i)));
  P.unshift([start.x, start.y]);
  const [lx, ly] = P[P.length - 1];
  if (dest.kind === 'booth') {
    const b = dest.b;
    P.push([Math.max(b.x, Math.min(b.x + b.w, lx)), Math.max(b.y, Math.min(b.y + b.h, ly))]);
  } else P.push([dest.lm.x, dest.lm.y]);

  let len = 0;
  for (let k = 1; k < P.length; k++) len += Math.hypot(P[k][0] - P[k - 1][0], P[k][1] - P[k - 1][1]);
  const m = len * venue.metersPerPx;
  return { P, len, meters: Math.max(5, Math.round(m / 5) * 5), minutes: Math.max(1, Math.round(m / WALK_M_PER_MIN)), doorsUsed, areas };
}
```

- [ ] **Step 5: Run the routing test**

Run: `bun test tests/routing.test.ts`
Expected: PASS, 3 tests. If the golden test fails, print the first mismatching route's `got` and `g.r` side by side; differences in `P` mean the floor ops, door punches or obstacle list differ from v1 (compare against `legacy/src/routing.js` `createGrid`), not the A* code.

- [ ] **Step 6: Commit**

```bash
git add src/lib/core/grid.ts src/lib/core/routing.ts tests/routing.test.ts
git commit -m "Port routing grid and A* to TypeScript, pinned to v1 golden routes"
```

---

### Task 7: Strings, search and directions, plus per-event and per-venue integrity tests

**Files:**
- Create: `src/lib/i18n/strings.ts`
- Create: `src/lib/core/search.ts`
- Create: `src/lib/core/directions.ts`
- Test: `tests/search.test.ts`, `tests/directions.test.ts`, `tests/events.test.ts`, `tests/venues.test.ts`, `tests/strings.test.ts`

**Interfaces:**
- Consumes: Tasks 3–6.
- Produces:
  - `type Lang = 'th' | 'en'`, `type Strings` (shape below), `STRINGS: Record<Lang, Strings>`, `nameIn(lang: Lang): (o: I18n) => string`, `textFor(s: Strings, event: EventFile, lang: Lang, key: TextKey): string`, `fmtRange(start: string, end: string, lang: Lang): string`
  - `norm(s: string): string`
  - `type SearchItem = { type: 'booth'; b: Booth } | { type: 'exh'; b: Booth; ex: Exhibitor } | { type: 'place'; lm: Landmark }`
  - `createSearch(data: EventData): (query: string, limit?: number) => SearchItem[]`
  - `isAisleBooth(b: Booth, data: EventData): boolean`
  - `buildSteps(route: RouteOk, start: Landmark, dest: Dest, data: EventData, lang: Lang): string[]`

- [ ] **Step 1: Write the strings**

`src/lib/i18n/strings.ts`:

```ts
import type { EventFile, I18n, LandmarkGroup, TextKey } from '../core/types';

export type Lang = 'th' | 'en';

export type Strings = {
  title: string;
  searchLabel: string;
  ph: string;
  exhibitors: string;
  quick: string;
  legend: string;
  noRes: (q: string) => string;
  aisle: (l: string) => string;
  from: string;
  pickFrom: string;
  pickHint: string;
  min: (m: number) => string;
  meters: string;
  s_start: (n: string) => string;
  s_door: (n: string) => string;
  s_area: (n: string) => string;
  s_aisle: (l: string) => string;
  s_arrive: (c: string) => string;
  s_arrivePlace: (n: string) => string;
  same: string;
  clear: string;
  share: string;
  copied: string;
  hide: string;
  show: string;
  zoomIn: string;
  zoomOut: string;
  fit: string;
  clearSearch: string;
  groups: Record<LandmarkGroup, string>;
  tapHint: string;
  noRoute: string;
  events: string;
  allEvents: string;
  live: string;
  upcoming: string;
  past: string;
  ended: (date: string) => string;
  openMap: string;
  notFound: string;
  noEvents: string;
  language: string;
  floorPlan: string;
};

export const STRINGS: Record<Lang, Strings> = {
  th: {
    title: 'ค้นหาบูธ',
    searchLabel: 'ค้นหาบูธหรือผู้ออกบูธ',
    ph: 'เลขบูธ หรือชื่อผู้ออกบูธ',
    exhibitors: 'ผู้ออกบูธในบูธนี้',
    quick: 'ไปที่ยอดนิยม',
    legend: 'สีของโซน',
    noRes: (q) => `ไม่พบ “${q}” ลองพิมพ์เลขบูธ หรือชื่อผู้ออกบูธ`,
    aisle: (l) => `ทางเดิน ${l}`,
    from: 'คุณอยู่ที่ไหนตอนนี้',
    pickFrom: 'เลือกจุดเริ่มต้น',
    pickHint: 'เลือกจุดที่คุณอยู่ แล้วแอปจะวาดเส้นทางเดินให้',
    min: (m) => `ประมาณ ${m} นาที`,
    meters: 'ม.',
    s_start: (n) => `เริ่มที่${n}`,
    s_door: (n) => `เข้างานทาง${n}`,
    s_area: (n) => `เดินต่อเข้า${n}`,
    s_aisle: (l) => `เลี้ยวเข้าทางเดิน ${l}`,
    s_arrive: (c) => `ถึงบูธ ${c} แล้ว ดูจุดที่ไฮไลต์บนแผนที่`,
    s_arrivePlace: (n) => `ถึง${n}แล้ว`,
    same: 'คุณอยู่ที่นี่แล้ว',
    clear: 'ล้างเส้นทาง',
    share: 'คัดลอกลิงก์',
    copied: 'คัดลอกลิงก์แล้ว',
    hide: 'ย่อ',
    show: 'ขยาย',
    zoomIn: 'ซูมเข้า',
    zoomOut: 'ซูมออก',
    fit: 'ดูทั้งผัง',
    clearSearch: 'ล้างคำค้นหา',
    groups: { entry: 'ทางเข้า', wc: 'ห้องน้ำ', info: 'จุดประชาสัมพันธ์', charge: 'จุดชาร์จแบต', stage: 'เวทีและกิจกรรม', other: 'อื่น ๆ' },
    tapHint: 'แตะบูธบนแผนที่ หรือพิมพ์ค้นหาด้านบน',
    noRoute: 'ไม่พบเส้นทาง ลองเลือกจุดเริ่มต้นอื่น',
    events: 'งานทั้งหมด',
    allEvents: 'งานทั้งหมด',
    live: 'กำลังจัด',
    upcoming: 'เร็ว ๆ นี้',
    past: 'จบแล้ว',
    ended: (d) => `งานนี้จบไปแล้วเมื่อ ${d} แผนที่ยังใช้ได้`,
    openMap: 'เปิดแผนที่',
    notFound: 'ไม่พบงานนี้ กลับไปเลือกจากรายการงาน',
    noEvents: 'ยังไม่มีงาน',
    language: 'ภาษา',
    floorPlan: 'ผังงาน',
  },
  en: {
    title: 'Booth Finder',
    searchLabel: 'Search booths or exhibitors',
    ph: 'Booth code or exhibitor',
    exhibitors: 'At this booth',
    quick: 'Popular places',
    legend: 'Zone colours',
    noRes: (q) => `Nothing matches “${q}”. Try a booth code or an exhibitor name.`,
    aisle: (l) => `Aisle ${l}`,
    from: 'Where are you now?',
    pickFrom: 'Choose a starting point',
    pickHint: 'Pick where you are and the map draws your walking route.',
    min: (m) => `about ${m} min`,
    meters: 'm',
    s_start: (n) => `Start at ${n}.`,
    s_door: (n) => `Go in through the ${n}.`,
    s_area: (n) => `Keep walking into ${n}.`,
    s_aisle: (l) => `Turn into aisle ${l}.`,
    s_arrive: (c) => `You're at booth ${c}. It's highlighted on the map.`,
    s_arrivePlace: (n) => `You've reached ${n}.`,
    same: "You're already here.",
    clear: 'Clear route',
    share: 'Copy link',
    copied: 'Link copied',
    hide: 'Less',
    show: 'More',
    zoomIn: 'Zoom in',
    zoomOut: 'Zoom out',
    fit: 'Show whole floor',
    clearSearch: 'Clear search',
    groups: { entry: 'Entrances', wc: 'Toilets', info: 'Information', charge: 'Charging spots', stage: 'Stages & activities', other: 'Other' },
    tapHint: 'Tap a booth on the map, or search above.',
    noRoute: 'No route found. Try a different starting point.',
    events: 'Events',
    allEvents: 'All events',
    live: 'On now',
    upcoming: 'Coming up',
    past: 'Past',
    ended: (d) => `This event ended on ${d}. The map still works.`,
    openMap: 'Open map',
    notFound: "We can't find this event. Pick one from the event list.",
    noEvents: 'No events yet.',
    language: 'Language',
    floorPlan: 'Floor plan',
  },
};

export const nameIn = (lang: Lang) => (o: I18n) => o[lang] || o.th || o.en;

export const textFor = (s: Strings, event: EventFile, lang: Lang, key: TextKey) => event.text?.[key]?.[lang] ?? s[key];

export function fmtRange(start: string, end: string, lang: Lang): string {
  const f = new Intl.DateTimeFormat(lang === 'th' ? 'th-TH' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  const d = (iso: string) => new Date(`${iso}T00:00:00Z`);
  return start === end ? f.format(d(start)) : f.formatRange(d(start), d(end));
}
```

- [ ] **Step 2: Write the failing tests**

`tests/strings.test.ts`:

```ts
import { test, expect } from 'bun:test';
import { STRINGS, fmtRange } from '../src/lib/i18n/strings';

test('th and en have the same keys', () => {
  expect(Object.keys(STRINGS.th).sort()).toEqual(Object.keys(STRINGS.en).sort());
  expect(Object.keys(STRINGS.th.groups).sort()).toEqual(Object.keys(STRINGS.en.groups).sort());
});

test('no exclamation marks in copy', () => {
  const all = JSON.stringify(STRINGS) + Object.values(STRINGS).map((s) => s.noRes('x') + s.ended('x')).join('');
  expect(all.includes('!')).toBe(false);
});

test('fmtRange formats both languages', () => {
  expect(fmtRange('2026-03-26', '2026-04-06', 'en')).toContain('2026');
  expect(fmtRange('2026-03-26', '2026-04-06', 'th')).toContain('2569');
});
```

`tests/search.test.ts`:

```ts
import { test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { loadEvent } from '../src/lib/server/catalog';
import { loadData, prepareData } from '../src/lib/core/prepare';
import { parseCSV } from '../src/lib/core/csv';
import { createSearch, type SearchItem } from '../src/lib/core/search';

const bundle = loadEvent('bkkibf-2026');
const data = loadData(bundle);
const golden = JSON.parse(readFileSync('tests/golden/v1.json', 'utf8'));
const key = (it: SearchItem) => {
  if (it.type === 'place') return `place:${it.lm.id}`;
  const k = `${it.b.c}#${data.byCode[it.b.c].indexOf(it.b)}`;
  return it.type === 'exh' ? `exh:${k}:${it.ex.en || it.ex.th}` : `booth:${k}`;
};

test('search results match v1 for every golden query', () => {
  const find = createSearch(data);
  for (const g of golden.search) expect({ q: g.q, hits: find(g.q).map(key) }).toEqual(g);
});

test('search finds publishers from the CSV', () => {
  const d = prepareData(bundle.venue, bundle.event, bundle.booths, parseCSV('booth,name_th,name_en\nK16,สำนักพิมพ์ทดสอบ,Test Press\n'));
  const find = createSearch(d);
  const hit = find('test press')[0];
  expect(hit.type).toBe('exh');
  expect(hit.type !== 'place' && hit.b.c).toBe('K16');
});
```

`tests/directions.test.ts`:

```ts
import { test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { loadEvent } from '../src/lib/server/catalog';
import { loadData } from '../src/lib/core/prepare';
import { createGrid, obstaclesOf } from '../src/lib/core/grid';
import { findRoute } from '../src/lib/core/routing';
import { buildSteps, isAisleBooth } from '../src/lib/core/directions';
import { isRouteOk, type Dest } from '../src/lib/core/types';

const data = loadData(loadEvent('bkkibf-2026'));
const grid = createGrid(data.venue, obstaclesOf(data));
const golden = JSON.parse(readFileSync('tests/golden/v1.json', 'utf8'));
const destOf = (to: string): Dest => {
  const [kind, rest] = to.split(':');
  if (kind === 'place') return { kind: 'place', lm: data.landmarkById[rest] };
  const [code, n] = rest.split('#');
  return { kind: 'booth', b: data.byCode[code][Number(n)] };
};

test('steps match v1 in both languages for every golden route', () => {
  const bad: string[] = [];
  for (const g of golden.routes) {
    if (!g.en) continue;
    const start = data.landmarkById[g.from], dest = destOf(g.to);
    const r = findRoute(grid, data.venue, start, dest);
    if (!isRouteOk(r)) { bad.push(`${g.from} -> ${g.to}: no route`); continue; }
    for (const lang of ['en', 'th'] as const) {
      const got = buildSteps(r, start, dest, data, lang);
      if (JSON.stringify(got) !== JSON.stringify(g[lang]) && bad.length < 5) bad.push(`${lang} ${g.from} -> ${g.to}: ${got.join(' | ')}`);
    }
  }
  expect(bad).toEqual([]);
});

test('foyer zones and top-row booths are not aisle booths', () => {
  expect(isAisleBooth(data.byCode.U07[0], data)).toBe(false);
  expect(isAisleBooth(data.byCode.K16[0], data)).toBe(true);
});
```

`tests/events.test.ts`:

```ts
import { test, expect, describe } from 'bun:test';
import { listEventIds, loadEvent } from '../src/lib/server/catalog';
import { loadData } from '../src/lib/core/prepare';
import { createGrid, obstaclesOf } from '../src/lib/core/grid';
import { findRoute } from '../src/lib/core/routing';
import { ICON_NAMES, isRouteOk } from '../src/lib/core/types';

for (const id of listEventIds()) {
  describe(`event ${id}`, () => {
    const bundle = loadEvent(id);
    const data = loadData(bundle);
    const { event, venue } = data;

    test('booth codes match the event code pattern', () => {
      const re = new RegExp(event.codePattern);
      expect(data.booths.filter((b) => !re.test(b.c)).map((b) => b.c)).toEqual([]);
    });

    test('only allowed duplicate codes exist', () => {
      const dups = Object.entries(data.byCode).filter(([, l]) => l.length > 1).map(([c]) => c).sort();
      expect(dups).toEqual([...event.allowedDuplicateCodes].sort());
    });

    test('booths do not overlap', () => {
      const bs = data.booths.filter((b) => !b.foyer), hits: string[] = [];
      for (let i = 0; i < bs.length; i++)
        for (let j = i + 1; j < bs.length; j++) {
          const a = bs[i], b = bs[j];
          const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
          const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
          if (ox > 3 && oy > 3) hits.push(`${a.c}/${b.c}`);
        }
      expect(hits).toEqual([]);
    });

    test('every category used is defined, special exists with foyer zones', () => {
      const used = new Set([...data.booths.map((b) => b.cat), ...data.pillars.map((p) => p.cat)]);
      expect([...used].filter((c) => !event.categories[c])).toEqual([]);
      if (event.foyerZones.length) expect(event.categories.special).toBeDefined();
    });

    test('exhibitors point at real booths', () => {
      expect(data.unknownExhibitorBooths).toEqual([]);
    });

    test('zones refer to booths on the map', () => {
      expect(Object.keys(event.zones).filter((c) => !data.byCode[c])).toEqual([]);
    });

    test('landmark ids are unique across venue and event, icons known', () => {
      const ids = [...venue.landmarks, ...event.landmarks].map((l) => l.id);
      expect(ids.length).toBe(new Set(ids).size);
      expect(data.landmarks.filter((l) => !ICON_NAMES.includes(l.icon))).toEqual([]);
    });

    test('quick picks resolve', () => {
      const bad = event.quickPicks.filter(([k, v]) => (k === 'booth' ? !data.byCode[v] : !data.landmarkById[v]));
      expect(bad).toEqual([]);
    });

    test('every booth and landmark is reachable from the venue origin', () => {
      const grid = createGrid(venue, obstaclesOf(data));
      const origin = data.landmarkById[venue.origin];
      const unreachable = [
        ...data.booths.filter((b) => !isRouteOk(findRoute(grid, venue, origin, { kind: 'booth', b }))).map((b) => b.c),
        ...data.landmarks
          .filter((l) => l.id !== origin.id && !isRouteOk(findRoute(grid, venue, origin, { kind: 'place', lm: l })))
          .map((l) => l.id),
      ];
      expect(unreachable).toEqual([]);
    });
  });
}

test('aisles in the 2026 event stay at least 4 cells wide', () => {
  const data = loadData(loadEvent('bkkibf-2026'));
  const grid = createGrid(data.venue, obstaclesOf(data));
  const row = Math.round((900 - grid.y0) / grid.g - 0.5);
  const narrow: string[] = [];
  for (const [letter, x] of Object.entries(data.event.aisles!.x)) {
    const c = Math.round((x - grid.x0) / grid.g - 0.5);
    let l = c, r = c;
    while (l > 0 && grid.walk[row * grid.gw + l - 1]) l--;
    while (r < grid.gw - 1 && grid.walk[row * grid.gw + r + 1]) r++;
    if (!grid.walk[row * grid.gw + c] || r - l + 1 < 4) narrow.push(letter);
  }
  expect(narrow).toEqual([]);
});
```

`tests/venues.test.ts`:

```ts
import { test, expect, describe } from 'bun:test';
import { listVenueIds, loadVenue } from '../src/lib/server/catalog';
import { pointInPolygon } from '../src/lib/core/geometry';
import { createGrid } from '../src/lib/core/grid';
import { findRoute } from '../src/lib/core/routing';
import { isRouteOk, type Box, type Point } from '../src/lib/core/types';

const segHitsBox = ([ax, ay]: Point, [bx, by]: Point, [x0, y0, x1, y1]: Box) => {
  for (let k = 0; k <= 50; k++) {
    const x = ax + ((bx - ax) * k) / 50, y = ay + ((by - ay) * k) / 50;
    if (x >= x0 && x <= x1 && y >= y0 && y <= y1) return true;
  }
  return false;
};

for (const id of listVenueIds()) {
  describe(`venue ${id}`, () => {
    const venue = loadVenue(id);

    test('origin is a venue landmark', () => {
      expect(venue.landmarks.some((l) => l.id === venue.origin)).toBe(true);
    });

    test('every door crosses a wall and names a known area', () => {
      const edges = venue.walls.flatMap((w) => w.map((p, k) => [p, w[(k + 1) % w.length]] as [Point, Point]));
      for (const d of venue.doors) {
        expect(edges.some(([a, b]) => segHitsBox(a, b, d.gap))).toBe(true);
        expect(venue.areas.some((a) => a.id === d.area)).toBe(true);
      }
    });

    test('area labels sit inside their area and areas do not overlap', () => {
      for (const a of venue.areas) expect(pointInPolygon(a.label.x, a.label.y, a.bounds)).toBe(true);
      const v = venue.view;
      for (let y = v.y + 5; y < v.y + v.h; y += 20)
        for (let x = v.x + 5; x < v.x + v.w; x += 20)
          expect(venue.areas.filter((a) => pointInPolygon(x, y, a.bounds)).length).toBeLessThanOrEqual(1);
    });

    test('every venue landmark is reachable from the origin on an empty floor', () => {
      const grid = createGrid(venue, []);
      const origin = venue.landmarks.find((l) => l.id === venue.origin)!;
      const bad = venue.landmarks.filter((l) => l.id !== origin.id && !isRouteOk(findRoute(grid, venue, origin, { kind: 'place', lm: l })));
      expect(bad.map((l) => l.id)).toEqual([]);
    });
  });
}
```

- [ ] **Step 3: Run them to see them fail**

Run: `bun test tests/strings.test.ts tests/search.test.ts tests/directions.test.ts tests/events.test.ts tests/venues.test.ts`
Expected: strings and venues pass; search, directions and events fail on missing modules.

- [ ] **Step 4: Write `search.ts`**

`src/lib/core/search.ts`:

```ts
import { STRINGS } from '../i18n/strings';
import type { Booth, EventData, Exhibitor, Landmark } from './types';

export type SearchItem = { type: 'booth'; b: Booth } | { type: 'exh'; b: Booth; ex: Exhibitor } | { type: 'place'; lm: Landmark };

export const norm = (s: string) => String(s).toLowerCase().replace(/[\s\-_.·,'’()]/g, '');

export function createSearch(data: EventData) {
  const { zones } = data.event;
  const items: { it: SearchItem; code?: string; names: string[] }[] = [];
  for (const b of data.booths) items.push({ it: { type: 'booth', b }, code: b.c, names: zones[b.c] ? [zones[b.c].th, zones[b.c].en] : [] });
  for (const ex of data.exhibitors)
    for (const b of data.byCode[ex.booth] || []) items.push({ it: { type: 'exh', b, ex }, code: b.c, names: [ex.th, ex.en].filter(Boolean) });
  for (const lm of data.landmarks)
    items.push({ it: { type: 'place', lm }, names: [lm.th, lm.en, STRINGS.th.groups[lm.group], STRINGS.en.groups[lm.group]] });
  const prepared = items.map((p) => ({ it: p.it, code: p.code?.toLowerCase(), names: p.names.map(norm) }));

  return function search(query: string, limit = 40): SearchItem[] {
    const n = norm(query);
    if (!n) return [];
    const codeQ = /^([a-z])(\d{0,2})$/.exec(n);
    const scored: [number, SearchItem, string][] = [];
    for (const p of prepared) {
      let score = 0;
      if (p.code) {
        if (p.code === n) score = 100;
        else if (codeQ && p.code[0] === codeQ[1]) {
          const num = codeQ[2], rest = p.code.slice(1);
          if (num === '' || rest.startsWith(num) || (num.length === 1 && rest === '0' + num)) score = 80;
        }
      }
      for (const nm of p.names) {
        if (!nm) continue;
        if (nm.startsWith(n)) score = Math.max(score, 65);
        else if (nm.includes(n)) score = Math.max(score, 45);
      }
      if (p.it.type === 'exh' && score === 80) score = 0;
      if (score) scored.push([score, p.it, p.it.type === 'place' ? '' : p.it.b.c]);
    }
    scored.sort((a, b) => b[0] - a[0] || a[2].localeCompare(b[2]));
    const seen = new Set<string>(), out: SearchItem[] = [];
    for (const [, it] of scored) {
      const key = it.type === 'place' ? 'p:' + it.lm.id : `${it.type}:${it.b.i}:${it.type === 'exh' ? it.ex.th + it.ex.en : ''}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(it);
      if (out.length >= limit) break;
    }
    return out;
  };
}
```

- [ ] **Step 5: Write `directions.ts`**

`src/lib/core/directions.ts`:

```ts
import { areaAt, areaName } from './geometry';
import { STRINGS, nameIn, type Lang } from '../i18n/strings';
import type { Booth, Dest, EventData, Landmark, RouteOk } from './types';

export function isAisleBooth(b: Booth, data: EventData): boolean {
  const a = data.event.aisles;
  if (!a || !b.area || b.y <= a.boothMinY) return false;
  if (!new RegExp(data.event.codePattern).test(b.c)) return false;
  return /^[A-Z]/.test(b.c) && b.c[0] in a.x;
}

export function buildSteps(route: RouteOk, start: Landmark, dest: Dest, data: EventData, lang: Lang): string[] {
  const s = STRINGS[lang], nameOf = nameIn(lang), { venue } = data;
  const steps = [s.s_start(nameOf(start))];
  const startArea = areaAt(venue, start.x, start.y);

  const firstDoor = route.doorsUsed.length ? venue.doors[route.doorsUsed[0]] : null;
  if (firstDoor && firstDoor.id !== start.id) {
    const lm = data.landmarkById[firstDoor.id];
    if (lm) steps.push(s.s_door(nameOf(lm)));
  }

  const destArea = dest.kind === 'booth' ? dest.b.area : areaAt(venue, dest.lm.x, dest.lm.y);
  const entryArea = startArea || firstDoor?.area || null;
  if (destArea && entryArea && entryArea !== destArea) steps.push(s.s_area(nameOf(areaName(venue, destArea))));

  if (dest.kind === 'booth') {
    const b = dest.b;
    if (isAisleBooth(b, data)) {
      const hint = venue.depth ? ' ' + nameOf(venue.depth.aisleHint) : '';
      steps.push(s.s_aisle(b.c[0]) + hint);
      if (venue.depth) {
        const { back, front, text } = venue.depth;
        const f = (b.cy - back) / (front - back);
        steps.push(nameOf(f < 0.36 ? text.back : f < 0.66 ? text.mid : text.front));
      }
    }
    steps.push(s.s_arrive(b.c));
  } else {
    steps.push(s.s_arrivePlace(nameOf(dest.lm)));
  }
  return steps;
}
```

- [ ] **Step 6: Run the tests**

Run: `bun test`
Expected: all tests pass. The directions golden test is the strict one: it confirms area names, door ids and venue phrases reproduce v1 text character for character.

- [ ] **Step 7: Commit**

```bash
git add src/lib/i18n src/lib/core/search.ts src/lib/core/directions.ts tests
git commit -m "Port search and directions, add strings and integrity tests per event and venue"
```

---

### Task 8: Styles, storage, language state and the app shell

**Files:**
- Create: `src/lib/styles/app.css` (from `legacy/src/styles.css` plus new rules)
- Create: `src/lib/storage.ts`
- Create: `src/lib/i18n/lang.svelte.ts`
- Create: `src/lib/ui/Header.svelte`, `src/lib/ui/LangToggle.svelte`
- Create: `src/routes/+layout.svelte`
- Test: `tests/storage.test.ts`

**Interfaces:**
- Consumes: `Lang`, `STRINGS` (Task 7).
- Produces:
  - `type KV = { get(k: string): string | null; set(k: string, v: string): void }`
  - `makeStore(ls: () => Storage | undefined): KV`, `store: KV`
  - `lang: { current: Lang }` (a `$state` object), `initLang(): void`, `setLang(l: Lang): void`
  - `<Header title subtitle backHref? backLabel?>`, `<LangToggle>`
  - Global CSS classes unchanged from v1, plus `.events`, `.event-card`, `.badge`, `.badge.live|upcoming|past`, `.back`, `.notice`, `.page`

- [ ] **Step 1: Write the failing storage test**

`tests/storage.test.ts`:

```ts
import { test, expect } from 'bun:test';
import { makeStore } from '../src/lib/storage';

test('reads and writes through localStorage', () => {
  const m = new Map<string, string>();
  const ls = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) } as unknown as Storage;
  const s = makeStore(() => ls);
  s.set('bf:lang', 'en');
  expect(s.get('bf:lang')).toBe('en');
});

test('survives storage that throws or is missing', () => {
  const boom = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } } as unknown as Storage;
  const s = makeStore(() => boom);
  expect(() => s.set('k', 'v')).not.toThrow();
  expect(s.get('k')).toBeNull();
  const none = makeStore(() => { throw new Error('SecurityError'); });
  expect(none.get('k')).toBeNull();
  expect(() => none.set('k', 'v')).not.toThrow();
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `bun test tests/storage.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Write `storage.ts`**

`src/lib/storage.ts`:

```ts
export type KV = { get(k: string): string | null; set(k: string, v: string): void };

export function makeStore(ls: () => Storage | undefined): KV {
  return {
    get(k) {
      try {
        return ls()?.getItem(k) ?? null;
      } catch {
        return null;
      }
    },
    set(k, v) {
      try {
        ls()?.setItem(k, v);
      } catch {
        return;
      }
    },
  };
}

export const store = makeStore(() => globalThis.localStorage);
```

- [ ] **Step 4: Run the storage test**

Run: `bun test tests/storage.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 5: Write the language state**

`src/lib/i18n/lang.svelte.ts`:

```ts
import { store } from '../storage';
import type { Lang } from './strings';

export const lang = $state<{ current: Lang }>({ current: 'th' });

const apply = (l: Lang) => {
  lang.current = l;
  if (typeof document !== 'undefined') document.documentElement.lang = l;
};

export function initLang() {
  apply((store.get('bf:lang') ?? store.get('bf26:lang')) === 'en' ? 'en' : 'th');
}

export function setLang(l: Lang) {
  apply(l);
  store.set('bf:lang', l);
}
```

- [ ] **Step 6: Port the CSS**

```bash
mkdir -p src/lib/styles
cp legacy/src/styles.css src/lib/styles/app.css
```

Edit the first comment line of `src/lib/styles/app.css` to `/* Tokens on :root; dark theme redefines them. */` and delete the second comment line. Append:

```css
.back{color:#fff;text-decoration:none;font-size:22px;line-height:1;padding:4px 6px 6px;border-radius:10px;flex:none}
.back:hover{background:rgba(255,255,255,.12)}
.notice{background:var(--chip);color:var(--text);border-radius:12px;padding:8px 12px;font-size:14px;margin:0 0 12px}
.page{height:100%;display:flex;flex-direction:column}
.events{flex:1;overflow:auto;padding:16px;display:grid;gap:12px;align-content:start;max-width:720px;width:100%;margin:0 auto}
.events h2{font-family:var(--display);font-weight:500;font-size:15px;color:var(--muted);margin:8px 0 0}
.event-card{display:flex;flex-direction:column;gap:4px;padding:14px 16px;border:1.5px solid var(--line);border-radius:16px;background:var(--panel);color:var(--text);text-decoration:none}
.event-card:hover{border-color:var(--blue)}
.event-card b{font-family:var(--display);font-weight:500;font-size:18px;line-height:1.3}
.event-card span{font-size:14px;color:var(--muted)}
.badge{align-self:flex-start;font-size:12.5px;font-weight:600;border-radius:999px;padding:2px 10px;background:var(--chip);color:var(--ink)}
.badge.live{background:var(--sun);color:#13306B}
.badge.past{color:var(--muted)}
```

- [ ] **Step 7: Write the header and language toggle**

`src/lib/ui/LangToggle.svelte`:

```svelte
<script lang="ts">
  import { lang, setLang } from '$lib/i18n/lang.svelte';
  import { STRINGS, type Lang } from '$lib/i18n/strings';
  const options: [Lang, string][] = [['th', 'ไทย'], ['en', 'EN']];
</script>

<div class="lang" role="group" aria-label={STRINGS[lang.current].language}>
  {#each options as [l, label] (l)}
    <button type="button" aria-pressed={lang.current === l} onclick={() => setLang(l)}>{label}</button>
  {/each}
</div>
```

`src/lib/ui/Header.svelte`:

```svelte
<script lang="ts">
  import LangToggle from './LangToggle.svelte';
  let { title, subtitle = '', backHref = '', backLabel = '' }: { title: string; subtitle?: string; backHref?: string; backLabel?: string } = $props();
</script>

<header>
  {#if backHref}
    <a class="back" href={backHref} aria-label={backLabel} title={backLabel}>‹</a>
  {/if}
  <div class="brand">
    <b>{title}</b>
    {#if subtitle}<span>{subtitle}</span>{/if}
  </div>
  <LangToggle />
</header>
```

- [ ] **Step 8: Write the root layout**

`src/routes/+layout.svelte`:

```svelte
<script lang="ts">
  import '$lib/styles/app.css';
  import { onMount } from 'svelte';
  import { initLang } from '$lib/i18n/lang.svelte';
  let { children } = $props();
  onMount(initLang);
</script>

{@render children()}
```

- [ ] **Step 9: Check and build**

Run: `bun run check && bun run lint && bun run build`
Expected: no errors.

- [ ] **Step 10: Commit**

```bash
git add src tests
git commit -m "Add styles, storage, language state and app shell"
```

---

### Task 9: Map components and viewport

**Files:**
- Create: `src/lib/core/panzoom.ts`
- Create: `src/lib/map/labels.ts`
- Create: `src/lib/map/viewport.ts`
- Create: `src/lib/map/FloorMap.svelte`, `BaseLayer.svelte`, `BoothLayer.svelte`, `ZoneLayer.svelte`, `MarkLayer.svelte`, `Icon.svelte`, `RouteLayer.svelte`, `PinLayer.svelte`
- Test: `tests/panzoom.test.ts`, `tests/labels.test.ts`

**Interfaces:**
- Consumes: `EventData`, `Dest`, `RouteOk`, `Venue`, `Box`, `Rect`, `Landmark` (Task 3); `isAisleBooth` (Task 7); `STRINGS`, `nameIn` (Task 7); `lang` (Task 8).
- Produces:
  - `type VB = { x: number; y: number; w: number; h: number }`
  - `MIN_W = 170`, `LABEL_MIN_PX_PER_UNIT = 0.42`
  - `clampVB(vb: VB, view: Rect, aspect: number): VB`
  - `boxFor(x0: number, y0: number, x1: number, y1: number, pad: number, aspect: number): VB`
  - `zoomAt(vb: VB, px: number, py: number, k: number): VB` (px, py in map units)
  - `ease(k: number): number`, `lerpVB(a: VB, b: VB, e: number): VB`
  - `frameTarget(dest: Dest | null, route: RouteOk | null): { box: Box; pad: number } | null`
  - `boothLabel(b: Booth, short?: string): { fs: number; code: { x: number; y: number; rotate: boolean }; lines: { x: number; y: number; text: string }[] }`
  - `type Viewport = { fitAll(animated?: boolean): void; zoomCenter(k: number): void; frame(dest: Dest | null, route: RouteOk | null): void; destroy(): void }`
  - `createViewport(svg: SVGSVGElement, venue: Venue, onTap: (target: Element | null) => void): Viewport`
  - `<FloorMap data dest route onSelectBooth onSelectPlace onFit bind:this>` exposing `fitAll`, `zoomCenter`, `frame`

- [ ] **Step 1: Write the failing pure tests**

`tests/panzoom.test.ts`:

```ts
import { test, expect } from 'bun:test';
import { clampVB, boxFor, zoomAt, frameTarget, lerpVB, ease, MIN_W } from '../src/lib/core/panzoom';

const view = { x: 180, y: 240, w: 2230, h: 1420 };

test('clampVB keeps the aspect ratio and a minimum width', () => {
  const v = clampVB({ x: 0, y: 0, w: 10, h: 999 }, view, 0.5);
  expect(v.w).toBe(MIN_W);
  expect(v.h).toBe(MIN_W * 0.5);
});

test('clampVB keeps the centre inside the view', () => {
  const v = clampVB({ x: -5000, y: -5000, w: 400, h: 200 }, view, 0.5);
  expect(v.x + v.w / 2).toBe(view.x);
  expect(v.y + v.h / 2).toBe(view.y);
});

test('clampVB caps width at 1.25 × view', () => {
  expect(clampVB({ x: 0, y: 0, w: 99999, h: 1 }, view, 1).w).toBe(view.w * 1.25);
});

test('boxFor fits the box with padding at the given aspect', () => {
  const b = boxFor(0, 0, 100, 100, 10, 0.5);
  expect(b.h / b.w).toBeCloseTo(0.5);
  expect(b.w).toBeGreaterThanOrEqual(240);
});

test('zoomAt keeps the anchor point fixed', () => {
  const a = { x: 0, y: 0, w: 100, h: 50 };
  const b = zoomAt(a, 25, 25, 0.5);
  expect((25 - b.x) / b.w).toBeCloseTo((25 - a.x) / a.w);
  expect(b.w).toBe(50);
});

test('frameTarget pads routes less than single points and leaves room for the pin', () => {
  const b = { c: 'K16', x: 100, y: 100, w: 30, h: 60, cat: 'general', i: 0, cx: 115, cy: 130, area: 'hall7' };
  const t1 = frameTarget({ kind: 'booth', b }, null)!;
  expect(t1.pad).toBe(160);
  expect(t1.box[1]).toBe(100 - 70);
  const t2 = frameTarget({ kind: 'booth', b }, { P: [[0, 0], [200, 300]], len: 1, meters: 5, minutes: 1, doorsUsed: [], areas: [] })!;
  expect(t2.pad).toBe(60);
  expect(t2.box).toEqual([0, -70, 200, 300]);
  expect(frameTarget(null, null)).toBeNull();
});

test('ease and lerp', () => {
  expect(ease(0)).toBe(0);
  expect(ease(1)).toBe(1);
  expect(lerpVB({ x: 0, y: 0, w: 0, h: 0 }, { x: 10, y: 10, w: 10, h: 10 }, 0.5)).toEqual({ x: 5, y: 5, w: 5, h: 5 });
});
```

`tests/labels.test.ts`:

```ts
import { test, expect } from 'bun:test';
import { boothLabel } from '../src/lib/map/labels';

const b = (w: number, h: number) => ({ c: 'A02', x: 0, y: 0, w, h, cat: 'special', i: 0, cx: w / 2, cy: h / 2, area: 'hall5' });

test('font size is clamped between 8 and 13', () => {
  expect(boothLabel(b(10, 10)).fs).toBe(8);
  expect(boothLabel(b(200, 200)).fs).toBe(13);
});

test('wide booths with a short name get two text lines', () => {
  const l = boothLabel(b(120, 80), "AUTHOR'S SALON");
  expect(l.code.y).toBe(40 - 12);
  expect(l.lines.map((x) => x.text)).toEqual(["AUTHOR'S SALON"]);
  expect(boothLabel(b(120, 80), 'MEET THE LEGENDS').lines.map((x) => x.text)).toEqual(['MEET THE', 'LEGENDS']);
});

test('narrow tall named booths rotate their code', () => {
  expect(boothLabel(b(28, 80), 'X').code.rotate).toBe(true);
  expect(boothLabel(b(28, 80)).code.rotate).toBe(false);
});
```

`short` is `undefined` when the booth has no zone entry and `''` for a zone without a short name. Only zoned booths rotate their code, matching v1.

- [ ] **Step 2: Run them to see them fail**

Run: `bun test tests/panzoom.test.ts tests/labels.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 3: Write `panzoom.ts` and `labels.ts`**

`src/lib/core/panzoom.ts`:

```ts
import type { Box, Dest, Rect, RouteOk } from './types';

export type VB = { x: number; y: number; w: number; h: number };
export const MIN_W = 170;
export const LABEL_MIN_PX_PER_UNIT = 0.42;

export function clampVB(vb: VB, view: Rect, aspect: number): VB {
  const w = Math.max(MIN_W, Math.min(view.w * 1.25, vb.w)), h = w * aspect;
  const cx = Math.max(view.x, Math.min(view.x + view.w, vb.x + vb.w / 2));
  const cy = Math.max(view.y, Math.min(view.y + view.h, vb.y + vb.h / 2));
  return { x: cx - w / 2, y: cy - h / 2, w, h };
}

export function boxFor(x0: number, y0: number, x1: number, y1: number, pad: number, aspect: number): VB {
  let w = x1 - x0 + pad * 2;
  const h0 = y1 - y0 + pad * 2;
  if (h0 / w > aspect) w = h0 / aspect;
  const h = w * aspect;
  return { x: (x0 + x1) / 2 - w / 2, y: (y0 + y1) / 2 - h / 2, w, h };
}

export const zoomAt = (vb: VB, px: number, py: number, k: number): VB => ({
  x: px - (px - vb.x) * k,
  y: py - (py - vb.y) * k,
  w: vb.w * k,
  h: vb.h * k,
});

export const ease = (k: number) => 1 - (1 - k) ** 3;

export const lerpVB = (a: VB, b: VB, e: number): VB => ({
  x: a.x + (b.x - a.x) * e,
  y: a.y + (b.y - a.y) * e,
  w: a.w + (b.w - a.w) * e,
  h: a.h + (b.h - a.h) * e,
});

export function frameTarget(dest: Dest | null, route: RouteOk | null): { box: Box; pad: number } | null {
  let x0: number, y0: number, x1: number, y1: number;
  if (route) {
    const xs = route.P.map((p) => p[0]), ys = route.P.map((p) => p[1]);
    [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  } else if (dest) {
    const [px, py] = dest.kind === 'booth' ? [dest.b.cx, dest.b.cy] : [dest.lm.x, dest.lm.y];
    x0 = x1 = px;
    y0 = y1 = py;
  } else return null;
  if (dest?.kind === 'booth') {
    const b = dest.b;
    x0 = Math.min(x0, b.x); x1 = Math.max(x1, b.x + b.w); y0 = Math.min(y0, b.y); y1 = Math.max(y1, b.y + b.h);
  }
  return { box: [x0, y0 - 70, x1, y1], pad: route ? 60 : 160 };
}
```

`src/lib/map/labels.ts`:

```ts
import type { Booth } from '../core/types';

export function boothLabel(b: Booth, short?: string) {
  const fs = Math.min(13, Math.max(8, Math.min(b.w * 0.36, b.h * 0.5)));
  if (short && b.w > 50) {
    const words = short.split(' ');
    const lines = words.length > 2 ? [words.slice(0, 2).join(' '), words.slice(2).join(' ')] : [words.join(' ')];
    return { fs, code: { x: b.cx, y: b.cy - 12, rotate: false }, lines: lines.map((text, k) => ({ x: b.cx, y: b.cy + 4 + k * 12, text })) };
  }
  return { fs, code: { x: b.cx, y: b.cy, rotate: short !== undefined && b.w < 32 && b.h > 60 }, lines: [] };
}
```

- [ ] **Step 4: Run the pure tests**

Run: `bun test tests/panzoom.test.ts tests/labels.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the viewport module**

`src/lib/map/viewport.ts`:

```ts
import { boxFor, clampVB, ease, frameTarget, lerpVB, zoomAt, LABEL_MIN_PX_PER_UNIT, type VB } from '../core/panzoom';
import type { Dest, RouteOk, Venue } from '../core/types';

export type Viewport = {
  fitAll(animated?: boolean): void;
  zoomCenter(k: number): void;
  frame(dest: Dest | null, route: RouteOk | null): void;
  destroy(): void;
};

export function createViewport(svg: SVGSVGElement, venue: Venue, onTap: (target: Element | null) => void): Viewport {
  const view = venue.view;
  let vb: VB = { ...view }, anim = 0;
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const aspect = () => {
    const r = svg.getBoundingClientRect();
    return r.width && r.height ? r.height / r.width : view.h / view.w;
  };
  const apply = () => {
    svg.setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.w} ${vb.h}`);
    svg.classList.toggle('labels-off', svg.getBoundingClientRect().width / vb.w < LABEL_MIN_PX_PER_UNIT);
  };
  const set = (next: VB) => { vb = clampVB(next, view, aspect()); apply(); };
  const toSvg = (cx: number, cy: number) => {
    const p = svg.createSVGPoint();
    p.x = cx; p.y = cy;
    return p.matrixTransform(svg.getScreenCTM()!.inverse());
  };
  const animateTo = (target: VB) => {
    cancelAnimationFrame(anim);
    const from = { ...vb }, t0 = performance.now(), dur = reduceMotion ? 0 : 450;
    const step = (now: number) => {
      const k = dur ? Math.min(1, (now - t0) / dur) : 1;
      vb = lerpVB(from, target, ease(k));
      if (k < 1) { apply(); anim = requestAnimationFrame(step); } else set(vb);
    };
    anim = requestAnimationFrame(step);
  };
  const overview = () => {
    const o = svg.getBoundingClientRect().width < 600 ? venue.overview.narrow : venue.overview.wide;
    return boxFor(...o.box, o.pad, aspect());
  };
  const zoomAtClient = (cx: number, cy: number, k: number) => {
    const p = toSvg(cx, cy);
    set(zoomAt(vb, p.x, p.y, k));
  };

  const pointers = new Map<number, { x: number; y: number }>();
  let down: { x: number; y: number; target: Element | null; moved: boolean; start: DOMPoint } | null = null;
  let pinch: { d: number; mx: number; my: number } | null = null;

  const onDown = (e: PointerEvent) => {
    svg.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    cancelAnimationFrame(anim);
    if (pointers.size === 1) down = { x: e.clientX, y: e.clientY, target: e.target as Element, moved: false, start: toSvg(e.clientX, e.clientY) };
    else if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
      if (down) down.moved = true;
    }
  };
  const onMove = (e: PointerEvent) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2 && pinch) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      const p0 = toSvg(pinch.mx, pinch.my);
      zoomAtClient(mx, my, pinch.d / d);
      const p1 = toSvg(mx, my);
      set({ ...vb, x: vb.x + p0.x - p1.x, y: vb.y + p0.y - p1.y });
      pinch = { d, mx, my };
    } else if (pointers.size === 1 && down) {
      if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) { down.moved = true; svg.classList.add('dragging'); }
      if (down.moved) {
        const p = toSvg(e.clientX, e.clientY);
        set({ ...vb, x: vb.x + down.start.x - p.x, y: vb.y + down.start.y - p.y });
      }
    }
  };
  const onEnd = (e: PointerEvent) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
    if (pointers.size === 1) {
      const [p] = [...pointers.values()];
      down = { x: p.x, y: p.y, target: null, moved: true, start: toSvg(p.x, p.y) };
    }
    if (pointers.size === 0) {
      svg.classList.remove('dragging');
      if (down && !down.moved && e.type === 'pointerup') onTap(down.target);
      down = null;
    }
  };
  const onWheel = (e: WheelEvent) => { e.preventDefault(); zoomAtClient(e.clientX, e.clientY, Math.exp(e.deltaY * 0.0016)); };

  svg.addEventListener('pointerdown', onDown);
  svg.addEventListener('pointermove', onMove);
  svg.addEventListener('pointerup', onEnd);
  svg.addEventListener('pointercancel', onEnd);
  svg.addEventListener('wheel', onWheel, { passive: false });
  const ro = new ResizeObserver(() => {
    const cx = vb.x + vb.w / 2, cy = vb.y + vb.h / 2, h = vb.w * aspect();
    set({ x: cx - vb.w / 2, y: cy - h / 2, w: vb.w, h });
  });
  ro.observe(svg);

  return {
    fitAll(animated = false) {
      const b = overview();
      if (animated) animateTo(b); else set(b);
    },
    zoomCenter(k) {
      const r = svg.getBoundingClientRect();
      zoomAtClient(r.left + r.width / 2, r.top + r.height / 2, k);
    },
    frame(dest, route) {
      const t = frameTarget(dest, route);
      if (t) requestAnimationFrame(() => animateTo(boxFor(...t.box, t.pad, aspect())));
    },
    destroy() {
      cancelAnimationFrame(anim);
      ro.disconnect();
      svg.removeEventListener('pointerdown', onDown);
      svg.removeEventListener('pointermove', onMove);
      svg.removeEventListener('pointerup', onEnd);
      svg.removeEventListener('pointercancel', onEnd);
      svg.removeEventListener('wheel', onWheel);
    },
  };
}
```

`frame` waits one animation frame so the sheet height has settled before measuring. Keep that `requestAnimationFrame`.

- [ ] **Step 6: Write the layer components**

`src/lib/map/Icon.svelte`:

```svelte
<script lang="ts">
  import type { IconName } from '$lib/core/types';
  let { icon, x, y }: { icon: IconName; x: number; y: number } = $props();
  const DARK = '#1D2442';
</script>

{#if icon === 'wc'}
  <circle cx={x} cy={y} r="17" fill={DARK} stroke="var(--floor)" stroke-width="2" />
  <text {x} y={y + 1} class="icon-txt" font-size="12">WC</text>
{:else if icon === 'charge'}
  <circle cx={x} cy={y} r="14" fill="#16B3D6" stroke="var(--floor)" stroke-width="2" />
  <path d="M{x + 2} {y - 9}l-8 11h6l-2 8 8-11h-6z" fill="#fff" />
{:else if icon === 'info'}
  <circle cx={x} cy={y - 22} r="9" fill="var(--blue)" />
  <text {x} y={y - 21} class="icon-txt" font-size="12">i</text>
{:else if icon === 'door' || icon === 'doorSide'}
  <rect x={x - 14} y={y - 14} width="28" height="28" rx="8" fill="var(--sun)" />
  <path
    d={icon === 'door' ? `M${x - 5} ${y + 8}v-15l-4 4M${x + 5} ${y - 8}v15l4-4` : `M${x - 8} ${y - 5}h15l-4-4M${x + 8} ${y + 5}h-15l4 4`}
    fill="none" stroke="#13306B" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"
  />
{:else if icon === 'mrt'}
  <rect x={x - 30} y={y - 18} width="60" height="36" rx="9" fill={DARK} />
  <text {x} y={y + 1} class="icon-txt" font-size="16">MRT</text>
{:else if icon === 'lift'}
  <rect x={x - 15} y={y - 15} width="30" height="30" rx="6" fill={DARK} />
  <path d="M{x - 6} {y - 2}l6-7 6 7zM{x - 6} {y + 2}l6 7 6-7z" fill="#fff" />
{/if}
```

`src/lib/map/BaseLayer.svelte`:

```svelte
<script lang="ts">
  import type { EventData } from '$lib/core/types';
  let { data, activeAisle = '' }: { data: EventData; activeAisle?: string } = $props();
  const v = $derived(data.venue);
  const aisles = $derived(data.event.aisles);
  const DARK = '#1D2442';
</script>

<g id="layer-base">
  <rect x={v.view.x - 400} y={v.view.y - 400} width={v.view.w + 800} height={v.view.h + 800} class="outside" />
  {#each v.walls as wall, k (k)}
    <path d={'M' + wall.map((p) => p.join(',')).join('L') + 'Z'} class="hall" />
  {/each}
  {#each v.doors as d (d.id)}
    <rect x={d.gap[0]} y={d.gap[1]} width={d.gap[2] - d.gap[0]} height={d.gap[3] - d.gap[1]} fill="var(--floor)" />
  {/each}
  {#if aisles}
    <g>
      {#each Object.entries(aisles.x) as [letter, x] (letter)}
        <g class="aisle" class:on={activeAisle === letter} data-a={letter}>
          <circle cx={x} cy={aisles.signY} r="13" />
          <text {x} y={aisles.signY + 1}>{letter}</text>
        </g>
      {/each}
    </g>
  {/if}
  {#each v.areas as a (a.id)}
    <text x={a.label.x} y={a.label.y} class="halltxt">{a.label.text}</text>
  {/each}
  {#each data.event.obstacles.filter((o) => o.kind === 'stage') as s, k (k)}
    <rect x={s.x} y={s.y} width={s.w} height={s.h} rx="4" fill="var(--panel)" stroke="var(--blue)" stroke-width="3" />
    {#each [0, 1] as r (r)}
      {#each [0, 1, 2, 3, 4, 5] as c (c)}
        <rect x={s.x + 14 + c * 14} y={s.y + 14 + r * 52} width="5" height="40" fill="var(--muted)" opacity="0.6" />
      {/each}
    {/each}
    <rect x={s.x + 120} y={s.y + 22} width="36" height="70" fill={DARK} />
    <text x={s.x + 138} y={s.y + 57} class="lbl" font-size="16" transform="rotate(90 {s.x + 138} {s.y + 57})">STAGE</text>
    {#if s.note}
      <rect x={s.x + 160} y={s.y + 56} width="62" height="36" fill={DARK} />
      <text x={s.x + 192} y={s.y + 40} class="small-map-txt" font-size="9">{s.note}</text>
    {/if}
  {/each}
</g>
```

`src/lib/map/BoothLayer.svelte`:

```svelte
<script lang="ts">
  import type { EventData } from '$lib/core/types';
  import { boothLabel } from './labels';
  let { data, destIndex = -1 }: { data: EventData; destIndex?: number } = $props();
  const cats = $derived(data.event.categories);
  const zones = $derived(data.event.zones);
</script>

<g id="layer-booths">
  {#each data.pillars as p, k (k)}
    <rect x={p.x} y={p.y} width={p.w} height={p.h} fill={cats[p.cat].color} stroke="var(--gap)" stroke-width="1.6" />
    <rect x={p.inner.x} y={p.inner.y} width={p.inner.w} height={p.inner.h} rx="4" class="pillar" />
  {/each}
  {#each data.booths.filter((b) => !b.foyer) as b (b.i)}
    {@const z = zones[b.c]}
    {@const l = boothLabel(b, z ? (z.short ?? '') : undefined)}
    <g class="booth c-{b.cat}" class:dest={destIndex === b.i} data-b={b.i}>
      <rect x={b.x} y={b.y} width={b.w} height={b.h} fill={cats[b.cat].color} />
      {#each b.extra ?? [] as e, k (k)}
        <rect x={e.x} y={e.y} width={e.w} height={e.h} fill={cats[b.cat].color} />
      {/each}
      <text x={l.code.x} y={l.code.y} font-size={l.fs} transform={l.code.rotate ? `rotate(-90 ${l.code.x} ${l.code.y})` : undefined}>{b.c}</text>
      {#each l.lines as line, k (k)}
        <text x={line.x} y={line.y} font-size="8.5" class="small-lbl">{line.text}</text>
      {/each}
    </g>
  {/each}
</g>
```

`src/lib/map/ZoneLayer.svelte`:

```svelte
<script lang="ts">
  import type { EventData } from '$lib/core/types';
  let { data, destIndex = -1 }: { data: EventData; destIndex?: number } = $props();
  const DARK = '#1D2442';
</script>

<g id="layer-zones">
  {#each data.event.foyerZones as z (z.c)}
    {@const b = data.byCode[z.c][0]}
    <g class="zone booth c-special" class:dest={destIndex === b.i} data-b={b.i}>
      <rect x={z.x} y={z.y} width={z.w} height={z.h} rx="2" />
      <text x={z.x + z.w / 2} y={z.y + z.h / 2} font-size="12" transform={z.vertical ? `rotate(-90 ${z.x + z.w / 2} ${z.y + z.h / 2})` : undefined}>{z.c}</text>
    </g>
  {/each}
  {#each data.event.obstacles.filter((o) => o.kind === 'info') as o, k (k)}
    <rect x={o.x} y={o.y} width={o.w} height={o.h} rx="2" fill={DARK} />
    <text x={o.x + o.w / 2} y={o.y + o.h / 2} class="icon-txt" font-size="11">Information</text>
  {/each}
</g>
```

`src/lib/map/MarkLayer.svelte`:

```svelte
<script lang="ts">
  import type { Landmark } from '$lib/core/types';
  import Icon from './Icon.svelte';
  let { landmarks, nameOf }: { landmarks: Landmark[]; nameOf: (o: Landmark) => string } = $props();
</script>

<g id="layer-marks">
  {#each landmarks as lm (lm.id)}
    {#if lm.icon !== 'stage'}
      <g class="lm" data-lm={lm.id}>
        <Icon icon={lm.icon} x={lm.x} y={lm.y} />
        <title>{nameOf(lm)}</title>
      </g>
    {/if}
  {/each}
</g>
```

In v1 the `stage` icon drew nothing because the base layer draws the stage. Here it's skipped, so the `stage` landmark has no tap target of its own, which matches v1.

`src/lib/map/RouteLayer.svelte`:

```svelte
<script lang="ts">
  import type { RouteOk } from '$lib/core/types';
  let { route }: { route: RouteOk | null } = $props();
  const d = $derived(route ? 'M' + route.P.map((p) => p.map((v) => v.toFixed(1)).join(',')).join('L') : '');
  function drawOnce(node: SVGPathElement) {
    const len = node.getTotalLength();
    node.style.setProperty('--len', String(len));
    node.style.strokeDasharray = String(len);
    node.addEventListener('animationend', () => { node.style.strokeDasharray = ''; }, { once: true });
  }
</script>

<g id="layer-route">
  {#if d}
    <path {d} class="case" />
    {#key d}
      <path {d} class="line draw" use:drawOnce />
    {/key}
  {/if}
</g>
```

`src/lib/map/PinLayer.svelte`:

```svelte
<script lang="ts">
  import type { Dest, RouteOk } from '$lib/core/types';
  let { dest, route }: { dest: Dest | null; route: RouteOk | null } = $props();
  const t = $derived(dest ? (dest.kind === 'booth' ? { x: dest.b.cx, y: dest.b.y } : { x: dest.lm.x, y: dest.lm.y - 14 }) : null);
</script>

<g id="layer-pins">
  {#if route}
    {@const [sx, sy] = route.P[0]}
    <circle cx={sx} cy={sy} r="13" fill="var(--panel)" stroke="var(--route)" stroke-width="5" />
    <circle cx={sx} cy={sy} r="4.5" fill="var(--route)" />
  {/if}
  {#if t}
    <g>
      <circle cx={t.x} cy={t.y - 2} r="22" fill="var(--sun)" class="pulse" />
      <path d="M{t.x} {t.y - 2}c-9-13-16-20-16-29a16 16 0 0 1 32 0c0 9-7 16-16 29z" fill="var(--ink)" stroke="var(--panel)" stroke-width="2.5" />
      <circle cx={t.x} cy={t.y - 31} r="6.5" fill="var(--sun)" />
    </g>
  {/if}
</g>
```

- [ ] **Step 7: Write `FloorMap.svelte`**

`src/lib/map/FloorMap.svelte`:

```svelte
<script lang="ts">
  import { onMount, type Snippet } from 'svelte';
  import type { Booth, Dest, EventData, Landmark, RouteOk } from '$lib/core/types';
  import { isAisleBooth } from '$lib/core/directions';
  import { STRINGS, nameIn } from '$lib/i18n/strings';
  import { lang } from '$lib/i18n/lang.svelte';
  import { createViewport, type Viewport } from './viewport';
  import BaseLayer from './BaseLayer.svelte';
  import BoothLayer from './BoothLayer.svelte';
  import ZoneLayer from './ZoneLayer.svelte';
  import MarkLayer from './MarkLayer.svelte';
  import RouteLayer from './RouteLayer.svelte';
  import PinLayer from './PinLayer.svelte';

  let {
    data,
    dest,
    route,
    onSelectBooth,
    onSelectPlace,
    onFit,
    children,
  }: {
    data: EventData;
    dest: Dest | null;
    route: RouteOk | null;
    onSelectBooth: (b: Booth) => void;
    onSelectPlace: (lm: Landmark) => void;
    onFit: () => void;
    children?: Snippet;
  } = $props();

  let svg: SVGSVGElement;
  let vp: Viewport | null = null;
  const s = $derived(STRINGS[lang.current]);
  const destIndex = $derived(dest?.kind === 'booth' ? dest.b.i : -1);
  const activeAisle = $derived(dest?.kind === 'booth' && isAisleBooth(dest.b, data) ? dest.b.c[0] : '');

  export const fitAll = (animated = false) => vp?.fitAll(animated);
  export const zoomCenter = (k: number) => vp?.zoomCenter(k);
  export const frame = (d: Dest | null, r: RouteOk | null) => vp?.frame(d, r);

  onMount(() => {
    vp = createViewport(svg, data.venue, (target) => {
      const bEl = target?.closest('[data-b]'), lEl = target?.closest('[data-lm]');
      if (bEl) onSelectBooth(data.booths[Number(bEl.getAttribute('data-b'))]);
      else if (lEl) {
        const lm = data.landmarkById[lEl.getAttribute('data-lm') ?? ''];
        if (lm) onSelectPlace(lm);
      }
    });
    return () => vp?.destroy();
  });
</script>

<div class="mapwrap">
  <svg
    bind:this={svg}
    id="map"
    class:dim={!!dest}
    xmlns="http://www.w3.org/2000/svg"
    preserveAspectRatio="xMidYMid meet"
    role="img"
    aria-label={s.floorPlan}
    viewBox="{data.venue.view.x} {data.venue.view.y} {data.venue.view.w} {data.venue.view.h}"
  >
    <BaseLayer {data} {activeAisle} />
    <BoothLayer {data} {destIndex} />
    <ZoneLayer {data} {destIndex} />
    <MarkLayer landmarks={data.landmarks} nameOf={nameIn(lang.current)} />
    <RouteLayer {route} />
    <PinLayer {dest} {route} />
  </svg>
  <div class="zoombar">
    <button type="button" aria-label={s.zoomIn} title={s.zoomIn} onclick={() => zoomCenter(0.7)}>+</button>
    <button type="button" aria-label={s.zoomOut} title={s.zoomOut} onclick={() => zoomCenter(1 / 0.7)}>−</button>
    <button type="button" aria-label={s.fit} title={s.fit} onclick={onFit}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" /></svg>
    </button>
  </div>
  {@render children?.()}
</div>
```

The toast renders through `children`.

The viewBox attribute is set once from the venue at render. After mount the viewport writes it directly. Svelte never reassigns it because its value never changes reactively.

- [ ] **Step 8: Check**

Run: `bun run check && bun run lint && bun test`
Expected: no type errors; tests pass.

- [ ] **Step 9: Commit**

```bash
git add src/lib tests
git commit -m "Add Svelte map layers, pure pan/zoom maths and viewport gestures"
```

---

### Task 10: Finder page

**Files:**
- Create: `src/lib/core/hash.ts`
- Create: `src/lib/core/describe.ts`
- Create: `src/lib/ui/finder.svelte.ts`
- Create: `src/lib/ui/Sheet.svelte`, `SearchBox.svelte`, `Results.svelte`, `IdleView.svelte`, `ResultCard.svelte`, `StartPicker.svelte`, `Toast.svelte`, `CodeChip.svelte`
- Create: `src/routes/e/[id]/+page.server.ts`, `src/routes/e/[id]/+page.svelte`
- Test: `tests/hash.test.ts`, `tests/describe.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 3–9.
- Produces:
  - `parseHash(hash: string, data: EventData): { dest: Dest | null; fromId: string | null }`
  - `formatHash(dest: Dest | null, fromId: string, data: EventData): string` (no leading `#`)
  - `exhibitorsAt(data: EventData, code: string): Exhibitor[]`
  - `boothTitle(b: Booth, data: EventData, lang: Lang): string` (results list)
  - `cardTitle(b: Booth, data: EventData, lang: Lang): string` (result card)
  - `boothSub(b: Booth, data: EventData, lang: Lang): string`
  - `PLACE_GLYPH: Record<LandmarkGroup, string>`
  - `class Finder { data; dest; fromId; query; sheetOpen; start; route; routeOk; grid }`
  - Page data: `{ bundle: EventBundle }`

- [ ] **Step 1: Write the failing tests**

`tests/hash.test.ts`:

```ts
import { test, expect } from 'bun:test';
import { loadEvent } from '../src/lib/server/catalog';
import { loadData } from '../src/lib/core/prepare';
import { parseHash, formatHash } from '../src/lib/core/hash';

const data = loadData(loadEvent('bkkibf-2026'));

test('parses a booth and a start point', () => {
  const r = parseHash('#to=K16&from=door6', data);
  expect(r.dest?.kind === 'booth' && r.dest.b.c).toBe('K16');
  expect(r.fromId).toBe('door6');
});

test('lowercase codes resolve and places win over codes', () => {
  expect(parseHash('#to=k16', data).dest?.kind).toBe('booth');
  expect(parseHash('#to=stage', data).dest?.kind).toBe('place');
});

test('unknown values are ignored', () => {
  expect(parseHash('#to=ZZ99&from=nowhere', data)).toEqual({ dest: null, fromId: null });
  expect(parseHash('', data)).toEqual({ dest: null, fromId: null });
});

test('n picks between duplicate codes and falls back to the first', () => {
  const second = parseHash('#to=H31&n=1', data).dest;
  expect(second?.kind === 'booth' && second.b).toBe(data.byCode.H31[1]);
  const bad = parseHash('#to=H31&n=9', data).dest;
  expect(bad?.kind === 'booth' && bad.b).toBe(data.byCode.H31[0]);
  const junk = parseHash('#to=H31&n=abc', data).dest;
  expect(junk?.kind === 'booth' && junk.b).toBe(data.byCode.H31[0]);
});

test('formatHash round-trips and adds n only for duplicates', () => {
  expect(formatHash({ kind: 'booth', b: data.byCode.K16[0] }, 'mrt', data)).toBe('to=K16&from=mrt');
  expect(formatHash({ kind: 'booth', b: data.byCode.H31[1] }, '', data)).toBe('to=H31&n=1');
  expect(formatHash({ kind: 'place', lm: data.landmarkById.wc2 }, '', data)).toBe('to=wc2');
  expect(formatHash(null, 'mrt', data)).toBe('from=mrt');
});
```

`tests/describe.test.ts`:

```ts
import { test, expect } from 'bun:test';
import { loadEvent } from '../src/lib/server/catalog';
import { loadData } from '../src/lib/core/prepare';
import { boothSub, boothTitle, cardTitle } from '../src/lib/core/describe';

const data = loadData(loadEvent('bkkibf-2026'));

test('plain aisle booth shows area and aisle', () => {
  expect(boothSub(data.byCode.K16[0], data, 'en')).toBe('Hall 7 · Aisle K');
  expect(boothSub(data.byCode.K16[0], data, 'th')).toBe('ฮอลล์ 7 · ทางเดิน K');
  expect(boothTitle(data.byCode.K16[0], data, 'en')).toBe(data.event.categories[data.byCode.K16[0].cat].en);
});

test('zoned foyer booth shows outside and its category', () => {
  expect(boothSub(data.byCode.U07[0], data, 'en')).toBe('Outside the halls · Exhibitions & stages');
  expect(cardTitle(data.byCode.U07[0], data, 'en')).toBe(data.event.zones.U07.en);
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `bun test tests/hash.test.ts tests/describe.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 3: Write `hash.ts` and `describe.ts`**

`src/lib/core/hash.ts`:

```ts
import type { Dest, EventData } from './types';

export function parseHash(hash: string, data: EventData): { dest: Dest | null; fromId: string | null } {
  const p = new URLSearchParams(hash.replace(/^#/, ''));
  const f = p.get('from');
  const fromId = f && data.landmarkById[f] ? f : null;
  const to = (p.get('to') || '').trim();
  if (!to) return { dest: null, fromId };
  const lm = data.landmarkById[to];
  if (lm) return { dest: { kind: 'place', lm }, fromId };
  const list = data.byCode[to.toUpperCase()];
  if (!list) return { dest: null, fromId };
  return { dest: { kind: 'booth', b: list[Number(p.get('n') || 0)] || list[0] }, fromId };
}

export function formatHash(dest: Dest | null, fromId: string, data: EventData): string {
  const p = new URLSearchParams();
  if (dest) {
    p.set('to', dest.kind === 'booth' ? dest.b.c : dest.lm.id);
    if (dest.kind === 'booth' && data.byCode[dest.b.c].length > 1) p.set('n', String(data.byCode[dest.b.c].indexOf(dest.b)));
  }
  if (fromId) p.set('from', fromId);
  return p.toString();
}
```

`src/lib/core/describe.ts`:

```ts
import { areaName } from './geometry';
import { isAisleBooth } from './directions';
import { STRINGS, nameIn, type Lang } from '../i18n/strings';
import type { Booth, EventData, LandmarkGroup } from './types';

export const PLACE_GLYPH: Record<LandmarkGroup, string> = { entry: '⇅', wc: 'WC', info: 'i', charge: '⚡', stage: '★', other: '↥' };

export const exhibitorsAt = (data: EventData, code: string) => data.exhibitors.filter((e) => e.booth === code);

export function boothTitle(b: Booth, data: EventData, lang: Lang): string {
  const nameOf = nameIn(lang), z = data.event.zones[b.c];
  if (z) return nameOf(z);
  const ex = exhibitorsAt(data, b.c);
  return ex.length ? ex.map(nameOf).join(', ') : nameOf(data.event.categories[b.cat]);
}

export function cardTitle(b: Booth, data: EventData, lang: Lang): string {
  const nameOf = nameIn(lang), z = data.event.zones[b.c], ex = exhibitorsAt(data, b.c);
  return z ? nameOf(z) : ex.length === 1 ? nameOf(ex[0]) : nameOf(data.event.categories[b.cat]);
}

export function boothSub(b: Booth, data: EventData, lang: Lang): string {
  const nameOf = nameIn(lang), s = STRINGS[lang], z = data.event.zones[b.c];
  const parts = [nameOf(areaName(data.venue, b.area))];
  if (isAisleBooth(b, data) && !z) parts.push(s.aisle(b.c[0]));
  if (z || exhibitorsAt(data, b.c).length) parts.push(nameOf(data.event.categories[b.cat]));
  return parts.join(' · ');
}
```

- [ ] **Step 4: Run the tests**

Run: `bun test tests/hash.test.ts tests/describe.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the finder state**

`src/lib/ui/finder.svelte.ts`:

```ts
import { createGrid, obstaclesOf, type Grid } from '$lib/core/grid';
import { findRoute } from '$lib/core/routing';
import { isRouteOk, type Dest, type EventData, type Landmark, type RouteResult } from '$lib/core/types';

export class Finder {
  data: EventData;
  #grid: Grid | null = null;
  dest = $state<Dest | null>(null);
  fromId = $state('');
  query = $state('');
  sheetOpen = $state(true);
  start = $derived<Landmark | null>(this.fromId ? (this.data.landmarkById[this.fromId] ?? null) : null);
  route = $derived.by<RouteResult | null>(() => (this.start && this.dest ? findRoute(this.grid, this.data.venue, this.start, this.dest) : null));
  routeOk = $derived(isRouteOk(this.route) ? this.route : null);

  constructor(data: EventData) {
    this.data = data;
  }

  get grid(): Grid {
    return (this.#grid ??= createGrid(this.data.venue, obstaclesOf(this.data)));
  }
}
```

The grid is built on the first route request, once per page.

- [ ] **Step 6: Write the small UI components**

`src/lib/ui/CodeChip.svelte`:

```svelte
<script lang="ts">
  let { label, color, cat = '' }: { label: string; color: string; cat?: string } = $props();
</script>

<span class="code {cat ? `c-${cat}` : ''}" style:background={color}>{label}</span>
```

`src/lib/ui/Toast.svelte`:

```svelte
<script lang="ts">
  let { message, show }: { message: string; show: boolean } = $props();
</script>

<div class="toast" class:show role="status" aria-live="polite">{message}</div>
```

`src/lib/ui/StartPicker.svelte`:

```svelte
<script lang="ts">
  import { GROUP_ORDER, type EventData } from '$lib/core/types';
  import { STRINGS, nameIn, type Lang } from '$lib/i18n/strings';
  let { data, lang, value, onChange }: { data: EventData; lang: Lang; value: string; onChange: (id: string) => void } = $props();
  const s = $derived(STRINGS[lang]);
  const nameOf = $derived(nameIn(lang));
  const groups = $derived(GROUP_ORDER.map((g) => [g, data.landmarks.filter((l) => l.group === g)] as const).filter(([, l]) => l.length));
</script>

<div class="from">
  <label for="from">{s.from}</label>
  <div class="selwrap">
    <select id="from" value={value} onchange={(e) => onChange(e.currentTarget.value)}>
      <option value="" disabled selected={!value}>{s.pickFrom}</option>
      {#each groups as [g, items] (g)}
        <optgroup label={s.groups[g]}>
          {#each items as l (l.id)}
            <option value={l.id} selected={l.id === value}>{nameOf(l)}</option>
          {/each}
        </optgroup>
      {/each}
    </select>
  </div>
</div>
```

`src/lib/ui/SearchBox.svelte`:

```svelte
<script lang="ts">
  let {
    value = $bindable(),
    label,
    placeholder,
    clearLabel,
    onInput,
    onEnter,
  }: { value: string; label: string; placeholder: string; clearLabel: string; onInput: () => void; onEnter: () => void } = $props();
  let input: HTMLInputElement;
</script>

<div class="search">
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
  <label class="sr" for="q">{label}</label>
  <input
    bind:this={input}
    bind:value
    id="q"
    type="search"
    autocomplete="off"
    autocapitalize="characters"
    spellcheck="false"
    enterkeyhint="search"
    {placeholder}
    oninput={onInput}
    onkeydown={(e) => { if (e.key === 'Enter') onEnter(); }}
  />
  {#if value.trim()}
    <button type="button" class="iconbtn" aria-label={clearLabel} title={clearLabel} onclick={() => { value = ''; input.focus(); }}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
    </button>
  {/if}
</div>
```

`src/lib/ui/Results.svelte`:

```svelte
<script lang="ts">
  import type { SearchItem } from '$lib/core/search';
  import type { EventData } from '$lib/core/types';
  import { boothSub, boothTitle, PLACE_GLYPH } from '$lib/core/describe';
  import { STRINGS, nameIn, type Lang } from '$lib/i18n/strings';
  import CodeChip from './CodeChip.svelte';
  let { items, query, data, lang, onPick }: { items: SearchItem[]; query: string; data: EventData; lang: Lang; onPick: (it: SearchItem) => void } = $props();
  const s = $derived(STRINGS[lang]);
  const nameOf = $derived(nameIn(lang));
</script>

{#if !items.length}
  <p class="empty">{s.noRes(query.trim())}</p>
{:else}
  <ul class="results">
    {#each items as it, k (k)}
      <li>
        <button type="button" onclick={() => onPick(it)}>
          {#if it.type === 'place'}
            <CodeChip label={PLACE_GLYPH[it.lm.group]} color="var(--ink)" />
            <span class="rmain"><b>{nameOf(it.lm)}</b><span>{s.groups[it.lm.group]}</span></span>
          {:else}
            <CodeChip label={it.b.c} color={data.event.categories[it.b.cat].color} cat={it.b.cat} />
            <span class="rmain">
              <b>{it.type === 'exh' ? nameOf(it.ex) : boothTitle(it.b, data, lang)}</b>
              <span>{boothSub(it.b, data, lang)}</span>
            </span>
          {/if}
        </button>
      </li>
    {/each}
  </ul>
{/if}
```

`src/lib/ui/IdleView.svelte`:

```svelte
<script lang="ts">
  import type { EventData } from '$lib/core/types';
  import { STRINGS, nameIn, type Lang } from '$lib/i18n/strings';
  let { data, lang, notice = '', onPick }: { data: EventData; lang: Lang; notice?: string; onPick: (kind: 'booth' | 'place', id: string) => void } = $props();
  const s = $derived(STRINGS[lang]);
  const nameOf = $derived(nameIn(lang));
  const label = (kind: 'booth' | 'place', id: string) => {
    if (kind === 'place') return nameOf(data.landmarkById[id]);
    const z = data.event.zones[id];
    return z ? `${id} ${nameOf(z)}` : id;
  };
</script>

{#if notice}<p class="notice">{notice}</p>{/if}
<p class="hint first">{s.tapHint}</p>
{#if data.event.quickPicks.length}
  <h2 class="sec">{s.quick}</h2>
  <div class="quick">
    {#each data.event.quickPicks as [kind, id] (kind + id)}
      <button type="button" onclick={() => onPick(kind, id)}>{label(kind, id)}</button>
    {/each}
  </div>
{/if}
<h2 class="sec">{s.legend}</h2>
<ul class="legend">
  {#each Object.entries(data.event.categories) as [key, c] (key)}
    <li><span class="sw" style:background={c.color}></span>{nameOf(c)}</li>
  {/each}
</ul>
```

`src/lib/ui/ResultCard.svelte`:

```svelte
<script lang="ts">
  import type { Dest, EventData, RouteResult } from '$lib/core/types';
  import { isRouteOk } from '$lib/core/types';
  import { boothSub, cardTitle, exhibitorsAt, PLACE_GLYPH } from '$lib/core/describe';
  import { buildSteps } from '$lib/core/directions';
  import { STRINGS, nameIn, textFor, type Lang } from '$lib/i18n/strings';
  import StartPicker from './StartPicker.svelte';
  let {
    data, lang, dest, fromId, route, onFrom, onClear, onShare,
  }: {
    data: EventData; lang: Lang; dest: Dest; fromId: string; route: RouteResult | null;
    onFrom: (id: string) => void; onClear: () => void; onShare: () => void;
  } = $props();
  const s = $derived(STRINGS[lang]);
  const nameOf = $derived(nameIn(lang));
  const ex = $derived(dest.kind === 'booth' ? exhibitorsAt(data, dest.b.c) : []);
  const steps = $derived(isRouteOk(route) && fromId ? buildSteps(route, data.landmarkById[fromId], dest, data, lang) : []);
</script>

<div class="card">
  {#if dest.kind === 'booth'}
    {@const b = dest.b}
    <div class="ticket">
      <div class="bigcode c-{b.cat}" style:background={data.event.categories[b.cat].color}>{b.c}</div>
      <div class="tinfo"><div class="t1">{cardTitle(b, data, lang)}</div><div class="t2">{boothSub(b, data, lang)}</div></div>
    </div>
    {#if ex.length > 1}
      <h2 class="sec gap">{textFor(s, data.event, lang, 'exhibitors')}</h2>
      <ul class="exh">{#each ex as e, k (k)}<li>{nameOf(e)}</li>{/each}</ul>
    {/if}
  {:else}
    <div class="ticket">
      <div class="bigcode place">{PLACE_GLYPH[dest.lm.group]}</div>
      <div class="tinfo"><div class="t1">{nameOf(dest.lm)}</div><div class="t2">{s.groups[dest.lm.group]}</div></div>
    </div>
  {/if}

  <StartPicker {data} {lang} value={fromId} onChange={onFrom} />

  {#if !fromId}
    <p class="hint">{s.pickHint}</p>
  {:else if route && 'same' in route}
    <p class="hint">{s.same}</p>
  {:else if !isRouteOk(route)}
    <p class="hint">{s.noRoute}</p>
  {:else}
    <div class="summary"><span class="m">{route.meters} {s.meters}</span><span class="t">{s.min(route.minutes)}</span></div>
    <ol class="steps">{#each steps as step, k (k)}<li><span>{step}</span></li>{/each}</ol>
  {/if}

  <div class="actions">
    <button type="button" class="btn" onclick={onClear}>{s.clear}</button>
    <button type="button" class="btn" onclick={onShare}>{s.share}</button>
  </div>
</div>
```

`src/lib/ui/Sheet.svelte`:

```svelte
<script lang="ts">
  import type { Snippet } from 'svelte';
  let { open, toggleLabel, onToggle, head, children }: { open: boolean; toggleLabel: string; onToggle: () => void; head: Snippet; children: Snippet } = $props();
</script>

<section class="sheet" class:min={!open}>
  <div class="sheet-head">
    {@render head()}
    <button type="button" class="toggle" aria-expanded={open} onclick={onToggle}>{toggleLabel}</button>
  </div>
  <div class="body" aria-live="polite">{@render children()}</div>
</section>
```

- [ ] **Step 7: Write the route files**

`src/routes/e/[id]/+page.server.ts`:

```ts
import { error } from '@sveltejs/kit';
import { listEventIds, loadEvent } from '$lib/server/catalog';
import type { EntryGenerator, PageServerLoad } from './$types';

export const entries: EntryGenerator = () => listEventIds().map((id) => ({ id }));

export const load: PageServerLoad = ({ params }) => {
  if (!listEventIds().includes(params.id)) error(404, 'Event not found');
  return { bundle: loadEvent(params.id) };
};
```

`src/routes/e/[id]/+page.svelte`:

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import { replaceState } from '$app/navigation';
  import { loadData } from '$lib/core/prepare';
  import { createSearch, type SearchItem } from '$lib/core/search';
  import { parseHash, formatHash } from '$lib/core/hash';
  import type { Booth, Dest, Landmark } from '$lib/core/types';
  import { STRINGS, nameIn, textFor } from '$lib/i18n/strings';
  import { lang } from '$lib/i18n/lang.svelte';
  import { store } from '$lib/storage';
  import { Finder } from '$lib/ui/finder.svelte';
  import Header from '$lib/ui/Header.svelte';
  import FloorMap from '$lib/map/FloorMap.svelte';
  import Sheet from '$lib/ui/Sheet.svelte';
  import SearchBox from '$lib/ui/SearchBox.svelte';
  import Results from '$lib/ui/Results.svelte';
  import IdleView from '$lib/ui/IdleView.svelte';
  import ResultCard from '$lib/ui/ResultCard.svelte';
  import Toast from '$lib/ui/Toast.svelte';

  let { data: page } = $props();
  const data = loadData(page.bundle);
  const f = new Finder(data);
  const search = createSearch(data);
  const FROM_KEY = `bf:${data.event.id}:from`;

  let map: FloorMap;
  let toast = $state({ message: '', show: false });
  let toastTimer: ReturnType<typeof setTimeout>;
  let notice = $state('');

  const s = $derived(STRINGS[lang.current]);
  const nameOf = $derived(nameIn(lang.current));
  const results = $derived(f.query.trim() ? search(f.query) : []);

  function writeHash() {
    try {
      replaceState(`#${formatHash(f.dest, f.fromId, data)}`, {});
    } catch {
      return;
    }
  }
  function select(dest: Dest) {
    f.dest = dest;
    f.sheetOpen = true;
    writeHash();
    map.frame(f.dest, f.routeOk);
  }
  const selectBooth = (b: Booth) => select({ kind: 'booth', b });
  const selectPlace = (lm: Landmark) => select({ kind: 'place', lm });
  function pick(it: SearchItem) {
    f.query = '';
    (document.activeElement as HTMLElement | null)?.blur();
    if (it.type === 'place') selectPlace(it.lm);
    else selectBooth(it.b);
  }
  function setFrom(id: string) {
    f.fromId = id;
    store.set(FROM_KEY, id);
    writeHash();
    map.frame(f.dest, f.routeOk);
  }
  function clearRoute() {
    f.dest = null;
    writeHash();
  }
  function showToast(message: string) {
    toast = { message, show: true };
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (toast = { ...toast, show: false }), 1800);
  }
  async function share() {
    try {
      await navigator.clipboard.writeText(location.href);
      showToast(s.copied);
    } catch {
      showToast(location.href);
    }
  }
  function readHash(): boolean {
    const { dest, fromId } = parseHash(location.hash, data);
    if (fromId) { f.fromId = fromId; store.set(FROM_KEY, fromId); }
    if (dest) f.dest = dest;
    return !!dest;
  }

  onMount(() => {
    const stored = store.get(FROM_KEY);
    if (stored && data.landmarkById[stored]) f.fromId = stored;
    requestAnimationFrame(() => {
      map.fitAll();
      if (readHash()) map.frame(f.dest, f.routeOk);
    });
    const onHash = () => { if (readHash()) map.frame(f.dest, f.routeOk); };
    addEventListener('hashchange', onHash);
    return () => removeEventListener('hashchange', onHash);
  });
</script>

<svelte:head>
  <title>{nameOf(data.event.name)} · {s.title}</title>
  <meta name="description" content="{nameOf(data.event.name)}, {nameOf(data.venue.name)}" />
  <meta name="theme-color" content="#13306B" />
</svelte:head>

<div class="app">
  <Header title={s.title} subtitle={data.event.subtitle ? nameOf(data.event.subtitle) : nameOf(data.event.name)} backHref="/" backLabel={s.allEvents} />
  <FloorMap
    bind:this={map}
    {data}
    dest={f.dest}
    route={f.routeOk}
    onSelectBooth={selectBooth}
    onSelectPlace={selectPlace}
    onFit={() => (f.dest ? map.frame(f.dest, f.routeOk) : map.fitAll(true))}
  >
    <Toast message={toast.message} show={toast.show} />
  </FloorMap>
  <Sheet open={f.sheetOpen} toggleLabel={f.sheetOpen ? s.hide : s.show} onToggle={() => (f.sheetOpen = !f.sheetOpen)}>
    {#snippet head()}
      <SearchBox
        bind:value={f.query}
        label={textFor(s, data.event, lang.current, 'searchLabel')}
        placeholder={textFor(s, data.event, lang.current, 'ph')}
        clearLabel={s.clearSearch}
        onInput={() => (f.sheetOpen = true)}
        onEnter={() => { if (results[0]) pick(results[0]); }}
      />
    {/snippet}
    {#if f.query.trim()}
      <Results items={results} query={f.query} {data} lang={lang.current} onPick={pick} />
    {:else if f.dest}
      <ResultCard {data} lang={lang.current} dest={f.dest} fromId={f.fromId} route={f.route} onFrom={setFrom} onClear={clearRoute} onShare={share} />
    {:else}
      <IdleView {data} lang={lang.current} {notice} onPick={(kind, id) => (kind === 'booth' ? selectBooth(data.byCode[id][0]) : selectPlace(data.landmarkById[id]))} />
    {/if}
  </Sheet>
</div>
```

`notice` stays empty in this task. Task 12 sets it for past events.

- [ ] **Step 8: Run it and check by hand**

Run: `bun run check && bun run lint && bun run dev`
Open `http://localhost:5173/e/bkkibf-2026/#to=K16&from=mrt` and check:
- the map shows and the route draws from the MRT to K16
- the card shows K16, the distance, the time and the steps, including "Turn into aisle K"
- tapping another booth selects it, and the URL hash updates
- the language toggle switches every label, and reloading keeps the language
- dragging, pinching, the wheel and the +/−/fit buttons all pan and zoom
- the sheet's Less/More works below 900 px wide, and the side panel shows above it

- [ ] **Step 9: Commit**

```bash
git add src tests
git commit -m "Add finder page with search, result card, start picker and share links"
```

---

### Task 11: End-to-end tests and the parity checkpoint

**Files:**
- Create: `playwright.config.ts`
- Create: `tests/e2e/finder.spec.ts`
- Modify: `.github/workflows/ci.yml` (add e2e job)
- Modify: `package.json` (`test` script must not pick up `tests/e2e`)

**Interfaces:**
- Consumes: the built site from Task 10.
- Produces: `bun run test:e2e`.

- [ ] **Step 1: Install Playwright**

```bash
bun add -d @playwright/test serve
bunx playwright install chromium
```

- [ ] **Step 2: Keep bun test away from Playwright specs**

Change the `test` script in `package.json` to:

```json
"test": "bun test --path-ignore-patterns 'tests/e2e/**' tests"
```

If the installed Bun does not support `--path-ignore-patterns`, name the e2e files `*.e2e.ts` instead of `*.spec.ts`, set `testMatch: '**/*.e2e.ts'` in `playwright.config.ts`, and keep `bun test tests` (Bun only runs `*.test.ts` and `*.spec.ts` by default).

- [ ] **Step 3: Write the config**

`playwright.config.ts`:

```ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  webServer: { command: 'bun run build && bunx serve _site -l 4173', port: 4173, reuseExistingServer: !process.env.CI },
  use: { baseURL: 'http://localhost:4173' },
  projects: [
    { name: 'phone', use: { ...devices['Pixel 7'] } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } },
  ],
});
```

- [ ] **Step 4: Write the finder specs**

`tests/e2e/finder.spec.ts`:

```ts
import { test, expect } from '@playwright/test';

test('deep link renders the card and steps', async ({ page }) => {
  await page.goto('/e/bkkibf-2026/#to=K16&from=mrt');
  await expect(page.locator('.bigcode')).toHaveText('K16');
  await page.getByRole('button', { name: 'EN' }).click();
  await expect(page.locator('.steps li')).toContainText(['Start at MRT']);
  await expect(page.locator('.steps')).toContainText('Turn into aisle K');
  await expect(page.locator('#layer-route path.line')).toHaveCount(1);
});

test('search picks a booth and updates the hash', async ({ page }) => {
  await page.goto('/e/bkkibf-2026/');
  await page.locator('#q').fill('T02');
  await page.locator('.results button').first().click();
  await expect(page.locator('.bigcode')).toHaveText('T02');
  await expect(page).toHaveURL(/#to=T02/);
});

test('tapping a booth on the map selects it', async ({ page }) => {
  await page.goto('/e/bkkibf-2026/#to=K16');
  await page.locator('[data-b]').filter({ hasText: 'K16' }).first().click();
  await expect(page.locator('.bigcode')).toHaveText('K16');
});

test('language choice survives a reload', async ({ page }) => {
  await page.goto('/e/bkkibf-2026/');
  await page.getByRole('button', { name: 'EN' }).click();
  await page.reload();
  await expect(page.locator('header .brand b')).toHaveText('Booth Finder');
});

test('the start point persists and the share link carries it', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/e/bkkibf-2026/#to=K16');
  await page.locator('#from').selectOption('door6');
  await expect(page).toHaveURL(/from=door6/);
  await page.reload();
  await expect(page.locator('#from')).toHaveValue('door6');
});
```

- [ ] **Step 5: Run the e2e tests**

Run: `bun run test:e2e`
Expected: 10 passed (5 specs × 2 projects).

- [ ] **Step 6: Add the e2e job to CI**

Append to `.github/workflows/ci.yml` under `jobs:`:

```yaml
  e2e:
    runs-on: ubuntu-latest
    needs: ci
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun install --frozen-lockfile
      - run: bunx playwright install --with-deps chromium
      - run: bun run test:e2e
```

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "Add Playwright end-to-end tests for the finder"
git push -u origin v2
```

Cloudflare builds a preview of `v2` with the existing settings (`npm run build`, output `_site`), which now run `vite build`. Only `main` deploys to production. Use the preview URL from the Cloudflare check on the commit for the parity checkpoint on a real phone.

- [ ] **Step 8: Parity checkpoint (manual, with the owner)**

Open the `v2` preview URL next to https://book-booth-finder.pages.dev (still v1), or run `bun run build && bunx serve _site -l 4173` and `bunx serve legacy -l 5174` locally. On a phone-sized window (375 × 812) and a desktop window (1280 × 800), in light and dark mode, compare:
- the zoomed-out framing
- K16 from the MRT: route shape, distance, time and steps
- `#to=H31&n=1`
- `#to=stage&from=door8`
- the aisle sign highlight
- the pin pulse and route draw, then again with reduced motion turned on in the OS settings
- label hiding when fully zoomed out

Record any difference in the PR description. Fix differences before continuing unless the owner accepts them.

---

### Task 12: Event list, status, legacy redirect and 404

**Files:**
- Create: `src/lib/core/status.ts`
- Create: `src/lib/ui/EventCard.svelte`
- Replace: `src/routes/+page.svelte`
- Create: `src/routes/+page.server.ts`
- Create: `src/routes/+error.svelte`
- Modify: `src/routes/e/[id]/+page.svelte` (ended notice)
- Modify: `svelte.config.js` (`fallback: '404.html'`)
- Test: `tests/status.test.ts`, `tests/e2e/events.spec.ts`

**Interfaces:**
- Consumes: `eventSummaries`, `EventSummary` (Task 5); strings (Task 7); `Header` (Task 8).
- Produces:
  - `type Status = 'live' | 'upcoming' | 'past'`
  - `todayIn(timezone: string, now?: Date): string` (YYYY-MM-DD)
  - `eventStatus(dates: { start: string; end: string }, timezone: string, now?: Date): Status`
  - `sortEvents<T extends { dates: { start: string; end: string }; timezone: string }>(list: T[], now?: Date): T[]`
  - `LEGACY_EVENT = 'bkkibf-2026'`

- [ ] **Step 1: Write the failing status test**

`tests/status.test.ts`:

```ts
import { test, expect } from 'bun:test';
import { eventStatus, sortEvents, todayIn } from '../src/lib/core/status';

const dates = { start: '2026-03-26', end: '2026-04-06' };
const tz = 'Asia/Bangkok';

test('today is computed in the venue timezone', () => {
  expect(todayIn(tz, new Date('2026-04-06T17:30:00Z'))).toBe('2026-04-07');
  expect(todayIn(tz, new Date('2026-04-06T16:30:00Z'))).toBe('2026-04-06');
});

test('last day stays live until midnight Bangkok time', () => {
  expect(eventStatus(dates, tz, new Date('2026-04-06T16:30:00Z'))).toBe('live');
  expect(eventStatus(dates, tz, new Date('2026-04-06T17:10:00Z'))).toBe('past');
  expect(eventStatus(dates, tz, new Date('2026-03-25T16:59:00Z'))).toBe('upcoming');
  expect(eventStatus(dates, tz, new Date('2026-03-25T17:00:00Z'))).toBe('live');
});

test('sort puts live first, then upcoming soonest, then past latest', () => {
  const now = new Date('2026-06-01T00:00:00Z');
  const list = [
    { id: 'old', dates: { start: '2025-01-01', end: '2025-01-05' }, timezone: tz },
    { id: 'later', dates: { start: '2027-01-01', end: '2027-01-05' }, timezone: tz },
    { id: 'live', dates: { start: '2026-05-30', end: '2026-06-03' }, timezone: tz },
    { id: 'soon', dates: { start: '2026-07-01', end: '2026-07-05' }, timezone: tz },
    { id: 'recent', dates: { start: '2026-03-26', end: '2026-04-06' }, timezone: tz },
  ];
  expect(sortEvents(list, now).map((e) => e.id)).toEqual(['live', 'soon', 'later', 'recent', 'old']);
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `bun test tests/status.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Write `status.ts`**

`src/lib/core/status.ts`:

```ts
export type Status = 'live' | 'upcoming' | 'past';
export const LEGACY_EVENT = 'bkkibf-2026';

export const todayIn = (timezone: string, now = new Date()) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);

export function eventStatus(dates: { start: string; end: string }, timezone: string, now = new Date()): Status {
  const today = todayIn(timezone, now);
  return today < dates.start ? 'upcoming' : today > dates.end ? 'past' : 'live';
}

const RANK: Record<Status, number> = { live: 0, upcoming: 1, past: 2 };

export function sortEvents<T extends { dates: { start: string; end: string }; timezone: string }>(list: T[], now = new Date()): T[] {
  return list
    .map((e) => ({ e, st: eventStatus(e.dates, e.timezone, now) }))
    .sort((a, b) => RANK[a.st] - RANK[b.st] || (a.st === 'past' ? b.e.dates.end.localeCompare(a.e.dates.end) : a.e.dates.start.localeCompare(b.e.dates.start)))
    .map(({ e }) => e);
}
```

- [ ] **Step 4: Run the status test**

Run: `bun test tests/status.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the list page**

`src/routes/+page.server.ts`:

```ts
import { eventSummaries } from '$lib/server/catalog';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = () => ({ events: eventSummaries() });
```

`src/lib/ui/EventCard.svelte`:

```svelte
<script lang="ts">
  import type { EventSummary } from '$lib/server/catalog';
  import type { Status } from '$lib/core/status';
  import { STRINGS, fmtRange, nameIn, type Lang } from '$lib/i18n/strings';
  let { event, status, lang }: { event: EventSummary; status: Status | null; lang: Lang } = $props();
  const s = $derived(STRINGS[lang]);
  const nameOf = $derived(nameIn(lang));
</script>

<a class="event-card" href="/e/{event.id}/">
  {#if status}<span class="badge {status}">{s[status]}</span>{/if}
  <b>{nameOf(event.name)}</b>
  <span>{nameOf(event.venueName)}</span>
  <span>{fmtRange(event.dates.start, event.dates.end, lang)}</span>
</a>
```

`EventSummary` is a type-only import, so the server module is not bundled into the client.

`src/routes/+page.svelte`:

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { eventStatus, sortEvents, LEGACY_EVENT, type Status } from '$lib/core/status';
  import { STRINGS } from '$lib/i18n/strings';
  import { lang } from '$lib/i18n/lang.svelte';
  import Header from '$lib/ui/Header.svelte';
  import EventCard from '$lib/ui/EventCard.svelte';

  let { data } = $props();
  let now = $state<Date | null>(null);
  const s = $derived(STRINGS[lang.current]);
  const events = $derived(now ? sortEvents(data.events, now) : data.events);
  const statusOf = (e: (typeof data.events)[number]): Status | null => (now ? eventStatus(e.dates, e.timezone, now) : null);

  onMount(() => {
    const p = new URLSearchParams(location.hash.slice(1));
    if (p.has('to') || p.has('from')) {
      goto(`/e/${LEGACY_EVENT}/${location.hash}`, { replaceState: true });
      return;
    }
    now = new Date();
  });
</script>

<svelte:head>
  <title>{s.title}</title>
  <meta name="theme-color" content="#13306B" />
</svelte:head>

<div class="page">
  <Header title={s.title} subtitle={s.events} />
  <main class="events">
    {#if !events.length}<p class="empty">{s.noEvents}</p>{/if}
    {#each events as e (e.id)}
      <EventCard event={e} status={statusOf(e)} lang={lang.current} />
    {/each}
  </main>
</div>
```

- [ ] **Step 6: Add the error page and the 404 fallback**

`src/routes/+error.svelte`:

```svelte
<script lang="ts">
  import { page } from '$app/state';
  import { STRINGS } from '$lib/i18n/strings';
  import { lang } from '$lib/i18n/lang.svelte';
  import Header from '$lib/ui/Header.svelte';
  const s = $derived(STRINGS[lang.current]);
</script>

<div class="page">
  <Header title={s.title} backHref="/" backLabel={s.allEvents} />
  <main class="events">
    <p class="notice">{page.status === 404 ? s.notFound : page.error?.message}</p>
    <a class="event-card" href="/"><b>{s.allEvents}</b></a>
  </main>
</div>
```

If the installed SvelteKit predates `$app/state`, import `page` from `$app/stores` and use `$page.status` and `$page.error`.

In `svelte.config.js`, change the adapter options to `adapter({ pages: '_site', assets: '_site', fallback: '404.html', strict: true })`. Cloudflare Pages serves `404.html` for unknown paths, and the client router renders `+error.svelte` for an unknown `/e/<id>/`.

- [ ] **Step 7: Show the ended notice on past events**

In `src/routes/e/[id]/+page.svelte`, add to the imports:

```ts
import { eventStatus } from '$lib/core/status';
import { fmtRange } from '$lib/i18n/strings';
```

Replace `let notice = $state('');` with:

```ts
let isPast = $state(false);
const notice = $derived(isPast ? s.ended(fmtRange(data.event.dates.end, data.event.dates.end, lang.current)) : '');
```

Add as the first line of the `onMount` callback:

```ts
isPast = eventStatus(data.event.dates, data.venue.timezone) === 'past';
```

- [ ] **Step 8: Write the list e2e specs**

`tests/e2e/events.spec.ts`:

```ts
import { test, expect } from '@playwright/test';

test('root lists the 2026 event and links to it', async ({ page }) => {
  await page.goto('/');
  const card = page.locator('.event-card', { hasText: 'สัปดาห์หนังสือ' });
  await expect(card).toBeVisible();
  await expect(card.locator('.badge')).toHaveText('จบแล้ว');
  await card.click();
  await expect(page).toHaveURL(/\/e\/bkkibf-2026\/$/);
  await expect(page.locator('.notice')).toBeVisible();
});

test('old share links redirect to the 2026 event', async ({ page }) => {
  await page.goto('/#to=K16&from=door6');
  await expect(page).toHaveURL(/\/e\/bkkibf-2026\/#to=K16&from=door6$/);
  await expect(page.locator('.bigcode')).toHaveText('K16');
});

test('unknown event shows the not-found page', async ({ page }) => {
  await page.goto('/e/does-not-exist/');
  await expect(page.locator('.notice')).toContainText('ไม่พบงานนี้');
});
```

The e2e server is `serve`, which answers unknown paths with `_site/404.html` the way Cloudflare Pages does.

- [ ] **Step 9: Run everything**

Run: `bun run test && bun run check && bun run test:e2e`
Expected: all pass.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "Add event list with status, legacy redirect, ended notice and 404 page"
```

---

### Task 13: Pipeline image primitives

**Files:**
- Create: `tools/pipeline/lib/image.ts`
- Test: `tests/pipeline-image.test.ts`

**Interfaces:**
- Produces:
  - `type RGB = { width: number; height: number; data: Uint8Array }` (3 bytes per pixel, row-major)
  - `type Mask = { width: number; height: number; data: Uint8Array }` (0 or 1)
  - `loadImage(path: string): Promise<RGB>`
  - `crop(img: RGB, box: Box): RGB`
  - `pixel(img: RGB, x: number, y: number): [number, number, number]`
  - `farFromColour(img: RGB, colour: [number, number, number], threshold: number): Mask` (max channel difference > threshold)
  - `gray(img: RGB): Float32Array` (channel mean)
  - `components(mask: Mask): { labels: Int32Array; stats: { x: number; y: number; w: number; h: number; area: number }[] }` (4-connected, label 0 = background, `stats[0]` unused, labels numbered in raster order of first pixel)
  - `openLine(mask: Mask, length: number, axis: 'h' | 'v'): Mask` (matches OpenCV `MORPH_OPEN` with a 1×L or L×1 rectangle, centre anchor, default borders)
  - `erode2(mask: Mask): Mask` (matches OpenCV `erode` with `np.ones((2, 2))`, default anchor and border)
  - `median(values: ArrayLike<number>): number` (NumPy semantics: mean of the two middle values for even counts)
  - `modeColour(img: RGB, quant?: number): [number, number, number]`

- [ ] **Step 1: Install sharp**

```bash
bun add -d sharp
```

- [ ] **Step 2: Write the failing tests**

`tests/pipeline-image.test.ts`:

```ts
import { test, expect } from 'bun:test';
import { components, erode2, median, openLine, farFromColour, type Mask } from '../tools/pipeline/lib/image';

const mask = (rows: string[]): Mask => {
  const h = rows.length, w = rows[0].length, data = new Uint8Array(w * h);
  rows.forEach((r, y) => [...r].forEach((c, x) => { data[y * w + x] = c === '#' ? 1 : 0; }));
  return { width: w, height: h, data };
};
const rows = (m: Mask) => Array.from({ length: m.height }, (_, y) => Array.from({ length: m.width }, (_, x) => (m.data[y * m.width + x] ? '#' : '.')).join(''));

test('median follows NumPy', () => {
  expect(median([3, 1, 2])).toBe(2);
  expect(median([4, 1, 3, 2])).toBe(2.5);
});

test('components are 4-connected with raster-order labels', () => {
  const m = mask(['#..#', '#..#', '.##.']);
  const { stats } = components(m);
  expect(stats.length - 1).toBe(3);
  expect(stats[1]).toEqual({ x: 0, y: 0, w: 1, h: 2, area: 2 });
  expect(stats[2]).toEqual({ x: 3, y: 0, w: 1, h: 2, area: 2 });
  expect(stats[3]).toEqual({ x: 1, y: 2, w: 2, h: 1, area: 2 });
});

test('openLine keeps interior runs of at least L', () => {
  const m = mask(['.......', '.#####.', '.###...', '.......']);
  expect(rows(openLine(m, 4, 'h'))).toEqual(['.......', '.#####.', '.......', '.......']);
});

test('openLine keeps edge runs of at least L - floor(L/2) at the start and floor(L/2) + 1 at the end', () => {
  expect(rows(openLine(mask(['##......']), 4, 'h'))).toEqual(['##......']);
  expect(rows(openLine(mask(['#.......']), 4, 'h'))).toEqual(['........']);
  expect(rows(openLine(mask(['.....###']), 4, 'h'))).toEqual(['.....###']);
  expect(rows(openLine(mask(['......##']), 4, 'h'))).toEqual(['........']);
});

test('openLine works vertically', () => {
  const m = mask(['.#', '.#', '.#', '##', '..']);
  expect(rows(openLine(m, 3, 'v'))).toEqual(['.#', '.#', '.#', '.#', '..']);
});

test('erode2 uses the 2x2 window up and to the left with foreground borders', () => {
  const m = mask(['###', '###', '##.']);
  expect(rows(erode2(m))).toEqual(['###', '###', '##.']);
  const n = mask(['.##', '###', '###']);
  expect(rows(erode2(n))).toEqual(['..#', '..#', '###']);
});

test('farFromColour uses the max channel difference', () => {
  const img = { width: 2, height: 1, data: new Uint8Array([255, 253, 240, 200, 253, 240]) };
  expect([...farFromColour(img, [255, 253, 240], 55).data]).toEqual([0, 0]);
  expect([...farFromColour(img, [255, 253, 240], 50).data]).toEqual([0, 1]);
});
```

- [ ] **Step 3: Run them to see them fail**

Run: `bun test tests/pipeline-image.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 4: Write `image.ts`**

`tools/pipeline/lib/image.ts`:

```ts
import sharp from 'sharp';
import type { Box } from '../../../src/lib/core/types';

export type RGB = { width: number; height: number; data: Uint8Array };
export type Mask = { width: number; height: number; data: Uint8Array };

export async function loadImage(path: string): Promise<RGB> {
  const { data, info } = await sharp(path).removeAlpha().toColourspace('srgb').raw().toBuffer({ resolveWithObject: true });
  return { width: info.width, height: info.height, data: new Uint8Array(data.buffer, data.byteOffset, data.length) };
}

export function crop(img: RGB, [x0, y0, x1, y1]: Box): RGB {
  const w = x1 - x0, h = y1 - y0, out = new Uint8Array(w * h * 3);
  for (let y = 0; y < h; y++) out.set(img.data.subarray(((y0 + y) * img.width + x0) * 3, ((y0 + y) * img.width + x1) * 3), y * w * 3);
  return { width: w, height: h, data: out };
}

export const pixel = (img: RGB, x: number, y: number): [number, number, number] => {
  const i = (y * img.width + x) * 3;
  return [img.data[i], img.data[i + 1], img.data[i + 2]];
};

export function farFromColour(img: RGB, [r, g, b]: [number, number, number], threshold: number): Mask {
  const n = img.width * img.height, out = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const d = Math.max(Math.abs(img.data[i * 3] - r), Math.abs(img.data[i * 3 + 1] - g), Math.abs(img.data[i * 3 + 2] - b));
    out[i] = d > threshold ? 1 : 0;
  }
  return { width: img.width, height: img.height, data: out };
}

export function gray(img: RGB): Float32Array {
  const n = img.width * img.height, out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = (img.data[i * 3] + img.data[i * 3 + 1] + img.data[i * 3 + 2]) / 3;
  return out;
}

export function components(mask: Mask) {
  const { width: w, height: h, data } = mask;
  const labels = new Int32Array(w * h);
  const stats = [{ x: 0, y: 0, w: 0, h: 0, area: 0 }];
  const stack: number[] = [];
  for (let s = 0; s < w * h; s++) {
    if (!data[s] || labels[s]) continue;
    const id = stats.length;
    let x0 = w, y0 = h, x1 = -1, y1 = -1, area = 0;
    labels[s] = id;
    stack.push(s);
    while (stack.length) {
      const i = stack.pop()!, x = i % w, y = (i / w) | 0;
      area++;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1])
        if (j >= 0 && data[j] && !labels[j]) { labels[j] = id; stack.push(j); }
    }
    stats.push({ x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1, area });
  }
  return { labels, stats };
}

export function openLine(mask: Mask, length: number, axis: 'h' | 'v'): Mask {
  const { width: w, height: h, data } = mask, out = new Uint8Array(w * h);
  const anchor = Math.floor(length / 2);
  const lines = axis === 'h' ? h : w, span = axis === 'h' ? w : h;
  const at = (line: number, k: number) => (axis === 'h' ? line * w + k : k * w + line);
  for (let line = 0; line < lines; line++) {
    let k = 0;
    while (k < span) {
      if (!data[at(line, k)]) { k++; continue; }
      const start = k;
      while (k < span && data[at(line, k)]) k++;
      const run = k - start, atStart = start === 0, atEnd = k === span;
      const keep = run >= length || (atStart && atEnd) || (atStart && run >= length - anchor) || (atEnd && run >= anchor + 1);
      if (keep) for (let j = start; j < k; j++) out[at(line, j)] = 1;
    }
  }
  return { width: w, height: h, data: out };
}

export function erode2(mask: Mask): Mask {
  const { width: w, height: h, data } = mask, out = new Uint8Array(w * h);
  const v = (x: number, y: number) => (x < 0 || y < 0 ? 1 : data[y * w + x]);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) out[y * w + x] = v(x, y) & v(x - 1, y) & v(x, y - 1) & v(x - 1, y - 1);
  return { width: w, height: h, data: out };
}

export function median(values: ArrayLike<number>): number {
  const a = Float64Array.from(values).sort(), n = a.length;
  if (!n) return NaN;
  return n % 2 ? a[(n - 1) / 2] : (a[n / 2 - 1] + a[n / 2]) / 2;
}

export function modeColour(img: RGB, quant = 8): [number, number, number] {
  const counts = new Map<number, { n: number; r: number; g: number; b: number }>();
  for (let i = 0; i < img.width * img.height; i++) {
    const r = img.data[i * 3], g = img.data[i * 3 + 1], b = img.data[i * 3 + 2];
    const k = ((r / quant) | 0) * 65536 + ((g / quant) | 0) * 256 + ((b / quant) | 0);
    const c = counts.get(k) ?? { n: 0, r: 0, g: 0, b: 0 };
    c.n++; c.r += r; c.g += g; c.b += b;
    counts.set(k, c);
  }
  const best = [...counts.values()].sort((a, b) => b.n - a.n)[0];
  return [Math.round(best.r / best.n), Math.round(best.g / best.n), Math.round(best.b / best.n)];
}
```

`openLine` treats pixels outside the image as foreground while eroding and as background while dilating, which is OpenCV's default. That is why runs touching an edge survive at a shorter length. The run rule above is the closed form of that.

- [ ] **Step 5: Run the tests**

Run: `bun test tests/pipeline-image.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add tools/pipeline tests/pipeline-image.test.ts package.json bun.lock
git commit -m "Add pipeline image primitives matching OpenCV morphology"
```

---

### Task 14: Register and detect stages

**Files:**
- Create: `tools/pipeline/lib/register.ts`
- Create: `tools/pipeline/lib/detect.ts`
- Create: `tools/pipeline/lib/paths.ts`
- Create: `events/bkkibf-2026/source/detect.json`
- Test: `tests/pipeline-register.test.ts`, `tests/pipeline-detect.test.ts`

**Interfaces:**
- Consumes: `image.ts` (Task 13); `Venue`, `Box`, `Point`, `Rect` (Task 3); `loadVenue`, `loadEvent` (Task 5).
- Produces:
  - `type Transform = { sx: number; sy: number; dx: number; dy: number; score: number; method: 'auto' | 'manual' }`
  - `IDENTITY: Transform`
  - `toVenue(t: Transform, [x, y]: Point): Point`, `toPlan(t: Transform, [x, y]: Point): Point`, `rectToVenue(t: Transform, r: Rect): Rect`, `rectToPlan(t: Transform, r: Rect): Rect`
  - `fitAxes(pairs: { plan: Point; venue: Point }[]): Transform` (least squares per axis, `method: 'manual'`, needs ≥ 2 pairs)
  - `autoRegister(img: RGB, venue: Venue): Transform`
  - `type DetectParams = { roi: Box; floor: [number, number, number]; threshold: number; lineLength: number; lighterDelta: number; minIsland: number; minCell: { w: number; h: number; area: number }; exclude: Box[] }` (all in plan pixels)
  - `defaultDetectParams(img: RGB, venue: Venue, t: Transform): DetectParams`
  - `type Cell = Rect & { rgb: [number, number, number]; inner?: Rect; outer?: [number, number, number] }` (plan pixels; `inner` is the white square of a pillar-like cell, `outer` the median colour of its non-white pixels)
  - `detectCells(img: RGB, p: DetectParams): Cell[]` (sorted by `(x, y)`)
  - `eventPaths(id: string): { dir, source, plan, detect, registration, cells, reads, corrections, event, booths, exhibitors }` (absolute paths; `plan` resolves to the first `source/plan.*` file)

- [ ] **Step 1: Write the detect params for 2026**

`events/bkkibf-2026/source/detect.json`:

```json
{
  "roi": [440, 340, 2395, 1390],
  "floor": [255, 253, 240],
  "threshold": 55,
  "lineLength": 18,
  "lighterDelta": 35,
  "minIsland": 18,
  "minCell": { "w": 14, "h": 12, "area": 200 },
  "exclude": [[2095, 725, 2400, 915]]
}
```

These are `FLOOR_ROI`, `FLOOR_BGR` (as RGB), `STAGE_BOX` and the literals in `tools/digitize/common.py` and `detect_cells.py`.

- [ ] **Step 2: Write the failing tests**

`tests/pipeline-register.test.ts`:

```ts
import { test, expect } from 'bun:test';
import { loadImage } from '../tools/pipeline/lib/image';
import { autoRegister, fitAxes, toVenue, toPlan } from '../tools/pipeline/lib/register';
import { loadVenue } from '../src/lib/server/catalog';

test('fitAxes recovers scale and offset', () => {
  const t = fitAxes([
    { plan: [0, 0], venue: [10, 20] },
    { plan: [100, 0], venue: [210, 20] },
    { plan: [0, 50], venue: [10, 120] },
    { plan: [100, 50], venue: [210, 120] },
  ]);
  expect(t.sx).toBeCloseTo(2);
  expect(t.sy).toBeCloseTo(2);
  expect(toVenue(t, [50, 25])).toEqual([110, 70]);
  expect(toPlan(t, [110, 70])).toEqual([50, 25]);
});

test('the 2026 plan registers onto its own venue as identity', async () => {
  const venue = loadVenue('qsncc-lg-5-8');
  const t = autoRegister(await loadImage('venues/qsncc-lg-5-8/reference.jpg'), venue);
  expect(Math.abs(t.sx - 1)).toBeLessThan(0.01);
  expect(Math.abs(t.sy - 1)).toBeLessThan(0.01);
  expect(Math.abs(t.dx)).toBeLessThan(10);
  expect(Math.abs(t.dy)).toBeLessThan(10);
  expect(t.score).toBeGreaterThan(0.9);
});
```

`tests/pipeline-detect.test.ts`:

```ts
import { test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { loadImage } from '../tools/pipeline/lib/image';
import { detectCells } from '../tools/pipeline/lib/detect';

test('detects about as many cells on the 2026 plan as the Python detector', async () => {
  const img = await loadImage('events/bkkibf-2026/source/plan.jpg');
  const params = JSON.parse(readFileSync('events/bkkibf-2026/source/detect.json', 'utf8'));
  const cells = detectCells(img, params);
  expect(cells.length).toBeGreaterThan(360);
  expect(cells.length).toBeLessThan(400);
  for (let k = 1; k < cells.length; k++) {
    const a = cells[k - 1], b = cells[k];
    expect(a.x < b.x || (a.x === b.x && a.y <= b.y)).toBe(true);
  }
});
```

`labels.txt` has 378 lines, one per Python cell, so the expected count is near 378.

- [ ] **Step 3: Run them to see them fail**

Run: `bun test tests/pipeline-register.test.ts tests/pipeline-detect.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 4: Write `paths.ts` and `register.ts`**

`tools/pipeline/lib/paths.ts`:

```ts
import { existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

export function eventPaths(id: string, root = process.cwd()) {
  const dir = resolve(root, 'events', id), source = join(dir, 'source');
  const planFile = existsSync(source) ? readdirSync(source).find((f) => /^plan\.(jpe?g|png|webp)$/i.test(f)) : undefined;
  return {
    dir,
    source,
    plan: planFile ? join(source, planFile) : join(source, 'plan.jpg'),
    detect: join(source, 'detect.json'),
    registration: join(source, 'registration.json'),
    cells: join(source, 'cells.json'),
    reads: join(source, 'reads.json'),
    corrections: join(source, 'corrections.json'),
    event: join(dir, 'event.json'),
    booths: join(dir, 'booths.json'),
    exhibitors: join(dir, 'exhibitors.csv'),
  };
}
```

`tools/pipeline/lib/register.ts`:

```ts
import { components, farFromColour, modeColour, type Mask, type RGB } from './image';
import type { Point, Rect, Venue } from '../../../src/lib/core/types';

export type Transform = { sx: number; sy: number; dx: number; dy: number; score: number; method: 'auto' | 'manual' };
export const IDENTITY: Transform = { sx: 1, sy: 1, dx: 0, dy: 0, score: 1, method: 'manual' };

export const toVenue = (t: Transform, [x, y]: Point): Point => [x * t.sx + t.dx, y * t.sy + t.dy];
export const toPlan = (t: Transform, [x, y]: Point): Point => [(x - t.dx) / t.sx, (y - t.dy) / t.sy];
export const rectToVenue = (t: Transform, r: Rect): Rect => {
  const [x, y] = toVenue(t, [r.x, r.y]);
  return { x, y, w: r.w * t.sx, h: r.h * t.sy };
};
export const rectToPlan = (t: Transform, r: Rect): Rect => {
  const [x, y] = toPlan(t, [r.x, r.y]);
  return { x, y, w: r.w / t.sx, h: r.h / t.sy };
};

const fit1 = (a: number[], b: number[]) => {
  const n = a.length, ma = a.reduce((s, v) => s + v, 0) / n, mb = b.reduce((s, v) => s + v, 0) / n;
  let num = 0, den = 0;
  for (let k = 0; k < n; k++) { num += (a[k] - ma) * (b[k] - mb); den += (a[k] - ma) ** 2; }
  const s = num / den;
  return { s, d: mb - s * ma };
};

export function fitAxes(pairs: { plan: Point; venue: Point }[]): Transform {
  if (pairs.length < 2) throw new Error('Need at least two point pairs to register the plan');
  const x = fit1(pairs.map((p) => p.plan[0]), pairs.map((p) => p.venue[0]));
  const y = fit1(pairs.map((p) => p.plan[1]), pairs.map((p) => p.venue[1]));
  return { sx: x.s, sy: y.s, dx: x.d, dy: y.d, score: 1, method: 'manual' };
}

const bboxOfLargest = (m: Mask) => {
  const { stats } = components(m);
  const best = stats.slice(1).sort((a, b) => b.area - a.area)[0];
  return best;
};

export function autoRegister(img: RGB, venue: Venue): Transform {
  const floor = modeColour(img);
  const near = farFromColour(img, floor, 24);
  for (let i = 0; i < near.data.length; i++) near.data[i] = near.data[i] ? 0 : 1;
  const plan = bboxOfLargest(near);
  const hall = venue.walls[0];
  const xs = hall.map((p) => p[0]), ys = hall.map((p) => p[1]);
  const vx0 = Math.min(...xs), vx1 = Math.max(...xs), vy0 = Math.min(...ys), vy1 = Math.max(...ys);
  const sx = (vx1 - vx0) / plan.w, sy = (vy1 - vy0) / plan.h;
  const dx = vx0 - plan.x * sx, dy = vy0 - plan.y * sy;
  const ix = Math.max(0, Math.min(vx1, plan.x * sx + dx + plan.w * sx) - Math.max(vx0, plan.x * sx + dx));
  const iy = Math.max(0, Math.min(vy1, plan.y * sy + dy + plan.h * sy) - Math.max(vy0, plan.y * sy + dy));
  const score = (ix * iy) / ((vx1 - vx0) * (vy1 - vy0));
  return { sx, sy, dx, dy, score: Math.min(score, Math.min(sx, sy) / Math.max(sx, sy)), method: 'auto' };
}
```

The score falls when the two axes scale differently, which usually means the floor was detected wrongly. If the 2026 identity test fails, the largest floor-coloured region isn't the hall floor. Inspect it by writing `near` to a PNG with sharp, then tighten the tolerance (24) or restrict the search to the plan's central 80%. The test stays as written.

- [ ] **Step 5: Write `detect.ts`**

`tools/pipeline/lib/detect.ts`:

```ts
import { components, crop, erode2, farFromColour, gray, median, modeColour, openLine, type Mask, type RGB } from './image';
import type { Box, Rect, Venue } from '../../../src/lib/core/types';
import { toPlan, type Transform } from './register';

export type DetectParams = {
  roi: Box;
  floor: [number, number, number];
  threshold: number;
  lineLength: number;
  lighterDelta: number;
  minIsland: number;
  minCell: { w: number; h: number; area: number };
  exclude: Box[];
};

export type Cell = Rect & { rgb: [number, number, number]; inner?: Rect; outer?: [number, number, number] };

export function defaultDetectParams(img: RGB, venue: Venue, t: Transform): DetectParams {
  const hall = venue.walls[0];
  const [x0, y0] = toPlan(t, [Math.min(...hall.map((p) => p[0])), Math.min(...hall.map((p) => p[1]))]);
  const [x1, y1] = toPlan(t, [Math.max(...hall.map((p) => p[0])), Math.max(...hall.map((p) => p[1]))]);
  const roi: Box = [Math.max(0, Math.round(x0)), Math.max(0, Math.round(y0)), Math.min(img.width, Math.round(x1)), Math.min(img.height, Math.round(y1))];
  return { roi, floor: modeColour(crop(img, roi)), threshold: 55, lineLength: 18, lighterDelta: 35, minIsland: 18, minCell: { w: 14, h: 12, area: 200 }, exclude: [] };
}

export function detectCells(img: RGB, p: DetectParams): Cell[] {
  const roi = crop(img, p.roi), W = roi.width, H = roi.height;
  const coloured = farFromColour(roi, p.floor, p.threshold);
  const g = gray(roi);
  const { labels, stats } = components(coloured);
  const lines = new Uint8Array(W * H), blocks: Rect[] = [];

  for (let id = 1; id < stats.length; id++) {
    const { x, y, w, h } = stats[id];
    if (w < p.minIsland || h < p.minIsland) continue;
    blocks.push({ x, y, w, h });
    const inIsland = (i: number) => labels[i] === id;
    const vals: number[] = [];
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) if (inIsland(yy * W + xx)) vals.push(g[yy * W + xx]);
    const base = median(vals);
    const lighter: Mask = { width: w, height: h, data: new Uint8Array(w * h) };
    for (let yy = 0; yy < h; yy++)
      for (let xx = 0; xx < w; xx++) {
        const i = (y + yy) * W + (x + xx);
        lighter.data[yy * w + xx] = g[i] > base + p.lighterDelta || !inIsland(i) ? 1 : 0;
      }
    const vl = openLine(lighter, p.lineLength, 'v'), hl = openLine(lighter, p.lineLength, 'h');
    for (let yy = 0; yy < h; yy++)
      for (let xx = 0; xx < w; xx++) {
        const i = (y + yy) * W + (x + xx), k = yy * w + xx;
        if ((vl.data[k] || hl.data[k]) && inIsland(i)) lines[i] = 1;
        if (!inIsland(i)) lines[i] = 1;
      }
  }

  const cell: Mask = { width: W, height: H, data: new Uint8Array(W * H) };
  for (const b of blocks) for (let yy = b.y; yy < b.y + b.h; yy++) cell.data.fill(1, yy * W + b.x, yy * W + b.x + b.w);
  for (let i = 0; i < W * H; i++) cell.data[i] &= 1 - lines[i];
  const eroded = erode2(cell);
  const cc = components(eroded);

  const [ox, oy] = p.roi;
  const cells: Cell[] = [];
  for (let id = 1; id < cc.stats.length; id++) {
    const { x, y, w, h, area } = cc.stats[id];
    if (w < p.minCell.w || h < p.minCell.h || area < p.minCell.area) continue;
    const gx = x + ox, gy = y + oy;
    if (p.exclude.some(([a, b, c, d]) => a < gx && gx < c && b < gy && gy < d)) continue;
    const rs: number[] = [], gs: number[] = [], bs: number[] = [];
    for (let yy = y; yy < y + h; yy++)
      for (let xx = x; xx < x + w; xx++)
        if (cc.labels[yy * W + xx] === id) { const i = (yy * W + xx) * 3; rs.push(roi.data[i]); gs.push(roi.data[i + 1]); bs.push(roi.data[i + 2]); }
    const c: Cell = { x: gx, y: gy, w, h, rgb: [Math.trunc(median(rs)), Math.trunc(median(gs)), Math.trunc(median(bs))] };
    const white = whiteSquare(img, c);
    if (white) Object.assign(c, white);
    cells.push(c);
  }
  cells.sort((a, b) => a.x - b.x || a.y - b.y);
  return cells;
}

function whiteSquare(img: RGB, c: Rect): { inner: Rect; outer: [number, number, number] } | null {
  let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
  const rs: number[] = [], gs: number[] = [], bs: number[] = [];
  for (let y = c.y; y < c.y + c.h; y++)
    for (let x = c.x; x < c.x + c.w; x++) {
      const i = (y * img.width + x) * 3, r = img.data[i], g = img.data[i + 1], b = img.data[i + 2];
      if (Math.min(r, g, b) > 225) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      else { rs.push(r); gs.push(g); bs.push(b); }
    }
  if (x1 < 0) return null;
  return { inner: { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 }, outer: [Math.trunc(median(rs)), Math.trunc(median(gs)), Math.trunc(median(bs))] };
}
```

`inner` and `outer` reproduce the pillar handling in `build_booths.py`: the white square's bounding box, and the median colour of the non-white pixels used for the pillar's category. Most booth cells also contain white code text, so `inner` alone doesn't mean "pillar". The corrections decide that.

- [ ] **Step 6: Run the tests**

Run: `bun test tests/pipeline-register.test.ts tests/pipeline-detect.test.ts`
Expected: PASS. The detect test takes a few seconds.

- [ ] **Step 7: Commit**

```bash
git add tools/pipeline events/bkkibf-2026/source/detect.json tests
git commit -m "Add plan registration and booth cell detection"
```

---

### Task 15: Corrections, build stage and the 2026 reproduction

**Files:**
- Create: `tools/pipeline/lib/corrections.ts`
- Create: `tools/pipeline/lib/build.ts`
- Create: `tools/pipeline/lib/categorise.ts` (nearest-colour part; clustering added in Task 16)
- Create: `tools/migrate/corrections-2026.ts` (one-off)
- Create: `events/bkkibf-2026/source/corrections.json` (generated), `events/bkkibf-2026/source/registration.json`
- Create: `tools/pipeline/cli.ts` (`build` command)
- Modify: `package.json` (`event:build`, `event:detect`)
- Test: `tests/pipeline-build.test.ts`

**Interfaces:**
- Consumes: Tasks 3, 5, 13, 14.
- Produces:
  - Zod `CorrectionsSchema` and `type Corrections`:
    ```ts
    type Corrections = {
      cells: { at: Point; code?: string; pillar?: true; drop?: true; rect?: Rect; extra?: Rect[] }[];
      add: { code: string; rect: Rect; extra?: Rect[]; cat?: string }[];
      categoryColours: Record<string, [number, number, number]>;
      event?: Partial<Pick<EventFile, 'categories' | 'zones' | 'foyerZones' | 'obstacles' | 'landmarks' | 'quickPicks'>>;
    };
    ```
    All coordinates in venue space.
  - `EMPTY_CORRECTIONS: Corrections`
  - `nearestCategory(rgb: [number, number, number], colours: Record<string, [number, number, number]>): string`
  - `type Read = { at: Point; text: string; conf: number; code: string | null; flags: string[] }`
  - `type BuildInput = { cells: Cell[]; reads: Read[]; corrections: Corrections; t: Transform; sample: (r: Rect) => [number, number, number]; codePattern: string }`
  - `type BuildResult = { booths: BoothsFile; problems: string[] }`
  - `buildBooths(input: BuildInput): BuildResult`
  - `computeAisles(booths: BoothRaw[], venue: Venue, codePattern: string): EventFile['aisles']`
  - CLI: `bun run event:build <id>` writes `booths.json`, merges `corrections.event` and computed aisles into `event.json`, then validates with `loadEvent` and the same checks as `tests/events.test.ts`.

- [ ] **Step 1: Write `corrections.ts` and the nearest-colour helper**

`tools/pipeline/lib/corrections.ts`:

```ts
import { z } from 'zod';
import { EventSchema } from '../../../src/lib/server/schema';
import type { EventFile, Point, Rect } from '../../../src/lib/core/types';

const num = z.number().finite();
const rect = z.object({ x: num, y: num, w: num.positive(), h: num.positive() });
const rgb = z.tuple([z.number().int(), z.number().int(), z.number().int()]);

export const CorrectionsSchema = z.object({
  cells: z.array(
    z.object({
      at: z.tuple([num, num]),
      code: z.string().optional(),
      pillar: z.literal(true).optional(),
      drop: z.literal(true).optional(),
      rect: rect.optional(),
      extra: z.array(rect).optional(),
    }),
  ),
  add: z.array(z.object({ code: z.string(), rect, extra: z.array(rect).optional(), cat: z.string().optional() })),
  categoryColours: z.record(z.string(), rgb),
  event: z.record(z.string(), z.unknown()).optional(),
});

export type Corrections = {
  cells: { at: Point; code?: string; pillar?: true; drop?: true; rect?: Rect; extra?: Rect[] }[];
  add: { code: string; rect: Rect; extra?: Rect[]; cat?: string }[];
  categoryColours: Record<string, [number, number, number]>;
  event?: Partial<Pick<EventFile, 'categories' | 'zones' | 'foyerZones' | 'obstacles' | 'landmarks' | 'quickPicks'>>;
};

export const EMPTY_CORRECTIONS: Corrections = { cells: [], add: [], categoryColours: {} };

export const parseCorrections = (json: unknown): Corrections => CorrectionsSchema.parse(json) as Corrections;

export const mergeEvent = (event: EventFile, patch: Corrections['event']): EventFile => EventSchema.parse({ ...event, ...patch });
```

`tools/pipeline/lib/categorise.ts`:

```ts
export function nearestCategory(rgb: [number, number, number], colours: Record<string, [number, number, number]>): string {
  let best = '', bd = Infinity;
  for (const [k, c] of Object.entries(colours)) {
    const d = (c[0] - rgb[0]) ** 2 + (c[1] - rgb[1]) ** 2 + (c[2] - rgb[2]) ** 2;
    if (d < bd) { bd = d; best = k; }
  }
  return best;
}
```

- [ ] **Step 2: Write the failing build test**

`tests/pipeline-build.test.ts`:

```ts
import { test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { loadImage, crop, median } from '../tools/pipeline/lib/image';
import { detectCells } from '../tools/pipeline/lib/detect';
import { IDENTITY } from '../tools/pipeline/lib/register';
import { parseCorrections } from '../tools/pipeline/lib/corrections';
import { buildBooths, computeAisles } from '../tools/pipeline/lib/build';
import { loadEvent } from '../src/lib/server/catalog';
import type { Rect } from '../src/lib/core/types';

const bundle = loadEvent('bkkibf-2026');

test('the 2026 plan plus committed corrections reproduces booths.json', async () => {
  const img = await loadImage('events/bkkibf-2026/source/plan.jpg');
  const cells = detectCells(img, JSON.parse(readFileSync('events/bkkibf-2026/source/detect.json', 'utf8')));
  const corrections = parseCorrections(JSON.parse(readFileSync('events/bkkibf-2026/source/corrections.json', 'utf8')));
  const sample = (r: Rect) => {
    const c = crop(img, [Math.round(r.x + 3), Math.round(r.y + 3), Math.round(r.x + r.w - 3), Math.round(r.y + r.h - 3)]);
    const ch = (k: number) => Math.trunc(median(Array.from({ length: c.width * c.height }, (_, i) => c.data[i * 3 + k])));
    return [ch(0), ch(1), ch(2)] as [number, number, number];
  };
  const { booths, problems } = buildBooths({ cells, reads: [], corrections, t: IDENTITY, sample, codePattern: bundle.event.codePattern });
  expect(problems).toEqual([]);

  const want = bundle.booths;
  const byKey = (list: { c: string; x: number; y: number }[]) => [...list].sort((a, b) => a.c.localeCompare(b.c) || a.x - b.x || a.y - b.y);
  const got = byKey(booths.booths), exp = byKey(want.booths);
  expect(got.map((b) => b.c)).toEqual(exp.map((b) => b.c));
  const off: string[] = [];
  got.forEach((b, k) => {
    const e = exp[k];
    const far = Math.abs(b.x - e.x) > 2 || Math.abs(b.y - e.y) > 2 || Math.abs(b.w - e.w) > 2 || Math.abs(b.h - e.h) > 2;
    if (far || b.cat !== e.cat || JSON.stringify(b.extra ?? null) !== JSON.stringify(e.extra ?? null)) off.push(`${b.c}: ${JSON.stringify(b)} vs ${JSON.stringify(e)}`);
  });
  expect(off).toEqual([]);

  expect(booths.pillars.length).toBe(want.pillars.length);
  const pk = (p: Rect) => p.x * 10000 + p.y;
  const gp = [...booths.pillars].sort((a, b) => pk(a) - pk(b)), ep = [...want.pillars].sort((a, b) => pk(a) - pk(b));
  gp.forEach((p, k) => {
    expect(Math.abs(p.x - ep[k].x)).toBeLessThanOrEqual(2);
    expect(Math.abs(p.inner.x - ep[k].inner.x)).toBeLessThanOrEqual(2);
    expect(p.cat).toBe(ep[k].cat);
  });
}, 60_000);

test('computeAisles reproduces the 2026 aisle letters within 3 px', () => {
  const a = computeAisles(bundle.booths.booths, bundle.venue, bundle.event.codePattern)!;
  expect(a.signY).toBe(322);
  expect(a.boothMinY).toBe(340);
  for (const [letter, x] of Object.entries(bundle.event.aisles!.x)) expect(Math.abs(a.x[letter] - x)).toBeLessThanOrEqual(3);
});

test('a cell with no code and no correction is a problem, not a guess', () => {
  const cell = { x: 0, y: 0, w: 30, h: 30, rgb: [0, 0, 0] as [number, number, number] };
  const { problems } = buildBooths({ cells: [cell], reads: [], corrections: { cells: [], add: [], categoryColours: { general: [0, 0, 0] } }, t: IDENTITY, sample: () => [0, 0, 0], codePattern: '^[A-Z]\\d{2}$' });
  expect(problems[0]).toContain('15,15');
});
```

- [ ] **Step 3: Run it to see it fail**

Run: `bun test tests/pipeline-build.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 4: Write `build.ts`**

`tools/pipeline/lib/build.ts`:

```ts
import type { BoothRaw, BoothsFile, EventFile, Pillar, Point, Rect, Venue } from '../../../src/lib/core/types';
import type { Cell } from './detect';
import type { Corrections } from './corrections';
import { nearestCategory } from './categorise';
import { rectToVenue, type Transform } from './register';

export type Read = { at: Point; text: string; conf: number; code: string | null; flags: string[] };
export type BuildInput = {
  cells: Cell[];
  reads: Read[];
  corrections: Corrections;
  t: Transform;
  sample: (r: Rect) => [number, number, number];
  codePattern: string;
};

const inside = ([x, y]: Point, r: Rect) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;
const roundRect = (r: Rect): Rect => ({ x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.w), h: Math.round(r.h) });

export function buildBooths(input: BuildInput): { booths: BoothsFile; problems: string[] } {
  const { cells, reads, corrections, t, codePattern } = input;
  const re = new RegExp(codePattern), colours = corrections.categoryColours;
  const booths: BoothRaw[] = [], pillars: Pillar[] = [], problems: string[] = [];
  const used = new Set<number>();

  for (const cell of cells) {
    const vr = roundRect(rectToVenue(t, cell));
    const fixIdx = corrections.cells.findIndex((c) => inside(c.at, vr));
    const fix = fixIdx >= 0 ? corrections.cells[fixIdx] : undefined;
    if (fixIdx >= 0) used.add(fixIdx);
    const centre: Point = [vr.x + vr.w / 2, vr.y + vr.h / 2];
    if (fix?.drop) continue;
    if (fix?.pillar) {
      if (!cell.inner || !cell.outer) { problems.push(`cell at ${centre.join(',')} is marked as a pillar but has no white square`); continue; }
      pillars.push({ ...vr, cat: nearestCategory(cell.outer, colours), inner: roundRect(rectToVenue(t, cell.inner)) });
      continue;
    }
    const read = reads.find((r) => inside(r.at, vr));
    const code = fix?.code ?? (read && read.code && !read.flags.length ? read.code : undefined);
    if (!code) { problems.push(`cell at ${centre.join(',')} has no code. Set one in the review tool`); continue; }
    if (!re.test(code)) { problems.push(`cell at ${centre.join(',')}: code "${code}" does not match ${codePattern}`); continue; }
    const b: BoothRaw = { c: code, ...(fix?.rect ? roundRect(fix.rect) : vr), cat: nearestCategory(cell.rgb, colours) };
    if (fix?.extra) b.extra = fix.extra.map(roundRect);
    booths.push(b);
  }

  corrections.cells.forEach((c, k) => {
    if (!used.has(k)) problems.push(`correction at ${c.at.join(',')} matches no detected cell`);
  });

  for (const a of corrections.add) {
    if (!re.test(a.code)) { problems.push(`added booth "${a.code}" does not match ${codePattern}`); continue; }
    const r = roundRect(a.rect);
    const [px, py] = [(r.x - t.dx) / t.sx, (r.y - t.dy) / t.sy];
    const cat = a.cat ?? nearestCategory(input.sample({ x: px, y: py, w: r.w / t.sx, h: r.h / t.sy }), colours);
    const b: BoothRaw = { c: a.code, ...r, cat };
    if (a.extra) b.extra = a.extra.map(roundRect);
    booths.push(b);
  }
  return { booths: { booths, pillars }, problems };
}

export function computeAisles(booths: BoothRaw[], venue: Venue, codePattern: string): EventFile['aisles'] {
  const re = new RegExp(codePattern);
  const signY = (venue.depth?.back ?? Math.min(...booths.map((b) => b.y))) + 38;
  const boothMinY = signY + 18;
  const byLetter: Record<string, number[]> = {};
  for (const b of booths) if (re.test(b.c) && /^[A-Z]/.test(b.c) && b.y > boothMinY) (byLetter[b.c[0]] ||= []).push(b.x);
  const x: Record<string, number> = {};
  for (const [letter, xs] of Object.entries(byLetter).sort()) x[letter] = Math.round(Math.min(...xs) - 18);
  return Object.keys(x).length ? { signY, boothMinY, x } : undefined;
}
```

- [ ] **Step 5: Generate the 2026 corrections**

`tools/migrate/corrections-2026.ts`:

```ts
import { readFileSync, writeFileSync } from 'node:fs';
import { loadImage } from '../pipeline/lib/image';
import { detectCells } from '../pipeline/lib/detect';
import { IDENTITY } from '../pipeline/lib/register';

const MANUAL = ['C06', 'C04', 'E20', 'E16', 'F21', 'F17', 'F15', 'C17', 'G16', 'A31', 'A15'];
const MANUAL_RECTS: Record<string, [number, number, number, number]> = {
  C06: [673, 1283, 29, 29], C04: [673, 1313, 29, 29], E20: [857, 938, 28, 91], E16: [857, 1030, 28, 60],
  F21: [887, 938, 29, 60], F17: [887, 999, 29, 60], F15: [887, 1060, 29, 30], C17: [611, 1030, 29, 29],
  G16: [1041, 1031, 29, 59], A31: [407, 659, 61, 61], A15: [406, 1013, 61, 62],
};
const RECT_OVERRIDES: Record<string, [number, number, number, number]> = { C11: [611, 1125, 29, 59], D30: [794, 831, 30, 49] };
const BGR: Record<string, [number, number, number]> = {
  kids: [179, 136, 250], fiction: [41, 66, 224], bl: [185, 125, 155], intl: [1, 207, 255], rare: [71, 137, 196],
  general: [198, 132, 27], comic: [34, 134, 246], nonbook: [109, 188, 91], special: [32, 31, 35],
};

const booths = JSON.parse(readFileSync('events/bkkibf-2026/booths.json', 'utf8'));
const img = await loadImage('events/bkkibf-2026/source/plan.jpg');
const cells = detectCells(img, JSON.parse(readFileSync('events/bkkibf-2026/source/detect.json', 'utf8')));
const centre = (r: { x: number; y: number; w: number; h: number }): [number, number] => [r.x + r.w / 2, r.y + r.h / 2];
const inside = ([x, y]: [number, number], r: { x: number; y: number; w: number; h: number }) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;
const rect = ([x, y, w, h]: number[]) => ({ x, y, w, h });

const out: { at: [number, number]; code?: string; pillar?: true; drop?: true; rect?: object; extra?: object[] }[] = [];
const matched = new Set<string>();
for (const cell of cells) {
  const inB = booths.booths.filter((b: { c: string }) => !MANUAL.includes(b.c)).filter((b: object) => inside(centre(b as never), cell));
  const inP = booths.pillars.filter((p: object) => inside(centre(p as never), cell));
  const hasManual = booths.booths.some((b: { c: string }) => MANUAL.includes(b.c) && inside(centre(b as never), cell));
  if (inP.length === 1 && !inB.length) out.push({ at: centre(cell), pillar: true });
  else if (inB.length === 1 && !hasManual) {
    const b = inB[0];
    const fix: (typeof out)[number] = { at: centre(b), code: b.c };
    if (RECT_OVERRIDES[b.c]) fix.rect = rect(RECT_OVERRIDES[b.c]);
    if (b.extra) fix.extra = b.extra;
    out.push(fix);
    matched.add(`${b.c}@${b.x},${b.y}`);
  } else out.push({ at: centre(cell), drop: true });
}
const missing = booths.booths.filter((b: { c: string; x: number; y: number }) => !MANUAL.includes(b.c) && !matched.has(`${b.c}@${b.x},${b.y}`));
if (missing.length) console.warn('not matched to a detected cell:', missing.map((b: { c: string }) => b.c).join(', '));

const corrections = {
  cells: out,
  add: MANUAL.map((c) => ({ code: c, rect: rect(MANUAL_RECTS[c]) })),
  categoryColours: Object.fromEntries(Object.entries(BGR).map(([k, [b, g, r]]) => [k, [r, g, b]])),
};
writeFileSync('events/bkkibf-2026/source/corrections.json', JSON.stringify(corrections, null, 2) + '\n');
writeFileSync('events/bkkibf-2026/source/registration.json', JSON.stringify(IDENTITY, null, 2) + '\n');
console.log(`${out.length} cell corrections, ${missing.length} unmatched booths`);
```

Run: `bun tools/migrate/corrections-2026.ts`
Expected: `0 unmatched booths`. If some booths are unmatched, the TypeScript detector merged or split cells differently from Python. Compare its output against the Python cells for those booths and fix `detect.ts` before continuing. Adding them to `add` would hide a detector bug.

- [ ] **Step 6: Run the build test**

Run: `bun test tests/pipeline-build.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 7: Add the CLI `build` and `detect` commands**

`tools/pipeline/cli.ts`:

```ts
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { loadEvent, loadVenue } from '../../src/lib/server/catalog';
import { EventSchema } from '../../src/lib/server/schema';
import { loadData, prepareData } from '../../src/lib/core/prepare';
import { createGrid, obstaclesOf } from '../../src/lib/core/grid';
import { findRoute } from '../../src/lib/core/routing';
import { isRouteOk } from '../../src/lib/core/types';
import { crop, loadImage, median, type RGB } from './lib/image';
import { autoRegister, type Transform } from './lib/register';
import { defaultDetectParams, detectCells, type Cell } from './lib/detect';
import { EMPTY_CORRECTIONS, parseCorrections, mergeEvent } from './lib/corrections';
import { buildBooths, computeAisles, type Read } from './lib/build';
import { eventPaths } from './lib/paths';

const readJson = <T>(path: string, fallback?: T): T => (existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : (fallback as T));
const writeJson = (path: string, v: unknown) => writeFileSync(path, JSON.stringify(v, null, 2) + '\n');
const fail = (lines: string[]) => { console.error(lines.map((l) => `- ${l}`).join('\n')); process.exit(1); };

const sampler = (img: RGB) => (r: { x: number; y: number; w: number; h: number }) => {
  const c = crop(img, [Math.round(r.x + 3), Math.round(r.y + 3), Math.round(r.x + r.w - 3), Math.round(r.y + r.h - 3)]);
  const ch = (k: number) => Math.trunc(median(Array.from({ length: c.width * c.height }, (_, i) => c.data[i * 3 + k])));
  return [ch(0), ch(1), ch(2)] as [number, number, number];
};

export async function detect(id: string) {
  const p = eventPaths(id);
  const { event } = loadEvent(id);
  const venue = loadVenue(event.venue);
  const img = await loadImage(p.plan);
  const t: Transform = readJson(p.registration) ?? autoRegister(img, venue);
  writeJson(p.registration, t);
  if (t.score < 0.9) console.warn(`Registration score ${t.score.toFixed(2)} is low. Fix it in the review tool (register mode).`);
  const params = readJson(p.detect) ?? defaultDetectParams(img, venue, t);
  writeJson(p.detect, params);
  const cells = detectCells(img, params);
  writeJson(p.cells, cells);
  console.log(`${cells.length} cells`);
  return { img, t, cells };
}

export async function build(id: string) {
  const p = eventPaths(id);
  const bundle = loadEvent(id);
  const img = await loadImage(p.plan);
  const t: Transform = readJson(p.registration);
  const cells: Cell[] = readJson(p.cells);
  const reads: Read[] = readJson(p.reads, []);
  const corrections = parseCorrections(readJson(p.corrections, EMPTY_CORRECTIONS));
  const { booths, problems } = buildBooths({ cells, reads, corrections, t, sample: sampler(img), codePattern: bundle.event.codePattern });
  if (problems.length) fail(problems);

  let event = mergeEvent(bundle.event, corrections.event);
  if (!event.aisles) event = EventSchema.parse({ ...event, aisles: computeAisles(booths.booths, bundle.venue, event.codePattern) });

  const data = prepareData(bundle.venue, event, booths, bundle.exhibitors);
  const grid = createGrid(data.venue, obstaclesOf(data));
  const origin = data.landmarkById[data.venue.origin];
  const unreachable = data.booths.filter((b) => !isRouteOk(findRoute(grid, data.venue, origin, { kind: 'booth', b }))).map((b) => b.c);
  if (unreachable.length) fail([`not reachable from ${origin.id}: ${unreachable.join(', ')}`]);
  writeJson(p.booths, booths);
  writeJson(p.event, event);
  console.log(`${booths.booths.length} booths, ${booths.pillars.length} pillars written. Run bun test to check the event.`);
}

const [cmd, id] = process.argv.slice(2);
const commands: Record<string, (id: string) => Promise<unknown>> = { detect, build };
if (!cmd || !commands[cmd] || !id) fail([`usage: bun tools/pipeline/cli.ts <${Object.keys(commands).join('|')}> <event-id>`]);
await commands[cmd](id);
```

Add to `package.json` scripts:

```json
"event:detect": "bun tools/pipeline/cli.ts detect",
"event:build": "bun tools/pipeline/cli.ts build"
```

- [ ] **Step 8: Check the CLI on the 2026 event**

Run: `bun run event:detect bkkibf-2026 && bun run event:build bkkibf-2026 && git diff --stat events/bkkibf-2026`
Expected: `booths.json` differs only in rectangle values within ±2 px (or not at all). `event.json` is unchanged apart from key order. Then restore it: `git checkout events/bkkibf-2026/booths.json events/bkkibf-2026/event.json`. The committed 2026 data stays the v1 data. The CLI's job here is only to show it can regenerate it.

- [ ] **Step 9: Commit**

```bash
git add tools events/bkkibf-2026/source tests package.json
git commit -m "Add corrections, build stage and reproduce the 2026 booths from the plan"
```

---

### Task 16: OCR read stage, colour clustering and `event:new`

**Files:**
- Create: `tools/pipeline/lib/read.ts`
- Modify: `tools/pipeline/lib/categorise.ts` (add clustering)
- Modify: `tools/pipeline/cli.ts` (`new`, `read`, `ocr-report` commands)
- Modify: `package.json` (`event:new`, `event:read`, `event:ocr-report`)
- Test: `tests/pipeline-read.test.ts`, `tests/pipeline-categorise.test.ts`

**Interfaces:**
- Consumes: Tasks 13–15.
- Produces:
  - `readBox(c: Rect): Box` (the centre crop used for OCR, same size rule as `contact_sheets.py`)
  - `cleanRead(text: string, codePattern: string): string | null`
  - `flagReads(reads: Read[], rects: Rect[]): Read[]` (adds `flags`: `unread`, `low-confidence`, `duplicate`, `column-letter`, `column-order`)
  - `readCells(img: RGB, cells: Cell[], t: Transform, codePattern: string): Promise<Read[]>`
  - `clusterColours(colours: [number, number, number][], maxDist?: number): { rgb: [number, number, number]; count: number }[]`
  - `assignCategories(clusters: { rgb: [number, number, number] }[], existing: Record<string, [number, number, number]>, maxDist?: number): { categoryColours: Record<string, [number, number, number]>; created: Record<string, Category> }`
  - CLI: `event:new <id> --plan <file> --name-th <text> --name-en <text> --start <YYYY-MM-DD> --end <YYYY-MM-DD> [--venue <id>]`, `event:read <id>`, `event:ocr-report <id>`

- [ ] **Step 1: Install tesseract.js**

```bash
bun add -d tesseract.js
```

- [ ] **Step 2: Write the failing tests**

`tests/pipeline-read.test.ts`:

```ts
import { test, expect } from 'bun:test';
import { cleanRead, flagReads, readBox } from '../tools/pipeline/lib/read';
import type { Read } from '../tools/pipeline/lib/build';

const P = '^[A-Z]\\d{2}$';

test('cleanRead fixes common confusions by position', () => {
  expect(cleanRead(' k16 ', P)).toBe('K16');
  expect(cleanRead('KI6', P)).toBe('K16');
  expect(cleanRead('0O4', P)).toBe('O04');
  expect(cleanRead('B2S', P)).toBe('B25');
  expect(cleanRead('K1', P)).toBeNull();
  expect(cleanRead('', P)).toBeNull();
});

test('readBox follows the contact-sheet crop rule', () => {
  expect(readBox({ x: 100, y: 100, w: 30, h: 60 })).toEqual([99, 114, 131, 146]);
});

const rd = (x: number, y: number, code: string | null, conf = 90): Read => ({ at: [x, y], text: code ?? '', conf, code, flags: [] });

test('flagReads marks unread, low confidence and duplicates', () => {
  const rects = [{ x: 0, y: 0, w: 10, h: 10 }, { x: 100, y: 0, w: 10, h: 10 }, { x: 200, y: 0, w: 10, h: 10 }];
  const out = flagReads([rd(5, 5, null), rd(105, 5, 'A01', 40), rd(205, 5, 'A01')], rects);
  expect(out[0].flags).toContain('unread');
  expect(out[1].flags).toEqual(expect.arrayContaining(['low-confidence', 'duplicate']));
  expect(out[2].flags).toContain('duplicate');
});

test('flagReads checks letters and order within a column', () => {
  const rects = [0, 1, 2, 3].map((k) => ({ x: 0, y: k * 30, w: 29, h: 29 }));
  const out = flagReads([rd(5, 5, 'K20'), rd(5, 35, 'K18'), rd(5, 65, 'L16'), rd(5, 95, 'K19')], rects);
  expect(out[2].flags).toContain('column-letter');
  expect(out[3].flags).toContain('column-order');
  expect(out[0].flags).toEqual([]);
});
```

`tests/pipeline-categorise.test.ts`:

```ts
import { test, expect } from 'bun:test';
import { assignCategories, clusterColours, nearestCategory } from '../tools/pipeline/lib/categorise';

test('clusters near colours and counts members', () => {
  const c = clusterColours([[250, 136, 179], [248, 140, 180], [27, 132, 198], [30, 130, 200], [29, 131, 199]]);
  expect(c.map((x) => x.count).sort()).toEqual([2, 3]);
});

test('matches clusters to existing categories or creates placeholders', () => {
  const r = assignCategories([{ rgb: [250, 136, 179] }, { rgb: [10, 200, 10] }], { kids: [250, 136, 179] });
  expect(Object.keys(r.categoryColours).sort()).toEqual(['cat1', 'kids']);
  expect(r.created.cat1.en).toBe('Category 1');
  expect(r.created.cat1.color).toBe('#0AC80A');
  expect(nearestCategory([12, 198, 12], r.categoryColours)).toBe('cat1');
});
```

- [ ] **Step 3: Run them to see them fail**

Run: `bun test tests/pipeline-read.test.ts tests/pipeline-categorise.test.ts`
Expected: FAIL on missing exports.

- [ ] **Step 4: Write `read.ts`**

`tools/pipeline/lib/read.ts`:

```ts
import sharp from 'sharp';
import { createWorker, PSM } from 'tesseract.js';
import type { Box, Rect } from '../../../src/lib/core/types';
import { crop, type RGB } from './image';
import type { Cell } from './detect';
import type { Read } from './build';
import { rectToVenue, type Transform } from './register';

const TO_DIGIT: Record<string, string> = { O: '0', D: '0', Q: '0', I: '1', L: '1', T: '1', Z: '2', S: '5', B: '8', G: '6' };
const TO_LETTER: Record<string, string> = { '0': 'O', '1': 'I', '2': 'Z', '5': 'S', '8': 'B', '6': 'G' };

export function readBox(c: Rect): Box {
  const cx = Math.floor(c.x + c.w / 2), cy = Math.floor(c.y + c.h / 2);
  const hw = Math.max(Math.min(Math.floor(c.w / 2), 40), 16), hh = Math.max(Math.min(Math.floor(c.h / 2), 16), 12);
  return [cx - hw, cy - hh, cx + hw, cy + hh];
}

export function cleanRead(text: string, codePattern: string): string | null {
  const re = new RegExp(codePattern);
  const raw = text.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!raw) return null;
  if (re.test(raw)) return raw;
  const fixed = [...raw].map((ch, k) => (k === 0 ? (TO_LETTER[ch] ?? ch) : (TO_DIGIT[ch] ?? ch))).join('');
  return re.test(fixed) ? fixed : null;
}

const numOf = (code: string) => Number(code.slice(1));

export function flagReads(reads: Read[], rects: Rect[]): Read[] {
  const out = reads.map((r) => ({ ...r, flags: [] as string[] }));
  const counts = new Map<string, number>();
  for (const r of out) if (r.code) counts.set(r.code, (counts.get(r.code) ?? 0) + 1);
  out.forEach((r) => {
    if (!r.code) r.flags.push('unread');
    else {
      if (r.conf < 60) r.flags.push('low-confidence');
      if ((counts.get(r.code) ?? 0) > 1) r.flags.push('duplicate');
    }
  });
  const columns = new Map<number, number[]>();
  rects.forEach((rect, k) => {
    const key = [...columns.keys()].find((x) => Math.abs(x - rect.x) <= 3) ?? rect.x;
    columns.set(key, [...(columns.get(key) ?? []), k]);
  });
  for (const idx of columns.values()) {
    const col = idx.filter((k) => out[k].code).sort((a, b) => rects[a].y - rects[b].y);
    if (col.length < 3) continue;
    const letters = new Map<string, number>();
    for (const k of col) letters.set(out[k].code![0], (letters.get(out[k].code![0]) ?? 0) + 1);
    const major = [...letters.entries()].sort((a, b) => b[1] - a[1])[0][0];
    for (const k of col) if (out[k].code![0] !== major) out[k].flags.push('column-letter');
    const same = col.filter((k) => out[k].code![0] === major);
    if (same.length < 3) continue;
    const nums = same.map((k) => numOf(out[k].code!));
    const dir = Math.sign(nums[nums.length - 1] - nums[0]) || 1;
    for (let j = 1; j < same.length; j++) if (Math.sign(nums[j] - nums[j - 1]) !== dir) out[same[j]].flags.push('column-order');
  }
  return out;
}

async function prep(img: RGB, box: Box, rotate: boolean): Promise<Buffer> {
  const c = crop(img, box);
  let s = sharp(Buffer.from(c.data), { raw: { width: c.width, height: c.height, channels: 3 } }).greyscale();
  const { data } = await s.clone().raw().toBuffer({ resolveWithObject: true });
  const mean = data.reduce((a, v) => a + v, 0) / data.length;
  if (mean < 150) s = s.negate({ alpha: false });
  if (rotate) s = s.rotate(90);
  return s.resize({ width: c.width * 4 * (rotate ? c.height / c.width : 1), kernel: 'cubic' }).normalise().png().toBuffer();
}

export async function readCells(img: RGB, cells: Cell[], t: Transform, codePattern: string): Promise<Read[]> {
  const worker = await createWorker('eng');
  await worker.setParameters({ tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', tessedit_pageseg_mode: PSM.SINGLE_WORD });
  const reads: Read[] = [];
  try {
    for (const cell of cells) {
      const v = rectToVenue(t, cell);
      const at: [number, number] = [v.x + v.w / 2, v.y + v.h / 2];
      let best = { text: '', conf: 0, code: null as string | null };
      for (const rotate of cell.h > cell.w * 2 ? [false, true] : [false]) {
        const { data } = await worker.recognize(await prep(img, readBox(cell), rotate));
        const code = cleanRead(data.text, codePattern);
        if ((code && !best.code) || (!!code === !!best.code && data.confidence > best.conf)) best = { text: data.text.trim(), conf: data.confidence, code };
      }
      reads.push({ at, ...best, flags: [] });
    }
  } finally {
    await worker.terminate();
  }
  return flagReads(reads, cells.map((c) => rectToVenue(t, c)));
}
```

The column direction comes from the first and last same-letter codes. Any step against it is flagged: in the test, K20 → K18 → K19 flags K19. Columns with fewer than three codes are not checked.

If `tesseract.js` workers fail to start under Bun, run the read stage with Node: `npx tsx tools/pipeline/cli.ts read <id>`. Keep the command in `package.json` as Bun and note the fallback in `tools/pipeline/README.md`.

- [ ] **Step 5: Add clustering to `categorise.ts`**

Add `import type { Category } from '../../../src/lib/core/types';` at the top of `tools/pipeline/lib/categorise.ts`, then append:

```ts
type RGB3 = [number, number, number];
const dist = (a: RGB3, b: RGB3) => Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2);
const hex = ([r, g, b]: RGB3) => '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0').toUpperCase()).join('');

export function clusterColours(colours: RGB3[], maxDist = 40): { rgb: RGB3; count: number }[] {
  const clusters: { sum: RGB3; count: number; rgb: RGB3 }[] = [];
  for (const c of colours) {
    const hit = clusters.find((k) => dist(k.rgb, c) <= maxDist);
    if (hit) {
      hit.sum = [hit.sum[0] + c[0], hit.sum[1] + c[1], hit.sum[2] + c[2]];
      hit.count++;
      hit.rgb = [Math.round(hit.sum[0] / hit.count), Math.round(hit.sum[1] / hit.count), Math.round(hit.sum[2] / hit.count)];
    } else clusters.push({ sum: [...c], count: 1, rgb: [...c] });
  }
  return clusters.map(({ rgb, count }) => ({ rgb, count })).sort((a, b) => b.count - a.count);
}

export function assignCategories(clusters: { rgb: RGB3 }[], existing: Record<string, RGB3>, maxDist = 60) {
  const categoryColours: Record<string, RGB3> = { ...existing };
  const created: Record<string, Category> = {};
  let n = 0;
  for (const { rgb } of clusters) {
    const near = Object.values(existing).some((c) => dist(c, rgb) <= maxDist);
    if (near) continue;
    const key = `cat${++n}`;
    categoryColours[key] = rgb;
    created[key] = { th: `หมวด ${n}`, en: `Category ${n}`, color: hex(rgb) };
  }
  return { categoryColours, created };
}
```

- [ ] **Step 6: Run the pure tests**

Run: `bun test tests/pipeline-read.test.ts tests/pipeline-categorise.test.ts`
Expected: PASS.

- [ ] **Step 7: Add `new`, `read` and `ocr-report` to the CLI**

Add these imports to `tools/pipeline/cli.ts`:

```ts
import { copyFileSync, mkdirSync } from 'node:fs';
import { extname } from 'node:path';
import { readCells } from './lib/read';
import { clusterColours, assignCategories } from './lib/categorise';
```

Add these functions above the command table:

```ts
const flag = (name: string) => {
  const k = process.argv.indexOf(`--${name}`);
  return k > 0 ? process.argv[k + 1] : undefined;
};

export async function read(id: string) {
  const p = eventPaths(id);
  const { event } = loadEvent(id);
  const img = await loadImage(p.plan);
  const t: Transform = readJson(p.registration);
  const cells: Cell[] = readJson(p.cells);
  console.log(`Reading ${cells.length} cells. This takes a minute or two.`);
  const reads = await readCells(img, cells, t, event.codePattern);
  writeJson(p.reads, reads);
  const flagged = reads.filter((r) => r.flags.length).length;
  console.log(`${reads.length - flagged} read cleanly, ${flagged} need review`);
}

export async function categorise(id: string) {
  const p = eventPaths(id);
  const cells: Cell[] = readJson(p.cells);
  const corrections = parseCorrections(readJson(p.corrections, EMPTY_CORRECTIONS));
  const { categoryColours, created } = assignCategories(clusterColours(cells.map((c) => c.rgb)), corrections.categoryColours);
  corrections.categoryColours = categoryColours;
  corrections.event = { ...corrections.event, categories: { ...(corrections.event?.categories ?? {}), ...created } };
  writeJson(p.corrections, corrections);
  console.log(`${Object.keys(created).length} new categories to name in review`);
}

export async function create(id: string) {
  const plan = flag('plan'), nameTh = flag('name-th'), nameEn = flag('name-en'), start = flag('start'), end = flag('end');
  const venue = flag('venue') ?? 'qsncc-lg-5-8';
  const missing = Object.entries({ plan, 'name-th': nameTh, 'name-en': nameEn, start, end }).filter(([, v]) => !v).map(([k]) => `--${k} is required`);
  if (missing.length) fail(missing);
  if (!existsSync(plan!)) fail([`plan file ${plan} does not exist`]);
  const p = eventPaths(id);
  if (existsSync(p.event)) fail([`events/${id} already exists. Pick a new id or run event:detect ${id}`]);
  loadVenue(venue);
  mkdirSync(p.source, { recursive: true });
  copyFileSync(plan!, `${p.source}/plan${extname(plan!).toLowerCase()}`);
  writeJson(p.event, EventSchema.parse({
    id, name: { th: nameTh, en: nameEn }, dates: { start, end }, venue,
    categories: {}, zones: {}, foyerZones: [], obstacles: [], landmarks: [], quickPicks: [],
  }));
  writeJson(p.booths, { booths: [], pillars: [] });
  writeJson(p.corrections, EMPTY_CORRECTIONS);
  await detect(id);
  await read(id);
  await categorise(id);
  console.log(`Next: bun run event:review ${id}, then bun run event:build ${id}`);
}

export async function ocrReport(id: string) {
  const p = eventPaths(id);
  const { booths } = loadEvent(id);
  const reads: Read[] = readJson(p.reads);
  let right = 0, wrong = 0, none = 0;
  for (const b of booths.booths) {
    const r = reads.find((x) => x.at[0] >= b.x && x.at[0] < b.x + b.w && x.at[1] >= b.y && x.at[1] < b.y + b.h);
    if (!r?.code) none++;
    else if (r.code === b.c) right++;
    else wrong++;
  }
  console.log(`right ${right}, wrong ${wrong}, unread ${none} of ${booths.booths.length}`);
}
```

Replace the command table with:

```ts
const commands: Record<string, (id: string) => Promise<unknown>> = { new: create, detect, read, categorise, build, 'ocr-report': ocrReport };
```

Add to `package.json` scripts:

```json
"event:new": "bun tools/pipeline/cli.ts new",
"event:read": "bun tools/pipeline/cli.ts read",
"event:ocr-report": "bun tools/pipeline/cli.ts ocr-report"
```

- [ ] **Step 8: Measure OCR on 2026 (manual, not in CI)**

Run: `bun run event:read bkkibf-2026 && bun run event:ocr-report bkkibf-2026`
Expected: a line like `right N, wrong M, unread K of 369`. Record the numbers in `tools/pipeline/README.md` (Task 19). There's no pass mark: OCR only suggests codes, and every flagged or unread cell goes through review. Delete the generated `events/bkkibf-2026/source/reads.json` afterwards, since the committed corrections already cover 2026.

- [ ] **Step 9: Commit**

```bash
git add tools tests package.json bun.lock
git commit -m "Add OCR read stage with consistency flags, colour clustering and event:new"
```

---

### Task 17: Review tool

**Files:**
- Create: `tools/pipeline/review/vite.config.ts`, `index.html`, `main.ts`, `App.svelte`, `api.ts`, `review.svelte.ts`, `status.ts`
- Modify: `tools/pipeline/cli.ts` (`review` command), `package.json` (`event:review`)
- Test: `tests/review-status.test.ts`

**Interfaces:**
- Consumes: `Corrections`, `parseCorrections` (Task 15); `Read` (Task 15); `Cell` (Task 14); `Transform`, `fitAxes`, `rectToVenue`, `toPlan` (Task 14); `eventPaths` (Task 14); `loadEvent` (Task 5); `createViewport` (Task 9).
- Produces:
  - `type CellStatus = 'code' | 'read' | 'flagged' | 'missing' | 'pillar' | 'drop'`
  - `cellStatus(rect: Rect, reads: Read[], c: Corrections): { status: CellStatus; code?: string; fix: number; read?: Read }`
  - `upsertFix(c: Corrections, rect: Rect, patch: Partial<Corrections['cells'][number]>): Corrections`
  - HTTP (dev only): `GET /api/state?id=`, `GET /api/plan?id=`, `GET /api/reference?id=`, `POST /api/corrections?id=`, `POST /api/registration?id=`
  - CLI: `bun run event:review <id>`

- [ ] **Step 1: Write the failing status test**

`tests/review-status.test.ts`:

```ts
import { test, expect } from 'bun:test';
import { cellStatus, upsertFix } from '../tools/pipeline/review/status';
import { EMPTY_CORRECTIONS } from '../tools/pipeline/lib/corrections';

const rect = { x: 0, y: 0, w: 30, h: 30 };
const read = (code: string | null, flags: string[] = []) => ({ at: [15, 15] as [number, number], text: code ?? '', conf: 90, code, flags });

test('status follows corrections first, then reads', () => {
  expect(cellStatus(rect, [], EMPTY_CORRECTIONS).status).toBe('missing');
  expect(cellStatus(rect, [read('A01')], EMPTY_CORRECTIONS).status).toBe('read');
  expect(cellStatus(rect, [read('A01', ['duplicate'])], EMPTY_CORRECTIONS).status).toBe('flagged');
  const c = upsertFix(EMPTY_CORRECTIONS, rect, { code: 'A02' });
  expect(cellStatus(rect, [read('A01', ['duplicate'])], c)).toMatchObject({ status: 'code', code: 'A02' });
  expect(cellStatus(rect, [], upsertFix(c, rect, { pillar: true, code: undefined })).status).toBe('pillar');
  expect(cellStatus(rect, [], upsertFix(c, rect, { drop: true })).status).toBe('drop');
});

test('upsertFix edits the existing fix for the cell instead of adding another', () => {
  const a = upsertFix(EMPTY_CORRECTIONS, rect, { code: 'A02' });
  const b = upsertFix(a, rect, { code: 'A03' });
  expect(b.cells.length).toBe(1);
  expect(b.cells[0].code).toBe('A03');
  expect(EMPTY_CORRECTIONS.cells.length).toBe(0);
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `bun test tests/review-status.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Write `status.ts`**

`tools/pipeline/review/status.ts`:

```ts
import type { Point, Rect } from '../../../src/lib/core/types';
import type { Corrections } from '../lib/corrections';
import type { Read } from '../lib/build';

export type CellStatus = 'code' | 'read' | 'flagged' | 'missing' | 'pillar' | 'drop';
const inside = ([x, y]: Point, r: Rect) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;

export function cellStatus(rect: Rect, reads: Read[], c: Corrections): { status: CellStatus; code?: string; fix: number; read?: Read } {
  const fix = c.cells.findIndex((f) => inside(f.at, rect));
  const f = fix >= 0 ? c.cells[fix] : undefined;
  const read = reads.find((r) => inside(r.at, rect));
  if (f?.drop) return { status: 'drop', fix, read };
  if (f?.pillar) return { status: 'pillar', fix, read };
  if (f?.code) return { status: 'code', code: f.code, fix, read };
  if (read?.code && !read.flags.length) return { status: 'read', code: read.code, fix, read };
  if (read?.code) return { status: 'flagged', code: read.code, fix, read };
  return { status: 'missing', fix, read };
}

export function upsertFix(c: Corrections, rect: Rect, patch: Partial<Corrections['cells'][number]>): Corrections {
  const k = c.cells.findIndex((f) => inside(f.at, rect));
  const at: Point = [rect.x + rect.w / 2, rect.y + rect.h / 2];
  const next = { ...(k >= 0 ? c.cells[k] : { at }), ...patch };
  for (const key of Object.keys(next) as (keyof typeof next)[]) if (next[key] === undefined) delete next[key];
  const cells = k >= 0 ? c.cells.map((f, j) => (j === k ? next : f)) : [...c.cells, next];
  return { ...c, cells };
}
```

- [ ] **Step 4: Run the status test**

Run: `bun test tests/review-status.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the dev-server API**

`tools/pipeline/review/api.ts`:

```ts
import { createReadStream, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Plugin } from 'vite';
import { loadEvent } from '../../../src/lib/server/catalog';
import { parseCorrections, EMPTY_CORRECTIONS } from '../lib/corrections';
import { eventPaths } from '../lib/paths';

const root = resolve(import.meta.dirname, '../../..');
const json = (path: string, fallback: unknown) => (existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : fallback);

export function reviewApi(): Plugin {
  return {
    name: 'review-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url ?? '/', 'http://local');
        if (!url.pathname.startsWith('/api/')) return next();
        const id = url.searchParams.get('id') ?? '';
        const send = (code: number, body: unknown, type = 'application/json') => {
          res.statusCode = code;
          res.setHeader('content-type', type);
          res.end(typeof body === 'string' ? body : JSON.stringify(body));
        };
        if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) return send(400, { error: 'Add ?id=<event-id> to the address' });
        const p = eventPaths(id, root);
        try {
          if (req.method === 'GET' && url.pathname === '/api/state') {
            return send(200, {
              bundle: loadEvent(id, root),
              cells: json(p.cells, []),
              reads: json(p.reads, []),
              corrections: json(p.corrections, EMPTY_CORRECTIONS),
              registration: json(p.registration, null),
            });
          }
          if (req.method === 'GET' && (url.pathname === '/api/plan' || url.pathname === '/api/reference')) {
            const file = url.pathname === '/api/plan' ? p.plan : resolve(root, 'venues', loadEvent(id, root).event.venue, 'reference.jpg');
            res.setHeader('content-type', file.endsWith('.png') ? 'image/png' : 'image/jpeg');
            return createReadStream(file).pipe(res);
          }
          if (req.method === 'POST') {
            const chunks: Buffer[] = [];
            for await (const ch of req) chunks.push(ch as Buffer);
            const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
            if (url.pathname === '/api/corrections') {
              writeFileSync(p.corrections, JSON.stringify(parseCorrections(body), null, 2) + '\n');
              return send(200, { ok: true });
            }
            if (url.pathname === '/api/registration') {
              const t = body as Record<string, unknown>;
              if (!['sx', 'sy', 'dx', 'dy'].every((k) => typeof t[k] === 'number')) return send(400, { error: 'Registration needs sx, sy, dx and dy' });
              writeFileSync(p.registration, JSON.stringify({ ...t, score: 1, method: 'manual' }, null, 2) + '\n');
              return send(200, { ok: true });
            }
          }
          send(404, { error: 'Unknown endpoint' });
        } catch (e) {
          send(400, { error: (e as Error).message });
        }
      });
    },
  };
}
```

- [ ] **Step 6: Write the Vite config and entry**

`tools/pipeline/review/vite.config.ts`:

```ts
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { reviewApi } from './api';

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [svelte(), reviewApi()],
  resolve: { alias: { $lib: fileURLToPath(new URL('../../../src/lib', import.meta.url)) } },
  server: { port: 5190, open: `/?id=${process.env.EVENT_ID ?? ''}`, fs: { allow: [fileURLToPath(new URL('../../..', import.meta.url))] } },
});
```

`tools/pipeline/review/index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Review plan</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="./main.ts"></script>
  </body>
</html>
```

`tools/pipeline/review/main.ts`:

```ts
import { mount } from 'svelte';
import '$lib/styles/app.css';
import App from './App.svelte';

mount(App, { target: document.getElementById('app')! });
```

- [ ] **Step 7: Write the review state**

`tools/pipeline/review/review.svelte.ts`:

```ts
import { loadData } from '$lib/core/prepare';
import type { EventData, Landmark, Obstacle, FoyerZone, Point, Rect } from '$lib/core/types';
import type { EventBundle } from '$lib/server/catalog';
import type { Cell } from '../lib/detect';
import type { Read } from '../lib/build';
import type { Corrections } from '../lib/corrections';
import { IDENTITY, fitAxes, rectToVenue, toPlan, type Transform } from '../lib/register';
import { cellStatus, upsertFix, type CellStatus } from './status';

export type Mode = 'select' | 'booth' | 'stage' | 'info' | 'foyer' | 'landmark' | 'register';
export type Selection = { kind: 'cell'; index: number } | { kind: 'add'; index: number } | { kind: 'landmark'; index: number } | null;

export class Review {
  id: string;
  data = $state<EventData | null>(null);
  cells = $state<Cell[]>([]);
  reads = $state<Read[]>([]);
  corrections = $state<Corrections>({ cells: [], add: [], categoryColours: {} });
  t = $state<Transform>(IDENTITY);
  mode = $state<Mode>('select');
  selection = $state<Selection>(null);
  message = $state('');
  dirty = $state(false);
  pairs = $state<{ plan: Point; venue: Point }[]>([]);
  pendingPlan = $state<Point | null>(null);
  showReference = $state(false);
  planSize = $state({ w: 0, h: 0 });

  venueCells = $derived(this.cells.map((c) => rectToVenue(this.t, c)));
  statuses = $derived(this.venueCells.map((r) => cellStatus(r, this.reads, this.corrections)));
  problems = $derived(this.statuses.map((s, k) => ({ s, k })).filter(({ s }) => s.status === 'missing' || s.status === 'flagged').map(({ k }) => k));

  constructor(id: string) {
    this.id = id;
  }

  async load() {
    const r = await fetch(`/api/state?id=${this.id}`);
    const body = await r.json();
    if (!r.ok) { this.message = body.error; return; }
    const bundle: EventBundle = body.bundle;
    this.data = loadData(bundle);
    this.cells = body.cells;
    this.reads = body.reads;
    this.corrections = body.corrections;
    this.t = body.registration ?? IDENTITY;
    const img = new Image();
    img.src = `/api/plan?id=${this.id}`;
    await img.decode();
    this.planSize = { w: img.naturalWidth, h: img.naturalHeight };
    this.dirty = false;
    this.message = `${this.cells.length} cells, ${this.problems.length} to check`;
  }

  async save() {
    const r = await fetch(`/api/corrections?id=${this.id}`, { method: 'POST', body: JSON.stringify(this.corrections) });
    const body = await r.json();
    this.message = r.ok ? 'Saved. Run event:build when every cell is resolved.' : body.error;
    if (r.ok) this.dirty = false;
  }

  status(k: number): CellStatus {
    return this.statuses[k].status;
  }

  fixCell(k: number, patch: Partial<Corrections['cells'][number]>) {
    this.corrections = upsertFix(this.corrections, this.venueCells[k], patch);
    this.dirty = true;
  }

  nextProblem() {
    const cur = this.selection?.kind === 'cell' ? this.selection.index : -1;
    const next = this.problems.find((k) => k > cur) ?? this.problems[0];
    if (next !== undefined) this.selection = { kind: 'cell', index: next };
  }

  addRect(r: Rect) {
    const ev = { ...(this.corrections.event ?? {}) };
    if (this.mode === 'booth') {
      this.corrections = { ...this.corrections, add: [...this.corrections.add, { code: '', rect: r }] };
      this.selection = { kind: 'add', index: this.corrections.add.length - 1 };
    } else if (this.mode === 'stage' || this.mode === 'info') {
      const o: Obstacle = { ...r, kind: this.mode };
      this.corrections = { ...this.corrections, event: { ...ev, obstacles: [...(ev.obstacles ?? this.data!.event.obstacles), o] } };
    } else if (this.mode === 'foyer') {
      const z: FoyerZone = { ...r, c: `U${String((ev.foyerZones ?? this.data!.event.foyerZones).length + 1).padStart(2, '0')}` };
      this.corrections = { ...this.corrections, event: { ...ev, foyerZones: [...(ev.foyerZones ?? this.data!.event.foyerZones), z] } };
    }
    this.dirty = true;
  }

  addLandmark([x, y]: Point) {
    const ev = { ...(this.corrections.event ?? {}) };
    const list = ev.landmarks ?? this.data!.event.landmarks;
    const lm: Landmark = { id: `place${list.length + 1}`, group: 'other', icon: 'info', x: Math.round(x), y: Math.round(y), th: 'จุดใหม่', en: 'New place' };
    this.corrections = { ...this.corrections, event: { ...ev, landmarks: [...list, lm] } };
    this.selection = { kind: 'landmark', index: list.length };
    this.dirty = true;
  }

  registerClick(p: Point) {
    if (!this.showReference) {
      this.pendingPlan = toPlan(this.t, p);
      this.showReference = true;
      this.message = 'Now click the same corner on the venue reference.';
    } else if (this.pendingPlan) {
      this.pairs = [...this.pairs, { plan: this.pendingPlan, venue: p }];
      this.pendingPlan = null;
      this.showReference = false;
      this.message = `${this.pairs.length} pair(s). Add at least two, far apart, then apply.`;
    }
  }

  async applyRegistration() {
    const t = fitAxes(this.pairs);
    const r = await fetch(`/api/registration?id=${this.id}`, { method: 'POST', body: JSON.stringify(t) });
    this.message = r.ok ? 'Registration saved. Run event:detect again, then reload.' : (await r.json()).error;
    this.pairs = [];
  }
}
```

- [ ] **Step 8: Write the review app**

`tools/pipeline/review/App.svelte`:

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import { createViewport, type Viewport } from '$lib/map/viewport';
  import { GROUP_ORDER, ICON_NAMES, type Point, type Rect } from '$lib/core/types';
  import { Review, type Mode } from './review.svelte';

  const r = new Review(new URLSearchParams(location.search).get('id') ?? '');
  let svg: SVGSVGElement;
  let vp: Viewport | null = null;
  let drag = $state<{ a: Point; b: Point } | null>(null);
  const COLOURS = { code: '#2E9E5B', read: '#7FC98F', flagged: '#F2A900', missing: '#D64545', pillar: '#2F7FD1', drop: '#888' };
  const MODES: [Mode, string][] = [['select', 'Select'], ['booth', 'Add booth'], ['stage', 'Stage'], ['info', 'Info desk'], ['foyer', 'Foyer zone'], ['landmark', 'Landmark'], ['register', 'Register']];

  const toMap = (e: PointerEvent): Point => {
    const p = svg.createSVGPoint();
    p.x = e.clientX; p.y = e.clientY;
    const q = p.matrixTransform(svg.getScreenCTM()!.inverse());
    return [q.x, q.y];
  };
  const rectOf = (d: { a: Point; b: Point }): Rect => ({
    x: Math.round(Math.min(d.a[0], d.b[0])), y: Math.round(Math.min(d.a[1], d.b[1])),
    w: Math.round(Math.abs(d.a[0] - d.b[0])), h: Math.round(Math.abs(d.a[1] - d.b[1])),
  });
  function down(e: PointerEvent) {
    e.stopPropagation();
    const p = toMap(e);
    if (r.mode === 'landmark') r.addLandmark(p);
    else if (r.mode === 'register') r.registerClick(p);
    else drag = { a: p, b: p };
  }
  function move(e: PointerEvent) { if (drag) { e.stopPropagation(); drag = { ...drag, b: toMap(e) }; } }
  function up(e: PointerEvent) {
    if (!drag) return;
    e.stopPropagation();
    const rect = rectOf(drag);
    drag = null;
    if (rect.w > 4 && rect.h > 4) r.addRect(rect);
  }

  onMount(() => {
    r.load().then(() => {
      if (!r.data) return;
      vp = createViewport(svg, r.data.venue, (target) => {
        const k = target?.closest('[data-cell]')?.getAttribute('data-cell');
        const a = target?.closest('[data-add]')?.getAttribute('data-add');
        if (k) r.selection = { kind: 'cell', index: Number(k) };
        else if (a) r.selection = { kind: 'add', index: Number(a) };
      });
      vp.fitAll();
    });
    const key = (e: KeyboardEvent) => { if (e.key === 'n' && !(e.target instanceof HTMLInputElement)) r.nextProblem(); };
    addEventListener('keydown', key);
    return () => { removeEventListener('keydown', key); vp?.destroy(); };
  });

  const sel = $derived(r.selection);
  const landmarks = $derived(r.corrections.event?.landmarks ?? r.data?.event.landmarks ?? []);
  const categories = $derived({ ...(r.data?.event.categories ?? {}), ...(r.corrections.event?.categories ?? {}) });
</script>

<div class="review">
  <header>
    <b>{r.data?.event.name.en ?? r.id}</b>
    {#each MODES as [m, label] (m)}
      <button type="button" aria-pressed={r.mode === m} onclick={() => (r.mode = m)}>{label}</button>
    {/each}
    <span>{r.problems.length} to check · press n for next</span>
    <button type="button" onclick={() => r.save()} disabled={!r.dirty}>Save</button>
    <span class="msg" role="status">{r.message}</span>
  </header>

  <svg bind:this={svg} class="rmap" xmlns="http://www.w3.org/2000/svg">
    {#if r.data}
      <image href="/api/reference?id={r.id}" x="0" y="0" width={r.data.venue.reference.width} height={r.data.venue.reference.height}
        preserveAspectRatio="none" opacity={r.showReference ? 1 : 0} />
      <image href="/api/plan?id={r.id}" x={r.t.dx} y={r.t.dy} width={r.planSize.w * r.t.sx} height={r.planSize.h * r.t.sy}
        preserveAspectRatio="none" opacity={r.showReference ? 0 : 0.9} />
      {#each r.data.venue.walls as w, k (k)}
        <path d={'M' + w.map((p) => p.join(',')).join('L') + 'Z'} fill="none" stroke="#13306B" stroke-width="3" />
      {/each}
      {#each r.venueCells as c, k (k)}
        <rect data-cell={k} x={c.x} y={c.y} width={c.w} height={c.h} fill={COLOURS[r.status(k)]} fill-opacity="0.35"
          stroke={sel?.kind === 'cell' && sel.index === k ? '#000' : COLOURS[r.status(k)]} stroke-width={sel?.kind === 'cell' && sel.index === k ? 3 : 1} />
      {/each}
      {#each r.corrections.add as a, k (k)}
        <rect data-add={k} x={a.rect.x} y={a.rect.y} width={a.rect.w} height={a.rect.h} fill="#8E44AD" fill-opacity="0.4" stroke="#8E44AD" />
      {/each}
      {#each landmarks as l (l.id)}
        <circle cx={l.x} cy={l.y} r="8" fill="#13306B" />
      {/each}
      {#if drag}
        {@const d = rectOf(drag)}
        <rect x={d.x} y={d.y} width={d.w} height={d.h} fill="none" stroke="#000" stroke-dasharray="4 3" />
      {/if}
      {#if r.mode !== 'select'}
        <rect x={r.data.venue.view.x} y={r.data.venue.view.y} width={r.data.venue.view.w} height={r.data.venue.view.h} fill="transparent"
          onpointerdown={down} onpointermove={move} onpointerup={up} role="presentation" />
      {/if}
    {/if}
  </svg>

  <aside>
    {#if sel?.kind === 'cell'}
      {@const st = r.statuses[sel.index]}
      <h2>Cell {sel.index}</h2>
      <p>Status: {st.status}{st.read ? ` · OCR "${st.read.text}" (${Math.round(st.read.conf)}%) ${st.read.flags.join(', ')}` : ''}</p>
      <label>Code <input value={st.code ?? ''} onchange={(e) => r.fixCell(sel.index, { code: e.currentTarget.value.trim().toUpperCase() || undefined, pillar: undefined, drop: undefined })} /></label>
      <label><input type="checkbox" checked={st.status === 'pillar'} onchange={(e) => r.fixCell(sel.index, { pillar: e.currentTarget.checked || undefined, code: undefined, drop: undefined })} /> Pillar</label>
      <label><input type="checkbox" checked={st.status === 'drop'} onchange={(e) => r.fixCell(sel.index, { drop: e.currentTarget.checked || undefined })} /> Not a booth</label>
      {#if st.code}
        {@const z = r.corrections.event?.zones?.[st.code] ?? r.data?.event.zones[st.code]}
        <h3>Zone name (optional)</h3>
        {#each ['th', 'en', 'short'] as f (f)}
          <label>{f} <input value={(z as Record<string, string> | undefined)?.[f] ?? ''} onchange={(e) => {
            const ev = r.corrections.event ?? {};
            const zones = { ...(r.data?.event.zones ?? {}), ...(ev.zones ?? {}) };
            zones[st.code!] = { th: '', en: '', ...zones[st.code!], [f]: e.currentTarget.value };
            r.corrections = { ...r.corrections, event: { ...ev, zones } };
            r.dirty = true;
          }} /></label>
        {/each}
      {/if}
    {:else if sel?.kind === 'add'}
      {@const a = r.corrections.add[sel.index]}
      <h2>Added booth</h2>
      <label>Code <input value={a.code} onchange={(e) => { r.corrections.add[sel.index] = { ...a, code: e.currentTarget.value.trim().toUpperCase() }; r.dirty = true; }} /></label>
      <button type="button" onclick={() => { r.corrections = { ...r.corrections, add: r.corrections.add.filter((_, k) => k !== sel.index) }; r.selection = null; r.dirty = true; }}>Delete</button>
    {:else if sel?.kind === 'landmark'}
      {@const l = landmarks[sel.index]}
      <h2>Landmark</h2>
      {#each ['id', 'th', 'en'] as f (f)}
        <label>{f} <input value={l[f as 'id']} onchange={(e) => {
          const list = landmarks.map((x, k) => (k === sel.index ? { ...x, [f]: e.currentTarget.value } : x));
          r.corrections = { ...r.corrections, event: { ...(r.corrections.event ?? {}), landmarks: list } };
          r.dirty = true;
        }} /></label>
      {/each}
      <label>Group <select value={l.group} onchange={(e) => {
        const list = landmarks.map((x, k) => (k === sel.index ? { ...x, group: e.currentTarget.value as typeof l.group } : x));
        r.corrections = { ...r.corrections, event: { ...(r.corrections.event ?? {}), landmarks: list } };
        r.dirty = true;
      }}>{#each GROUP_ORDER as g (g)}<option value={g}>{g}</option>{/each}</select></label>
      <label>Icon <select value={l.icon} onchange={(e) => {
        const list = landmarks.map((x, k) => (k === sel.index ? { ...x, icon: e.currentTarget.value as typeof l.icon } : x));
        r.corrections = { ...r.corrections, event: { ...(r.corrections.event ?? {}), landmarks: list } };
        r.dirty = true;
      }}>{#each ICON_NAMES as i (i)}<option value={i}>{i}</option>{/each}</select></label>
    {:else if r.mode === 'register'}
      <h2>Register</h2>
      <p>Click a wall corner on the plan, then the same corner on the venue reference. Repeat for a far corner.</p>
      <p>{r.pairs.length} pair(s)</p>
      <button type="button" disabled={r.pairs.length < 2} onclick={() => r.applyRegistration()}>Apply</button>
    {:else}
      <h2>Categories</h2>
      {#each Object.entries(categories) as [key, c] (key)}
        <div class="cat"><span class="sw" style:background={c.color}></span>{key}
          <input aria-label="{key} Thai name" value={c.th} onchange={(e) => {
            const ev = r.corrections.event ?? {};
            r.corrections = { ...r.corrections, event: { ...ev, categories: { ...categories, [key]: { ...c, th: e.currentTarget.value } } } };
            r.dirty = true;
          }} />
          <input aria-label="{key} English name" value={c.en} onchange={(e) => {
            const ev = r.corrections.event ?? {};
            r.corrections = { ...r.corrections, event: { ...ev, categories: { ...categories, [key]: { ...c, en: e.currentTarget.value } } } };
            r.dirty = true;
          }} />
        </div>
      {/each}
    {/if}
  </aside>
</div>

<style>
  .review { display: grid; grid-template: auto 1fr / 1fr 340px; height: 100vh; }
  header { grid-column: 1 / -1; display: flex; gap: 8px; align-items: center; padding: 8px; background: #13306B; color: #fff; flex-wrap: wrap; }
  header button[aria-pressed='true'] { background: #FFD23F; }
  .rmap { width: 100%; height: 100%; background: #eee; touch-action: none; }
  aside { overflow: auto; padding: 12px; border-left: 1px solid #ccc; display: flex; flex-direction: column; gap: 8px; }
  label { display: flex; gap: 6px; align-items: center; }
  .msg { margin-left: auto; }
  .cat { display: grid; grid-template-columns: 14px 60px 1fr 1fr; gap: 6px; align-items: center; }
</style>
```

The plan image is drawn in venue space: its position and size follow the registration transform, so cells line up with it.

- [ ] **Step 9: Add the `review` command**

Add to `tools/pipeline/cli.ts`:

```ts
import { spawn } from 'node:child_process';

export async function review(id: string) {
  loadEvent(id);
  if (!existsSync(eventPaths(id).cells)) fail([`Run bun run event:detect ${id} first`]);
  const child = spawn('bunx', ['vite', '--config', 'tools/pipeline/review/vite.config.ts'], { stdio: 'inherit', env: { ...process.env, EVENT_ID: id } });
  await new Promise((resolve) => child.on('exit', resolve));
}
```

Add `review` to the command table. Add to `package.json` scripts: `"event:review": "bun tools/pipeline/cli.ts review"`.

- [ ] **Step 10: Try it on 2026**

Run: `bun run event:review bkkibf-2026`
Expected: the browser opens at `http://localhost:5190/?id=bkkibf-2026`, and the plan shows under the venue walls with every cell coloured (green, blue or grey, since 2026 is fully corrected). Check each of these:
- clicking a cell shows its status
- changing a code and saving writes `events/bkkibf-2026/source/corrections.json`
- `n` jumps to the next problem cell

Revert the test edit with `git checkout events/bkkibf-2026/source/corrections.json`.

- [ ] **Step 11: Commit**

```bash
git add tools tests package.json
git commit -m "Add plan review tool with cell fixes, drawing, landmarks and registration"
```

---

### Task 18: Exhibitor import

**Files:**
- Create: `tools/pipeline/lib/exhibitors.ts`
- Modify: `tools/pipeline/cli.ts` (`exhibitors` command), `package.json` (`event:exhibitors`)
- Test: `tests/exhibitors.test.ts`

**Interfaces:**
- Consumes: `parseCSV`, `normCode` (Task 5); `loadEvent` (Task 5).
- Produces:
  - `type ColumnMap = { booth: string; th?: string; en?: string }`
  - `guessColumns(headers: string[]): ColumnMap | null`
  - `parseMap(arg: string): ColumnMap` (`booth=Col,th=Col,en=Col`)
  - `expandCodes(cell: string, known: Set<string>): { codes: string[]; unknown: string[] }`
  - `toExhibitorRows(rows: Record<string, string>[], map: ColumnMap, known: Set<string>): { rows: { booth: string; name_th: string; name_en: string }[]; unknown: string[] }`
  - `readSheet(path: string): Promise<Record<string, string>[]>`
  - `toCsv(rows: { booth: string; name_th: string; name_en: string }[]): string`

- [ ] **Step 1: Install the spreadsheet reader**

```bash
bun add -d read-excel-file
```

- [ ] **Step 2: Write the failing test**

`tests/exhibitors.test.ts`:

```ts
import { test, expect } from 'bun:test';
import { parseCSV } from '../src/lib/core/csv';
import { expandCodes, guessColumns, parseMap, toCsv, toExhibitorRows } from '../tools/pipeline/lib/exhibitors';

const known = new Set(['K16', 'K17', 'K18', 'K20', 'A01']);

test('guesses Thai and English headers', () => {
  expect(guessColumns(['บูธ', 'ชื่อ', 'Name (EN)'])).toEqual({ booth: 'บูธ', th: 'ชื่อ', en: 'Name (EN)' });
  expect(guessColumns(['Booth No.', 'Publisher (TH)', 'Publisher (EN)'])).toEqual({ booth: 'Booth No.', th: 'Publisher (TH)', en: 'Publisher (EN)' });
  expect(guessColumns(['foo', 'bar'])).toBeNull();
});

test('expands lists and en dash ranges, keeping only codes on the map for ranges', () => {
  expect(expandCodes('K16–K20', known)).toEqual({ codes: ['K16', 'K17', 'K18', 'K20'], unknown: [] });
  expect(expandCodes('k16, k18', known)).toEqual({ codes: ['K16', 'K18'], unknown: [] });
  expect(expandCodes('K16 - 18', known)).toEqual({ codes: ['K16', 'K17', 'K18'], unknown: [] });
  expect(expandCodes('Z99', known)).toEqual({ codes: [], unknown: ['Z99'] });
});

test('builds rows from a BOM CSV with Thai headers', () => {
  const rows = parseCSV('﻿บูธ,ชื่อ,ชื่ออังกฤษ\nK16–K18,สำนักพิมพ์ก,Pub A\nA1,สำนักพิมพ์ข,\n');
  const map = guessColumns(Object.keys(rows[0]))!;
  const out = toExhibitorRows(rows, map, known);
  expect(out.unknown).toEqual([]);
  expect(out.rows.map((r) => r.booth)).toEqual(['K16', 'K17', 'K18', 'A01']);
  expect(toCsv(out.rows).split('\n')[0]).toBe('booth,name_th,name_en');
});

test('parseMap reads the override flag', () => {
  expect(parseMap('booth=Stand,th=ชื่อ,en=Name')).toEqual({ booth: 'Stand', th: 'ชื่อ', en: 'Name' });
});

test('names with commas and quotes survive the CSV round trip', () => {
  const csv = toCsv([{ booth: 'A01', name_th: 'ก "ข"', name_en: 'Pub, Inc.' }]);
  expect(parseCSV(csv)).toEqual([{ booth: 'A01', name_th: 'ก "ข"', name_en: 'Pub, Inc.' }]);
});
```

`parseCSV` lowercases header keys, so `guessColumns` receives lowercase headers from CSV input and original-case headers from XLSX input. It must match case-insensitively and return the header exactly as given.

- [ ] **Step 3: Run it to see it fail**

Run: `bun test tests/exhibitors.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 4: Write `exhibitors.ts`**

`tools/pipeline/lib/exhibitors.ts`:

```ts
import { readFileSync } from 'node:fs';
import { parseCSV } from '../../../src/lib/core/csv';
import { normCode } from '../../../src/lib/core/codes';

export type ColumnMap = { booth: string; th?: string; en?: string };

const BOOTH = /^(booth|booths|booth ?no\.?|booth number|stand|code|บูธ|เลขบูธ|หมายเลขบูธ)$/i;
const EN = /(english|name.?\(?en\)?|\(en\)|ชื่อ.*อังกฤษ|^en$|^name$)/i;
const TH = /(thai|name.?\(?th\)?|\(th\)|ชื่อ.*ไทย|^th$|^ชื่อ$|ชื่อสำนักพิมพ์)/i;

export function guessColumns(headers: string[]): ColumnMap | null {
  const clean = headers.map((h) => h.replace(/^﻿/, '').trim());
  const booth = clean.find((h) => BOOTH.test(h));
  if (!booth) return null;
  const en = clean.find((h) => h !== booth && EN.test(h));
  const th = clean.find((h) => h !== booth && h !== en && TH.test(h));
  if (!th && !en) return null;
  return { booth, ...(th ? { th } : {}), ...(en ? { en } : {}) };
}

export function parseMap(arg: string): ColumnMap {
  const m = Object.fromEntries(arg.split(',').map((kv) => kv.split('=').map((s) => s.trim())));
  if (!m.booth) throw new Error('--map needs booth=<column>');
  return { booth: m.booth, ...(m.th ? { th: m.th } : {}), ...(m.en ? { en: m.en } : {}) };
}

export function expandCodes(cell: string, known: Set<string>): { codes: string[]; unknown: string[] } {
  const text = cell.toUpperCase().replace(/[–—]/g, '-').replace(/\s*-\s*/g, '-');
  const codes: string[] = [], unknown: string[] = [];
  for (const token of text.split(/[\s,;/]+/).filter(Boolean)) {
    const range = /^([A-Z])(\d{1,2})-([A-Z])?(\d{1,2})$/.exec(token);
    if (range && (!range[3] || range[3] === range[1])) {
      const [a, b] = [Number(range[2]), Number(range[4])].sort((x, y) => x - y);
      for (let n = a; n <= b; n++) {
        const c = normCode(`${range[1]}${n}`);
        if (known.has(c)) codes.push(c);
      }
      continue;
    }
    const c = normCode(token);
    (known.has(c) ? codes : unknown).push(c);
  }
  return { codes, unknown };
}

export function toExhibitorRows(rows: Record<string, string>[], map: ColumnMap, known: Set<string>) {
  const out: { booth: string; name_th: string; name_en: string }[] = [], unknown = new Set<string>();
  const get = (r: Record<string, string>, col?: string) => {
    if (!col) return '';
    const key = Object.keys(r).find((k) => k.toLowerCase() === col.toLowerCase());
    return key ? String(r[key] ?? '').trim() : '';
  };
  for (const r of rows) {
    const th = get(r, map.th), en = get(r, map.en);
    if (!th && !en) continue;
    const { codes, unknown: bad } = expandCodes(get(r, map.booth), known);
    bad.forEach((b) => unknown.add(b));
    for (const booth of codes) out.push({ booth, name_th: th, name_en: en });
  }
  return { rows: out, unknown: [...unknown] };
}

export async function readSheet(path: string): Promise<Record<string, string>[]> {
  if (/\.csv$/i.test(path)) return parseCSV(readFileSync(path, 'utf8'));
  const { default: readXlsx } = await import('read-excel-file/node');
  const [head, ...body] = await readXlsx(path);
  const keys = head.map((h) => String(h ?? '').trim());
  return body.map((row) => Object.fromEntries(keys.map((k, i) => [k, row[i] == null ? '' : String(row[i])])));
}

const q = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

export const toCsv = (rows: { booth: string; name_th: string; name_en: string }[]) =>
  ['booth,name_th,name_en', ...rows.map((r) => [r.booth, r.name_th, r.name_en].map(q).join(','))].join('\n') + '\n';
```

- [ ] **Step 5: Run the test**

Run: `bun test tests/exhibitors.test.ts`
Expected: PASS.

- [ ] **Step 6: Add the CLI command**

Add to `tools/pipeline/cli.ts`:

```ts
import { guessColumns, parseMap, readSheet, toCsv, toExhibitorRows } from './lib/exhibitors';

export async function exhibitors(id: string) {
  const file = process.argv[4];
  if (!file || !existsSync(file)) fail([`usage: bun run event:exhibitors ${id} <file.csv|file.xlsx> [--map booth=Col,th=Col,en=Col]`]);
  const rows = await readSheet(file);
  if (!rows.length) fail([`${file} has no rows`]);
  const mapArg = flag('map');
  const map = mapArg ? parseMap(mapArg) : guessColumns(Object.keys(rows[0]));
  if (!map) fail([`Couldn't find the booth and name columns in: ${Object.keys(rows[0]).join(', ')}. Pass --map booth=<col>,th=<col>,en=<col>`]);
  const data = loadData(loadEvent(id));
  const out = toExhibitorRows(rows, map!, new Set(Object.keys(data.byCode)));
  if (out.unknown.length) fail([`booth codes not on the map: ${out.unknown.join(', ')}. Fix the spreadsheet or the map, then run again`]);
  writeFileSync(eventPaths(id).exhibitors, toCsv(out.rows));
  console.log(`${out.rows.length} exhibitor rows written using columns ${JSON.stringify(map)}`);
}
```

Add `exhibitors` to the command table and `"event:exhibitors": "bun tools/pipeline/cli.ts exhibitors"` to `package.json`.

- [ ] **Step 7: Commit**

```bash
git add tools tests package.json bun.lock
git commit -m "Add exhibitor import from CSV or XLSX with column guessing and range expansion"
```

---

### Task 19: Retire v1, build smoke test, docs, and switch production

**Files:**
- Delete: `legacy/`, `tools/digitize/`, `tools/migrate/`, `tools/golden/`
- Keep: `tests/golden/v1.json` (it still pins behaviour)
- Create: `tests/build.test.ts`
- Modify: `package.json`, `tsconfig.json`, `.oxlintrc.json`, `.oxfmtrc.json`, `.gitignore`, `.editorconfig`, `.github/workflows/ci.yml`
- Replace: `README.md`, `CLAUDE.md`
- Create: `tools/pipeline/README.md`

**Interfaces:**
- Consumes: everything.
- Produces: a `v2` branch ready to merge. Production build settings don't change.

- [ ] **Step 1: Write the build smoke test**

`tests/build.test.ts`:

```ts
import { test, expect } from 'bun:test';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const built = existsSync('_site/index.html');
const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? walk(join(dir, f)) : [join(dir, f)]));

test.skipIf(!built)('pages exist for the list, the event and 404', () => {
  for (const f of ['_site/index.html', '_site/e/bkkibf-2026/index.html', '_site/404.html']) expect(existsSync(f)).toBe(true);
});

test.skipIf(!built)('no source material or tooling is published', () => {
  const files = walk('_site');
  const leaked = files.filter((f) => /reference\.jpg|plan\.(jpe?g|png)|corrections\.json|cells\.json|reads\.json|detect\.json|registration\.json|\/tools\//.test(f));
  expect(leaked).toEqual([]);
});

test.skipIf(!built)('Zod is not in the client bundle', () => {
  const js = walk('_site/_app').filter((f) => f.endsWith('.js'));
  expect(js.filter((f) => readFileSync(f, 'utf8').includes('ZodError'))).toEqual([]);
});
```

- [ ] **Step 2: Run it**

Run: `bun run build && bun test tests/build.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 3: Delete v1 and the one-off tools**

```bash
git rm -r legacy tools/digitize tools/migrate tools/golden
```

Then clean up the config that pointed at them:
- `package.json`: remove the `legacy:test` script.
- `tsconfig.json`: set `"exclude": ["_site", "node_modules"]`.
- `.oxlintrc.json`: set `"ignorePatterns": ["_site/**", ".svelte-kit/**"]`.
- `.oxfmtrc.json`: set `"ignorePatterns": ["_site/**", ".svelte-kit/**", "tests/golden/**", "events/**/booths.json"]`.
- `.gitignore`: remove the `tools/digitize/out/`, `__pycache__/` and `.venv/` lines. Keep `_site/`.
- `.editorconfig`: remove the `[*.py]` section.

- [ ] **Step 4: Run CI locally in CI order**

Update `.github/workflows/ci.yml` so `build` runs before `test` (the smoke test needs `_site/`):

```yaml
      - run: bun run lint
      - run: bun run fmt:check
      - run: bun run check
      - run: bun run build
      - run: bun run test
```

Run: `bun run lint && bun run fmt:check && bun run check && bun run build && bun run test && bun run test:e2e`
Expected: all pass.

- [ ] **Step 5: Write `README.md`**

````markdown
# Booth Finder

A mobile-first booth finder for events at a venue. Guests search for a booth, exhibitor or place, pick where they are, and get a walking route on the floor plan with distance, time and written steps, in Thai and English.

It is a static site built with SvelteKit and Bun. Every event gets its own page at `/e/<event-id>/`, and `/` lists all events.

## Run it

```bash
bun install
bun run dev          # http://localhost:5173
```

## Check it

```bash
bun run lint && bun run fmt:check && bun run check
bun run build && bun run test
bun run test:e2e     # Playwright, needs: bunx playwright install chromium
```

## Add an event

Events live in `events/<event-id>/`. The id appears in URLs and printed QR codes, so never rename one.

1. Get the floor plan image and, if there is one, the exhibitor spreadsheet from the organiser.
2. Create the event and run the automatic stages:
   ```bash
   bun run event:new book-fair-2027 --plan ~/Downloads/plan.jpg \
     --name-th "…" --name-en "…" --start 2027-03-25 --end 2027-04-05
   ```
3. Review what the pipeline found, fix codes, and add the stage, info desks, foyer zones and landmarks:
   ```bash
   bun run event:review book-fair-2027
   ```
4. Build the event files and check them:
   ```bash
   bun run event:build book-fair-2027
   bun run test
   ```
5. Import exhibitors (CSV or XLSX):
   ```bash
   bun run event:exhibitors book-fair-2027 ~/Downloads/exhibitors.xlsx
   ```

`tools/pipeline/README.md` explains each stage.

## Add a venue

Venues live in `venues/<venue-id>/`: a `venue.json` and a `reference.jpg` whose pixels define the venue's coordinate space. Write `venue.json` by hand against the reference image (see `venues/qsncc-lg-5-8/venue.json`), then run `bun run test`. The venue tests check that doors sit on walls, areas don't overlap and every venue landmark is reachable.

## Share links and QR codes

```
https://<site>/e/<event-id>/#to=K16&from=door6
```

`to` takes a booth code or place id, `from` a place id, and `n=1` picks the second booth when a code appears twice. Print a QR code for `#from=<place-id>` at each door or information desk. Old links without `/e/<id>/` open the 2026 book fair.

## Deploy

Cloudflare Pages builds `main` through its Git integration. Build command `npm run build`, output directory `_site`. The build image installs dependencies from `bun.lock`.

## Credits

The 2026 floor plan belongs to the Publishers and Booksellers Association of Thailand (PUBAT). Check permission before publishing plan images.
````

- [ ] **Step 6: Write `CLAUDE.md`**

````markdown
# CLAUDE.md

Handover notes for Claude Code (and humans) working on this repo.

## What this is

A bilingual (Thai default, English) mobile-first booth finder for events at a venue. Guests search, pick a start point and get a walking route on an SVG floor plan. Users are visitors on phones in crowded halls on weak mobile data: keep it fast, legible and one-handed.

## Commands

```bash
bun run dev            # vite dev server
bun run build          # static site into _site/
bun run test           # bun test (unit, golden parity, per-event and per-venue checks, build smoke)
bun run test:e2e       # Playwright against the built site
bun run lint / fmt / fmt:check / check
bun run event:new|detect|read|review|build|exhibitors|ocr-report <event-id>
```

Run `bun run test` after any change to `venues/`, `events/`, `src/lib/core/` or `src/lib/i18n/`.

## Layout

```
venues/<id>/venue.json + reference.jpg   fixed geometry: walls, floor, areas, doors, venue landmarks
events/<id>/event.json, booths.json, exhibitors.csv, source/   per-event content; source/ is pipeline input, never published
src/lib/core/        pure TS: types, geometry, grid, routing, search, directions, prepare, hash, status, panzoom
src/lib/server/      Zod schemas and the catalog loader (build time only)
src/lib/i18n/        app strings and language state
src/lib/map/         FloorMap and its layers, viewport gestures
src/lib/ui/          sheet, search, results, card, start picker, header, event card
src/routes/          / (event list), /e/[id]/ (finder), +error
tools/pipeline/      ingestion CLI and the review tool
tests/               bun tests, golden v1 snapshot, e2e
```

Keep `src/lib/core/` free of DOM, Svelte and Zod. Zod must never reach the client bundle (a build test checks this).

## Venue vs event

A venue is the building: walls, walkable floor, named areas (halls), doors, scale, time zone, toilets and entrances. An event is what is set up inside it: booths, pillars, categories, zones, stage and info desks, foyer zones, aisle letters, event landmarks, quick picks and wording overrides. Landmark ids share one namespace across both and are never renamed.

## Coordinates

Each venue uses pixels of its own `reference.jpg`. Everything for that venue and its events is in that space. For `qsncc-lg-5-8` the reference is the 2026 plan (2560 × 1932); back wall at y ≈ 280, lakeside doors at y ≈ 1464, MRT corridor at x < 446, 3 m per 29.5 px. Walking speed is 55 m/min for every venue.

## Routing

`createGrid(venue, blockers)` rasterises `venue.floor` ops in order, punches door boxes, blocks booths, pillars and event obstacles with 2 px padding, then stores clearance. `findRoute` runs 8-way A* with clearance cost and no corner cutting, string-pulls with line of sight, and returns `{P, len, meters, minutes, doorsUsed, areas}`, `{same}` or `{fail}`. `tests/golden/v1.json` pins the 2026 routes, steps, search results and hall lookup to v1 exactly. v1 is gone, so the file can't be regenerated. If a change moves these results on purpose, edit the affected entries by hand and say why in the commit.

## Content rules

- Every guest-facing string exists in `th` and `en` (tests enforce it).
- Plain verbs, sentence case, no exclamation marks. Errors say what to do next.
- Storage keys `bf:lang` and `bf:<eventId>:from`, always in try/catch.
- No verbose code comments.

## Design

Mitr for display, Anuphan for body. Tokens on `:root` in `src/lib/styles/app.css`, dark mode under `prefers-color-scheme` and `[data-theme]`. The large booth code on the result card is the signature element. Route draws once and the pin pulses, both respect reduced motion. Below 900 px a bottom sheet (46vh, Less/More), at 900 px and above a 400 px side panel.

## Gotchas

- Map layer ids `layer-base|booths|zones|marks|route|pins`; CSS targets `#layer-route`.
- `viewport.frame()` waits one animation frame before measuring. Keep it.
- The viewBox aspect ratio always equals the element's (`clampVB`). Never set `h` on its own.
- Pointer capture sends events to the `<svg>`; taps are resolved from the `pointerdown` target.
- Booth labels hide below 0.42 screen px per map unit.
- Prerender loads events on the server side of SvelteKit; a bad event file fails the build with the file and field named.

## Known data issues

Each event lists its own in `event.json` `notes`. Check them with the organiser before the event. Don't silently "fix" them.
````

- [ ] **Step 7: Write `tools/pipeline/README.md`**

````markdown
# Ingestion pipeline

Turns an organiser's floor-plan image (and exhibitor spreadsheet) into `events/<id>/`. Every stage reads and writes `events/<id>/source/`, so any stage can be rerun alone.

| Command | Stage | Writes |
|---|---|---|
| `event:new <id> --plan … --name-th … --name-en … --start … --end … [--venue …]` | init, then detect, read, categorise | `event.json`, `source/plan.*`, and everything below |
| `event:detect <id>` | register onto the venue, detect booth cells | `source/registration.json`, `source/detect.json`, `source/cells.json` |
| `event:read <id>` | OCR each cell, flag suspicious reads | `source/reads.json` |
| `event:review <id>` | browser tool to fix everything by hand | `source/corrections.json`, `source/registration.json` |
| `event:build <id>` | apply corrections, write the event | `booths.json`, `event.json` |
| `event:exhibitors <id> <file> [--map booth=Col,th=Col,en=Col]` | import exhibitors | `exhibitors.csv` |
| `event:ocr-report <id>` | compare reads with the built booths | nothing |

## Registration

The plan is mapped onto the venue's reference image with a per-axis scale and offset. `event:detect` fits it automatically from the floor outline. If the score is below 0.9, open the review tool, choose Register, click a wall corner on the plan and then the same corner on the reference, twice or more, far apart, and apply. Then run `event:detect` again.

## Detection

`detect.json` holds the parameters: the region to search, the floor colour, and the thresholds from the original OpenCV pipeline. Defaults come from the venue outline and the most common colour. The 2026 values are in `events/bkkibf-2026/source/detect.json`.

## Reading codes

OCR (tesseract.js, English data downloaded on first run) only suggests codes. A read is flagged when it is missing, low confidence, duplicated, has the wrong letter for its column or breaks the column's number order. Flagged and unread cells show amber and red in the review tool; press `n` to jump to the next one. 2026 accuracy: record the `event:ocr-report bkkibf-2026` numbers here.

If tesseract.js fails to start under Bun, run the read stage with Node: `npx tsx tools/pipeline/cli.ts read <id>`.

## Corrections

`source/corrections.json` is the only hand-edited input and is committed. Cell fixes are keyed by a point in venue coordinates, so they survive re-detection: `code`, `pillar`, `drop`, `rect`, `extra`. `add` holds booths the detector missed. `categoryColours` maps plan colours to category keys. `event` holds categories, zones, foyer zones, obstacles, landmarks and quick picks edited in the review tool.

## Reproduction check

`tests/pipeline-build.test.ts` runs detection on the 2026 plan and applies the committed corrections. The output must match `events/bkkibf-2026/booths.json`: same codes, rectangles within 2 px, same categories. Keep it passing when changing the detector.
````

Replace "record the `event:ocr-report bkkibf-2026` numbers here" with the numbers measured in Task 16 Step 8.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "Retire v1, add build smoke test, rewrite docs for v2"
```

- [ ] **Step 9: Switch production (with the owner)**

This changes production. Ask the owner first.
1. Push `v2` and open a PR from `v2` to `main`, with a description written using the `mo-ai:pr-description` skill. Check the Cloudflare preview for the last commit.
2. The Cloudflare settings stay as they are (`npm run build`, output `_site`). If the build log shows dependencies installed with npm instead of Bun and something breaks, add the environment variable `BUN_VERSION` with the version from `bun --version`.
3. The owner merges the PR. Cloudflare builds `main`.
4. Check production:
   - `https://book-booth-finder.pages.dev/` lists the event
   - `/e/bkkibf-2026/#to=K16&from=mrt` shows the route
   - `/#to=K16&from=door6` redirects to the 2026 event
   - `/e/nope/` shows the not-found page
   - `/CLAUDE.md` and `/venues/qsncc-lg-5-8/reference.jpg` return the app's 404 page rather than the files
