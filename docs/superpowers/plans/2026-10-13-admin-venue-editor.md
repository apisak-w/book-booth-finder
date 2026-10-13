# Admin Venue Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the owner open a venue from the repo in `/admin`, see it drawn over its printed plan, edit landmarks and map pins (with a street map to pin the plan to the world), and save the result as one rolling pull request per venue; replace the Guest spots empty page with a way into that editor.

**Architecture:**

- **Pure edits in core:** `src/lib/core/` gets three pure modules: edit operations on a `Venue` (`venueEdit.ts`), the save rules (`venueChecks.ts`), and a JSON writer that reproduces the repo's formatter byte for byte (`jsonFormat.ts`).
- **Server:** `src/lib/api/venues.ts` reads venues, events and printed plans from GitHub, validates a save with the Zod venue schema plus the core rules, and commits to `admin/<venue-id>` through the existing `proposeChange`. Guest-spot "Move pin" now uses the same branch.
- **Client:** the admin gets Venues and Guest spots tabs. The Venues editor keeps its state in an undo history with a browser draft, draws the plan with the existing viewport, and pins the plan to the world with an OpenStreetMap picker drawn in Web Mercator world pixels.

**Tech Stack:** SvelteKit 2 (adapter-static), Svelte 5 runes, TypeScript, Bun test, Playwright, Cloudflare Pages Functions, D1, GitHub REST API, Zod (server only), OpenStreetMap raster tiles (admin only).

**Spec:** `docs/superpowers/specs/2026-10-13-admin-venue-editor-design.md` (builds on `docs/superpowers/specs/2026-10-13-guest-spots-design.md`, merged in PR apisak-w/book-booth-finder#7).

## Global Constraints

- The admin is owner-only and English only. Guest-facing strings still need `th` and `en`. Copy: plain verbs, sentence case, no exclamation marks, errors say what to do next.
- `src/lib/core/` stays free of DOM, Svelte and Zod. `src/lib/api/` may import `src/lib/server/schema.ts` (Zod, server-only) and nothing from Svelte. Zod never reaches the client bundle (`tests/build.test.ts`).
- Storage keys: `bf:lang`, `bf:<eventId>:from`, `bf:<eventId>:asked`, and the new `bf:admin:<venueId>:draft`. Always through `store` (try/catch).
- Editable in the admin: venue landmarks (add, move, rename, type and icon, delete when allowed) and `geo` (pins and street entrances). Read-only: `id`, `name`, `timezone`, `reference`, `view`, `overview`, `metersPerPx`, `gridCell`, `walls`, `floor`, `areas`, `outside`, `doors`, `depth`. `origin` must stay a landmark.
- Landmark ids are never renamed. New ids are `ID_PREFIX[group]` plus the lowest free number, skipping ids used by the venue and by any event at that venue (`entry`, `wc`, `info`, `ch`, `stage`, `place`).
- Door landmarks (id equal to a `doors[].id`) keep their position. The origin, street entrances, doors and anything an event's quick picks use can't be deleted.
- Every admin change to a venue goes to branch `admin/<venue-id>` and one PR. A save is refused with 409 when the file's blob sha on that ref differs from the sha the editor opened.
- `venue.json` is written with `formatVenueJson`, which must reproduce oxfmt output: 2-space indent; objects always expanded; an array goes on one line when it fits in 120 columns and isn't a list of multi-element arrays or non-empty objects.
- OpenStreetMap tiles load only on `/admin`, from `https://tile.openstreetmap.org/{z}/{x}/{y}.png`, credited "© OpenStreetMap contributors", zoom 15–19.
- Phones (width under 700 px) get a read-only editor with "Edit on a larger screen. Placing points needs a mouse or trackpad."
- No verbose code comments. Commits follow Conventional Commits with scopes `core`, `app`, `docs`.
- Run `bun run test` after changes to `src/lib/core/` or `venues/`. `tests/golden/v1.json` must keep passing unchanged.
- `main` has no measured map pins yet. Tests that need a pinned venue use `pinnedVenue()` (`tests/helpers/pinned-venue.ts`). Never commit test pins to `venues/`.

## Review Focus

1. A save whose JSON carries a field the schema doesn't know, or whose landmark objects arrive in a different key order. Expected: unknown fields are refused, and the file keeps its key order and formatting. Pinned by `canonical` equality in `saveVenue` (Task 5), the `formatVenueJson` round-trip tests (Task 1) and the extra-field API test (Task 5).
2. The venue is edited in two tabs or on two devices. Expected: the second save gets a 409 telling you to reload, and nothing is written. Pinned by the stale-sha API test (Task 5).
3. A new landmark would take an id an event already uses for its own landmark (`info3`). Expected: the id skips it, and the server refuses a clash. Pinned by `nextLandmarkId` (Task 2) and `venueEditProblems` (Task 3) tests.
4. A draft saved against an older copy, after the PR branch has moved on. Expected: the editor offers to discard it instead of silently reapplying old data. Pinned by the `isStale` test (Task 6) and the draft e2e (Task 8).
5. OpenStreetMap tiles fail to load (offline, blocked). Expected: the picker shows its credit and the paste-coordinates field still sets pins. Pinned by the tile-failure e2e (Task 9).

---

## File Structure

```
src/lib/core/jsonFormat.ts            formatVenueJson, canonical
src/lib/core/spotReview.ts            withPins via formatVenueJson
src/lib/core/venueEdit.ts             edit ops, ids, deleteBlockers, diffVenue
src/lib/core/venueChecks.ts           EventRef, venueEditProblems, unreachableLandmarks
src/lib/api/errors.ts                 Refused
src/lib/api/github.ts                 + openPr, readFile, readRaw, listDir, GitHubConflict, expectSha
src/lib/api/venues.ts                 adminBranch, listVenues, readVenue, venueReference, saveVenue
src/lib/api/admin.ts                  + venue routes; Move pin on admin/<venue>
src/lib/admin/history.ts              undo history, draft read and write, isStale
src/lib/admin/osm.ts                  OSM tiles in world pixels, screenToWorld, parseLatLng
src/lib/admin/api.ts                  + getVenues, getVenue, referenceUrl, saveVenue
src/lib/admin/Admin.svelte            tabs, sign-in, shared venue list
src/lib/admin/SpotsTab.svelte         the Guest spots screen (moved from Admin.svelte)
src/lib/admin/EmptySpots.svelte       Guest spots empty state
src/lib/admin/VenuesTab.svelte        venue list and editor host
src/lib/admin/VenueEditor.svelte      editor state, toolbar, panels, save
src/lib/admin/PlanCanvas.svelte       plan, printed image, landmarks, pins
src/lib/admin/LandmarkPanel.svelte    selected landmark fields
src/lib/admin/PinPanel.svelte         pins, fit, paste, entrances
src/lib/admin/StreetPicker.svelte     OSM street map
src/lib/admin/SaveDialog.svelte       change list and save
src/lib/admin/admin.css               + editor styles
tests/helpers/fake-github.ts          + fakeRepo
tests/json-format.test.ts, venue-edit.test.ts, venue-checks.test.ts, admin-history.test.ts, admin-osm.test.ts,
tests/api-github.test.ts (+), api-venues.test.ts, api-admin.test.ts (branch), e2e/admin.e2e.ts (tabs), e2e/venues.e2e.ts
README.md, CLAUDE.md                  editor setup and handover
```

---

### Task 1: Write venue files the way the formatter does

**Files:**

- Create: `src/lib/core/jsonFormat.ts`
- Modify: `src/lib/core/spotReview.ts` (`withPins` uses it)
- Test: `tests/json-format.test.ts`

**Interfaces:**

- Produces: `formatVenueJson(value: unknown): string` (ends with a newline) and `canonical(value: unknown): string` (JSON with object keys sorted at every level, used to compare content regardless of key order).

- [ ] **Step 1: Write the failing tests**

Create `tests/json-format.test.ts`:

```ts
import { test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { canonical, formatVenueJson } from '../src/lib/core/jsonFormat';
import { pinnedVenue } from './helpers/pinned-venue';

const files = [
  'venues/qsncc-lg-5-8/venue.json',
  'venues/qsncc-lg-5-7/venue.json',
  'events/bkkibf-2026/event.json',
  'events/bookexpo-2026/event.json',
];

test('formatVenueJson reproduces every venue and event file byte for byte', () => {
  for (const f of files) {
    const text = readFileSync(f, 'utf8');
    expect(formatVenueJson(JSON.parse(text))).toBe(text);
  }
});

test('short arrays stay on one line, lists of objects and pairs always break', () => {
  expect(
    formatVenueJson({
      a: [1, 2],
      b: [
        [1, 2],
        [3, 4],
      ],
      c: [{ x: 1 }],
      d: [],
    }),
  ).toBe(
    '{\n  "a": [1, 2],\n  "b": [\n    [1, 2],\n    [3, 4]\n  ],\n  "c": [\n    {\n      "x": 1\n    }\n  ],\n  "d": []\n}\n',
  );
  const long = { k: Array.from({ length: 30 }, (_, i) => `item-${i}`) };
  expect(formatVenueJson(long).split('\n').length).toBeGreaterThan(30);
});

test('a pinned venue writes its pins expanded and its entrances on one line', () => {
  const out = formatVenueJson(pinnedVenue().venue);
  expect(out).toContain('"entrances": ["mrt", "door5", "door6", "door7", "door8"]');
  expect(out).toContain('    "pins": [\n      {\n        "id": "a",');
});

test('canonical ignores key order but not content', () => {
  expect(canonical({ b: 1, a: [{ y: 2, x: 1 }] })).toBe(canonical({ a: [{ x: 1, y: 2 }], b: 1 }));
  expect(canonical({ a: 1 })).not.toBe(canonical({ a: 2 }));
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `bun test tests/json-format.test.ts`
Expected: FAIL with `Cannot find module '../src/lib/core/jsonFormat'`.

- [ ] **Step 3: Implement**

Create `src/lib/core/jsonFormat.ts`:

```ts
const WIDTH = 120;

const isFull = (x: unknown) =>
  Array.isArray(x) ? x.length > 1 : !!x && typeof x === 'object' && Object.keys(x).length > 0;

function fmt(v: unknown, indent: string, used: number): string {
  if (Array.isArray(v)) {
    if (!v.length) return '[]';
    const pad = indent + '  ';
    const inline = `[${v.map((x) => fmt(x, pad, 0)).join(', ')}]`;
    const nested = v.length > 1 && v.every(isFull);
    if (!nested && !inline.includes('\n') && used + inline.length + 1 <= WIDTH) return inline;
    return `[\n${v.map((x) => pad + fmt(x, pad, pad.length)).join(',\n')}\n${indent}]`;
  }
  if (v && typeof v === 'object') {
    const pad = indent + '  ';
    const entries = Object.entries(v as Record<string, unknown>).filter(([, x]) => x !== undefined);
    if (!entries.length) return '{}';
    return `{\n${entries
      .map(([k, x]) => {
        const key = `${pad}${JSON.stringify(k)}: `;
        return key + fmt(x, pad, key.length);
      })
      .join(',\n')}\n${indent}}`;
  }
  return JSON.stringify(v);
}

export const formatVenueJson = (value: unknown) => `${fmt(value, '', 0)}\n`;

function sorted(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sorted);
  if (v && typeof v === 'object')
    return Object.fromEntries(
      Object.keys(v)
        .sort()
        .map((k) => [k, sorted((v as Record<string, unknown>)[k])]),
    );
  return v;
}

export const canonical = (value: unknown) => JSON.stringify(sorted(value));
```

In `src/lib/core/spotReview.ts`, replace the body of `withPins` with:

```ts
export function withPins(text: string, pins: GeoPin[]): string {
  const venue = JSON.parse(text) as { geo?: { pins: GeoPin[] } };
  if (!venue.geo) throw new Error('venue.json has no map pins');
  return formatVenueJson({ ...venue, geo: { ...venue.geo, pins } });
}
```

and add `import { formatVenueJson } from './jsonFormat';` to its imports.

- [ ] **Step 4: Run the tests**

Run: `bun test tests/json-format.test.ts tests/spot-review.test.ts tests/api-admin.test.ts`
Expected: PASS. `withPins('{}', …)` still throws `venue.json has no map pins`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/core/jsonFormat.ts src/lib/core/spotReview.ts tests/json-format.test.ts
git commit -m "feat(core): write venue files the way the formatter does"
```

---

### Task 2: Venue edit operations

**Files:**

- Create: `src/lib/core/venueEdit.ts`
- Create: `src/lib/core/venueChecks.ts` (only the `EventRef` type in this task)
- Test: `tests/venue-edit.test.ts`

**Interfaces:**

- Consumes: `Venue`, `Landmark`, `LandmarkGroup`, `IconName`, `GeoPin` from `types.ts`.
- Produces:
  - `venueChecks.ts`: `type EventRef = { id: string; name: I18n; refs: string[]; ids: string[] }` (`refs`: venue landmark ids the event's quick picks use; `ids`: the event's own landmark ids)
  - `venueEdit.ts`: `class EditError extends Error`, `ID_PREFIX`, `DEFAULT_ICON`, `type NewLandmark = { group: LandmarkGroup; icon: IconName; th: string; en: string; x: number; y: number }`, `isDoor(v, id)`, `nextLandmarkId(v, group, taken?)`, `addLandmark(v, d, taken?) → { venue, id }`, `moveLandmark(v, id, x, y)`, `updateLandmark(v, id, patch)`, `deleteBlockers(v, id, events?) → string[]`, `deleteLandmark(v, id, events?)`, `defaultEntrances(v)`, `setEntrance(v, id, on)`, `nextPinId(v)`, `setPin(v, pin)`, `removePin(v, id)`, `diffVenue(base, next) → string[]`. Every op returns a new `Venue` and keeps the key order of objects it doesn't add.

- [ ] **Step 1: Write the failing tests**

Create `tests/venue-edit.test.ts`:

```ts
import { test, expect } from 'bun:test';
import {
  addLandmark,
  defaultEntrances,
  deleteBlockers,
  deleteLandmark,
  diffVenue,
  moveLandmark,
  nextLandmarkId,
  nextPinId,
  removePin,
  setEntrance,
  setPin,
  updateLandmark,
} from '../src/lib/core/venueEdit';
import type { EventRef } from '../src/lib/core/venueChecks';
import { loadVenue } from '../src/lib/server/catalog';
import { pinnedVenue } from './helpers/pinned-venue';

const base = loadVenue('qsncc-lg-5-8');
const fair: EventRef = { id: 'fair', name: { th: 'งาน', en: 'Fair' }, refs: ['stage', 'wc2'], ids: ['info1', 'stage'] };
const toilet = {
  group: 'wc' as const,
  icon: 'wc' as const,
  th: 'ห้องน้ำ ฮอลล์ 9',
  en: 'Toilets, Hall 9',
  x: 1200.4,
  y: 700.6,
};

test('new ids use the type prefix and skip ids taken by the venue or its events', () => {
  expect(nextLandmarkId(base, 'wc')).toBe('wc7');
  expect(nextLandmarkId(base, 'info', fair.ids)).toBe('info2');
  expect(nextLandmarkId(base, 'charge')).toBe('ch1');
  expect(nextLandmarkId(base, 'other')).toBe('place1');
});

test('adding a landmark appends it with rounded position and file key order', () => {
  const { venue, id } = addLandmark(base, toilet);
  expect(id).toBe('wc7');
  const lm = venue.landmarks.at(-1)!;
  expect(Object.keys(lm)).toEqual(['id', 'group', 'x', 'y', 'th', 'en', 'icon']);
  expect(lm).toMatchObject({ id: 'wc7', x: 1200, y: 701, en: 'Toilets, Hall 9' });
  expect(base.landmarks.some((l) => l.id === 'wc7')).toBe(false);
});

test('landmarks move and rename, but doors keep their position', () => {
  const moved = moveLandmark(base, 'wc1', 10.2, 20.7);
  expect(moved.landmarks.find((l) => l.id === 'wc1')).toMatchObject({ x: 10, y: 21 });
  expect(() => moveLandmark(base, 'door5', 1, 1)).toThrow('door5 is a door. Its position is part of the floor plan');
  const renamed = updateLandmark(base, 'door5', { en: 'Hall 5 lake door' });
  expect(renamed.landmarks.find((l) => l.id === 'door5')!.en).toBe('Hall 5 lake door');
  expect(Object.keys(renamed.landmarks.find((l) => l.id === 'door5')!)).toEqual(
    Object.keys(base.landmarks.find((l) => l.id === 'door5')!),
  );
  expect(() => moveLandmark(base, 'nope', 1, 1)).toThrow('No landmark nope');
});

test('deleting is blocked for the origin, doors, street entrances and event quick picks', () => {
  expect(deleteBlockers(base, 'mrt', [fair])).toContain('it is the starting point');
  expect(deleteBlockers(base, 'door6', [fair])).toContain('it is a door');
  expect(deleteBlockers(base, 'wc2', [fair])).toEqual(['Fair uses it as a quick pick']);
  expect(deleteBlockers(pinnedVenue().venue, 'door7', [])).toContain('it is a street entrance');
  expect(deleteBlockers(base, 'wc3', [fair])).toEqual([]);
  expect(deleteLandmark(base, 'wc3', [fair]).landmarks.some((l) => l.id === 'wc3')).toBe(false);
  expect(() => deleteLandmark(base, 'wc2', [fair])).toThrow("wc2 can't be deleted: Fair uses it as a quick pick");
});

test('the first pin creates geo with the entry landmarks as street entrances', () => {
  expect(nextPinId(base)).toBe('p1');
  const one = setPin(base, { id: 'p1', x: 446.4, y: 280, lat: 13.723033604, lng: 100.560597129 });
  expect(one.geo).toEqual({
    pins: [{ id: 'p1', x: 446, y: 280, lat: 13.7230336, lng: 100.5605971 }],
    entrances: defaultEntrances(base),
  });
  expect(Object.keys(one).at(-1)).toBe('geo');
  const two = setPin(one, { id: 'p1', x: 450, y: 280, lat: 13.7230336, lng: 100.5605971 });
  expect(two.geo!.pins).toHaveLength(1);
  expect(nextPinId(two)).toBe('p2');
  expect(removePin(two, 'p1').geo).toBeUndefined();
});

test('street entrances follow landmark order and need geo', () => {
  expect(() => setEntrance(base, 'wc1', true)).toThrow('Add map pins first');
  const v = pinnedVenue().venue;
  expect(setEntrance(v, 'door6', false).geo!.entrances).toEqual(['mrt', 'door5', 'door7', 'door8']);
  expect(setEntrance(setEntrance(v, 'door6', false), 'door6', true).geo!.entrances).toEqual([
    'mrt',
    'door5',
    'door6',
    'door7',
    'door8',
  ]);
});

test('diffVenue lists every change in plain words', () => {
  let v = addLandmark(base, toilet).venue;
  v = moveLandmark(v, 'wc1', 10, 20);
  v = updateLandmark(v, 'wc2', { en: 'Toilets near the stage' });
  v = updateLandmark(v, 'lift', { icon: 'info' });
  v = deleteLandmark(v, 'wc3', []);
  v = setPin(v, { id: 'p1', x: 1, y: 2, lat: 13.7, lng: 100.5 });
  expect(diffVenue(base, v)).toEqual([
    'Moved wc1 (Toilets, Hall 5)'.replace('Toilets, Hall 5', base.landmarks.find((l) => l.id === 'wc1')!.en),
    'Renamed wc2 to Toilets near the stage',
    'Changed the type of lift',
    'Added wc7 (Toilets, Hall 9)',
    `Deleted wc3 (${base.landmarks.find((l) => l.id === 'wc3')!.en})`,
    'Added map pin p1',
    ...defaultEntrances(base).map((id) => `Made ${id} a street entrance`),
  ]);
  expect(diffVenue(base, base)).toEqual([]);
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `bun test tests/venue-edit.test.ts`
Expected: FAIL with `Cannot find module '../src/lib/core/venueEdit'`.

- [ ] **Step 3: Implement**

Create `src/lib/core/venueChecks.ts`:

```ts
import type { I18n } from './types';

export type EventRef = { id: string; name: I18n; refs: string[]; ids: string[] };
```

Create `src/lib/core/venueEdit.ts`:

```ts
import type { EventRef } from './venueChecks';
import type { GeoPin, IconName, Landmark, LandmarkGroup, Venue } from './types';

export class EditError extends Error {}

export const ID_PREFIX: Record<LandmarkGroup, string> = {
  entry: 'entry',
  wc: 'wc',
  info: 'info',
  charge: 'ch',
  stage: 'stage',
  other: 'place',
};
export const DEFAULT_ICON: Record<LandmarkGroup, IconName> = {
  entry: 'door',
  wc: 'wc',
  info: 'info',
  charge: 'charge',
  stage: 'stage',
  other: 'lift',
};
export type NewLandmark = { group: LandmarkGroup; icon: IconName; th: string; en: string; x: number; y: number };

const round7 = (v: number) => Math.round(v * 1e7) / 1e7;

export const isDoor = (v: Venue, id: string) => v.doors.some((d) => d.id === id);

export function nextLandmarkId(v: Venue, group: LandmarkGroup, taken: string[] = []): string {
  const used = new Set([...v.landmarks.map((l) => l.id), ...taken]);
  for (let n = 1; ; n++) if (!used.has(`${ID_PREFIX[group]}${n}`)) return `${ID_PREFIX[group]}${n}`;
}

export function addLandmark(v: Venue, d: NewLandmark, taken: string[] = []): { venue: Venue; id: string } {
  const id = nextLandmarkId(v, d.group, taken);
  const lm: Landmark = {
    id,
    group: d.group,
    x: Math.round(d.x),
    y: Math.round(d.y),
    th: d.th,
    en: d.en,
    icon: d.icon,
  };
  return { venue: { ...v, landmarks: [...v.landmarks, lm] }, id };
}

function mapLandmark(v: Venue, id: string, fn: (l: Landmark) => Landmark): Venue {
  if (!v.landmarks.some((l) => l.id === id)) throw new EditError(`No landmark ${id}`);
  return { ...v, landmarks: v.landmarks.map((l) => (l.id === id ? fn(l) : l)) };
}

export function moveLandmark(v: Venue, id: string, x: number, y: number): Venue {
  if (isDoor(v, id)) throw new EditError(`${id} is a door. Its position is part of the floor plan`);
  return mapLandmark(v, id, (l) => ({ ...l, x: Math.round(x), y: Math.round(y) }));
}

export const updateLandmark = (v: Venue, id: string, patch: Partial<Pick<Landmark, 'th' | 'en' | 'group' | 'icon'>>) =>
  mapLandmark(v, id, (l) => ({ ...l, ...patch }));

export function deleteBlockers(v: Venue, id: string, events: EventRef[] = []): string[] {
  const why: string[] = [];
  if (v.origin === id) why.push('it is the starting point');
  if (isDoor(v, id)) why.push('it is a door');
  if (v.geo?.entrances.includes(id)) why.push('it is a street entrance');
  for (const e of events) if (e.refs.includes(id)) why.push(`${e.name.en} uses it as a quick pick`);
  return why;
}

export function deleteLandmark(v: Venue, id: string, events: EventRef[] = []): Venue {
  const why = deleteBlockers(v, id, events);
  if (why.length) throw new EditError(`${id} can't be deleted: ${why.join('; ')}`);
  return { ...v, landmarks: v.landmarks.filter((l) => l.id !== id) };
}

export const defaultEntrances = (v: Venue) => v.landmarks.filter((l) => l.group === 'entry').map((l) => l.id);

export function setEntrance(v: Venue, id: string, on: boolean): Venue {
  if (!v.geo) throw new EditError('Add map pins first');
  const now = new Set(v.geo.entrances);
  if (on) now.add(id);
  else now.delete(id);
  return { ...v, geo: { ...v.geo, entrances: v.landmarks.map((l) => l.id).filter((x) => now.has(x)) } };
}

export function nextPinId(v: Venue): string {
  const used = new Set(v.geo?.pins.map((p) => p.id) ?? []);
  for (let n = 1; ; n++) if (!used.has(`p${n}`)) return `p${n}`;
}

export function setPin(v: Venue, pin: GeoPin): Venue {
  const p: GeoPin = {
    id: pin.id,
    x: Math.round(pin.x),
    y: Math.round(pin.y),
    lat: round7(pin.lat),
    lng: round7(pin.lng),
  };
  if (!v.geo) return { ...v, geo: { pins: [p], entrances: defaultEntrances(v) } };
  const pins = v.geo.pins.some((q) => q.id === p.id)
    ? v.geo.pins.map((q) => (q.id === p.id ? p : q))
    : [...v.geo.pins, p];
  return { ...v, geo: { ...v.geo, pins } };
}

export function removePin(v: Venue, id: string): Venue {
  if (!v.geo) return v;
  const pins = v.geo.pins.filter((p) => p.id !== id);
  if (pins.length) return { ...v, geo: { ...v.geo, pins } };
  const rest = { ...v };
  delete rest.geo;
  return rest;
}

export function diffVenue(base: Venue, next: Venue): string[] {
  const out: string[] = [];
  const before = new Map(base.landmarks.map((l) => [l.id, l]));
  const after = new Set(next.landmarks.map((l) => l.id));
  const added: string[] = [];
  for (const l of next.landmarks) {
    const o = before.get(l.id);
    if (!o) {
      added.push(`Added ${l.id} (${l.en})`);
      continue;
    }
    if (o.x !== l.x || o.y !== l.y) out.push(`Moved ${l.id} (${l.en})`);
    if (o.th !== l.th || o.en !== l.en) out.push(`Renamed ${l.id} to ${l.en}`);
    if (o.group !== l.group || o.icon !== l.icon) out.push(`Changed the type of ${l.id}`);
  }
  out.push(...added);
  for (const l of base.landmarks) if (!after.has(l.id)) out.push(`Deleted ${l.id} (${l.en})`);
  const bp = new Map((base.geo?.pins ?? []).map((p) => [p.id, p]));
  const np = new Set((next.geo?.pins ?? []).map((p) => p.id));
  for (const p of next.geo?.pins ?? []) {
    const o = bp.get(p.id);
    if (!o) out.push(`Added map pin ${p.id}`);
    else if (JSON.stringify(o) !== JSON.stringify(p)) out.push(`Moved map pin ${p.id}`);
  }
  for (const p of base.geo?.pins ?? []) if (!np.has(p.id)) out.push(`Removed map pin ${p.id}`);
  const be = base.geo?.entrances ?? [],
    ne = next.geo?.entrances ?? [];
  for (const e of ne) if (!be.includes(e)) out.push(`Made ${e} a street entrance`);
  for (const e of be) if (!ne.includes(e)) out.push(`${e} is no longer a street entrance`);
  return out;
}
```

- [ ] **Step 4: Run the tests**

Run: `bun test tests/venue-edit.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/core/venueEdit.ts src/lib/core/venueChecks.ts tests/venue-edit.test.ts
git commit -m "feat(core): edit venue landmarks and map pins"
```

---

### Task 3: Rules for saving a venue

**Files:**

- Modify: `src/lib/core/venueChecks.ts`
- Test: `tests/venue-checks.test.ts`

**Interfaces:**

- Consumes: `deleteBlockers`, `isDoor` (Task 2), `pinProblems` (`geo.ts`), `createGrid`, `findRoute`, `isRouteOk`.
- Produces:
  - `LOCKED_FIELDS` (readonly list of venue keys the admin can't change)
  - `venueEditProblems(base: Venue, next: Venue, events: EventRef[]): string[]` (empty when the save is allowed)
  - `unreachableLandmarks(v: Venue): string[]` (the same rule as `tests/venues.test.ts`)

- [ ] **Step 1: Write the failing tests**

Create `tests/venue-checks.test.ts`:

```ts
import { test, expect } from 'bun:test';
import { addLandmark, deleteLandmark, moveLandmark, setPin, updateLandmark } from '../src/lib/core/venueEdit';
import { unreachableLandmarks, venueEditProblems, type EventRef } from '../src/lib/core/venueChecks';
import { loadVenue } from '../src/lib/server/catalog';
import { fakeLatLng } from './helpers/fake-geo';
import { pinnedVenue } from './helpers/pinned-venue';

const base = loadVenue('qsncc-lg-5-8');
const fair: EventRef = { id: 'fair', name: { th: 'งาน', en: 'Fair' }, refs: ['wc2'], ids: ['info1'] };

test('a normal edit passes', () => {
  let v = addLandmark(base, { group: 'wc', icon: 'wc', th: 'ห้องน้ำ', en: 'Toilets', x: 1200, y: 700 }).venue;
  v = moveLandmark(v, 'wc1', 900, 900);
  v = updateLandmark(v, 'door5', { en: 'Lake door' });
  expect(venueEditProblems(base, v, [fair])).toEqual([]);
});

test('floor plan fields are locked', () => {
  const v = {
    ...base,
    walls: [
      [
        [0, 0],
        [1, 0],
        [1, 1],
      ],
    ] as typeof base.walls,
    gridCell: 8,
  };
  expect(venueEditProblems(base, v, [])).toEqual([
    "gridCell can't be changed in the admin yet",
    "walls can't be changed in the admin yet",
  ]);
});

test('door positions, deletions, duplicate ids and event id clashes are refused', () => {
  const doorMoved = { ...base, landmarks: base.landmarks.map((l) => (l.id === 'door5' ? { ...l, x: l.x + 5 } : l)) };
  expect(venueEditProblems(base, doorMoved, [])).toEqual(["door5 is a door and can't move"]);
  expect(venueEditProblems(base, { ...base, landmarks: base.landmarks.filter((l) => l.id !== 'wc2') }, [fair])).toEqual(
    ["wc2 can't be deleted: Fair uses it as a quick pick"],
  );
  expect(venueEditProblems(base, deleteLandmark(base, 'wc3', [fair]), [fair])).toEqual([]);
  const dup = { ...base, landmarks: [...base.landmarks, { ...base.landmarks[7] }] };
  expect(venueEditProblems(base, dup, [])).toContain(`Landmark ids must be unique: ${base.landmarks[7].id}`);
  const clash = { ...base, landmarks: [...base.landmarks, { ...base.landmarks[7], id: 'info1' }] };
  expect(venueEditProblems(base, clash, [fair])).toEqual(['info1 is already used by Fair']);
});

test('map pins must fit and entrances must exist', () => {
  const two = setPin(setPin(base, { id: 'p1', ...fakeLatLng(446, 280), x: 446, y: 280 }), {
    id: 'p2',
    ...fakeLatLng(2391, 280),
    x: 2391,
    y: 280,
  });
  expect(venueEditProblems(base, two, [])).toEqual(['Map pins: needs at least 3 map pins']);
  const v = pinnedVenue().venue;
  expect(venueEditProblems(v, v, [])).toEqual([]);
  const ghost = { ...v, geo: { ...v.geo!, entrances: [...v.geo!.entrances, 'ghost'] } };
  expect(venueEditProblems(v, ghost, [])).toEqual(['Street entrance ghost is not a landmark']);
});

test('unreachable landmarks are named, the real venues have none', () => {
  expect(unreachableLandmarks(base)).toEqual([]);
  expect(unreachableLandmarks(loadVenue('qsncc-lg-5-7'))).toEqual([]);
  const lost = moveLandmark(base, 'wc1', -5000, -5000);
  expect(unreachableLandmarks(lost)).toEqual(['wc1']);
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `bun test tests/venue-checks.test.ts`
Expected: FAIL with `Export named 'venueEditProblems' not found`.

- [ ] **Step 3: Implement**

Replace `src/lib/core/venueChecks.ts` with:

```ts
import { pinProblems } from './geo';
import { createGrid } from './grid';
import { findRoute } from './routing';
import { isRouteOk, type I18n, type Venue } from './types';
import { deleteBlockers, isDoor } from './venueEdit';

export type EventRef = { id: string; name: I18n; refs: string[]; ids: string[] };

export const LOCKED_FIELDS = [
  'id',
  'name',
  'timezone',
  'reference',
  'view',
  'overview',
  'metersPerPx',
  'gridCell',
  'walls',
  'floor',
  'areas',
  'outside',
  'doors',
  'depth',
] as const;

export function venueEditProblems(base: Venue, next: Venue, events: EventRef[]): string[] {
  const out: string[] = [];
  for (const k of [...LOCKED_FIELDS].sort())
    if (JSON.stringify(base[k]) !== JSON.stringify(next[k])) out.push(`${k} can't be changed in the admin yet`);
  const ids = next.landmarks.map((l) => l.id);
  const dup = [...new Set(ids.filter((id, i) => ids.indexOf(id) !== i))];
  if (dup.length) out.push(`Landmark ids must be unique: ${dup.join(', ')}`);
  const now = new Set(ids);
  for (const l of base.landmarks) {
    if (now.has(l.id)) continue;
    const why = deleteBlockers(base, l.id, events);
    if (why.length) out.push(`${l.id} can't be deleted: ${why.join('; ')}`);
  }
  for (const l of next.landmarks) {
    const b = base.landmarks.find((x) => x.id === l.id);
    if (b && isDoor(base, l.id) && (b.x !== l.x || b.y !== l.y)) out.push(`${l.id} is a door and can't move`);
    if (!b) {
      const clash = events.find((e) => e.ids.includes(l.id));
      if (clash) out.push(`${l.id} is already used by ${clash.name.en}`);
    }
  }
  if (!now.has(next.origin)) out.push(`The starting point ${next.origin} must stay`);
  if (next.geo) {
    for (const id of next.geo.entrances) if (!now.has(id)) out.push(`Street entrance ${id} is not a landmark`);
    out.push(...pinProblems(next.geo.pins, next.metersPerPx).map((p) => `Map pins: ${p}`));
  }
  return out;
}

export function unreachableLandmarks(v: Venue): string[] {
  const origin = v.landmarks.find((l) => l.id === v.origin);
  if (!origin) return [];
  const grid = createGrid(v, []);
  return v.landmarks
    .filter((l) => l.id !== origin.id && !isRouteOk(findRoute(grid, v, origin, { kind: 'place', lm: l })))
    .map((l) => l.id);
}
```

`venueEdit.ts` imports only the `EventRef` type from here, so the two modules don't import each other's values.

- [ ] **Step 4: Run the tests**

Run: `bun test tests/venue-checks.test.ts tests/venue-edit.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/core/venueChecks.ts tests/venue-checks.test.ts
git commit -m "feat(core): check a venue edit before it is saved"
```

---

### Task 4: Read files from GitHub and refuse stale saves

**Files:**

- Create: `src/lib/api/errors.ts`
- Modify: `src/lib/api/github.ts`
- Modify: `src/lib/api/admin.ts` (import `Refused` from `errors.ts` instead of its local class)
- Modify: `tests/helpers/fake-github.ts` (add `fakeRepo`)
- Test: `tests/api-github.test.ts` (new tests)

**Interfaces:**

- Produces:
  - `errors.ts`: `class Refused extends Error`
  - `github.ts`:
    - `class GitHubConflict extends Error`
    - `openPr(g, branch) → { url: string } | null`
    - `readFile(g, path, ref) → { text: string; sha: string } | null` (404 gives null)
    - `readRaw(g, path, ref) → ArrayBuffer | null`
    - `listDir(g, path, ref) → { name: string; type: string }[]` (404 gives an empty list)
    - `Change` gains `expectSha?: string`: `proposeChange` throws `GitHubConflict` before any write when the file's sha on the ref it reads differs.
  - `tests/helpers/fake-github.ts`: `fakeRepo(files: Record<string, string | Uint8Array>, opts?: { openPr?: string[]; branches?: string[] }) → { calls, github }`. It serves `/contents/<path>?ref=…` (a file, or a directory listing derived from the paths), raw bytes for `accept: application/vnd.github.raw`, `/pulls?…head=owner:<branch>` (open when `<branch>` is in `openPr`), and the same write endpoints as `fakeGitHub`. The sha of a file is `sha-<path>`.

- [ ] **Step 1: Write the fake and the failing tests**

Append to `tests/helpers/fake-github.ts`:

```ts
export function fakeRepo(
  files: Record<string, string | Uint8Array>,
  opts: { openPr?: string[]; branches?: string[] } = {},
) {
  const calls: Call[] = [];
  const fake = async (url: string | URL | Request, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    const path = String(url).replace(`https://api.github.com/repos/${REPO}`, '');
    calls.push({ method, path, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    const accept = new Headers(init?.headers).get('accept') ?? '';
    if (method === 'GET' && path === '/git/ref/heads/main') return reply(200, { object: { sha: 'main-sha' } });
    if (method === 'GET' && path.startsWith('/pulls')) {
      const head = decodeURIComponent(new URL(`https://x${path}`).searchParams.get('head') ?? '').split(':')[1];
      return reply(200, (opts.openPr ?? []).includes(head) ? [{ html_url: `https://github.com/${REPO}/pull/9` }] : []);
    }
    if (method === 'GET' && path.startsWith('/git/ref/heads/')) {
      const b = path.slice('/git/ref/heads/'.length);
      return (opts.branches ?? []).includes(b)
        ? reply(200, { object: { sha: 'old-sha' } })
        : reply(404, { message: 'Not Found' });
    }
    if (method === 'GET' && path.startsWith('/contents/')) {
      const p = decodeURIComponent(path.slice('/contents/'.length).split('?')[0]);
      const f = files[p];
      if (f !== undefined) {
        const bytes = typeof f === 'string' ? new TextEncoder().encode(f) : f;
        if (accept.includes('raw')) return new Response(bytes, { status: 200 });
        return reply(200, {
          content: toBase64(typeof f === 'string' ? f : new TextDecoder().decode(f)),
          sha: `sha-${p}`,
        });
      }
      const kids = [
        ...new Set(
          Object.keys(files)
            .filter((k) => k.startsWith(`${p}/`))
            .map((k) => k.slice(p.length + 1).split('/')[0]),
        ),
      ];
      if (!kids.length) return reply(404, { message: 'Not Found' });
      return reply(
        200,
        kids.map((name) => ({ name, type: files[`${p}/${name}`] !== undefined ? 'file' : 'dir' })),
      );
    }
    if (method === 'POST' && path === '/git/refs') return reply(201, {});
    if (method === 'PATCH' || method === 'PUT') return reply(200, {});
    if (method === 'POST' && path === '/pulls') return reply(201, { html_url: `https://github.com/${REPO}/pull/10` });
    return reply(500, { message: `unexpected ${method} ${path}` });
  };
  const github: GitHub = { token: 't', repo: REPO, fetch: fake as typeof globalThis.fetch };
  return { calls, github };
}
```

Append to `tests/api-github.test.ts` (add `GitHubConflict`, `listDir`, `openPr`, `readFile`, `readRaw` to the import from `'../src/lib/api/github'` and `fakeRepo` to the fake-github import):

```ts
test('readFile, readRaw, listDir and openPr read the repo', async () => {
  const repo = fakeRepo(
    {
      'venues/v/venue.json': '{"id":"v"}\n',
      'venues/v/reference.jpg': new Uint8Array([1, 2, 3]),
      'venues/w/venue.json': '{}',
    },
    { openPr: ['admin/v'] },
  );
  expect(await readFile(repo.github, 'venues/v/venue.json', 'main')).toEqual({
    text: '{"id":"v"}\n',
    sha: 'sha-venues/v/venue.json',
  });
  expect(await readFile(repo.github, 'venues/x/venue.json', 'main')).toBeNull();
  expect([...new Uint8Array((await readRaw(repo.github, 'venues/v/reference.jpg', 'main'))!)]).toEqual([1, 2, 3]);
  expect(await listDir(repo.github, 'venues', 'main')).toEqual([
    { name: 'v', type: 'dir' },
    { name: 'w', type: 'dir' },
  ]);
  expect(await listDir(repo.github, 'nothing', 'main')).toEqual([]);
  expect(await openPr(repo.github, 'admin/v')).toEqual({ url: 'https://github.com/apisak-w/book-booth-finder/pull/9' });
  expect(await openPr(repo.github, 'admin/w')).toBeNull();
});

test('a stale expected sha is refused before anything is written', async () => {
  const gh = fakeGitHub(text);
  await expect(proposeChange(gh.github, { ...change(), expectSha: 'older' })).rejects.toBeInstanceOf(GitHubConflict);
  expect(writes(gh.calls)).toEqual([]);
  const ok = fakeGitHub(text);
  await proposeChange(ok.github, { ...change(), expectSha: 'file-sha' });
  expect(writes(ok.calls)).toContain('PUT /contents/venues/v/venue.json');
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `bun test tests/api-github.test.ts`
Expected: FAIL with `Export named 'GitHubConflict' not found`.

- [ ] **Step 3: Implement**

Create `src/lib/api/errors.ts`:

```ts
export class Refused extends Error {}
```

In `src/lib/api/admin.ts`, delete the line `class Refused extends Error {}` and add `import { Refused } from './errors';`.

In `src/lib/api/github.ts`:

- Add `expectSha?: string;` to `type Change`.
- Add after `class GitHubError`:

```ts
export class GitHubConflict extends Error {}
```

- Add these functions before `proposeChange`:

```ts
const enc = (path: string) => path.split('/').map(encodeURIComponent).join('/');

export async function openPr(g: GitHub, branch: string): Promise<{ url: string } | null> {
  const owner = g.repo.split('/')[0];
  const open = (await call<{ html_url: string }[]>(
    g,
    'GET',
    `/pulls?state=open&head=${encodeURIComponent(`${owner}:${branch}`)}`,
  ))!;
  return open.length ? { url: open[0].html_url } : null;
}

export async function readFile(g: GitHub, path: string, ref: string): Promise<{ text: string; sha: string } | null> {
  const f = await call<{ content: string; sha: string }>(
    g,
    'GET',
    `/contents/${enc(path)}?ref=${encodeURIComponent(ref)}`,
    undefined,
    true,
  );
  return f ? { text: fromBase64(f.content), sha: f.sha } : null;
}

export async function readRaw(g: GitHub, path: string, ref: string): Promise<ArrayBuffer | null> {
  const r = await (g.fetch ?? fetch)(
    `https://api.github.com/repos/${g.repo}/contents/${enc(path)}?ref=${encodeURIComponent(ref)}`,
    {
      headers: {
        authorization: `Bearer ${g.token}`,
        accept: 'application/vnd.github.raw',
        'x-github-api-version': '2022-11-28',
        'user-agent': 'booth-finder-admin',
      },
    },
  );
  if (r.status === 404) return null;
  if (!r.ok) throw new GitHubError(`GitHub refused GET /contents/${path}: ${r.status}`);
  return r.arrayBuffer();
}

export async function listDir(g: GitHub, path: string, ref: string): Promise<{ name: string; type: string }[]> {
  const items = await call<{ name: string; type: string }[]>(
    g,
    'GET',
    `/contents/${enc(path)}?ref=${encodeURIComponent(ref)}`,
    undefined,
    true,
  );
  return (items ?? []).map((i) => ({ name: i.name, type: i.type }));
}
```

- In `proposeChange`, replace the `open` lookup and the `file` read with:

```ts
const pr = await openPr(g, c.branch);
const ref = pr ? c.branch : 'main';
const file = (await call<{ content: string; sha: string }>(
  g,
  'GET',
  `/contents/${c.path}?ref=${encodeURIComponent(ref)}`,
))!;
if (c.expectSha && file.sha !== c.expectSha)
  throw new GitHubConflict('This venue changed since you opened it. Reload, then save again');
```

Then replace each later `open.length` with `pr`, and `return open[0].html_url;` with `return pr.url;`. The `owner` constant at the top of `proposeChange` is no longer needed; remove it.

- [ ] **Step 4: Run the tests**

Run: `bun test tests/api-github.test.ts tests/api-admin.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/api/errors.ts src/lib/api/github.ts src/lib/api/admin.ts tests/helpers/fake-github.ts tests/api-github.test.ts
git commit -m "feat(app): read venue files from GitHub and refuse stale saves"
```

---

### Task 5: Venue API

**Files:**

- Create: `src/lib/api/venues.ts`
- Modify: `src/lib/api/admin.ts` (routes, Move pin branch)
- Modify: `tests/api-admin.test.ts` (assert the new branch)
- Test: `tests/api-venues.test.ts`

**Interfaces:**

- Consumes: `VenueSchema`, `formatIssues` (`src/lib/server/schema.ts`); `formatVenueJson`, `canonical` (Task 1); `diffVenue` (Task 2); `venueEditProblems`, `EventRef` (Task 3); `openPr`, `readFile`, `readRaw`, `listDir`, `proposeChange`, `GitHubConflict`, `GitHubError` (Task 4); `Refused`.
- Produces:
  - `venues.ts`:
    - `adminBranch(id)` → `admin/<id>`
    - `type VenueSummary = { id: string; name: I18n; landmarks: number; pins: number; pr: string | null }`
    - `listVenues(g) → VenueSummary[]`
    - `eventRefs(g, venueId, ref) → EventRef[]`
    - `readVenue(g, id) → { venue, sha, ref, pr, events } | null`
    - `venueReference(g, id) → ArrayBuffer | null`
    - `saveVenue(g, id, body) → string` (PR url; throws `Refused` or `GitHubConflict`)
  - New routes, all signed in, using `deps.github(env)` (503 when unset):
    - `GET /api/admin/venues` → `{ venues: VenueSummary[] }`
    - `GET /api/admin/venue?id=` → the `readVenue` result, or 404
    - `GET /api/admin/venue/reference?id=` → `image/jpeg` bytes, `cache-control: private, max-age=300`, or 404
    - `POST /api/admin/venue/save` `{ id, venue, sha }` → `{ pr }`. 409 for `Refused` or `GitHubConflict`, 502 for `GitHubError`.
  - Move pin commits to `admin/<venue>` (title `fix(venue): update <venue> from the admin`).

- [ ] **Step 1: Write the failing tests**

Create `tests/api-venues.test.ts`:

```ts
import { test, expect, beforeEach } from 'bun:test';
import { readFileSync } from 'node:fs';
import { handleAdmin, type AdminDeps } from '../src/lib/api/admin';
import { b64url, type Ceremonies } from '../src/lib/api/auth';
import type { Env } from '../src/lib/api/db';
import { fromBase64 } from '../src/lib/api/github';
import { formatVenueJson } from '../src/lib/core/jsonFormat';
import { addLandmark } from '../src/lib/core/venueEdit';
import type { Venue } from '../src/lib/core/types';
import { fakeDb } from './helpers/fake-d1';
import { fakeRepo } from './helpers/fake-github';

const ORIGIN = 'https://booth.example';
const venueText = readFileSync('venues/qsncc-lg-5-8/venue.json', 'utf8');
const eventText = readFileSync('events/bkkibf-2026/event.json', 'utf8');
const base = JSON.parse(venueText) as Venue;
const files = {
  'venues/qsncc-lg-5-8/venue.json': venueText,
  'venues/qsncc-lg-5-8/reference.jpg': new Uint8Array([255, 216, 255]),
  'events/bkkibf-2026/event.json': eventText,
};
const ceremonies: Ceremonies = {
  registrationOptions: async () => ({ challenge: 'reg' }),
  verifyRegistration: async () => ({ id: 'pk', publicKey: new Uint8Array([1]), counter: 0, transports: [] }),
  authenticationOptions: async () => ({ challenge: 'sign' }),
  verifyAuthentication: async () => ({ newCounter: 1 }),
};
let db: ReturnType<typeof fakeDb>, env: Env, repo: ReturnType<typeof fakeRepo>, cookie: string;
const deps = (): AdminDeps => ({ ceremonies, github: () => repo.github, now: () => new Date('2026-10-16T03:00:00Z') });
const call = (method: string, path: string, body?: unknown) =>
  handleAdmin(
    new Request(`${ORIGIN}/api/admin/${path}`, {
      method,
      headers: { origin: ORIGIN, 'content-type': 'application/json', cookie },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    env,
    deps(),
  );

beforeEach(async () => {
  db = fakeDb();
  repo = fakeRepo(files);
  env = {
    DB: db,
    ASSETS: { fetch: async () => Response.json({ events: {}, venues: {} }) },
    ADMIN_SETUP_CODE: 'correct horse battery staple',
  };
  cookie = '';
  await call('POST', 'setup/options', { code: 'correct horse battery staple' });
  const response = {
    id: 'pk',
    response: { clientDataJSON: b64url(new TextEncoder().encode(JSON.stringify({ challenge: 'reg' }))) },
  };
  const r = await call('POST', 'setup/verify', { code: 'correct horse battery staple', name: 'Phone', response });
  cookie = (r.headers.get('set-cookie') ?? '').split(';')[0];
});

test('the venue list comes from main with counts and open PRs', async () => {
  const r = await (await call('GET', 'venues')).json();
  expect(r.venues).toEqual([
    { id: 'qsncc-lg-5-8', name: base.name, landmarks: base.landmarks.length, pins: 0, pr: null },
  ]);
});

test('a venue opens with its sha, ref and the events that use it', async () => {
  const r = await (await call('GET', 'venue?id=qsncc-lg-5-8')).json();
  expect(r.venue).toEqual(base);
  expect(r).toMatchObject({ sha: 'sha-venues/qsncc-lg-5-8/venue.json', ref: 'main', pr: null });
  expect(r.events).toEqual([
    {
      id: 'bkkibf-2026',
      name: JSON.parse(eventText).name,
      refs: ['stage', 'wc2', 'info2'],
      ids: JSON.parse(eventText).landmarks.map((l: { id: string }) => l.id),
    },
  ]);
  expect((await call('GET', 'venue?id=nope')).status).toBe(404);
  expect((await call('GET', 'venue?id=../x')).status).toBe(400);
});

test('an open admin PR is where the venue opens from', async () => {
  repo = fakeRepo(files, { openPr: ['admin/qsncc-lg-5-8'] });
  const r = await (await call('GET', 'venue?id=qsncc-lg-5-8')).json();
  expect(r).toMatchObject({ ref: 'admin/qsncc-lg-5-8', pr: 'https://github.com/apisak-w/book-booth-finder/pull/9' });
  expect(repo.calls.some((c) => c.path.includes('ref=admin%2Fqsncc-lg-5-8'))).toBe(true);
});

test('the printed plan is served privately as a JPEG', async () => {
  const r = await call('GET', 'venue/reference?id=qsncc-lg-5-8');
  expect(r.headers.get('content-type')).toBe('image/jpeg');
  expect(r.headers.get('cache-control')).toBe('private, max-age=300');
  expect([...new Uint8Array(await r.arrayBuffer())]).toEqual([255, 216, 255]);
});

test('saving commits the formatted venue to admin/<id> and opens a PR', async () => {
  const next = addLandmark(base, { group: 'wc', icon: 'wc', th: 'ห้องน้ำ', en: 'Toilets, Hall 9', x: 1200, y: 700 }, [
    'info1',
  ]).venue;
  const r = await call('POST', 'venue/save', {
    id: 'qsncc-lg-5-8',
    venue: next,
    sha: 'sha-venues/qsncc-lg-5-8/venue.json',
  });
  expect(await r.json()).toEqual({ pr: 'https://github.com/apisak-w/book-booth-finder/pull/10' });
  const put = repo.calls.find((c) => c.method === 'PUT')!;
  expect(put.body).toMatchObject({ branch: 'admin/qsncc-lg-5-8' });
  expect(fromBase64(put.body!.content as string)).toBe(formatVenueJson(next));
  expect(String(put.body!.message)).toBe(
    'fix(venue): edit qsncc-lg-5-8 from the admin\n\n- Added wc7 (Toilets, Hall 9)',
  );
  expect(repo.calls.find((c) => c.method === 'POST' && c.path === '/git/refs')!.body).toEqual({
    ref: 'refs/heads/admin/qsncc-lg-5-8',
    sha: 'main-sha',
  });
});

test('a stale copy, a refused change, an unknown field or no change writes nothing', async () => {
  const save = (venue: unknown, sha = 'sha-venues/qsncc-lg-5-8/venue.json') =>
    call('POST', 'venue/save', { id: 'qsncc-lg-5-8', venue, sha });
  const stale = await save(base, 'older');
  expect(stale.status).toBe(409);
  expect((await stale.json()).error).toBe('This venue changed since you opened it. Reload, then save again');
  const del = await save({ ...base, landmarks: base.landmarks.filter((l) => l.id !== 'wc2') });
  expect(del.status).toBe(409);
  expect((await del.json()).error).toContain('wc2 can');
  const walls = await save({ ...base, gridCell: 8 });
  expect((await walls.json()).error).toContain("gridCell can't be changed");
  const extra = await save({ ...base, landmarks: base.landmarks.map((l, i) => (i ? l : { ...l, colour: 'red' })) });
  expect(extra.status).toBe(409);
  expect((await extra.json()).error).toBe("The venue has fields the admin doesn't know. Reload, then try again");
  expect((await save(base)).status).toBe(409);
  expect((await save({ ...base, landmarks: 'nope' })).status).toBe(409);
  expect(repo.calls.filter((c) => c.method !== 'GET')).toEqual([]);
});

test('without GitHub settings the venue routes say what to set', async () => {
  const r = await handleAdmin(new Request(`${ORIGIN}/api/admin/venues`, { headers: { cookie } }), env, {
    ...deps(),
    github: () => null,
  });
  expect(r.status).toBe(503);
});
```

In `tests/api-admin.test.ts`, in `move commits the new pin to a pull request and records it`, add after the `put` assertions:

```ts
expect(gh.calls.find((c) => c.method === 'POST' && c.path === '/git/refs')!.body).toEqual({
  ref: 'refs/heads/admin/qsncc-lg-5-8',
  sha: 'main-sha',
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `bun test tests/api-venues.test.ts tests/api-admin.test.ts`
Expected: FAIL: the venue routes answer 404 and the move test still sees `spots/qsncc-lg-5-8`.

- [ ] **Step 3: Implement the venue module**

Create `src/lib/api/venues.ts`:

```ts
import { canonical, formatVenueJson } from '../core/jsonFormat';
import type { EventFile, I18n, Venue } from '../core/types';
import { venueEditProblems, type EventRef } from '../core/venueChecks';
import { diffVenue } from '../core/venueEdit';
import { formatIssues, VenueSchema } from '../server/schema';
import { Refused } from './errors';
import { listDir, openPr, proposeChange, readFile, readRaw, type GitHub } from './github';

export type VenueSummary = { id: string; name: I18n; landmarks: number; pins: number; pr: string | null };

export const VENUE_ID = /^[a-z0-9][a-z0-9-]*$/;
export const adminBranch = (id: string) => `admin/${id}`;

async function refFor(g: GitHub, id: string) {
  const pr = await openPr(g, adminBranch(id));
  return { ref: pr ? adminBranch(id) : 'main', pr: pr?.url ?? null };
}

export async function listVenues(g: GitHub): Promise<VenueSummary[]> {
  const out: VenueSummary[] = [];
  for (const d of await listDir(g, 'venues', 'main')) {
    if (d.type !== 'dir' || !VENUE_ID.test(d.name)) continue;
    const f = await readFile(g, `venues/${d.name}/venue.json`, 'main');
    if (!f) continue;
    const v = JSON.parse(f.text) as Venue;
    out.push({
      id: d.name,
      name: v.name,
      landmarks: v.landmarks.length,
      pins: v.geo?.pins.length ?? 0,
      pr: (await openPr(g, adminBranch(d.name)))?.url ?? null,
    });
  }
  return out;
}

export async function eventRefs(g: GitHub, venueId: string, ref: string): Promise<EventRef[]> {
  const out: EventRef[] = [];
  for (const d of await listDir(g, 'events', ref)) {
    if (d.type !== 'dir') continue;
    const f = await readFile(g, `events/${d.name}/event.json`, ref);
    if (!f) continue;
    const e = JSON.parse(f.text) as EventFile;
    if (e.venue !== venueId) continue;
    out.push({
      id: e.id,
      name: e.name,
      refs: e.quickPicks.filter((q) => q[0] === 'place').map((q) => q[1]),
      ids: e.landmarks.map((l) => l.id),
    });
  }
  return out;
}

export async function readVenue(g: GitHub, id: string) {
  const { ref, pr } = await refFor(g, id);
  const f = await readFile(g, `venues/${id}/venue.json`, ref);
  if (!f) return null;
  return { venue: JSON.parse(f.text) as Venue, sha: f.sha, ref, pr, events: await eventRefs(g, id, ref) };
}

export async function venueReference(g: GitHub, id: string) {
  const { ref } = await refFor(g, id);
  return readRaw(g, `venues/${id}/reference.jpg`, ref);
}

export async function saveVenue(g: GitHub, id: string, body: Record<string, unknown>): Promise<string> {
  const parsed = VenueSchema.safeParse(body.venue);
  if (!parsed.success) throw new Refused(formatIssues(parsed.error));
  if (canonical(parsed.data) !== canonical(body.venue))
    throw new Refused("The venue has fields the admin doesn't know. Reload, then try again");
  if (typeof body.sha !== 'string') throw new Refused('Reload the venue, then save again');
  const next = body.venue as Venue;
  const { ref } = await refFor(g, id);
  const events = await eventRefs(g, id, ref);
  return proposeChange(g, {
    path: `venues/${id}/venue.json`,
    branch: adminBranch(id),
    expectSha: body.sha,
    title: `fix(venue): update ${id} from the admin`,
    body: 'Changes from the admin. Check the Cloudflare preview before merging.',
    edit: (text) => {
      const base = JSON.parse(text) as Venue;
      const problems = venueEditProblems(base, next, events);
      if (problems.length) throw new Refused(problems.join('; '));
      const changes = diffVenue(base, next);
      if (!changes.length) throw new Refused('Nothing changed');
      return {
        text: formatVenueJson(next),
        message: `fix(venue): edit ${id} from the admin\n\n${changes.map((c) => `- ${c}`).join('\n')}`,
      };
    },
  });
}
```

- [ ] **Step 4: Wire the routes and the Move pin branch**

In `src/lib/api/admin.ts`:

- Change the import from `./github` to `import { GitHubConflict, GitHubError, proposeChange, type GitHub } from './github';` and add `import { adminBranch, listVenues, readVenue, saveVenue, venueReference, VENUE_ID } from './venues';`.
- In `decide`, replace `branch: \`spots/${venue}\`,`with`branch: adminBranch(venue),`and the title with `` title:`fix(venue): update ${venue} from the admin`, ``.
- Add `'GET venues': venuesList, 'GET venue': venueGet, 'GET venue/reference': venueImage, 'POST venue/save': venueSave` to the `closed` map.
- Append these handlers:

```ts
const NO_GITHUB = { error: 'Set GITHUB_TOKEN and GITHUB_REPO in Cloudflare first' };

function venueId(c: Ctx, from: unknown): string | null {
  return typeof from === 'string' && VENUE_ID.test(from) ? from : null;
}

async function venuesList(c: Ctx) {
  const gh = c.deps.github(c.env);
  if (!gh) return jsonResponse(503, NO_GITHUB);
  return jsonResponse(200, { venues: await listVenues(gh) });
}

async function venueGet(c: Ctx) {
  const gh = c.deps.github(c.env);
  if (!gh) return jsonResponse(503, NO_GITHUB);
  const id = venueId(c, c.url.searchParams.get('id'));
  if (!id) return jsonResponse(400, { error: 'Unknown venue id' });
  const v = await readVenue(gh, id);
  return v ? jsonResponse(200, v) : jsonResponse(404, { error: 'No such venue' });
}

async function venueImage(c: Ctx) {
  const gh = c.deps.github(c.env);
  if (!gh) return jsonResponse(503, NO_GITHUB);
  const id = venueId(c, c.url.searchParams.get('id'));
  if (!id) return jsonResponse(400, { error: 'Unknown venue id' });
  const bytes = await venueReference(gh, id);
  if (!bytes) return jsonResponse(404, { error: 'This venue has no printed plan' });
  return new Response(bytes, { headers: { 'content-type': 'image/jpeg', 'cache-control': 'private, max-age=300' } });
}

async function venueSave(c: Ctx) {
  const gh = c.deps.github(c.env);
  if (!gh) return jsonResponse(503, NO_GITHUB);
  const id = venueId(c, c.body.id);
  if (!id) return jsonResponse(400, { error: 'Unknown venue id' });
  try {
    return jsonResponse(200, { pr: await saveVenue(gh, id, c.body) });
  } catch (e) {
    if (e instanceof Refused || e instanceof GitHubConflict) return jsonResponse(409, { error: e.message });
    if (e instanceof GitHubError) return jsonResponse(502, { error: e.message });
    throw e;
  }
}
```

- [ ] **Step 5: Run the tests and checks**

Run: `bun test tests/api-venues.test.ts tests/api-admin.test.ts tests/api-github.test.ts && bun run check && bun run lint`
Expected: PASS, 0 errors.

- [ ] **Step 6: Make sure Zod stays out of the guest pages**

Run: `bun run build && bun test tests/build.test.ts`
Expected: PASS. `Zod is not in the client bundle` still holds because only `functions/` imports `src/lib/api/`.

- [ ] **Step 7: Commit**

```bash
git add src/lib/api tests/api-venues.test.ts tests/api-admin.test.ts
git commit -m "feat(app): read and save venues from the admin"
```

---

### Task 6: Client helpers: undo history, drafts, OpenStreetMap maths, API calls

**Files:**

- Create: `src/lib/admin/history.ts`
- Create: `src/lib/admin/osm.ts`
- Modify: `src/lib/admin/api.ts`
- Test: `tests/admin-history.test.ts`, `tests/admin-osm.test.ts`

**Interfaces:**

- Consumes: `KV` from `src/lib/storage.ts`; `Venue`, `LatLng`, `Point`; `FIT_Z` from `geo.ts`.
- Produces:
  - `history.ts`:
    - `type History<T> = { past: T[]; present: T; future: T[] }`
    - `HISTORY_LIMIT = 100`
    - `start(present)`, `push(h, next)`, `undo(h)`, `redo(h)`
    - `type Draft = { venue: Venue; sha: string; ref: string; at: string }`
    - `draftKey(id)` → `bf:admin:<id>:draft`
    - `readDraft(kv, id) → Draft | null`, `writeDraft(kv, id, d)`, `clearDraft(kv, id)`
    - `isStale(d, sha) → boolean`
  - `osm.ts`:
    - `OSM_URL`, `OSM_CREDIT`, `OSM_MIN_Z = 15`, `OSM_MAX_Z = 19`
    - `type OsmTile = { key: string; href: string; x: number; y: number; size: number }`
    - `osmTiles(c: Point, z, w, h) → OsmTile[]` (world-pixel positions at `FIT_Z`)
    - `screenToWorld(c, z, w, h, p) → Point`
    - `parseLatLng(text) → LatLng | null`
  - `api.ts`:
    - `type VenueSummary`, `type VenueDoc = { venue: Venue; sha: string; ref: string; pr: string | null; events: EventRef[] }`
    - `getVenues()`, `getVenue(id)`, `referenceUrl(id)`, `saveVenue(id, venue, sha) → { pr: string }`

- [ ] **Step 1: Write the failing tests**

Create `tests/admin-history.test.ts`:

```ts
import { test, expect } from 'bun:test';
import {
  clearDraft,
  draftKey,
  isStale,
  push,
  readDraft,
  redo,
  start,
  undo,
  writeDraft,
  HISTORY_LIMIT,
} from '../src/lib/admin/history';
import { makeStore } from '../src/lib/storage';
import { loadVenue } from '../src/lib/server/catalog';

const memory = () => {
  const m = new Map<string, string>();
  return makeStore(
    () =>
      ({
        getItem: (k: string) => m.get(k) ?? null,
        setItem: (k: string, v: string) => void m.set(k, v),
      }) as unknown as Storage,
  );
};

test('undo and redo walk the history, a new change clears redo', () => {
  let h = push(push(start(1), 2), 3);
  h = undo(h);
  expect(h.present).toBe(2);
  h = undo(undo(h));
  expect(h.present).toBe(1);
  h = redo(h);
  expect(h.present).toBe(2);
  h = push(h, 9);
  expect(h).toEqual({ past: [1, 2], present: 9, future: [] });
  expect(redo(h)).toBe(h);
});

test('history keeps at most the last 100 steps', () => {
  let h = start(0);
  for (let i = 1; i <= HISTORY_LIMIT + 20; i++) h = push(h, i);
  expect(h.past).toHaveLength(HISTORY_LIMIT);
  expect(h.past[0]).toBe(20);
});

test('drafts are saved per venue, read back, cleared and judged stale', () => {
  const kv = memory();
  const venue = loadVenue('qsncc-lg-5-8');
  expect(draftKey('qsncc-lg-5-8')).toBe('bf:admin:qsncc-lg-5-8:draft');
  expect(readDraft(kv, 'qsncc-lg-5-8')).toBeNull();
  const d = { venue, sha: 'abc', ref: 'main', at: '2026-10-13T07:05:00.000Z' };
  writeDraft(kv, 'qsncc-lg-5-8', d);
  expect(readDraft(kv, 'qsncc-lg-5-8')).toEqual(d);
  expect(isStale(d, 'abc')).toBe(false);
  expect(isStale(d, 'def')).toBe(true);
  clearDraft(kv, 'qsncc-lg-5-8');
  expect(readDraft(kv, 'qsncc-lg-5-8')).toBeNull();
  kv.set(draftKey('x'), '{not json');
  expect(readDraft(kv, 'x')).toBeNull();
  kv.set(draftKey('y'), JSON.stringify({ sha: 1 }));
  expect(readDraft(kv, 'y')).toBeNull();
});
```

Create `tests/admin-osm.test.ts`:

```ts
import { test, expect } from 'bun:test';
import { OSM_CREDIT, osmTiles, parseLatLng, screenToWorld } from '../src/lib/admin/osm';
import { latLngOf, worldPx } from '../src/lib/core/geo';

const c = worldPx(13.7236, 100.5597);

test('tiles cover the view at their world-pixel positions', () => {
  const tiles = osmTiles(c, 17, 512, 256);
  const size = 256 * 2 ** 3;
  expect(tiles.every((t) => t.size === size)).toBe(true);
  expect(Math.min(...tiles.map((t) => t.x))).toBeLessThanOrEqual(c[0] - 256 * 8);
  expect(Math.max(...tiles.map((t) => t.x + t.size))).toBeGreaterThanOrEqual(c[0] + 256 * 8);
  expect(tiles[0].href).toMatch(/^https:\/\/tile\.openstreetmap\.org\/17\/\d+\/\d+\.png$/);
  expect(new Set(tiles.map((t) => t.key)).size).toBe(tiles.length);
  expect(tiles.length).toBeLessThanOrEqual(12);
  expect(OSM_CREDIT).toBe('© OpenStreetMap contributors');
});

test('the middle of the screen is the centre, and offsets scale with zoom', () => {
  expect(screenToWorld(c, 17, 400, 300, [200, 150])).toEqual(c);
  const p = screenToWorld(c, 18, 400, 300, [300, 150]);
  expect(p[0] - c[0]).toBe(100 * 4);
  const ll = latLngOf(screenToWorld(c, 19, 400, 300, [200, 150]));
  expect(ll.lat).toBeCloseTo(13.7236, 6);
});

test('pasted coordinates are read from common formats', () => {
  expect(parseLatLng('13.7236, 100.5597')).toEqual({ lat: 13.7236, lng: 100.5597 });
  expect(parseLatLng('(13.72361,100.55972)')).toEqual({ lat: 13.72361, lng: 100.55972 });
  expect(parseLatLng('-33.9 151.2')).toEqual({ lat: -33.9, lng: 151.2 });
  expect(parseLatLng('100.5, 13.7')).toBeNull();
  expect(parseLatLng('hello')).toBeNull();
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `bun test tests/admin-history.test.ts tests/admin-osm.test.ts`
Expected: FAIL with `Cannot find module '../src/lib/admin/history'`.

- [ ] **Step 3: Implement**

Create `src/lib/admin/history.ts`:

```ts
import type { Venue } from '../core/types';
import type { KV } from '../storage';

export type History<T> = { past: T[]; present: T; future: T[] };
export type Draft = { venue: Venue; sha: string; ref: string; at: string };

export const HISTORY_LIMIT = 100;

export const start = <T>(present: T): History<T> => ({ past: [], present, future: [] });

export const push = <T>(h: History<T>, next: T): History<T> => ({
  past: [...h.past, h.present].slice(-HISTORY_LIMIT),
  present: next,
  future: [],
});

export const undo = <T>(h: History<T>): History<T> =>
  h.past.length
    ? { past: h.past.slice(0, -1), present: h.past[h.past.length - 1], future: [h.present, ...h.future] }
    : h;

export const redo = <T>(h: History<T>): History<T> =>
  h.future.length ? { past: [...h.past, h.present], present: h.future[0], future: h.future.slice(1) } : h;

export const draftKey = (id: string) => `bf:admin:${id}:draft`;

export function readDraft(kv: KV, id: string): Draft | null {
  const raw = kv.get(draftKey(id));
  if (!raw) return null;
  try {
    const d = JSON.parse(raw) as Draft;
    return d && typeof d.sha === 'string' && typeof d.ref === 'string' && Array.isArray(d.venue?.landmarks) ? d : null;
  } catch {
    return null;
  }
}

export const writeDraft = (kv: KV, id: string, d: Draft) => kv.set(draftKey(id), JSON.stringify(d));
export const clearDraft = (kv: KV, id: string) => kv.set(draftKey(id), '');
export const isStale = (d: Draft, sha: string) => d.sha !== sha;
```

Create `src/lib/admin/osm.ts`:

```ts
import { FIT_Z } from '../core/geo';
import type { LatLng, Point } from '../core/types';

export const OSM_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
export const OSM_CREDIT = '© OpenStreetMap contributors';
export const OSM_MIN_Z = 15;
export const OSM_MAX_Z = 19;

export type OsmTile = { key: string; href: string; x: number; y: number; size: number };

export function osmTiles(c: Point, z: number, w: number, h: number): OsmTile[] {
  const s = 2 ** (FIT_Z - z),
    size = 256 * s,
    n = 2 ** z;
  const x0 = Math.floor((c[0] - (w * s) / 2) / size),
    x1 = Math.floor((c[0] + (w * s) / 2) / size);
  const y0 = Math.max(0, Math.floor((c[1] - (h * s) / 2) / size)),
    y1 = Math.min(n - 1, Math.floor((c[1] + (h * s) / 2) / size));
  const out: OsmTile[] = [];
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      const wrapped = ((x % n) + n) % n;
      out.push({
        key: `${z}/${x}/${y}`,
        href: OSM_URL.replace('{z}', String(z)).replace('{x}', String(wrapped)).replace('{y}', String(y)),
        x: x * size,
        y: y * size,
        size,
      });
    }
  return out;
}

export function screenToWorld(c: Point, z: number, w: number, h: number, [sx, sy]: Point): Point {
  const s = 2 ** (FIT_Z - z);
  return [c[0] + (sx - w / 2) * s, c[1] + (sy - h / 2) * s];
}

export function parseLatLng(text: string): LatLng | null {
  const m = text.match(/(-?\d{1,3}(?:\.\d+)?)\s*[,\s]\s*(-?\d{1,3}(?:\.\d+)?)/);
  if (!m) return null;
  const lat = Number(m[1]),
    lng = Number(m[2]);
  return Math.abs(lat) <= 85 && Math.abs(lng) <= 180 ? { lat, lng } : null;
}
```

Append to `src/lib/admin/api.ts` (add `import type { I18n, Venue } from '$lib/core/types';` and `import type { EventRef } from '$lib/core/venueChecks';` at the top):

```ts
export type VenueSummary = { id: string; name: I18n; landmarks: number; pins: number; pr: string | null };
export type VenueDoc = { venue: Venue; sha: string; ref: string; pr: string | null; events: EventRef[] };

export const getVenues = () => call<{ venues: VenueSummary[] }>('GET', 'venues');
export const getVenue = (id: string) => call<VenueDoc>('GET', `venue?id=${encodeURIComponent(id)}`);
export const referenceUrl = (id: string) => `/api/admin/venue/reference?id=${encodeURIComponent(id)}`;
export const saveVenue = (id: string, venue: Venue, sha: string) =>
  call<{ pr: string }>('POST', 'venue/save', { id, venue, sha });
```

- [ ] **Step 4: Run the tests**

Run: `bun test tests/admin-history.test.ts tests/admin-osm.test.ts && bun run check`
Expected: PASS, 0 errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/admin/history.ts src/lib/admin/osm.ts src/lib/admin/api.ts tests/admin-history.test.ts tests/admin-osm.test.ts
git commit -m "feat(app): add undo, drafts and street map maths for the admin editor"
```

---

### Task 7: Admin tabs and the Guest spots empty state

**Files:**

- Create: `src/lib/admin/SpotsTab.svelte` (the current Guest spots body, moved)
- Create: `src/lib/admin/EmptySpots.svelte`
- Create: `src/lib/admin/VenuesTab.svelte` (list only in this task; the editor arrives in Task 8)
- Modify: `src/lib/admin/Admin.svelte`
- Modify: `src/lib/admin/admin.css`
- Modify: `tests/e2e/admin.e2e.ts`

**Interfaces:**

- Consumes: `getVenues`, `VenueSummary` (Task 6); the existing `places`, `SpotsMap`, `DecisionPanel`.
- Produces:
  - `Admin.svelte` holds `tab: 'venues' | 'spots'`, defaulting to `'venues'`, plus `venueList: VenueSummary[]` loaded after sign-in, and `openVenue: { id: string; mode: 'select' | 'pins' } | null`.
  - `VenuesTab` props: `{ venues: VenueSummary[]; open: { id; mode } | null; onOpen(id, mode); onClose(); onSaved(): void }`.
  - `SpotsTab` props: `{ venues: AdminVenue[]; venueList: VenueSummary[]; onAddPins(id: string): void }`.
  - `EmptySpots` props: `{ venues: VenueSummary[]; onAddPins(id) }`.

- [ ] **Step 1: Write the failing e2e tests**

In `tests/e2e/admin.e2e.ts`:

- Add a list mock to `mock()`:

```ts
await page.route(/\/api\/admin\/venues$/, (r) =>
  r.fulfill({
    json: {
      venues: [
        { id: 'qsncc-lg-5-8', name: { th: 'ฮอลล์ 5–8', en: 'QSNCC Halls 5–8' }, landmarks: 13, pins: 0, pr: null },
        { id: 'qsncc-lg-5-7', name: { th: 'ฮอลล์ 5–7', en: 'QSNCC Halls 5–7' }, landmarks: 12, pins: 0, pr: null },
      ],
    },
  }),
);
```

- Replace the test `signed in with no venue pinned yet: says so` with:

```ts
test('signed in: Venues opens first, and Guest spots offers to add map pins', async ({ page }) => {
  test.skip(!!g, 'qsncc-lg-5-8 has map pins');
  await mock(page, true);
  await page.goto('/admin/');
  const tabs = page.getByRole('navigation', { name: 'Admin sections' });
  await expect(tabs.getByRole('button', { name: 'Venues' })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('button', { name: /QSNCC Halls 5–8/ })).toContainText('Not on the street map yet');
  await tabs.getByRole('button', { name: 'Guest spots' }).click();
  await expect(page.getByRole('heading', { name: 'No venue is on the street map yet' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add map pins' })).toHaveCount(2);
});
```

- In the two signed-in tests that need pins, click the Guest spots tab after `page.goto('/admin/')`:

```ts
await page.getByRole('navigation', { name: 'Admin sections' }).getByRole('button', { name: 'Guest spots' }).click();
```

- [ ] **Step 2: Run them to see them fail**

Run: `bunx playwright test tests/e2e/admin.e2e.ts --project=desktop`
Expected: FAIL, because there is no Venues tab.

- [ ] **Step 3: Move the Guest spots screen into its own component**

Create `src/lib/admin/SpotsTab.svelte`. Its script holds everything from `Admin.svelte` that only Guest spots uses: the `spots`, `decisions`, `placeId`, `filters`, `surroundings`, `venueId` state; the `venue`, `places` and `place` derivations; `load`, `chooseVenue`, `keep` and `move`. Its markup is the current venue select plus the `admin-body` block. Run errors and PR links through two callback props instead of `message` and `link`:

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import { ALL_FILTERS, type Filters, type StoredSpot } from '$lib/core/spotReview';
  import type { Surroundings } from '$lib/core/types';
  import { decide, getSpots, type VenueSummary } from './api';
  import { placeNote, placesFor, type Decision } from './places';
  import type { AdminVenue } from './types';
  import SpotsMap from './SpotsMap.svelte';
  import DecisionPanel from './DecisionPanel.svelte';
  import EmptySpots from './EmptySpots.svelte';

  let {
    venues,
    venueList,
    busy,
    run,
    onDone,
    onAddPins,
  }: {
    venues: AdminVenue[];
    venueList: VenueSummary[];
    busy: boolean;
    run: (fn: () => Promise<void>) => void;
    onDone: (message: string, link?: string) => void;
    onAddPins: (id: string) => void;
  } = $props();
  let venueId = $state('');
  let spots = $state<StoredSpot[]>([]);
  let decisions = $state<Decision[]>([]);
  let placeId = $state('');
  let filters = $state<Filters>({ ...ALL_FILTERS });
  let surroundings = $state<Surroundings | null>(null);

  const venue = $derived(venues.find((v) => v.id === venueId) ?? venues[0] ?? null);
  const places = $derived(venue ? placesFor(venue, spots, decisions, filters) : []);
  const place = $derived(places.find((p) => p.id === placeId) ?? places[0] ?? null);

  async function load() {
    if (!venue) return;
    const r = await getSpots(venue.id);
    spots = r.spots;
    decisions = r.decisions;
    surroundings = await fetch(`/v/${venue.id}/surroundings.json`)
      .then((res) => (res.ok ? res.json() : null))
      .catch(() => null);
  }
  const chooseVenue = (id: string) => {
    venueId = id;
    placeId = '';
    run(load);
  };
  const keep = () =>
    run(async () => {
      if (!venue || !place) return;
      await decide(venue.id, place.id, 'keep', filters);
      await load();
      onDone('Pin kept.');
    });
  const move = () =>
    run(async () => {
      if (!venue || !place) return;
      const r = await decide(venue.id, place.id, 'move', filters);
      await load();
      onDone('Pull request ready. Check the preview, then merge.', r.pr ?? '');
    });

  onMount(() => run(load));
</script>

{#if !venue}
  <EmptySpots venues={venueList} {onAddPins} />
{:else}
  {#if venues.length > 1}
    <label class="admin-venue-pick"
      >Venue
      <select value={venue.id} onchange={(e) => chooseVenue(e.currentTarget.value)}>
        {#each venues as v (v.id)}<option value={v.id}>{v.name.en}</option>{/each}
      </select>
    </label>
  {/if}
  <div class="admin-body">
    <nav class="admin-places" aria-label="Places">
      <h2>Places guests confirmed</h2>
      {#each places as p (p.id)}
        <button type="button" class="admin-place" aria-current={p.id === place?.id} onclick={() => (placeId = p.id)}>
          <b>{p.name.en}{p.kind === 'hall' ? ' (hall confirm)' : ''}</b>
          <span>{placeNote(p, venue)}</span>
        </button>
      {/each}
    </nav>
    {#if place}
      <SpotsMap {venue} {place} {surroundings} />
      {#if place.kind === 'door'}
        <DecisionPanel {place} bind:filters {busy} onKeep={keep} onMove={move} />
      {:else}
        <aside class="admin-decision" aria-label="Decision">
          <h2>{place.name.en}</h2>
          <p class="admin-note">Hall confirms only check the map. They never move a pin.</p>
        </aside>
      {/if}
    {/if}
  </div>
{/if}
```

Create `src/lib/admin/EmptySpots.svelte`:

```svelte
<script lang="ts">
  import type { VenueSummary } from './api';
  let { venues, onAddPins }: { venues: VenueSummary[]; onAddPins: (id: string) => void } = $props();
</script>

<section class="signin" aria-labelledby="empty-t">
  <div class="signin-card">
    <div class="signin-badge" aria-hidden="true">
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.5" />
      </svg>
    </div>
    <h1 id="empty-t">No venue is on the street map yet</h1>
    <p class="signin-lede">Guest spots start once a venue has map pins.</p>
    <ul class="empty-venues">
      {#each venues as v (v.id)}
        <li>
          <div><b>{v.name.en}</b><span>{v.id} · {v.landmarks} landmarks</span></div>
          <button type="button" class="btn primary" onclick={() => onAddPins(v.id)}>Add map pins</button>
        </li>
      {/each}
    </ul>
  </div>
</section>
```

Create `src/lib/admin/VenuesTab.svelte` (the editor slot is filled in Task 8):

```svelte
<script lang="ts">
  import type { VenueSummary } from './api';
  let {
    venues,
    onOpen,
  }: { venues: VenueSummary[]; onOpen: (id: string, mode: 'select' | 'pins') => void } = $props();
</script>

<section class="venue-list" aria-labelledby="venues-t">
  <h1 id="venues-t">Venues</h1>
  <ul>
    {#each venues as v (v.id)}
      <li>
        <button type="button" class="venue-row" onclick={() => onOpen(v.id, 'select')}>
          <b>{v.name.en}</b>
          <span>{v.id} · {v.landmarks} landmarks · {v.pins ? `${v.pins} map pins` : 'Not on the street map yet'}</span>
        </button>
        {#if v.pr}<a href={v.pr} target="_blank" rel="noopener">Open pull request</a>{/if}
      </li>
    {/each}
  </ul>
</section>
```

- [ ] **Step 4: Rebuild Admin.svelte around the tabs**

Replace `src/lib/admin/Admin.svelte` with:

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import { getMe, getVenues, setUp, signIn, signOut, type Me, type VenueSummary } from './api';
  import type { AdminVenue } from './types';
  import SignIn from './SignIn.svelte';
  import SpotsTab from './SpotsTab.svelte';
  import VenuesTab from './VenuesTab.svelte';
  import './admin.css';

  let { venues }: { venues: AdminVenue[] } = $props();
  let me = $state<Me | null>(null);
  let tab = $state<'venues' | 'spots'>('venues');
  let venueList = $state<VenueSummary[]>([]);
  let open = $state<{ id: string; mode: 'select' | 'pins' } | null>(null);
  let message = $state('');
  let link = $state('');
  let busy = $state(false);

  async function run(fn: () => Promise<void>) {
    busy = true;
    message = '';
    link = '';
    try {
      await fn();
    } catch (e) {
      message = e instanceof Error ? e.message : String(e);
    } finally {
      busy = false;
    }
  }
  async function load() {
    me = await getMe();
    if (!me.signedIn) return;
    venueList = (await getVenues()).venues;
  }
  const done = (m: string, l = '') => {
    message = m;
    link = l;
  };
  const openVenue = (id: string, mode: 'select' | 'pins') => {
    open = { id, mode };
    tab = 'venues';
  };
  const addPasskey = () =>
    run(async () => {
      const name = prompt('Name this passkey', 'Spare passkey');
      if (!name) return;
      await setUp('', name);
      await load();
      message = 'Spare passkey added.';
    });

  onMount(() => {
    run(load);
  });
</script>

<div class="admin">
  <header class="admin-top">
    <b>Booth finder admin</b>
    {#if me?.signedIn}
      <nav class="admin-tabs" aria-label="Admin sections">
        <button type="button" class="admin-tab" aria-current={tab === 'venues' ? 'page' : undefined} onclick={() => (tab = 'venues')}>Venues</button>
        <button type="button" class="admin-tab" aria-current={tab === 'spots' ? 'page' : undefined} onclick={() => (tab = 'spots')}>Guest spots</button>
      </nav>
      <button type="button" class="btn" disabled={busy} onclick={addPasskey}>Add a passkey</button>
      <button type="button" class="btn" disabled={busy} onclick={() => run(async () => { await signOut(); await load(); })}>Sign out</button>
    {/if}
  </header>
  {#if !me || me.signedIn}
    <p class="admin-msg" role="status">
      {message}
      {#if link}<a href={link} target="_blank" rel="noopener">Open the pull request</a>{/if}
    </p>
  {/if}
  {#if !me}
    <p class="admin-wait">Checking sign-in…</p>
  {:else if !me.signedIn}
    <SignIn
      hasPasskeys={me.hasPasskeys}
      {busy}
      error={message}
      onSignIn={() => run(async () => { await signIn(); await load(); })}
      onSetUp={(code, name) => run(async () => { await setUp(code, name); await load(); })}
    />
  {:else if tab === 'venues'}
    <VenuesTab venues={venueList} onOpen={openVenue} />
  {:else}
    <SpotsTab {venues} {venueList} {busy} {run} onDone={done} onAddPins={(id) => openVenue(id, 'pins')} />
  {/if}
</div>
```

- [ ] **Step 5: Styles**

Append to `src/lib/admin/admin.css`:

```css
.admin-tab {
  border: 0;
  background: none;
  color: #fff;
  font: inherit;
  cursor: pointer;
}
.admin-venue-pick {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 16px 8px;
  font-size: 14px;
}
.venue-list {
  max-width: 760px;
  padding: 16px;
}
.venue-list h1 {
  margin: 0 0 12px;
  font-family: Mitr, sans-serif;
  font-weight: 500;
  font-size: 22px;
}
.venue-list ul,
.empty-venues {
  display: grid;
  gap: 10px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.venue-list li {
  display: flex;
  align-items: center;
  gap: 12px;
}
.venue-row {
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  min-height: 56px;
  padding: 12px 14px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--panel);
  color: var(--text);
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.venue-row span,
.empty-venues span {
  font-size: 13px;
  color: var(--muted);
}
.empty-venues li {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border: 1px solid var(--line);
  border-radius: 12px;
}
.empty-venues li div {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
}
```

- [ ] **Step 6: Run the e2e tests and checks**

Run: `bunx playwright test tests/e2e/admin.e2e.ts && bun run check && bun run lint`
Expected: PASS, 0 errors.

- [ ] **Step 7: Commit**

```bash
git add src/lib/admin tests/e2e/admin.e2e.ts
git commit -m "feat(app): add a Venues tab and a way into it from Guest spots"
```

---

### Task 8: Venue editor: plan, landmarks, draft, save, phone

**Files:**

- Create: `src/lib/admin/PlanCanvas.svelte`, `LandmarkPanel.svelte`, `SaveDialog.svelte`, `VenueEditor.svelte`
- Modify: `src/lib/admin/VenuesTab.svelte`, `src/lib/admin/Admin.svelte`, `src/lib/admin/admin.css`
- Test: `tests/e2e/venues.e2e.ts`

**Interfaces:**

- Consumes: Tasks 2, 3 and 6 (`venueEdit`, `venueChecks`, `history`, `api`); `createViewport` (`src/lib/map/viewport.ts`); `PLACE_GLYPH` (`src/lib/core/describe.ts`); `store` (`src/lib/storage.ts`).
- Produces:
  - `PlanCanvas` props: `{ venue: Venue; refUrl: string | null; opacity: number; mode: 'select' | 'add' | 'pins'; selected: string | null; pins: GeoPin[]; pending: Point | null; unreachable: string[]; readonly: boolean; onSelect(id); onMove(id, x, y); onAdd(x, y); onPlanPoint(x, y) }`. Landmarks are `<g data-lm="<id>">`.
  - `VenueEditor` props: `{ id: string; mode: 'select' | 'pins'; onClose(): void; onSaved(message: string, link: string): void }`.
  - `VenuesTab` props: `{ venues; open: { id; mode } | null; onOpen(id, mode); onClose(); onSaved(message, link) }`.

- [ ] **Step 1: Write the failing e2e tests**

Create `tests/e2e/venues.e2e.ts`:

```ts
import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

const venue = JSON.parse(readFileSync('venues/qsncc-lg-5-8/venue.json', 'utf8'));
const event = JSON.parse(readFileSync('events/bkkibf-2026/event.json', 'utf8'));
const doc = {
  venue,
  sha: 'sha-1',
  ref: 'main',
  pr: null,
  events: [
    {
      id: event.id,
      name: event.name,
      refs: ['stage', 'wc2', 'info2'],
      ids: event.landmarks.map((l: { id: string }) => l.id),
    },
  ],
};

async function mock(page: Page) {
  const saved: Record<string, unknown>[] = [];
  await page.route(/\/api\/admin\/me$/, (r) =>
    r.fulfill({ json: { signedIn: true, hasPasskeys: true, passkeys: [] } }),
  );
  await page.route(/\/api\/admin\/venues$/, (r) =>
    r.fulfill({
      json: { venues: [{ id: venue.id, name: venue.name, landmarks: venue.landmarks.length, pins: 0, pr: null }] },
    }),
  );
  await page.route(/\/api\/admin\/venue\?id=/, (r) => r.fulfill({ json: doc }));
  await page.route(/\/api\/admin\/venue\/reference/, (r) => r.fulfill({ status: 404, json: { error: 'none' } }));
  await page.route(/\/api\/admin\/venue\/save$/, async (r) => {
    saved.push(r.request().postDataJSON());
    await r.fulfill({ json: { pr: 'https://github.com/apisak-w/book-booth-finder/pull/10' } });
  });
  await page.route(/\/api\/admin\/spots/, (r) => r.fulfill({ json: { spots: [], decisions: [] } }));
  return saved;
}

async function addToilet(page: Page) {
  await page.getByRole('button', { name: /QSNCC Halls 5–8/ }).click();
  await page.getByRole('button', { name: 'Add landmark' }).click();
  await page.locator('.plan-canvas').click();
  await expect(page.getByText('wc7', { exact: true })).toBeVisible();
  await page.getByLabel('Name in Thai').fill('ห้องน้ำ ฮอลล์ 9');
  await page.getByLabel('Name in Thai').blur();
  await page.getByLabel('Name in English').fill('Toilets, Hall 9');
  await page.getByLabel('Name in English').blur();
}

test.use({ viewport: { width: 1280, height: 800 } });

test('add a toilet, name it and save it to the venue pull request', async ({ page }) => {
  const saved = await mock(page);
  await page.goto('/admin/');
  await addToilet(page);
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('dialog')).toContainText('Added wc7 (Toilets, Hall 9)');
  await page.getByRole('button', { name: 'Save to pull request' }).click();
  await expect(page.getByRole('link', { name: 'Open the pull request' })).toHaveAttribute(
    'href',
    'https://github.com/apisak-w/book-booth-finder/pull/10',
  );
  expect(saved).toHaveLength(1);
  const body = saved[0] as { id: string; sha: string; venue: { landmarks: { id: string; en: string }[] } };
  expect(body).toMatchObject({ id: venue.id, sha: 'sha-1' });
  expect(body.venue.landmarks.at(-1)).toMatchObject({ id: 'wc7', en: 'Toilets, Hall 9' });
});

test('a door keeps its place, undo removes a new landmark', async ({ page }) => {
  await mock(page);
  await page.goto('/admin/');
  await page.getByRole('button', { name: /QSNCC Halls 5–8/ }).click();
  await page.locator('[data-lm="door5"]').click();
  await expect(page.getByText('Position is part of the floor plan')).toBeVisible();
  await page.getByRole('button', { name: 'Add landmark' }).click();
  await page.locator('.plan-canvas').click();
  await expect(page.locator('[data-lm="wc7"]')).toHaveCount(1);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.locator('[data-lm="wc7"]')).toHaveCount(0);
});

test('unsaved changes come back after a reload', async ({ page }) => {
  await mock(page);
  await page.goto('/admin/');
  await addToilet(page);
  await page.reload();
  await page.getByRole('button', { name: /QSNCC Halls 5–8/ }).click();
  await expect(page.getByText('Restored unsaved changes')).toBeVisible();
  await expect(page.locator('[data-lm="wc7"]')).toHaveCount(1);
  await page.getByRole('button', { name: 'Discard changes' }).click();
  await expect(page.locator('[data-lm="wc7"]')).toHaveCount(0);
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test('the venue is view-only', async ({ page }) => {
    await mock(page);
    await page.goto('/admin/');
    await page.getByRole('button', { name: /QSNCC Halls 5–8/ }).click();
    await expect(page.getByText('Edit on a larger screen. Placing points needs a mouse or trackpad.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add landmark' })).toHaveCount(0);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `bunx playwright test tests/e2e/venues.e2e.ts --project=desktop`
Expected: FAIL, because the venue row doesn't open an editor.

- [ ] **Step 3: The plan canvas**

Create `src/lib/admin/PlanCanvas.svelte`:

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import { PLACE_GLYPH } from '$lib/core/describe';
  import { isDoor } from '$lib/core/venueEdit';
  import type { GeoPin, Landmark, Point, Venue } from '$lib/core/types';
  import { createViewport, type Viewport } from '$lib/map/viewport';

  let {
    venue,
    refUrl = null,
    opacity = 0.6,
    mode = 'select',
    selected = null,
    pins = [],
    pending = null,
    unreachable = [],
    readonly = false,
    onSelect = () => {},
    onMove = () => {},
    onAdd = () => {},
    onPlanPoint = () => {},
  }: {
    venue: Venue;
    refUrl?: string | null;
    opacity?: number;
    mode?: 'select' | 'add' | 'pins';
    selected?: string | null;
    pins?: GeoPin[];
    pending?: Point | null;
    unreachable?: string[];
    readonly?: boolean;
    onSelect?: (id: string) => void;
    onMove?: (id: string, x: number, y: number) => void;
    onAdd?: (x: number, y: number) => void;
    onPlanPoint?: (x: number, y: number) => void;
  } = $props();

  let svg: SVGSVGElement;
  let vp: Viewport | null = null;
  let drag = $state<{ id: string; p: Point } | null>(null);

  const toPlan = (e: PointerEvent): Point => {
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(svg.getScreenCTM()!.inverse());
    return [Math.round(p.x), Math.round(p.y)];
  };
  const at = (l: Landmark): Point => (drag?.id === l.id ? drag.p : [l.x, l.y]);

  onMount(() => {
    vp = createViewport(svg, venue, (t) => {
      const id = t?.closest('[data-lm]')?.getAttribute('data-lm');
      if (id) onSelect(id);
    });
    vp.fitAll();
    return () => vp?.destroy();
  });

  function downLandmark(e: PointerEvent, id: string) {
    if (readonly || mode !== 'select' || isDoor(venue, id)) return;
    e.stopPropagation();
    onSelect(id);
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    drag = { id, p: toPlan(e) };
  }
  const moveLandmark = (e: PointerEvent) => {
    if (drag) drag = { ...drag, p: toPlan(e) };
  };
  function upLandmark() {
    if (!drag) return;
    const d = drag;
    drag = null;
    const l = venue.landmarks.find((x) => x.id === d.id);
    if (l && (l.x !== d.p[0] || l.y !== d.p[1])) onMove(d.id, d.p[0], d.p[1]);
  }
  function downPlane(e: PointerEvent) {
    if (readonly || mode === 'select') return;
    e.stopPropagation();
    const [x, y] = toPlan(e);
    if (mode === 'add') onAdd(x, y);
    else onPlanPoint(x, y);
  }
</script>

<svg bind:this={svg} class="plan-canvas" class:picking={mode !== 'select' && !readonly} xmlns="http://www.w3.org/2000/svg" role="application" aria-label="Venue plan">
  <rect x="0" y="0" width={venue.reference.width} height={venue.reference.height} class="pc-ground" />
  {#if refUrl}
    <image href={refUrl} x="0" y="0" width={venue.reference.width} height={venue.reference.height} {opacity} preserveAspectRatio="none" />
  {/if}
  {#each venue.walls as w, k (k)}
    <path d={'M' + w.map((p) => p.join(',')).join('L') + 'Z'} class="pc-wall" />
  {/each}
  {#each venue.areas as a (a.id)}
    <text x={a.label.x} y={a.label.y} class="pc-area">{a.label.text}</text>
  {/each}
  {#each venue.doors as d (d.id)}
    <rect x={d.gap[0]} y={d.gap[1]} width={d.gap[2] - d.gap[0]} height={d.gap[3] - d.gap[1]} class="pc-door" />
  {/each}
  {#if mode !== 'select' && !readonly}
    <rect x="0" y="0" width={venue.reference.width} height={venue.reference.height} class="pc-catch" onpointerdown={downPlane} role="presentation" />
  {/if}
  {#each venue.landmarks as l (l.id)}
    {@const p = at(l)}
    <g
      data-lm={l.id}
      class="pc-lm"
      class:sel={l.id === selected}
      class:bad={unreachable.includes(l.id)}
      class:door={isDoor(venue, l.id)}
      onpointerdown={(e) => downLandmark(e, l.id)}
      onpointermove={moveLandmark}
      onpointerup={upLandmark}
      role="button"
      tabindex="-1"
      aria-label={l.en || l.id}
      onkeydown={(e) => e.key === 'Enter' && onSelect(l.id)}
    >
      <circle cx={p[0]} cy={p[1]} r="20" />
      <text x={p[0]} y={p[1] + 7}>{PLACE_GLYPH[l.group]}</text>
    </g>
  {/each}
  {#each pins as pin, k (pin.id)}
    <g class="pc-pin"><circle cx={pin.x} cy={pin.y} r="18" /><text x={pin.x} y={pin.y + 7}>{k + 1}</text></g>
  {/each}
  {#if pending}
    <circle cx={pending[0]} cy={pending[1]} r="18" class="pc-pending" />
  {/if}
</svg>
```

- [ ] **Step 4: The landmark panel and the save dialog**

Create `src/lib/admin/LandmarkPanel.svelte`:

```svelte
<script lang="ts">
  import { GROUP_ORDER, ICON_NAMES, type Landmark, type Venue } from '$lib/core/types';
  import { DEFAULT_ICON, deleteBlockers, isDoor } from '$lib/core/venueEdit';
  import type { EventRef } from '$lib/core/venueChecks';

  let {
    venue,
    lm,
    events,
    readonly,
    onUpdate,
    onDelete,
    onEntrance,
  }: {
    venue: Venue;
    lm: Landmark;
    events: EventRef[];
    readonly: boolean;
    onUpdate: (patch: Partial<Pick<Landmark, 'th' | 'en' | 'group' | 'icon'>>) => void;
    onDelete: () => void;
    onEntrance: (on: boolean) => void;
  } = $props();
  const TYPE_NAME = { entry: 'Entrance', wc: 'Toilets', info: 'Information', charge: 'Charging', stage: 'Stage', other: 'Other' };
  const blockers = $derived(deleteBlockers(venue, lm.id, events));
  const entrance = $derived(!!venue.geo?.entrances.includes(lm.id));
</script>

<div class="lm-panel">
  <div class="lm-head"><b>{lm.en || 'New landmark'}</b><span>{lm.id}</span></div>
  <label>Name in Thai <input value={lm.th} disabled={readonly} onchange={(e) => onUpdate({ th: e.currentTarget.value })} /></label>
  <label>Name in English <input value={lm.en} disabled={readonly} onchange={(e) => onUpdate({ en: e.currentTarget.value })} /></label>
  <label
    >Type
    <select
      value={lm.group}
      disabled={readonly}
      onchange={(e) => {
        const group = e.currentTarget.value as Landmark['group'];
        onUpdate(lm.icon === DEFAULT_ICON[lm.group] ? { group, icon: DEFAULT_ICON[group] } : { group });
      }}
    >
      {#each GROUP_ORDER as g (g)}<option value={g}>{TYPE_NAME[g]}</option>{/each}
    </select>
  </label>
  <label
    >Icon
    <select value={lm.icon} disabled={readonly} onchange={(e) => onUpdate({ icon: e.currentTarget.value as Landmark['icon'] })}>
      {#each ICON_NAMES as i (i)}<option value={i}>{i}</option>{/each}
    </select>
  </label>
  <label class="lm-check"
    ><input type="checkbox" checked={entrance} disabled={readonly || !venue.geo} onchange={(e) => onEntrance(e.currentTarget.checked)} /> Street
    entrance</label
  >
  {#if !venue.geo}<span class="lm-note">Add map pins first to choose street entrances.</span>{/if}
  <span class="lm-note">Plan {lm.x}, {lm.y}{isDoor(venue, lm.id) ? ' · Position is part of the floor plan' : ' · drag to move'}</span>
  {#if !readonly}
    {#if blockers.length}
      <span class="lm-note">Can't delete: {blockers.join('; ')}.</span>
    {:else}
      <button type="button" class="btn" onclick={onDelete}>Delete landmark</button>
    {/if}
  {/if}
</div>
```

Create `src/lib/admin/SaveDialog.svelte`:

```svelte
<script lang="ts">
  let {
    changes,
    pr,
    busy,
    onCancel,
    onSave,
  }: { changes: string[]; pr: string | null; busy: boolean; onCancel: () => void; onSave: () => void } = $props();
</script>

<div class="save-scrim">
  <div class="save-dialog" role="dialog" aria-modal="true" aria-labelledby="save-t">
    <h2 id="save-t">{pr ? 'Add to the open pull request' : 'Open a pull request'}</h2>
    <ul>
      {#each changes as c (c)}<li>{c}</li>{/each}
    </ul>
    <div class="save-btns">
      <button type="button" class="btn" disabled={busy} onclick={onCancel}>Cancel</button>
      <button type="button" class="btn primary" disabled={busy} onclick={onSave}>{busy ? 'Saving…' : 'Save to pull request'}</button>
    </div>
  </div>
</div>
```

- [ ] **Step 5: The editor**

Create `src/lib/admin/VenueEditor.svelte`:

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import type { Venue } from '$lib/core/types';
  import { unreachableLandmarks } from '$lib/core/venueChecks';
  import {
    addLandmark,
    deleteLandmark,
    diffVenue,
    isDoor,
    moveLandmark,
    setEntrance,
    updateLandmark,
  } from '$lib/core/venueEdit';
  import { store } from '$lib/storage';
  import { getVenue, referenceUrl, saveVenue, type VenueDoc } from './api';
  import { clearDraft, isStale, push, readDraft, redo, start, undo, writeDraft, type History } from './history';
  import LandmarkPanel from './LandmarkPanel.svelte';
  import PlanCanvas from './PlanCanvas.svelte';
  import SaveDialog from './SaveDialog.svelte';

  let {
    id,
    onClose,
    onSaved,
  }: { id: string; mode: 'select' | 'pins'; onClose: () => void; onSaved: (message: string, link: string) => void } =
    $props();

  let doc = $state<VenueDoc | null>(null);
  let hist = $state<History<Venue> | null>(null);
  let tool = $state<'select' | 'add'>('select');
  let selected = $state<string | null>(null);
  let opacity = $state(0.6);
  let note = $state('');
  let staleDraft = $state(false);
  let error = $state('');
  let saving = $state(false);
  let confirming = $state(false);
  let readonly = $state(false);

  const venue = $derived(hist?.present ?? null);
  const changes = $derived(doc && venue ? diffVenue(doc.venue, venue) : []);
  const unreachable = $derived(venue ? unreachableLandmarks(venue) : []);
  const unnamed = $derived(venue ? venue.landmarks.filter((l) => !l.th.trim() || !l.en.trim()).map((l) => l.id) : []);
  const problems = $derived([
    ...unreachable.map((x) => `${x} can't be reached on foot from the starting point`),
    ...unnamed.map((x) => `${x} needs a name in Thai and English`),
  ]);
  const lm = $derived(venue?.landmarks.find((l) => l.id === selected) ?? null);
  const taken = $derived(doc ? doc.events.flatMap((e) => e.ids) : []);

  function apply(next: Venue) {
    if (!hist || !doc) return;
    hist = push(hist, next);
    writeDraft(store, id, { venue: next, sha: doc.sha, ref: doc.ref, at: new Date().toISOString() });
    error = '';
  }
  function tryApply(fn: () => Venue) {
    try {
      apply(fn());
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
  }
  function step(h: History<Venue>) {
    if (!doc) return;
    hist = h;
    writeDraft(store, id, { venue: h.present, sha: doc.sha, ref: doc.ref, at: new Date().toISOString() });
  }
  function discard() {
    if (!doc) return;
    clearDraft(store, id);
    hist = start(doc.venue);
    note = '';
    staleDraft = false;
    selected = null;
  }
  async function load() {
    const d = await getVenue(id);
    doc = d;
    hist = start(d.venue);
    const draft = readDraft(store, id);
    if (draft && isStale(draft, d.sha)) staleDraft = true;
    else if (draft) {
      hist = push(hist, draft.venue);
      note = `Restored unsaved changes from ${new Date(draft.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    }
  }
  async function save() {
    if (!doc || !venue) return;
    saving = true;
    try {
      const r = await saveVenue(id, venue, doc.sha);
      clearDraft(store, id);
      confirming = false;
      note = '';
      onSaved('Saved. Check the preview on the pull request, then merge.', r.pr);
      await load();
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
      confirming = false;
    } finally {
      saving = false;
    }
  }
  function onKey(e: KeyboardEvent) {
    if (readonly || !hist || (e.target as HTMLElement).closest('input, select, textarea')) return;
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      step(e.shiftKey ? redo(hist) : undo(hist));
      return;
    }
    const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    if (d && lm && venue && !isDoor(venue, lm.id)) {
      e.preventDefault();
      const k = e.shiftKey ? 10 : 1;
      apply(moveLandmark(venue, lm.id, lm.x + d[0] * k, lm.y + d[1] * k));
    }
  }

  onMount(() => {
    readonly = matchMedia('(max-width: 699px)').matches;
    load().catch((e) => (error = e instanceof Error ? e.message : String(e)));
  });
</script>

<svelte:window onkeydown={onKey} />

<section class="editor" aria-label="Venue editor">
  <div class="editor-bar">
    <button type="button" class="btn" onclick={onClose}>All venues</button>
    <b>{venue?.name.en ?? id}</b>
    {#if doc}
      <span class="editor-ref">
        {#if doc.pr}Continuing <a href={doc.pr} target="_blank" rel="noopener">the open pull request</a>{:else}Editing main{/if}
      </span>
    {/if}
    {#if !readonly && hist}
      <button type="button" class="btn" aria-pressed={tool === 'select'} onclick={() => (tool = 'select')}>Select</button>
      <button type="button" class="btn" aria-pressed={tool === 'add'} onclick={() => (tool = 'add')}>Add landmark</button>
      <button type="button" class="btn" disabled={!hist.past.length} onclick={() => hist && step(undo(hist))}>Undo</button>
      <button type="button" class="btn" disabled={!hist.future.length} onclick={() => hist && step(redo(hist))}>Redo</button>
      <button type="button" class="btn" disabled={!changes.length} onclick={discard}>Discard changes</button>
      <button type="button" class="btn primary" disabled={!changes.length || problems.length > 0 || saving} onclick={() => (confirming = true)}>Save</button>
    {/if}
  </div>
  {#if readonly}<p class="editor-note">Edit on a larger screen. Placing points needs a mouse or trackpad.</p>{/if}
  {#if note}<p class="editor-note">{note}</p>{/if}
  {#if staleDraft}
    <p class="editor-note">
      The venue changed since your unsaved changes were made. <button type="button" class="linkish" onclick={discard}>Discard the old changes</button>
    </p>
  {/if}
  {#if error}<p class="editor-error" role="alert">{error}</p>{/if}
  {#if problems.length && !readonly}
    <ul class="editor-problems">{#each problems as p (p)}<li>{p}</li>{/each}</ul>
  {/if}
  {#if venue && doc}
    <div class="editor-body">
      <div class="editor-plan">
        <PlanCanvas
          {venue}
          refUrl={referenceUrl(id)}
          {opacity}
          mode={tool}
          {selected}
          pins={venue.geo?.pins ?? []}
          {unreachable}
          {readonly}
          onSelect={(x) => (selected = x)}
          onMove={(x, px, py) => tryApply(() => moveLandmark(venue, x, px, py))}
          onAdd={(px, py) => {
            const r = addLandmark(venue, { group: 'wc', icon: 'wc', th: '', en: '', x: px, y: py }, taken);
            apply(r.venue);
            selected = r.id;
            tool = 'select';
          }}
        />
        <label class="editor-opacity">Printed plan <input type="range" min="0" max="1" step="0.05" bind:value={opacity} /></label>
      </div>
      <aside class="editor-side">
        {#if lm}
          <LandmarkPanel
            {venue}
            {lm}
            events={doc.events}
            {readonly}
            onUpdate={(patch) => tryApply(() => updateLandmark(venue, lm.id, patch))}
            onDelete={() => {
              tryApply(() => deleteLandmark(venue, lm.id, doc!.events));
              selected = null;
            }}
            onEntrance={(on) => tryApply(() => setEntrance(venue, lm.id, on))}
          />
        {:else}
          <p class="lm-note">Select a landmark on the plan, or use Add landmark.</p>
        {/if}
      </aside>
    </div>
  {/if}
  {#if confirming && doc}
    <SaveDialog {changes} pr={doc.pr} busy={saving} onCancel={() => (confirming = false)} onSave={save} />
  {/if}
</section>
```

- [ ] **Step 6: Host the editor in the Venues tab**

Replace `src/lib/admin/VenuesTab.svelte` with:

```svelte
<script lang="ts">
  import type { VenueSummary } from './api';
  import VenueEditor from './VenueEditor.svelte';
  let {
    venues,
    open,
    onOpen,
    onClose,
    onSaved,
  }: {
    venues: VenueSummary[];
    open: { id: string; mode: 'select' | 'pins' } | null;
    onOpen: (id: string, mode: 'select' | 'pins') => void;
    onClose: () => void;
    onSaved: (message: string, link: string) => void;
  } = $props();
</script>

{#if open}
  {#key open.id}
    <VenueEditor id={open.id} mode={open.mode} {onClose} {onSaved} />
  {/key}
{:else}
  <section class="venue-list" aria-labelledby="venues-t">
    <h1 id="venues-t">Venues</h1>
    <ul>
      {#each venues as v (v.id)}
        <li>
          <button type="button" class="venue-row" onclick={() => onOpen(v.id, 'select')}>
            <b>{v.name.en}</b>
            <span>{v.id} · {v.landmarks} landmarks · {v.pins ? `${v.pins} map pins` : 'Not on the street map yet'}</span>
          </button>
          {#if v.pr}<a href={v.pr} target="_blank" rel="noopener">Open pull request</a>{/if}
        </li>
      {/each}
    </ul>
  </section>
{/if}
```

In `src/lib/admin/Admin.svelte`, replace `<VenuesTab venues={venueList} onOpen={openVenue} />` with:

```svelte
    <VenuesTab
      venues={venueList}
      {open}
      onOpen={openVenue}
      onClose={() => (open = null)}
      onSaved={(m, l) => {
        done(m, l);
        getVenues()
          .then((r) => (venueList = r.venues))
          .catch(() => {});
      }}
    />
```

- [ ] **Step 7: Editor styles**

Append to `src/lib/admin/admin.css`:

```css
.editor {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
}
.editor-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  border-bottom: 1px solid var(--line);
}
.editor-bar b {
  font-family: Mitr, sans-serif;
  font-weight: 500;
  font-size: 17px;
}
.editor-bar .btn[aria-pressed='true'] {
  background: var(--chip);
  border-color: var(--ink);
}
.editor-ref {
  margin-right: auto;
  font-size: 13px;
  color: var(--muted);
}
.editor-note,
.editor-error {
  margin: 0;
  padding: 8px 16px;
  font-size: 13px;
}
.editor-note {
  background: var(--chip);
}
.editor-error {
  background: rgba(179, 38, 30, 0.1);
  color: #b3261e;
  font-weight: 600;
}
.editor-problems {
  margin: 0;
  padding: 8px 16px 8px 34px;
  font-size: 13px;
  color: #b3261e;
}
.editor-body {
  display: grid;
  flex: 1;
  grid-template-columns: minmax(0, 1fr) 300px;
  min-height: 0;
}
.editor-plan {
  position: relative;
  min-height: 420px;
  background: var(--outside);
}
.plan-canvas {
  display: block;
  width: 100%;
  height: 100%;
  min-height: 420px;
  touch-action: none;
}
.plan-canvas.picking {
  cursor: crosshair;
}
.editor-opacity {
  position: absolute;
  left: 12px;
  bottom: 12px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border-radius: 8px;
  background: var(--panel);
  font-size: 12px;
}
.pc-ground {
  fill: var(--outside);
}
.pc-wall {
  fill: var(--floor);
  fill-opacity: 0.55;
  stroke: var(--wall);
  stroke-width: 4;
}
.pc-area {
  font:
    600 40px Mitr,
    sans-serif;
  fill: var(--ink);
  fill-opacity: 0.35;
  text-anchor: middle;
}
.pc-door {
  fill: var(--sun);
  fill-opacity: 0.7;
}
.pc-catch {
  fill: transparent;
}
.pc-lm circle {
  fill: var(--panel);
  stroke: var(--ink);
  stroke-width: 3;
}
.pc-lm text {
  font:
    600 20px Mitr,
    sans-serif;
  fill: var(--ink);
  text-anchor: middle;
  pointer-events: none;
}
.pc-lm.sel circle {
  stroke: var(--blue);
  stroke-width: 6;
}
.pc-lm.bad circle {
  stroke: #b3261e;
  stroke-width: 6;
}
.pc-lm:not(.door) {
  cursor: grab;
}
.pc-pin circle,
.pc-pending {
  fill: var(--sun);
  stroke: var(--ink);
  stroke-width: 3;
}
.pc-pending {
  fill-opacity: 0.5;
  stroke-dasharray: 6 4;
}
.pc-pin text {
  font:
    600 20px Mitr,
    sans-serif;
  fill: var(--ink);
  text-anchor: middle;
  pointer-events: none;
}
.editor-side {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  border-left: 1px solid var(--line);
  overflow-y: auto;
}
.lm-panel {
  display: grid;
  gap: 10px;
}
.lm-head {
  display: flex;
  flex-direction: column;
}
.lm-head b {
  font-family: Mitr, sans-serif;
  font-weight: 500;
  font-size: 17px;
}
.lm-head span,
.lm-note {
  font-size: 12.5px;
  color: var(--muted);
}
.lm-panel label {
  display: grid;
  gap: 4px;
  font-size: 13px;
  font-weight: 600;
}
.lm-panel input:not([type='checkbox']),
.lm-panel select {
  min-height: 38px;
  padding: 0 10px;
  border: 1.5px solid var(--line);
  border-radius: 10px;
  background: var(--panel);
  color: var(--text);
  font: inherit;
  font-weight: 400;
}
.lm-panel .lm-check {
  display: flex;
  align-items: center;
  gap: 8px;
}
.save-scrim {
  position: fixed;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 16px;
  background: rgba(19, 48, 107, 0.35);
}
.save-dialog {
  display: grid;
  gap: 12px;
  width: min(100%, 460px);
  padding: 20px;
  border-radius: 16px;
  background: var(--panel);
  box-shadow: 0 12px 30px rgba(19, 48, 107, 0.25);
}
.save-dialog h2 {
  margin: 0;
  font-family: Mitr, sans-serif;
  font-weight: 500;
  font-size: 19px;
}
.save-dialog ul {
  margin: 0;
  padding-left: 18px;
  font-size: 14px;
}
.save-btns {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
.linkish {
  border: 0;
  background: none;
  color: var(--blue);
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}
@media (max-width: 899px) {
  .editor-body {
    grid-template-columns: 1fr;
  }
  .editor-side {
    border-left: 0;
    border-top: 1px solid var(--line);
  }
}
```

- [ ] **Step 8: Run the e2e tests and checks**

Run: `bunx playwright test tests/e2e/venues.e2e.ts tests/e2e/admin.e2e.ts && bun run check && bun run lint && bun run test`
Expected: PASS, 0 errors.

- [ ] **Step 9: Commit**

```bash
git add src/lib/admin tests/e2e/venues.e2e.ts
git commit -m "feat(app): edit venue landmarks in the admin and save them as a pull request"
```

---

### Task 9: Map pins mode with a street map

**Files:**

- Create: `src/lib/admin/StreetPicker.svelte`, `src/lib/admin/PinPanel.svelte`
- Modify: `src/lib/admin/VenueEditor.svelte`, `src/lib/admin/admin.css`
- Modify: `tests/e2e/venues.e2e.ts`

**Interfaces:**

- Consumes: `osmTiles`, `screenToWorld`, `parseLatLng`, `OSM_CREDIT`, `OSM_MIN_Z`, `OSM_MAX_Z` (Task 6); `worldPx`, `latLngOf`, `georef`, `planToLatLng`, `pinProblems`; `setPin`, `removePin`, `nextPinId`, `setEntrance` (Task 2).
- Produces:
  - `StreetPicker` props: `{ center: LatLng; pins: GeoPin[]; onPick(ll: LatLng): void }`
  - `PinPanel` props: `{ venue: Venue; selectedPin: string | null; pending: Point | null; readonly: boolean; onSelectPin(id); onPaste(ll); onRemove(id); onEntrance(id, on) }`
  - `VenueEditor` gains tool `'pins'` and starts in it when `mode === 'pins'`.

- [ ] **Step 1: Write the failing e2e tests**

Append to `tests/e2e/venues.e2e.ts`:

```ts
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
);

test('map pins: find the venue, click the plan, then the street map', async ({ page }) => {
  await mock(page);
  await page.route(/tile\.openstreetmap\.org/, (r) => r.fulfill({ contentType: 'image/png', body: PNG }));
  await page.goto('/admin/');
  await page.getByRole('button', { name: /QSNCC Halls 5–8/ }).click();
  await page.getByRole('button', { name: 'Map pins' }).click();
  await page.getByLabel("Paste the venue's coordinates").fill('13.7236, 100.5597');
  await page.getByRole('button', { name: 'Show on the street map' }).click();
  await expect(page.getByText('© OpenStreetMap contributors')).toBeVisible();
  await page.locator('.plan-canvas').click();
  await expect(page.getByText('Now click the same spot on the street map')).toBeVisible();
  await page.locator('.street-picker svg').click();
  await expect(page.locator('.pin-row')).toHaveCount(1);
  await expect(page.locator('.pin-row')).toContainText('13.72360, 100.55970');
  await expect(page.getByText('Add at least 3 pins')).toBeVisible();
});

test('map pins: with no street tiles, pasting coordinates still works', async ({ page }) => {
  await mock(page);
  await page.route(/tile\.openstreetmap\.org/, (r) => r.fulfill({ status: 503, body: '' }));
  await page.goto('/admin/');
  await page.getByRole('button', { name: /QSNCC Halls 5–8/ }).click();
  await page.getByRole('button', { name: 'Map pins' }).click();
  await page.getByLabel("Paste the venue's coordinates").fill('13.7236, 100.5597');
  await page.getByRole('button', { name: 'Show on the street map' }).click();
  await page.locator('.plan-canvas').click();
  await page.getByLabel('Paste coordinates for this pin').fill('13.72401, 100.55912');
  await page.getByRole('button', { name: 'Set pin' }).click();
  await expect(page.locator('.pin-row')).toContainText('13.72401, 100.55912');
  await expect(page.getByText('© OpenStreetMap contributors')).toBeVisible();
});

test('Add map pins from Guest spots opens the editor in map pins mode', async ({ page }) => {
  await mock(page);
  await page.goto('/admin/');
  await page.getByRole('navigation', { name: 'Admin sections' }).getByRole('button', { name: 'Guest spots' }).click();
  await page.getByRole('button', { name: 'Add map pins' }).click();
  await expect(page.getByRole('button', { name: 'Map pins' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByLabel("Paste the venue's coordinates")).toBeVisible();
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `bunx playwright test tests/e2e/venues.e2e.ts --project=desktop -g "map pins"`
Expected: FAIL, because there is no Map pins button.

- [ ] **Step 3: The street picker and the pin panel**

Create `src/lib/admin/StreetPicker.svelte`:

```svelte
<script lang="ts">
  import { untrack } from 'svelte';
  import { latLngOf, worldPx } from '$lib/core/geo';
  import type { GeoPin, LatLng, Point } from '$lib/core/types';
  import { OSM_CREDIT, OSM_MAX_Z, OSM_MIN_Z, osmTiles, screenToWorld } from './osm';

  let { center, pins, onPick }: { center: LatLng; pins: GeoPin[]; onPick: (ll: LatLng) => void } = $props();
  let w = $state(600);
  let h = $state(420);
  let z = $state(18);
  let c = $state<Point>(untrack(() => worldPx(center.lat, center.lng)));
  let drag: { x: number; y: number; c: Point; moved: boolean } | null = null;

  const s = $derived(2 ** (20 - z));
  const tiles = $derived(osmTiles(c, z, w, h));
  const vb = $derived(`${c[0] - (w * s) / 2} ${c[1] - (h * s) / 2} ${w * s} ${h * s}`);

  function down(e: PointerEvent) {
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    drag = { x: e.clientX, y: e.clientY, c, moved: false };
  }
  function move(e: PointerEvent) {
    if (!drag) return;
    const dx = e.clientX - drag.x,
      dy = e.clientY - drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
    if (drag.moved) c = [drag.c[0] - dx * s, drag.c[1] - dy * s];
  }
  function up(e: PointerEvent) {
    const d = drag;
    drag = null;
    if (!d || d.moved) return;
    const r = (e.currentTarget as Element).getBoundingClientRect();
    onPick(latLngOf(screenToWorld(c, z, w, h, [e.clientX - r.left, e.clientY - r.top])));
  }
  const zoom = (k: number) => (z = Math.min(OSM_MAX_Z, Math.max(OSM_MIN_Z, z + k)));
</script>

<div class="street-picker" bind:clientWidth={w} bind:clientHeight={h}>
  <svg
    viewBox={vb}
    role="application"
    aria-label="Street map. Click the spot that matches the plan."
    onpointerdown={down}
    onpointermove={move}
    onpointerup={up}
    onwheel={(e) => {
      e.preventDefault();
      zoom(e.deltaY < 0 ? 1 : -1);
    }}
  >
    {#each tiles as t (t.key)}
      <image href={t.href} x={t.x} y={t.y} width={t.size} height={t.size} />
    {/each}
    {#each pins as p, k (p.id)}
      {@const q = worldPx(p.lat, p.lng)}
      <g class="pc-pin"><circle cx={q[0]} cy={q[1]} r={11 * s} stroke-width={2.5 * s} /><text x={q[0]} y={q[1] + 4.5 * s} font-size={13 * s}>{k + 1}</text></g>
    {/each}
  </svg>
  <div class="sp-zoom">
    <button type="button" class="btn" aria-label="Zoom in" onclick={() => zoom(1)}>+</button>
    <button type="button" class="btn" aria-label="Zoom out" onclick={() => zoom(-1)}>−</button>
  </div>
  <span class="sp-credit">{OSM_CREDIT}</span>
</div>
```

Create `src/lib/admin/PinPanel.svelte`:

```svelte
<script lang="ts">
  import { georef, pinProblems } from '$lib/core/geo';
  import type { LatLng, Point, Venue } from '$lib/core/types';
  import { parseLatLng } from './osm';

  let {
    venue,
    selectedPin,
    pending,
    readonly,
    onSelectPin,
    onPaste,
    onRemove,
    onEntrance,
  }: {
    venue: Venue;
    selectedPin: string | null;
    pending: Point | null;
    readonly: boolean;
    onSelectPin: (id: string) => void;
    onPaste: (ll: LatLng) => void;
    onRemove: (id: string) => void;
    onEntrance: (id: string, on: boolean) => void;
  } = $props();
  let text = $state('');
  let bad = $state(false);
  const pins = $derived(venue.geo?.pins ?? []);
  const problems = $derived(pins.length >= 3 ? pinProblems(pins, venue.metersPerPx) : []);
  const fit = $derived(pins.length >= 3 ? georef(pins) : null);
  const entries = $derived(venue.landmarks.filter((l) => l.group === 'entry' || venue.geo?.entrances.includes(l.id)));
  function set() {
    const ll = parseLatLng(text);
    bad = !ll;
    if (ll) {
      onPaste(ll);
      text = '';
    }
  }
</script>

<div class="pin-panel">
  <b class="pin-title">Map pins</b>
  {#if pending}
    <span class="lm-note">Now click the same spot on the street map, or paste its coordinates.</span>
  {:else if !readonly}
    <span class="lm-note">Click a spot on the plan you can also find on the street map, like a building corner or a door.</span>
  {/if}
  <ul class="pin-list">
    {#each pins as p, k (p.id)}
      <li>
        <button type="button" class="pin-row" aria-current={p.id === selectedPin} onclick={() => onSelectPin(p.id)}>
          <b>Pin {k + 1}</b><span>plan {p.x}, {p.y} · {p.lat.toFixed(5)}, {p.lng.toFixed(5)}</span>
        </button>
        {#if !readonly}<button type="button" class="btn" aria-label="Remove pin {k + 1}" onclick={() => onRemove(p.id)}>Remove</button>{/if}
      </li>
    {/each}
  </ul>
  {#if !readonly && (pending || selectedPin)}
    <label>Paste coordinates for this pin <input bind:value={text} placeholder="13.72361, 100.55972" /></label>
    {#if bad}<span class="editor-error">Paste two numbers, latitude then longitude.</span>{/if}
    <button type="button" class="btn" onclick={set}>Set pin</button>
  {/if}
  {#if pins.length < 3}
    <span class="lm-note">Add at least 3 pins (4 is better) spread across the venue.</span>
  {:else if fit}
    <span class="lm-note">Fit error {fit.residualM.toFixed(1)} m · scale {((fit.mPerPx / venue.metersPerPx - 1) * 100).toFixed(1)}% off</span>
    {#if problems.length}
      <ul class="editor-problems">{#each problems as p (p)}<li>{p}</li>{/each}</ul>
    {:else}
      <span class="admin-ok">Map pin checks pass.</span>
    {/if}
  {/if}
  {#if venue.geo}
    <b class="pin-title">Street entrances</b>
    {#each entries as l (l.id)}
      <label class="lm-check"
        ><input type="checkbox" checked={venue.geo.entrances.includes(l.id)} disabled={readonly} onchange={(e) => onEntrance(l.id, e.currentTarget.checked)} />
        {l.en}</label
      >
    {/each}
  {/if}
</div>
```

- [ ] **Step 4: Wire map pins into the editor**

In `src/lib/admin/VenueEditor.svelte`:

- Add to the imports: `import { georef, planToLatLng } from '$lib/core/geo';`, add `LatLng` and `Point` to the type import from `$lib/core/types`, add `nextPinId, removePin, setPin` to the `venueEdit` import, `import { parseLatLng } from './osm';`, `import PinPanel from './PinPanel.svelte';` and `import StreetPicker from './StreetPicker.svelte';`.
- Read `mode` from props: change the destructuring to `let { id, mode, onClose, onSaved }: …`.
- Change the tool state and add the pins state:

```ts
let tool = $state<'select' | 'add' | 'pins'>(untrack(() => mode));
let selectedPin = $state<string | null>(null);
let pending = $state<Point | null>(null);
let found = $state<LatLng | null>(null);
let findText = $state('');
```

and add `untrack` to the `svelte` import.

- Add these after `const taken`:

```ts
const center = $derived.by((): LatLng | null => {
  const pins = venue?.geo?.pins ?? [];
  if (venue && pins.length >= 3) {
    const v = venue.view;
    return planToLatLng(georef(pins), [v.x + v.w / 2, v.y + v.h / 2]);
  }
  if (pins.length) return { lat: pins[0].lat, lng: pins[0].lng };
  return found;
});

function placeOnWorld(ll: LatLng) {
  if (!venue) return;
  if (pending) {
    const pinId = nextPinId(venue);
    apply(setPin(venue, { id: pinId, x: pending[0], y: pending[1], lat: ll.lat, lng: ll.lng }));
    pending = null;
    selectedPin = pinId;
  } else if (selectedPin) {
    const p = venue.geo?.pins.find((q) => q.id === selectedPin);
    if (p) apply(setPin(venue, { ...p, lat: ll.lat, lng: ll.lng }));
  }
}
function placeOnPlan(x: number, y: number) {
  if (!venue) return;
  const p = selectedPin ? venue.geo?.pins.find((q) => q.id === selectedPin) : null;
  if (p) apply(setPin(venue, { ...p, x, y }));
  else pending = [x, y];
}
function findVenue() {
  found = parseLatLng(findText);
  if (!found) error = 'Paste two numbers, latitude then longitude.';
}
function useMyLocation() {
  navigator.geolocation?.getCurrentPosition(
    (p) => (found = { lat: p.coords.latitude, lng: p.coords.longitude }),
    () => (error = "Couldn't get this device's location. Paste the venue's coordinates instead."),
  );
}
```

- In the toolbar, after the Add landmark button, add:

```svelte
      <button type="button" class="btn" aria-pressed={tool === 'pins'} onclick={() => { tool = 'pins'; selected = null; }}>Map pins</button>
```

and, on the Select and Add landmark buttons, clear the pins state in the click handler too: `onclick={() => { tool = 'select'; pending = null; selectedPin = null; }}` (same for `'add'`).

- Replace the `<div class="editor-body">…</div>` block with:

```svelte
    <div class="editor-body" class:pins={tool === 'pins'}>
      <div class="editor-plan">
        <PlanCanvas
          {venue}
          refUrl={referenceUrl(id)}
          {opacity}
          mode={tool}
          {selected}
          pins={venue.geo?.pins ?? []}
          {pending}
          {unreachable}
          {readonly}
          onSelect={(x) => (selected = x)}
          onMove={(x, px, py) => tryApply(() => moveLandmark(venue, x, px, py))}
          onAdd={(px, py) => {
            const r = addLandmark(venue, { group: 'wc', icon: 'wc', th: '', en: '', x: px, y: py }, taken);
            apply(r.venue);
            selected = r.id;
            tool = 'select';
          }}
          onPlanPoint={placeOnPlan}
        />
        <label class="editor-opacity">Printed plan <input type="range" min="0" max="1" step="0.05" bind:value={opacity} /></label>
      </div>
      {#if tool === 'pins'}
        <div class="editor-street">
          {#if center}
            <StreetPicker {center} pins={venue.geo?.pins ?? []} onPick={placeOnWorld} />
          {:else}
            <div class="find-venue">
              <b>Find the venue on the street map</b>
              <label>Paste the venue's coordinates <input bind:value={findText} placeholder="13.72361, 100.55972" /></label>
              <button type="button" class="btn primary" onclick={findVenue}>Show on the street map</button>
              <button type="button" class="btn" onclick={useMyLocation}>Use this device's location</button>
              <span class="lm-note">In Google Maps, right-click the venue and copy the numbers.</span>
            </div>
          {/if}
        </div>
      {/if}
      <aside class="editor-side">
        {#if tool === 'pins'}
          <PinPanel
            {venue}
            {selectedPin}
            {pending}
            {readonly}
            onSelectPin={(x) => {
              selectedPin = selectedPin === x ? null : x;
              pending = null;
            }}
            onPaste={placeOnWorld}
            onRemove={(x) => {
              apply(removePin(venue, x));
              if (selectedPin === x) selectedPin = null;
            }}
            onEntrance={(x, on) => tryApply(() => setEntrance(venue, x, on))}
          />
        {:else if lm}
          <LandmarkPanel
            {venue}
            {lm}
            events={doc.events}
            {readonly}
            onUpdate={(patch) => tryApply(() => updateLandmark(venue, lm.id, patch))}
            onDelete={() => {
              tryApply(() => deleteLandmark(venue, lm.id, doc!.events));
              selected = null;
            }}
            onEntrance={(on) => tryApply(() => setEntrance(venue, lm.id, on))}
          />
        {:else}
          <p class="lm-note">Select a landmark on the plan, or use Add landmark.</p>
        {/if}
      </aside>
    </div>
```

- Add a client-side pins problem to `problems` so Save stays off until the fit passes:

```ts
const problems = $derived([
  ...unreachable.map((x) => `${x} can't be reached on foot from the starting point`),
  ...unnamed.map((x) => `${x} needs a name in Thai and English`),
  ...(venue?.geo ? pinProblems(venue.geo.pins, venue.metersPerPx).map((p) => `Map pins: ${p}`) : []),
]);
```

and add `pinProblems` to the `$lib/core/geo` import.

- [ ] **Step 5: Styles**

Append to `src/lib/admin/admin.css`:

```css
.editor-body.pins {
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) 300px;
}
.editor-street {
  position: relative;
  min-height: 420px;
  border-left: 1px solid var(--line);
  background: var(--s-ground);
}
.street-picker {
  position: absolute;
  inset: 0;
}
.street-picker svg {
  display: block;
  width: 100%;
  height: 100%;
  cursor: crosshair;
  touch-action: none;
}
.sp-zoom {
  position: absolute;
  top: 10px;
  right: 10px;
  display: grid;
  gap: 4px;
}
.sp-credit {
  position: absolute;
  right: 0;
  bottom: 0;
  padding: 1px 6px;
  background: var(--panel);
  font-size: 11px;
  color: var(--muted);
}
.find-venue {
  display: grid;
  align-content: center;
  gap: 10px;
  max-width: 340px;
  height: 100%;
  margin: 0 auto;
  padding: 16px;
}
.find-venue label,
.pin-panel label {
  display: grid;
  gap: 4px;
  font-size: 13px;
  font-weight: 600;
}
.find-venue input,
.pin-panel input:not([type='checkbox']) {
  min-height: 38px;
  padding: 0 10px;
  border: 1.5px solid var(--line);
  border-radius: 10px;
  background: var(--panel);
  color: var(--text);
  font: inherit;
  font-weight: 400;
}
.pin-panel {
  display: grid;
  gap: 10px;
}
.pin-title {
  font-family: Mitr, sans-serif;
  font-weight: 500;
  font-size: 16px;
}
.pin-list {
  display: grid;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.pin-list li {
  display: flex;
  gap: 6px;
}
.pin-row {
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: flex-start;
  padding: 8px 10px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--chip);
  color: var(--text);
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.pin-row[aria-current='true'] {
  border-color: var(--ink);
}
.pin-row span {
  font-size: 12px;
  color: var(--muted);
}
@media (max-width: 1199px) {
  .editor-body.pins {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  }
  .editor-body.pins .editor-side {
    grid-column: 1 / -1;
  }
}
```

- [ ] **Step 6: Run the e2e tests and checks**

Run: `bunx playwright test tests/e2e/venues.e2e.ts tests/e2e/admin.e2e.ts && bun run check && bun run lint && bun run test`
Expected: PASS, 0 errors.

- [ ] **Step 7: Commit**

```bash
git add src/lib/admin tests/e2e/venues.e2e.ts
git commit -m "feat(app): pin a venue to the street map from the admin"
```

---

### Task 10: Handover notes

**Files:**

- Modify: `README.md`, `CLAUDE.md`

- [ ] **Step 1: README**

In `README.md`, in "Guest spots and the admin screen", add after the "Recovery" subsection:

```markdown
### Editing venues

Venues opens first after sign-in. Open a venue to see it over its printed plan. Add, move, rename or delete landmarks, and use Map pins to pin the plan to the street map (click a spot on the plan, then the same spot on the street map, or paste its coordinates). Save sends every change to one pull request per venue on `admin/<venue-id>`. Check its Cloudflare preview, then merge. Guest-spot pin moves go to the same pull request. Walls, floor, halls and doors can't be edited here yet. Unsaved changes stay in this browser until you save or discard them.
```

- [ ] **Step 2: CLAUDE.md**

In `CLAUDE.md`:

- In Content rules, change the storage keys line to: `- Storage keys \`bf:lang\`, \`bf:<eventId>:from\`, \`bf:<eventId>:asked\` and \`bf:admin:<venueId>:draft\` (admin only), always in try/catch.`
- In the Layout block, change the `src/lib/api/` line to `src/lib/api/         server code for /api/spots and /api/admin/* (no Svelte; may use the Zod schema, server-side only)`.
- In Gotchas, add:

```
- Admin saves write `venue.json` through `formatVenueJson`, which must match oxfmt byte for byte. `tests/json-format.test.ts` checks it against every venue and event file.
- Every admin change to a venue goes to branch `admin/<venue-id>` and one pull request.
```

- [ ] **Step 3: Format, check and commit**

Run: `bun run fmt && bun run fmt:check && bun run test`
Expected: PASS.

```bash
git add README.md CLAUDE.md
git commit -m "docs: explain the admin venue editor"
```

---

## Self-review notes

- Spec coverage:

  | Spec | Plan                                              |
  | ---- | ------------------------------------------------- |
  | 2.1  | Tasks 2, 3, 8 and 9                               |
  | 2.2  | Task 5 `refFor`                                   |
  | 2.3  | Task 5 `adminBranch` and the Move pin branch      |
  | 2.4  | Task 5 reference route, Task 8 `PlanCanvas` image |
  | 2.5  | Tasks 6 and 9                                     |
  | 2.6  | Tasks 3 and 5                                     |
  | 2.7  | Task 8 phone view-only                            |
  | 2.8  | Task 2 `nextLandmarkId`                           |
  | 2.9  | Tasks 2 and 3 `deleteBlockers`                    |
  | 2.10 | Task 2 `moveLandmark`                             |
  | 2.11 | Tasks 6 and 8                                     |
  | 2.12 | Task 7 `EmptySpots`                               |
  | 2.13 | Task 7 tabs                                       |
  | 4    | Task 5                                            |
  | 5    | Tasks 3 and 5                                     |
  | 6    | Task 1                                            |
  | 7    | File Structure                                    |
  | 8    | Each task's tests                                 |

- Types used across tasks:
  - `EventRef` is defined once in `venueChecks.ts` and used by `venueEdit.ts`, `venues.ts` and the client.
  - `VenueSummary` and `VenueDoc` match the JSON that `venues.ts` returns.
  - `NewLandmark`, `Draft` and `History` are used exactly as declared.
- The `formatVenueJson` rules were checked against both venue files and both event files while writing the spec. Every one comes out byte-identical.
