# Guest Spots and Admin Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let guests send one GPS reading at a door or hall hand-off, and let the owner review those readings on a passkey-protected `/admin` page and turn an agreed "Move pin" into a GitHub pull request that changes `venue.json`.

**Architecture:** Pure logic in `src/lib/core/` checks a spot (`spots.ts`) and reviews spots for one place (`spotReview.ts`). Thin server modules in `src/lib/api/` (no Svelte, no Zod) handle requests: `/api/spots` stores rows in D1, and `/api/admin/*` signs the owner in with passkeys (`@simplewebauthn/server`, injected so tests can stub it) and turns a move into a commit and PR through the GitHub REST API. Cloudflare Pages Functions in `functions/` only forward to those modules. The site prerenders `/spots-config.json` from the catalog, so the Function and the pages agree on events, doors and halls. The admin client lives in `src/lib/admin/` and is the only code that imports `@simplewebauthn/browser`.

**Tech Stack:** SvelteKit 2 (adapter-static), Svelte 5 runes, TypeScript, Bun test with `bun:sqlite` standing in for D1, Playwright, Cloudflare Pages Functions, D1, `@simplewebauthn/server` and `@simplewebauthn/browser` 14, GitHub REST API.

**Spec:** `docs/superpowers/specs/2026-10-13-guest-spots-design.md` (builds on `docs/superpowers/specs/2026-10-13-gps-street-map-design.md` and plan 1 on branch `claude/booth-map-gps-overlay-b3d3fa`).

## Global Constraints

- Every guest-facing string exists in `th` and `en` (`tests/strings.test.ts` checks matching keys). The admin screen is owner-only and English only, like the local review tool.
- Copy: plain verbs, sentence case, no exclamation marks, errors say what to do next.
- `src/lib/core/` stays free of DOM, Svelte and Zod. `src/lib/api/` stays free of Svelte and Zod and is imported only by `functions/` and tests. Zod never reaches the client bundle (`tests/build.test.ts`).
- `@simplewebauthn/browser` is imported only under `src/lib/admin/`, and guest pages never load it (build test in Task 12).
- Storage keys: `bf:lang`, `bf:<eventId>:from` and the new `bf:<eventId>:asked` (values `sent`, `never` or a `YYYY-MM-DD` date). Always through `store` (try/catch). The guest's position is never stored on the phone.
- A spot holds only: event, kind (`door` or `hall`), place id, lat and lng (6 decimals), accuracy (whole metres), hour (`YYYY-MM-DDTHH`, UTC) and purge date. No name, device id, IP address or user agent.
- Numbers: a spot is offered at accuracy ≤ 50 m, reading ≤ 2 minutes old and, for a door, ≤ 150 m from where the pins put it. The server takes accuracy in (0, 100] within 2 km of the venue centre, from 7 days before `dates.start` to `dates.end` in the venue time zone, at most 5,000 per event, and deletes spots 30 days after `dates.end`. The review counts GPS better than 15 m and within 100 m of the pin, needs 5 good spots, and suggests a move above `max(5 m, spread)`.
- Map-pin checks are those of `pinProblems` (Task 1): not mirrored, scale within 5% of `metersPerPx`, aspect above 0.95, skew below 3°, RMS under 5 m with 4 or more pins.
- Sessions: cookie `__Host-bf_admin`, HttpOnly, Secure, SameSite=Strict, Path=/, 12 hours, only its SHA-256 in D1. Challenges are single use and last 5 minutes. Setup codes must be at least 16 characters and work once.
- Move pin never pushes to `main`. It commits to `spots/<venue-id>` and opens or reuses one PR.
- The guest card shows only when the site is built with `VITE_SPOTS=1`.
- No verbose code comments. Commits follow Conventional Commits with scopes `core`, `app`, `docs`.
- Run `bun run test` after any change to `venues/`, `events/`, `src/lib/core/` or `src/lib/i18n/`. `tests/golden/v1.json` must keep passing unchanged.

## Review Focus

1. The guest's GPS reading is cleared when locating stops at the hand-off, before the card can use it. Expected: the card still appears with that reading. Pinned by the door e2e test in Task 8.
2. An event that has ended or not yet opened for spots. Expected: no card, since the server would refuse it anyway. Pinned by the `acceptsSpots` test in Task 2 and the existing `locate.e2e.ts` running unchanged against the past `bkkibf-2026` (Task 8 runs it).
3. A captured passkey sign-in response sent a second time. Expected: refused, because its challenge was used. Pinned by the replay test in Task 11.
4. Someone who later learns the setup code tries to register their own passkey. Expected: refused, because the code works once. Pinned by the set-up test in Task 11.
5. A second Move pin while the first PR is still open. Expected: a commit on the same PR, not a second branch that would conflict. Pinned by the open-PR test in Task 10.

---

## File Structure

```
src/lib/core/geo.ts                      + metersBetween, pinProblems
src/lib/core/geometry.ts                 areaAt takes Pick<Venue, 'areas'>
src/lib/core/spots.ts                    spot types, acceptsSpots, parseSpot, canOffer
src/lib/core/spotReview.ts               review maths, hall check, pin move, withPins
src/lib/server/spotsCatalog.ts           buildSpotsConfig, adminVenues
src/routes/spots-config.json/+server.ts  prerendered config for the Function
src/lib/api/db.ts                        Db/Env types, jsonResponse, purge, loadConfig
src/lib/api/spots.ts                     handleSpot
src/lib/api/auth.ts                      sessions, challenges, setup code, passkey rows
src/lib/api/webauthn.ts                  Ceremonies backed by @simplewebauthn/server
src/lib/api/github.ts                    proposeChange, base64 helpers
src/lib/api/admin.ts                     handleAdmin router
functions/api/spots.ts                   Pages Function → handleSpot
functions/api/admin/[[path]].ts          Pages Function → handleAdmin
migrations/0001_spots.sql                D1 schema
src/lib/ui/spotAsk.ts                    ask-state rules
src/lib/ui/spotConfig.ts                 VITE_SPOTS flag
src/lib/ui/SpotAsk.svelte                guest card
src/lib/ui/locator.svelte.ts             + fixAt
src/lib/ui/locate.ts                     + LocView.ask
src/lib/ui/ResultCard.svelte             renders SpotAsk
src/lib/ui/FinderView.svelte             offers and sends spots
src/lib/i18n/strings.ts                  + card strings
src/lib/i18n/keep.ts                     What we keep copy
src/routes/what-we-keep/+page.svelte
src/lib/admin/types.ts, places.ts, api.ts, admin.css
src/lib/admin/Admin.svelte, SignIn.svelte, SpotsMap.svelte, DecisionPanel.svelte
src/routes/admin/+page.server.ts, +page.svelte
src/lib/styles/app.css                   + .spotask, .keep
tests/helpers/fake-d1.ts, fake-github.ts
tests/geo.test.ts, venues.test.ts, spots.test.ts, spot-review.test.ts, spots-catalog.test.ts,
tests/api-spots.test.ts, spot-ask.test.ts, keep.test.ts, api-auth.test.ts, api-github.test.ts,
tests/api-admin.test.ts, admin-places.test.ts, build.test.ts, strings.test.ts
tests/e2e/spots.e2e.ts, admin.e2e.ts
playwright.config.ts                     + VITE_SPOTS=1
.gitignore                               + .wrangler/, wrangler.toml, .dev.vars
README.md, CLAUDE.md                     setup and handover
```

---

### Task 1: Share the map-pin checks

**Files:**

- Modify: `src/lib/core/geo.ts` (append after `planToLatLng`)
- Modify: `tests/geo.test.ts` (imports, two new tests)
- Modify: `tests/venues.test.ts:8` and the `map pins match the plan` test

**Interfaces:**

- Consumes: `georef`, `rad`, `R` already in `geo.ts`; `GeoPin`, `LatLng` from `types.ts`.
- Produces: `metersBetween(a: LatLng, b: LatLng): number` (ground distance in metres, fine under a few km) and `pinProblems(pins: GeoPin[], metersPerPx: number): string[]` (empty when the fit passes; each entry names one failure in plain words).

- [ ] **Step 1: Write the failing tests**

In `tests/geo.test.ts`, add `metersBetween` and `pinProblems` to the import list from `'../src/lib/core/geo'`, then append:

```ts
test('metersBetween measures short distances on the ground', () => {
  expect(metersBetween(fakeLatLng(1400, 900), fakeLatLng(1500, 900))).toBeCloseTo(100 * M, 1);
  expect(metersBetween(fakeLatLng(1400, 900), fakeLatLng(1400, 1000))).toBeCloseTo(100 * M, 1);
});

test('pinProblems passes a clean fit and names what is wrong', () => {
  expect(pinProblems(fakePins(), M)).toEqual([]);
  expect(pinProblems(fakePins().slice(0, 2), M)).toEqual(['needs at least 3 map pins']);
  expect(pinProblems(fakePins(), M * 1.2).some((p) => p.startsWith('scale is'))).toBe(true);
  const mirrored = fakePins().map((p) => ({ ...p, x: 2800 - p.x }));
  expect(pinProblems(mirrored, M)).toContain('the fit is mirrored');
  const bent = fakePins();
  bent[2] = { ...bent[2], ...fakeLatLng(bent[2].x + 400, bent[2].y) };
  expect(pinProblems(bent, M).some((p) => p.startsWith('fit error'))).toBe(true);
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `bun test tests/geo.test.ts`
Expected: FAIL with `Export named 'metersBetween' not found`.

- [ ] **Step 3: Implement**

Append to `src/lib/core/geo.ts`:

```ts
const M_PER_DEG = (2 * Math.PI * R) / 360;

export function metersBetween(a: LatLng, b: LatLng): number {
  const k = Math.cos(rad((a.lat + b.lat) / 2));
  return Math.hypot((b.lat - a.lat) * M_PER_DEG, (b.lng - a.lng) * M_PER_DEG * k);
}

export function pinProblems(pins: GeoPin[], metersPerPx: number): string[] {
  if (pins.length < 3) return ['needs at least 3 map pins'];
  const g = georef(pins),
    out: string[] = [];
  const off = g.mPerPx / metersPerPx - 1;
  if (g.mirrored) out.push('the fit is mirrored');
  if (Math.abs(off) >= 0.05) out.push(`scale is ${(off * 100).toFixed(1)}% off metersPerPx`);
  if (g.aspect <= 0.95) out.push(`the fit is stretched (aspect ${g.aspect.toFixed(3)})`);
  if (g.skewDeg >= 3) out.push(`the fit is skewed by ${g.skewDeg.toFixed(1)}°`);
  if (pins.length >= 4 && g.residualM >= 5) out.push(`fit error is ${g.residualM.toFixed(1)} m`);
  return out;
}
```

- [ ] **Step 4: Use it in the venue test**

In `tests/venues.test.ts` change the import `import { georef } from '../src/lib/core/geo';` to `import { pinProblems } from '../src/lib/core/geo';` and replace the body of `map pins match the plan` with:

```ts
test.skipIf(!venue.geo)('map pins match the plan', () => {
  const geo = venue.geo!;
  expect(pinProblems(geo.pins, venue.metersPerPx)).toEqual([]);
  for (const e of geo.entrances) expect(venue.landmarks.some((l) => l.id === e)).toBe(true);
});
```

- [ ] **Step 5: Run the tests**

Run: `bun test tests/geo.test.ts tests/venues.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/core/geo.ts tests/geo.test.ts tests/venues.test.ts
git commit -m "refactor(core): share the map pin checks"
```

---

### Task 2: Check a guest spot

**Files:**

- Create: `src/lib/core/spots.ts`
- Test: `tests/spots.test.ts`

**Interfaces:**

- Consumes: `metersBetween` (Task 1), `todayIn(tz, now)` from `src/lib/core/status.ts`, `LatLng`.
- Produces:
  - `type SpotKind = 'door' | 'hall'`
  - `type SpotRow = { event; kind: SpotKind; place; lat; lng; accuracy; hour; purgeAfter }` (all strings except numbers `lat`, `lng`, `accuracy`)
  - `type SpotsEvent = { venue: string; start: string; end: string; tz: string; doors: string[]; halls: string[] }`
  - `type SpotsConfig = { events: Record<string, SpotsEvent>; venues: Record<string, LatLng> }`
  - constants `SPOT_MAX_ACCURACY_M = 100`, `SPOT_RADIUS_M = 2000`, `SPOT_OPENS_DAYS = 7`, `SPOT_KEEP_DAYS = 30`, `SPOTS_PER_EVENT = 5000`
  - `addDays(iso: string, n: number): string`
  - `acceptsSpots(dates: { start: string; end: string }, tz: string, now: Date): boolean`
  - `parseSpot(body: unknown, cfg: SpotsConfig, now: Date): { row: SpotRow } | { error: string }`

- [ ] **Step 1: Write the failing tests**

Create `tests/spots.test.ts`:

```ts
import { test, expect } from 'bun:test';
import { acceptsSpots, addDays, parseSpot, type SpotsConfig } from '../src/lib/core/spots';
import { LAT0, LNG0 } from './helpers/fake-geo';

const cfg: SpotsConfig = {
  events: {
    fair: { venue: 'v', start: '2026-10-15', end: '2026-10-25', tz: 'Asia/Bangkok', doors: ['mrt'], halls: ['hall5'] },
  },
  venues: { v: { lat: LAT0, lng: LNG0 } },
};
const good = {
  event: 'fair',
  kind: 'door',
  place: 'mrt',
  lat: LAT0 + 0.00012345678,
  lng: LNG0 - 0.0001,
  accuracy: 8.4,
};
const at = (iso: string) => new Date(iso);

test('a good spot becomes a row with rounded numbers, the hour and a delete date', () => {
  expect(parseSpot(good, cfg, at('2026-10-16T03:20:11Z'))).toEqual({
    row: {
      event: 'fair',
      kind: 'door',
      place: 'mrt',
      lat: 13.723723,
      lng: 100.5596,
      accuracy: 8,
      hour: '2026-10-16T03',
      purgeAfter: '2026-11-24',
    },
  });
});

test('spots are taken from 7 days before the start to the last day, in the venue time zone', () => {
  const dates = { start: '2026-10-15', end: '2026-10-25' };
  expect(addDays('2026-10-15', -7)).toBe('2026-10-08');
  expect(acceptsSpots(dates, 'Asia/Bangkok', at('2026-10-07T16:59:00Z'))).toBe(false);
  expect(acceptsSpots(dates, 'Asia/Bangkok', at('2026-10-07T17:00:00Z'))).toBe(true);
  expect(acceptsSpots(dates, 'Asia/Bangkok', at('2026-10-25T16:59:00Z'))).toBe(true);
  expect(acceptsSpots(dates, 'Asia/Bangkok', at('2026-10-25T17:00:00Z'))).toBe(false);
});

test('bad spots say what is wrong', () => {
  const now = at('2026-10-16T03:00:00Z');
  const err = (b: unknown) => {
    const r = parseSpot(b, cfg, now);
    return 'error' in r ? r.error : null;
  };
  expect(err(null)).toBe('Send a JSON object');
  expect(err([good])).toBe('Send a JSON object');
  expect(err({ ...good, event: 'other' })).toBe('Unknown event');
  expect(err({ ...good, event: '__proto__' })).toBe('Unknown event');
  expect(err({ ...good, kind: 'hall' })).toBe('Unknown place');
  expect(err({ ...good, kind: 'roof' })).toBe('Unknown place');
  expect(err({ ...good, kind: 'hall', place: 'hall5' })).toBeNull();
  expect(err({ ...good, lat: '13.7' })).toBe('lat, lng and accuracy must be numbers');
  expect(err({ ...good, lat: Number.NaN })).toBe('lat, lng and accuracy must be numbers');
  expect(err({ ...good, accuracy: 0 })).toBe('This GPS reading is too rough');
  expect(err({ ...good, accuracy: 101 })).toBe('This GPS reading is too rough');
  expect(err({ ...good, lat: LAT0 + 0.03 })).toBe('This spot is too far from the venue');
  expect(parseSpot(good, cfg, at('2026-11-01T00:00:00Z'))).toEqual({ error: 'This event is not taking spots now' });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `bun test tests/spots.test.ts`
Expected: FAIL with `Cannot find module '../src/lib/core/spots'`.

- [ ] **Step 3: Implement**

Create `src/lib/core/spots.ts`:

```ts
import { metersBetween } from './geo';
import { todayIn } from './status';
import type { LatLng } from './types';

export type SpotKind = 'door' | 'hall';
export type SpotRow = {
  event: string;
  kind: SpotKind;
  place: string;
  lat: number;
  lng: number;
  accuracy: number;
  hour: string;
  purgeAfter: string;
};
export type SpotsEvent = { venue: string; start: string; end: string; tz: string; doors: string[]; halls: string[] };
export type SpotsConfig = { events: Record<string, SpotsEvent>; venues: Record<string, LatLng> };

export const SPOT_MAX_ACCURACY_M = 100;
export const SPOT_RADIUS_M = 2000;
export const SPOT_OPENS_DAYS = 7;
export const SPOT_KEEP_DAYS = 30;
export const SPOTS_PER_EVENT = 5000;

export const addDays = (iso: string, n: number) =>
  new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

export function acceptsSpots(dates: { start: string; end: string }, tz: string, now: Date): boolean {
  const today = todayIn(tz, now);
  return today >= addDays(dates.start, -SPOT_OPENS_DAYS) && today <= dates.end;
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const round = (v: number, d: number) => Math.round(v * 10 ** d) / 10 ** d;

export function parseSpot(body: unknown, cfg: SpotsConfig, now: Date): { row: SpotRow } | { error: string } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: 'Send a JSON object' };
  const b = body as Record<string, unknown>;
  const id = typeof b.event === 'string' && Object.hasOwn(cfg.events, b.event) ? b.event : null;
  if (!id) return { error: 'Unknown event' };
  const ev = cfg.events[id];
  if (!acceptsSpots(ev, ev.tz, now)) return { error: 'This event is not taking spots now' };
  const places = b.kind === 'door' ? ev.doors : b.kind === 'hall' ? ev.halls : null;
  if (!places || typeof b.place !== 'string' || !places.includes(b.place)) return { error: 'Unknown place' };
  const { lat, lng, accuracy } = b;
  if (!isNum(lat) || !isNum(lng) || !isNum(accuracy)) return { error: 'lat, lng and accuracy must be numbers' };
  if (accuracy <= 0 || accuracy > SPOT_MAX_ACCURACY_M) return { error: 'This GPS reading is too rough' };
  const centre = cfg.venues[ev.venue];
  if (!centre || metersBetween({ lat, lng }, centre) > SPOT_RADIUS_M)
    return { error: 'This spot is too far from the venue' };
  return {
    row: {
      event: id,
      kind: b.kind as SpotKind,
      place: b.place,
      lat: round(lat, 6),
      lng: round(lng, 6),
      accuracy: Math.max(1, Math.round(accuracy)),
      hour: now.toISOString().slice(0, 13),
      purgeAfter: addDays(ev.end, SPOT_KEEP_DAYS),
    },
  };
}
```

- [ ] **Step 4: Run the tests**

Run: `bun test tests/spots.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/core/spots.ts tests/spots.test.ts
git commit -m "feat(core): check guest map spots"
```

---

### Task 3: Review spots and move a pin

**Files:**

- Modify: `src/lib/core/geometry.ts:13` (`areaAt` takes `Pick<Venue, 'areas'>`)
- Create: `src/lib/core/spotReview.ts`
- Test: `tests/spot-review.test.ts`

**Interfaces:**

- Consumes: `georef`, `latLngToPlan`, `planToLatLng`, `metersBetween`, `pinProblems` (Task 1); `SpotKind` (Task 2); `areaAt`; `todayIn`.
- Produces:
  - `type StoredSpot = { event: string; kind: SpotKind; place: string; lat: number; lng: number; accuracy: number; hour: string }`
  - `type Filters = { accuracy: boolean; near: boolean; eventDays: boolean }`, `ALL_FILTERS`
  - `type EventDays = Record<string, { start: string; end: string; tz: string }>`
  - `type PlaceReview = { pin: LatLng; good: StoredSpot[]; left: StoredSpot[]; middle: LatLng | null; spreadM: number; offsetM: number; status: 'few' | 'move' | 'right' }`
  - `type DoorStatus = PlaceReview['status'] | 'kept'`
  - `type HallCheck = { inside: StoredSpot[]; elsewhere: number; topArea: string | null; flagged: boolean }`
  - constants `GOOD_ACCURACY_M = 15`, `NEAR_PIN_M = 100`, `MIN_SPOTS = 5`, `MIN_MOVE_M = 5`
  - `spotDay(hour, tz): string`, `entrancePin(pins, { x, y }): LatLng`
  - `reviewDoor(spots, pin, filters, days): PlaceReview`
  - `doorStatus(r: PlaceReview, keptAt: string | null): DoorStatus`
  - `movePin(pins, { id, x, y }, to: LatLng): GeoPin[]`
  - `moveProblems(r, pins, { id, x, y }, metersPerPx): string[]`
  - `hallCheck(spots, hall: string, areas: Area[], pins: GeoPin[]): HallCheck`
  - `withPins(venueJsonText: string, pins: GeoPin[]): string` (rewrites only the `"pins"` array, keeping the file's formatting)

- [ ] **Step 1: Write the failing tests**

Create `tests/spot-review.test.ts`:

```ts
import { test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import {
  ALL_FILTERS,
  doorStatus,
  entrancePin,
  hallCheck,
  movePin,
  moveProblems,
  reviewDoor,
  withPins,
  type StoredSpot,
} from '../src/lib/core/spotReview';
import type { Area } from '../src/lib/core/types';
import { fakeLatLng, fakePins, M } from './helpers/fake-geo';

const mrt = { id: 'mrt', x: 252, y: 560 };
const days = { fair: { start: '2026-10-15', end: '2026-10-25', tz: 'Asia/Bangkok' } };
const spot = (x: number, y: number, extra: Partial<StoredSpot> = {}): StoredSpot => ({
  event: 'fair',
  kind: 'door',
  place: 'mrt',
  ...fakeLatLng(x, y),
  accuracy: 8,
  hour: '2026-10-16T03',
  ...extra,
});
const ring = (cx: number, cy: number, n = 6) =>
  Array.from({ length: n }, (_, k) => spot(cx + 5 * Math.cos(k), cy + 5 * Math.sin(k)));
const pin = entrancePin(fakePins(), mrt);

test('entrancePin puts the entrance where the pins say it is', () => {
  const ll = fakeLatLng(mrt.x, mrt.y);
  expect(pin.lat).toBeCloseTo(ll.lat, 7);
  expect(pin.lng).toBeCloseTo(ll.lng, 7);
});

test('spots clustered 10 m from the pin suggest a move', () => {
  const r = reviewDoor(ring(mrt.x + 100, mrt.y), pin, ALL_FILTERS, days);
  expect(r.status).toBe('move');
  expect(r.good).toHaveLength(6);
  expect(r.offsetM).toBeCloseTo(100 * M, 0);
  expect(r.spreadM).toBeLessThan(1);
});

test('spots around the pin say it looks right, and fewer than 5 are too few', () => {
  expect(reviewDoor(ring(mrt.x, mrt.y), pin, ALL_FILTERS, days).status).toBe('right');
  expect(reviewDoor(ring(mrt.x + 100, mrt.y, 4), pin, ALL_FILTERS, days).status).toBe('few');
  expect(reviewDoor([], pin, ALL_FILTERS, days)).toMatchObject({ status: 'few', middle: null });
});

test('each filter leaves out its spots, and turning it off lets them back in', () => {
  const rough = spot(mrt.x, mrt.y, { accuracy: 40 });
  const far = spot(mrt.x + 1500, mrt.y);
  const late = spot(mrt.x, mrt.y, { hour: '2026-10-25T17' });
  const stray = spot(mrt.x, mrt.y, { event: 'gone' });
  expect(reviewDoor([rough, far, late, stray], pin, ALL_FILTERS, days).left).toEqual([rough, far, late, stray]);
  expect(reviewDoor([rough], pin, { ...ALL_FILTERS, accuracy: false }, days).good).toEqual([rough]);
  expect(reviewDoor([far], pin, { ...ALL_FILTERS, near: false }, days).good).toEqual([far]);
  expect(reviewDoor([late, stray], pin, { ...ALL_FILTERS, eventDays: false }, days).good).toEqual([late, stray]);
});

test('kept shows until a newer spot arrives', () => {
  const r = reviewDoor(ring(mrt.x + 100, mrt.y), pin, ALL_FILTERS, days);
  expect(doorStatus(r, '2026-10-16T05:00:00.000Z')).toBe('kept');
  expect(doorStatus(r, '2026-10-16T03:30:00.000Z')).toBe('move');
  expect(doorStatus(r, null)).toBe('move');
});

test('movePin adds or replaces the entrance pin and the checks run on the result', () => {
  const to = fakeLatLng(mrt.x + 59, mrt.y);
  const added = movePin(fakePins(), mrt, to);
  expect(added).toHaveLength(5);
  expect(added[4]).toEqual({
    id: 'mrt',
    x: 252,
    y: 560,
    lat: Math.round(to.lat * 1e7) / 1e7,
    lng: Math.round(to.lng * 1e7) / 1e7,
  });
  expect(movePin(added, mrt, fakeLatLng(mrt.x, mrt.y))).toHaveLength(5);
  expect(moveProblems(reviewDoor(ring(mrt.x + 59, mrt.y), pin, ALL_FILTERS, days), fakePins(), mrt, M)).toEqual([]);
  const wild = reviewDoor(ring(mrt.x + 900, mrt.y), pin, ALL_FILTERS, days);
  expect(moveProblems(wild, fakePins(), mrt, M).some((p) => p.startsWith('fit error'))).toBe(true);
  expect(moveProblems(reviewDoor([], pin, ALL_FILTERS, days), fakePins(), mrt, M)).toEqual([
    'Only 0 good spots. Moving a pin needs 5.',
  ]);
  expect(moveProblems(reviewDoor([spot(mrt.x, mrt.y)], pin, ALL_FILTERS, days), fakePins(), mrt, M)).toEqual([
    'Only 1 good spot. Moving a pin needs 5.',
  ]);
});

const square = (id: string, x0: number): Area => ({
  id,
  name: { th: id, en: id },
  label: { x: x0 + 500, y: 500, text: id },
  bounds: [
    [x0, 0],
    [x0 + 1000, 0],
    [x0 + 1000, 1000],
    [x0, 1000],
  ],
});
const areas = [square('h1', 0), square('h2', 1000)];
const hallSpot = (x: number) => spot(x, 500, { kind: 'hall', place: 'h1' });

test('hall confirms are flagged when most land in another hall', () => {
  const c = hallCheck([500, 600, 1500, 1600, 1700, 1800].map(hallSpot), 'h1', areas, fakePins());
  expect(c).toMatchObject({ elsewhere: 4, topArea: 'h2', flagged: true });
  expect(c.inside).toHaveLength(2);
  expect(hallCheck([1500, 1600, 1700].map(hallSpot), 'h1', areas, fakePins()).flagged).toBe(false);
  expect(hallCheck([500, 600, 700, 1500, 1600].map(hallSpot), 'h1', areas, fakePins()).flagged).toBe(false);
});

test('withPins rewrites only the pins and keeps the file format', () => {
  const text = readFileSync('venues/qsncc-lg-5-8/venue.json', 'utf8');
  const venue = JSON.parse(text);
  expect(withPins(text, venue.geo.pins)).toBe(text);
  const pins = movePin(venue.geo.pins, mrt, { lat: 13.7231, lng: 100.5612 });
  const next = withPins(text, pins);
  expect(JSON.parse(next)).toEqual({ ...venue, geo: { ...venue.geo, pins } });
  expect(next.split('\n').length).toBe(text.split('\n').length + 7);
  expect(() => withPins('{}', pins)).toThrow('venue.json has no map pins');
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `bun test tests/spot-review.test.ts`
Expected: FAIL with `Cannot find module '../src/lib/core/spotReview'`.

- [ ] **Step 3: Let `areaAt` take only the areas**

In `src/lib/core/geometry.ts` change the signature of `areaAt` to:

```ts
export function areaAt(venue: Pick<Venue, 'areas'>, x: number, y: number): string | null {
```

- [ ] **Step 4: Implement**

Create `src/lib/core/spotReview.ts`:

```ts
import { georef, latLngToPlan, metersBetween, pinProblems, planToLatLng } from './geo';
import { areaAt } from './geometry';
import { todayIn } from './status';
import type { SpotKind } from './spots';
import type { Area, GeoPin, LatLng } from './types';

export type StoredSpot = {
  event: string;
  kind: SpotKind;
  place: string;
  lat: number;
  lng: number;
  accuracy: number;
  hour: string;
};
export type Filters = { accuracy: boolean; near: boolean; eventDays: boolean };
export type EventDays = Record<string, { start: string; end: string; tz: string }>;
export type PlaceReview = {
  pin: LatLng;
  good: StoredSpot[];
  left: StoredSpot[];
  middle: LatLng | null;
  spreadM: number;
  offsetM: number;
  status: 'few' | 'move' | 'right';
};
export type DoorStatus = PlaceReview['status'] | 'kept';
export type HallCheck = { inside: StoredSpot[]; elsewhere: number; topArea: string | null; flagged: boolean };
type PinPlace = { id: string; x: number; y: number };

export const ALL_FILTERS: Filters = { accuracy: true, near: true, eventDays: true };
export const GOOD_ACCURACY_M = 15;
export const NEAR_PIN_M = 100;
export const MIN_SPOTS = 5;
export const MIN_MOVE_M = 5;

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b),
    k = s.length >> 1;
  return s.length % 2 ? s[k] : (s[k - 1] + s[k]) / 2;
};
const round7 = (v: number) => Math.round(v * 1e7) / 1e7;

export const spotDay = (hour: string, tz: string) => todayIn(tz, new Date(`${hour}:00:00Z`));
export const entrancePin = (pins: GeoPin[], p: { x: number; y: number }): LatLng =>
  planToLatLng(georef(pins), [p.x, p.y]);

export function reviewDoor(spots: StoredSpot[], pin: LatLng, filters: Filters, days: EventDays): PlaceReview {
  const good: StoredSpot[] = [],
    left: StoredSpot[] = [];
  for (const s of spots) {
    const d = days[s.event],
      day = d ? spotDay(s.hour, d.tz) : '';
    const ok =
      (!filters.accuracy || s.accuracy <= GOOD_ACCURACY_M) &&
      (!filters.near || metersBetween(s, pin) <= NEAR_PIN_M) &&
      (!filters.eventDays || (!!d && day >= d.start && day <= d.end));
    (ok ? good : left).push(s);
  }
  if (!good.length) return { pin, good, left, middle: null, spreadM: 0, offsetM: 0, status: 'few' };
  const middle = { lat: median(good.map((s) => s.lat)), lng: median(good.map((s) => s.lng)) };
  const spreadM = median(good.map((s) => metersBetween(s, middle)));
  const offsetM = metersBetween(middle, pin);
  const status = good.length < MIN_SPOTS ? 'few' : offsetM > Math.max(MIN_MOVE_M, spreadM) ? 'move' : 'right';
  return { pin, good, left, middle, spreadM, offsetM, status };
}

export function doorStatus(r: PlaceReview, keptAt: string | null): DoorStatus {
  const all = [...r.good, ...r.left];
  return keptAt && all.every((s) => `${s.hour}:59:59.999Z` < keptAt) ? 'kept' : r.status;
}

export function movePin(pins: GeoPin[], p: PinPlace, to: LatLng): GeoPin[] {
  const pin: GeoPin = { id: p.id, x: p.x, y: p.y, lat: round7(to.lat), lng: round7(to.lng) };
  return pins.some((q) => q.id === p.id) ? pins.map((q) => (q.id === p.id ? pin : q)) : [...pins, pin];
}

export function moveProblems(r: PlaceReview, pins: GeoPin[], p: PinPlace, metersPerPx: number): string[] {
  const n = r.good.length;
  if (!r.middle || n < MIN_SPOTS) return [`Only ${n} good spot${n === 1 ? '' : 's'}. Moving a pin needs ${MIN_SPOTS}.`];
  return pinProblems(movePin(pins, p, r.middle), metersPerPx);
}

export function hallCheck(spots: StoredSpot[], hall: string, areas: Area[], pins: GeoPin[]): HallCheck {
  const g = georef(pins),
    inside: StoredSpot[] = [],
    other = new Map<string, number>();
  for (const s of spots) {
    const [x, y] = latLngToPlan(g, s);
    const a = areaAt({ areas }, x, y) ?? 'outside';
    if (a === hall) inside.push(s);
    else other.set(a, (other.get(a) ?? 0) + 1);
  }
  const elsewhere = spots.length - inside.length;
  const topArea = [...other].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  return { inside, elsewhere, topArea, flagged: spots.length >= MIN_SPOTS && elsewhere * 2 > spots.length };
}

export function withPins(text: string, pins: GeoPin[]): string {
  const start = text.indexOf('"pins": [');
  if (start < 0) throw new Error('venue.json has no map pins');
  const open = start + '"pins": '.length;
  let depth = 0,
    end = open;
  for (; end < text.length; end++) {
    if (text[end] === '[') depth++;
    else if (text[end] === ']' && --depth === 0) break;
  }
  const indent = text.slice(text.lastIndexOf('\n', start) + 1, start);
  return text.slice(0, open) + JSON.stringify(pins, null, 2).replace(/\n/g, `\n${indent}`) + text.slice(end + 1);
}
```

- [ ] **Step 5: Run the tests**

Run: `bun test tests/spot-review.test.ts tests/locate.test.ts tests/geometry.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/core/geometry.ts src/lib/core/spotReview.ts tests/spot-review.test.ts
git commit -m "feat(core): review guest spots and move a map pin"
```

---

### Task 4: Publish the spots config

**Files:**

- Create: `src/lib/server/spotsCatalog.ts`
- Create: `src/routes/spots-config.json/+server.ts`
- Modify: `tests/build.test.ts` (one new test)
- Test: `tests/spots-catalog.test.ts`

**Interfaces:**

- Consumes: `listEventIds`, `loadEvent` from `src/lib/server/catalog.ts`; `georef`, `planToLatLng`; `SpotsConfig` (Task 2).
- Produces: `buildSpotsConfig(root?: string): SpotsConfig`, served as `/spots-config.json` and read by the Functions in Tasks 5 and 11.

- [ ] **Step 1: Write the failing tests**

Create `tests/spots-catalog.test.ts`:

```ts
import { test, expect } from 'bun:test';
import { metersBetween } from '../src/lib/core/geo';
import { listEventIds, loadEvent } from '../src/lib/server/catalog';
import { buildSpotsConfig } from '../src/lib/server/spotsCatalog';

const cfg = buildSpotsConfig();

test('every event at a venue with map pins is listed with its doors and halls', () => {
  for (const id of listEventIds()) {
    const { event, venue } = loadEvent(id);
    if (!venue.geo) {
      expect(cfg.events[id]).toBeUndefined();
      continue;
    }
    expect(cfg.events[id]).toEqual({
      venue: venue.id,
      start: event.dates.start,
      end: event.dates.end,
      tz: venue.timezone,
      doors: venue.geo.entrances,
      halls: venue.areas.map((a) => a.id),
    });
  }
});

test('the venue centre sits among the map pins', () => {
  expect(metersBetween(cfg.venues['qsncc-lg-5-8'], { lat: 13.7236, lng: 100.5597 })).toBeLessThan(300);
});
```

Append to `tests/build.test.ts`:

```ts
test.skipIf(!built)('the spots config is published', () => {
  const cfg = JSON.parse(readFileSync('_site/spots-config.json', 'utf8'));
  expect(cfg.events['bkkibf-2026'].venue).toBe('qsncc-lg-5-8');
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `bun test tests/spots-catalog.test.ts`
Expected: FAIL with `Cannot find module '../src/lib/server/spotsCatalog'`.

- [ ] **Step 3: Implement**

Create `src/lib/server/spotsCatalog.ts`:

```ts
import { georef, planToLatLng } from '../core/geo';
import type { SpotsConfig } from '../core/spots';
import { listEventIds, loadEvent } from './catalog';

const round6 = (v: number) => Math.round(v * 1e6) / 1e6;

export function buildSpotsConfig(root = process.cwd()): SpotsConfig {
  const cfg: SpotsConfig = { events: {}, venues: {} };
  for (const id of listEventIds(root)) {
    const { event, venue } = loadEvent(id, root);
    if (!venue.geo) continue;
    if (!cfg.venues[venue.id]) {
      const pts = venue.walls.flat(),
        xs = pts.map((p) => p[0]),
        ys = pts.map((p) => p[1]);
      const c = planToLatLng(georef(venue.geo.pins), [
        (Math.min(...xs) + Math.max(...xs)) / 2,
        (Math.min(...ys) + Math.max(...ys)) / 2,
      ]);
      cfg.venues[venue.id] = { lat: round6(c.lat), lng: round6(c.lng) };
    }
    cfg.events[id] = {
      venue: venue.id,
      start: event.dates.start,
      end: event.dates.end,
      tz: venue.timezone,
      doors: venue.geo.entrances,
      halls: venue.areas.map((a) => a.id),
    };
  }
  return cfg;
}
```

Create `src/routes/spots-config.json/+server.ts`:

```ts
import { json } from '@sveltejs/kit';
import { buildSpotsConfig } from '$lib/server/spotsCatalog';
import type { RequestHandler } from './$types';

export const prerender = true;

export const GET: RequestHandler = () => json(buildSpotsConfig());
```

- [ ] **Step 4: Run the tests and the build**

Run: `bun test tests/spots-catalog.test.ts && bun run build && bun test tests/build.test.ts`
Expected: PASS, and `_site/spots-config.json` exists.

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/spotsCatalog.ts src/routes/spots-config.json tests/spots-catalog.test.ts tests/build.test.ts
git commit -m "feat(app): publish the events that take guest spots"
```

---

### Task 5: Store spots in D1 at `/api/spots`

**Files:**

- Create: `migrations/0001_spots.sql`
- Create: `src/lib/api/db.ts`
- Create: `src/lib/api/spots.ts`
- Create: `functions/api/spots.ts`
- Create: `tests/helpers/fake-d1.ts`
- Modify: `.gitignore` (add `.wrangler/`, `wrangler.toml`, `.dev.vars`)
- Test: `tests/api-spots.test.ts`

**Interfaces:**

- Consumes: `parseSpot`, `SPOTS_PER_EVENT`, `SpotsConfig` (Task 2); `/spots-config.json` (Task 4).
- Produces:
  - `db.ts`: `interface Stmt { bind(...v: unknown[]): Stmt; first<T = Row>(): Promise<T | null>; all<T = Row>(): Promise<{ results: T[] }>; run(): Promise<unknown> }`, `interface Db { prepare(sql: string): Stmt; batch(s: Stmt[]): Promise<unknown[]> }`, `type Env = { DB: Db; ASSETS: { fetch(r: Request): Promise<Response> }; ADMIN_SETUP_CODE?: string; GITHUB_TOKEN?: string; GITHUB_REPO?: string }`, `jsonResponse(status, body): Response`, `purge(db, now): Promise<void>`, `loadConfig(env, url): Promise<SpotsConfig>`.
  - `spots.ts`: `handleSpot(request: Request, env: Env, now?: Date): Promise<Response>` (204 on success).
  - `tests/helpers/fake-d1.ts`: `fakeDb(): Db & { raw: Database }` running the real migration on `bun:sqlite`.
  - D1 tables `spots`, `decisions`, `passkeys`, `sessions`, `challenges`, `meta`, used by Tasks 9 and 11.

- [ ] **Step 1: Write the schema**

Create `migrations/0001_spots.sql`:

```sql
CREATE TABLE spots (
  id INTEGER PRIMARY KEY,
  event TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('door', 'hall')),
  place TEXT NOT NULL,
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  accuracy INTEGER NOT NULL,
  hour TEXT NOT NULL,
  purge_after TEXT NOT NULL
);
CREATE INDEX spots_event_place ON spots (event, place);
CREATE INDEX spots_purge ON spots (purge_after);

CREATE TABLE decisions (
  id INTEGER PRIMARY KEY,
  venue TEXT NOT NULL,
  place TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('keep', 'move')),
  lat REAL,
  lng REAL,
  spots INTEGER NOT NULL,
  pr TEXT,
  at TEXT NOT NULL
);
CREATE INDEX decisions_venue ON decisions (venue, at);

CREATE TABLE passkeys (
  id TEXT PRIMARY KEY,
  public_key BLOB NOT NULL,
  counter INTEGER NOT NULL,
  transports TEXT NOT NULL,
  name TEXT NOT NULL,
  created TEXT NOT NULL,
  last_used TEXT
);

CREATE TABLE sessions (token_hash TEXT PRIMARY KEY, expires TEXT NOT NULL);

CREATE TABLE challenges (challenge TEXT PRIMARY KEY, kind TEXT NOT NULL, expires TEXT NOT NULL);

CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
```

- [ ] **Step 2: Write the fake D1**

Create `tests/helpers/fake-d1.ts`:

```ts
import { Database } from 'bun:sqlite';
import { readFileSync } from 'node:fs';
import type { Db, Stmt } from '../../src/lib/api/db';

export function fakeDb(): Db & { raw: Database } {
  const raw = new Database(':memory:');
  raw.run(readFileSync('migrations/0001_spots.sql', 'utf8'));
  const stmt = (sql: string, values: unknown[] = []): Stmt => ({
    bind: (...v) => stmt(sql, v),
    first: async <T>() => (raw.query(sql).get(...(values as never[])) ?? null) as T | null,
    all: async <T>() => ({ results: raw.query(sql).all(...(values as never[])) as T[] }),
    run: async () => raw.query(sql).run(...(values as never[])),
  });
  return { raw, prepare: (sql) => stmt(sql), batch: async (all) => Promise.all(all.map((s) => s.run())) };
}
```

- [ ] **Step 3: Write the failing tests**

Create `tests/api-spots.test.ts`:

```ts
import { test, expect, beforeEach } from 'bun:test';
import type { Env } from '../src/lib/api/db';
import { handleSpot } from '../src/lib/api/spots';
import { SPOTS_PER_EVENT, type SpotsConfig } from '../src/lib/core/spots';
import { fakeDb } from './helpers/fake-d1';
import { LAT0, LNG0 } from './helpers/fake-geo';

const cfg: SpotsConfig = {
  events: {
    fair: { venue: 'v', start: '2026-10-15', end: '2026-10-25', tz: 'Asia/Bangkok', doors: ['mrt'], halls: ['hall5'] },
  },
  venues: { v: { lat: LAT0, lng: LNG0 } },
};
const now = new Date('2026-10-16T03:20:00Z');
const good = { event: 'fair', kind: 'door', place: 'mrt', lat: LAT0, lng: LNG0, accuracy: 9 };
const INSERT =
  'INSERT INTO spots (event, kind, place, lat, lng, accuracy, hour, purge_after) VALUES (?, ?, ?, ?, ?, ?, ?, ?)';
let db: ReturnType<typeof fakeDb>;
let env: Env;

beforeEach(() => {
  db = fakeDb();
  env = { DB: db, ASSETS: { fetch: async () => Response.json(cfg) } };
});

const send = (body: unknown, type = 'application/json') =>
  handleSpot(
    new Request('https://booth.example/api/spots', {
      method: 'POST',
      headers: { 'content-type': type },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
    env,
    now,
  );

test('a good spot is stored and answered with 204', async () => {
  expect((await send(good)).status).toBe(204);
  expect(db.raw.query('SELECT event, kind, place, lat, lng, accuracy, hour, purge_after FROM spots').all()).toEqual([
    {
      event: 'fair',
      kind: 'door',
      place: 'mrt',
      lat: LAT0,
      lng: LNG0,
      accuracy: 9,
      hour: '2026-10-16T03',
      purge_after: '2026-11-24',
    },
  ]);
});

test('the spots table holds nothing about the sender', () => {
  const cols = db.raw
    .query('PRAGMA table_info(spots)')
    .all()
    .map((c) => (c as { name: string }).name);
  expect(cols).toEqual(['id', 'event', 'kind', 'place', 'lat', 'lng', 'accuracy', 'hour', 'purge_after']);
});

test('bad requests are refused with a reason and store nothing', async () => {
  expect((await send(good, 'text/plain')).status).toBe(415);
  expect((await send('{not json')).status).toBe(400);
  expect((await send({ ...good, pad: 'x'.repeat(3000) })).status).toBe(413);
  const r = await send({ ...good, place: 'roof' });
  expect(r.status).toBe(400);
  expect(await r.json()).toEqual({ error: 'Unknown place' });
  expect((await handleSpot(new Request('https://booth.example/api/spots'), env, now)).status).toBe(405);
  expect(db.raw.query('SELECT COUNT(*) AS n FROM spots').get()).toEqual({ n: 0 });
});

test('spots past their delete date go on the next call', async () => {
  db.raw.query(INSERT).run('old', 'door', 'mrt', 0, 0, 5, '2026-09-01T10', '2026-10-15');
  db.raw.query(INSERT).run('old', 'door', 'mrt', 0, 0, 5, '2026-09-01T10', '2026-10-16');
  await send({ ...good, place: 'roof' });
  expect(db.raw.query('SELECT purge_after FROM spots').all()).toEqual([{ purge_after: '2026-10-16' }]);
});

test('an event with a full mailbox refuses more spots', async () => {
  const ins = db.raw.prepare(INSERT);
  db.raw.transaction(() => {
    for (let k = 0; k < SPOTS_PER_EVENT; k++) ins.run('fair', 'door', 'mrt', 0, 0, 5, '2026-10-16T01', '2026-11-24');
  })();
  const r = await send(good);
  expect(r.status).toBe(503);
  expect(await r.json()).toEqual({ error: 'Spots are full for this event' });
});
```

- [ ] **Step 4: Run them to see them fail**

Run: `bun test tests/api-spots.test.ts`
Expected: FAIL with `Cannot find module '../src/lib/api/db'`.

- [ ] **Step 5: Implement**

Create `src/lib/api/db.ts`:

```ts
import type { SpotsConfig } from '../core/spots';

export type Row = Record<string, unknown>;
export interface Stmt {
  bind(...values: unknown[]): Stmt;
  first<T = Row>(): Promise<T | null>;
  all<T = Row>(): Promise<{ results: T[] }>;
  run(): Promise<unknown>;
}
export interface Db {
  prepare(sql: string): Stmt;
  batch(stmts: Stmt[]): Promise<unknown[]>;
}
export type Env = {
  DB: Db;
  ASSETS: { fetch(request: Request): Promise<Response> };
  ADMIN_SETUP_CODE?: string;
  GITHUB_TOKEN?: string;
  GITHUB_REPO?: string;
};

export const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });

export async function purge(db: Db, now: Date) {
  await db.prepare('DELETE FROM spots WHERE purge_after < ?').bind(now.toISOString().slice(0, 10)).run();
}

export async function loadConfig(env: Env, url: string): Promise<SpotsConfig> {
  const r = await env.ASSETS.fetch(new Request(new URL('/spots-config.json', url)));
  if (!r.ok) throw new Error('spots-config.json is missing from the build');
  return r.json();
}
```

Create `src/lib/api/spots.ts`:

```ts
import { parseSpot, SPOTS_PER_EVENT } from '../core/spots';
import { jsonResponse, loadConfig, purge, type Env } from './db';

const MAX_BODY = 2048;

export async function handleSpot(request: Request, env: Env, now = new Date()): Promise<Response> {
  if (request.method !== 'POST') return jsonResponse(405, { error: 'Use POST' });
  if (!(request.headers.get('content-type') ?? '').toLowerCase().startsWith('application/json'))
    return jsonResponse(415, { error: 'Send JSON' });
  const text = await request.text();
  if (text.length > MAX_BODY) return jsonResponse(413, { error: 'Send one spot at a time' });
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return jsonResponse(400, { error: 'Send JSON' });
  }
  await purge(env.DB, now);
  const parsed = parseSpot(body, await loadConfig(env, request.url), now);
  if ('error' in parsed) return jsonResponse(400, { error: parsed.error });
  const r = parsed.row;
  const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM spots WHERE event = ?')
    .bind(r.event)
    .first<{ n: number }>();
  if ((count?.n ?? 0) >= SPOTS_PER_EVENT) return jsonResponse(503, { error: 'Spots are full for this event' });
  await env.DB.prepare(
    'INSERT INTO spots (event, kind, place, lat, lng, accuracy, hour, purge_after) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
  )
    .bind(r.event, r.kind, r.place, r.lat, r.lng, r.accuracy, r.hour, r.purgeAfter)
    .run();
  return new Response(null, { status: 204 });
}
```

Create `functions/api/spots.ts`:

```ts
import type { Env } from '../../src/lib/api/db';
import { handleSpot } from '../../src/lib/api/spots';

export const onRequest = ({ request, env }: { request: Request; env: Env }) => handleSpot(request, env);
```

Append to `.gitignore`:

```
.wrangler/
wrangler.toml
.dev.vars
```

- [ ] **Step 6: Run the tests**

Run: `bun test tests/api-spots.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add migrations src/lib/api functions tests/helpers/fake-d1.ts tests/api-spots.test.ts .gitignore
git commit -m "feat(app): take guest map spots at /api/spots"
```

---

### Task 6: When to ask a guest

**Files:**

- Modify: `src/lib/core/spots.ts` (append `canOffer`)
- Create: `src/lib/ui/spotAsk.ts`
- Modify: `src/lib/ui/locator.svelte.ts` (add `fixAt`)
- Modify: `tests/spots.test.ts` (one new test)
- Test: `tests/spot-ask.test.ts`

**Interfaces:**

- Consumes: `metersBetween` (Task 1).
- Produces:
  - `spots.ts`: `OFFER_MAX_ACCURACY_M = 50`, `OFFER_MAX_AGE_MS = 120_000`, `OFFER_DOOR_M = 150`, `type Reading = LatLng & { accuracy: number; at: number }`, `canOffer(r: Reading | null, now: number, doorAt: LatLng | null): boolean`.
  - `spotAsk.ts`: `askKey(eventId): string` (`bf:<eventId>:asked`), `mayAsk(saved: string | null, today: string): boolean`, `afterAnswer(send: boolean, never: boolean, today: string): string`.
  - `Locator.fixAt: number` (ms since epoch of the latest fix, 0 when stopped).

- [ ] **Step 1: Write the failing tests**

In `tests/spots.test.ts` add `canOffer` to the import from `'../src/lib/core/spots'`, change `import { LAT0, LNG0 } from './helpers/fake-geo';` to `import { fakeLatLng, LAT0, LNG0 } from './helpers/fake-geo';`, and append:

```ts
test('a spot is offered only for a fresh, close, accurate reading', () => {
  const door = fakeLatLng(252, 560);
  const r = { ...fakeLatLng(452, 560), accuracy: 20, at: 1_000_000 };
  expect(canOffer(r, 1_060_000, door)).toBe(true);
  expect(canOffer(null, 1_000_000, door)).toBe(false);
  expect(canOffer({ ...r, accuracy: 51 }, 1_000_000, door)).toBe(false);
  expect(canOffer(r, 1_120_001, door)).toBe(false);
  expect(canOffer({ ...r, ...fakeLatLng(1852, 560) }, 1_000_000, door)).toBe(false);
  expect(canOffer({ ...r, ...fakeLatLng(1852, 560) }, 1_000_000, null)).toBe(true);
});
```

Create `tests/spot-ask.test.ts`:

```ts
import { test, expect } from 'bun:test';
import { afterAnswer, askKey, mayAsk } from '../src/lib/ui/spotAsk';

test('the card is asked at most once a day until sent or turned off', () => {
  expect(askKey('fair')).toBe('bf:fair:asked');
  expect(mayAsk(null, '2026-10-16')).toBe(true);
  expect(mayAsk('2026-10-16', '2026-10-16')).toBe(false);
  expect(mayAsk('2026-10-15', '2026-10-16')).toBe(true);
  expect(mayAsk('sent', '2026-10-16')).toBe(false);
  expect(mayAsk('never', '2026-10-16')).toBe(false);
  expect(mayAsk('garbage', '2026-10-16')).toBe(false);
});

test('the answer decides what is saved', () => {
  expect(afterAnswer(true, false, '2026-10-16')).toBe('sent');
  expect(afterAnswer(true, true, '2026-10-16')).toBe('sent');
  expect(afterAnswer(false, true, '2026-10-16')).toBe('never');
  expect(afterAnswer(false, false, '2026-10-16')).toBe('2026-10-16');
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `bun test tests/spots.test.ts tests/spot-ask.test.ts`
Expected: FAIL with `Export named 'canOffer' not found` and `Cannot find module '../src/lib/ui/spotAsk'`.

- [ ] **Step 3: Implement**

Append to `src/lib/core/spots.ts`:

```ts
export const OFFER_MAX_ACCURACY_M = 50;
export const OFFER_MAX_AGE_MS = 120_000;
export const OFFER_DOOR_M = 150;
export type Reading = LatLng & { accuracy: number; at: number };

export function canOffer(r: Reading | null, now: number, doorAt: LatLng | null): boolean {
  if (!r || r.accuracy > OFFER_MAX_ACCURACY_M || now - r.at > OFFER_MAX_AGE_MS) return false;
  return !doorAt || metersBetween(r, doorAt) <= OFFER_DOOR_M;
}
```

Create `src/lib/ui/spotAsk.ts`:

```ts
export const askKey = (eventId: string) => `bf:${eventId}:asked`;

export function mayAsk(saved: string | null, today: string): boolean {
  if (!saved) return true;
  return /^\d{4}-\d{2}-\d{2}$/.test(saved) && saved < today;
}

export const afterAnswer = (send: boolean, never: boolean, today: string) => (send ? 'sent' : never ? 'never' : today);
```

In `src/lib/ui/locator.svelte.ts`:

- add the field `fixAt = $state(0);` under `fix = $state<Fix | null>(null);`
- in `stop()`, after `this.fix = null;` add `this.fixAt = 0;`
- in `#watch()`, after the line that sets `this.fix = { ... };` add `this.fixAt = Date.now();`

`Date.now()` is used rather than the position's own timestamp, so the age check runs on the same clock as the page (Playwright fixes that clock in Task 8).

- [ ] **Step 4: Run the tests**

Run: `bun test tests/spots.test.ts tests/spot-ask.test.ts && bun run check`
Expected: PASS, and svelte-check reports 0 errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/core/spots.ts src/lib/ui/spotAsk.ts src/lib/ui/locator.svelte.ts tests/spots.test.ts tests/spot-ask.test.ts
git commit -m "feat(app): decide when to ask guests for a map spot"
```

---

### Task 7: "What we keep" page

**Files:**

- Create: `src/lib/i18n/keep.ts`
- Create: `src/routes/what-we-keep/+page.svelte`
- Modify: `src/lib/styles/app.css` (append `.keep` styles)
- Modify: `tests/build.test.ts` (page list)
- Test: `tests/keep.test.ts`

**Interfaces:**

- Consumes: `SPOT_KEEP_DAYS` (Task 2), `lang`, `STRINGS`, `Header`.
- Produces: `KEEP: Record<Lang, { title: string; intro: string; sections: { h: string; p: string }[] }>` and the page `/what-we-keep/` that the guest card links to in Task 8. This copy is a draft for the owner to approve before `VITE_SPOTS=1` is set.

- [ ] **Step 1: Write the failing test**

Create `tests/keep.test.ts`:

```ts
import { test, expect } from 'bun:test';
import { KEEP } from '../src/lib/i18n/keep';
import { SPOT_KEEP_DAYS } from '../src/lib/core/spots';

test('What we keep has the same sections in Thai and English, in plain copy', () => {
  expect(KEEP.th.sections.length).toBe(KEEP.en.sections.length);
  expect(KEEP.en.sections.map((s) => s.h)).toEqual([
    'What we receive',
    "What we don't keep",
    'Why we ask',
    'Who sees it',
    'How long we keep it',
    'Where it is stored',
    'Saying no',
  ]);
  expect(JSON.stringify(KEEP).includes('!')).toBe(false);
});

test('the page promises the same number of days the code uses', () => {
  expect(KEEP.en.sections[4].p).toContain(`${SPOT_KEEP_DAYS} days`);
  expect(KEEP.th.sections[4].p).toContain(`${SPOT_KEEP_DAYS} วัน`);
});
```

In `tests/build.test.ts`, add `'_site/what-we-keep/index.html'` to the array in `pages exist for the list, the event and 404`.

- [ ] **Step 2: Run it to see it fail**

Run: `bun test tests/keep.test.ts`
Expected: FAIL with `Cannot find module '../src/lib/i18n/keep'`.

- [ ] **Step 3: Write the copy**

Create `src/lib/i18n/keep.ts`:

```ts
import { SPOT_KEEP_DAYS } from '../core/spots';
import type { Lang } from './strings';

export type KeepPage = { title: string; intro: string; sections: { h: string; p: string }[] };

export const KEEP: Record<Lang, KeepPage> = {
  th: {
    title: 'ข้อมูลที่เราเก็บ',
    intro:
      'เมื่อคุณถึงประตูหรือเลือกฮอลล์ที่อยู่ ตัวช่วยหาบูธอาจถามว่า "ช่วยให้แผนที่ตรงขึ้นไหม" หน้านี้บอกว่าจะเกิดอะไรขึ้นถ้าคุณแตะ "ส่งจุดนี้"',
    sections: [
      {
        h: 'สิ่งที่เราได้รับ',
        p: 'ชื่องาน ทางเข้าหรือฮอลล์ที่คุณอยู่ ค่า GPS หนึ่งครั้งจากโทรศัพท์ของคุณ (ละติจูด ลองจิจูด และความแม่นยำที่โทรศัพท์รายงาน) และชั่วโมงที่ส่ง',
      },
      {
        h: 'สิ่งที่เราไม่เก็บ',
        p: 'ไม่มีชื่อ อีเมล เบอร์โทร รหัสเครื่อง หมายเลข IP หรือข้อมูลเบราว์เซอร์ ไม่มีอะไรบอกได้ว่าจุดสองจุดมาจากคนเดียวกัน ระหว่างที่ใช้ "ใช้ตำแหน่งของฉัน" ตำแหน่งของคุณอยู่ในโทรศัพท์เท่านั้น มีเพียงค่าเดียวที่คุณเลือกส่งที่ออกจากเครื่อง',
      },
      {
        h: 'ทำไมเราถึงถาม',
        p: 'ค่าจากผู้มางานหลายคนที่ประตูเดียวกันบอกได้ว่าประตูนั้นอยู่ตรงไหนบนแผนที่ถนนจริง ๆ เราจึงวางผังงานให้ตรงขึ้นสำหรับผู้มาคนถัดไปได้ ค่าจากในฮอลล์ใช้ตรวจแผนที่เท่านั้น',
      },
      {
        h: 'ใครเห็นข้อมูลนี้',
        p: 'เฉพาะเจ้าของเว็บ ในหน้าตรวจที่ต้องใช้พาสคีย์เข้า เราดูค่าต่าง ๆ รวมกัน ไม่ดูค่าของใครคนเดียว ถ้าเราย้ายหมุดแผนที่ จะมีเพียงจุดกึ่งกลางของค่าหลายค่าที่เข้าไปอยู่ในเว็บ',
      },
      { h: 'เราเก็บนานแค่ไหน', p: `เราลบแต่ละค่าเมื่อครบ ${SPOT_KEEP_DAYS} วันหลังวันสุดท้ายของงาน` },
      { h: 'เก็บไว้ที่ไหน', p: 'ในฐานข้อมูลของ Cloudflare ซึ่งให้บริการเว็บนี้และรับทุกคำขอที่ส่งมาที่เว็บ' },
      {
        h: 'ถ้าไม่อยากส่ง',
        p: 'แตะ "ไม่เป็นไร" ถ้าติ๊ก "ไม่ต้องถามอีกในงานนี้" ด้วย เราจะไม่ถามอีกในงานนี้ โทรศัพท์ของคุณจำแค่ตัวเลือกนี้ ไม่ได้จำตำแหน่งของคุณ',
      },
    ],
  },
  en: {
    title: 'What we keep',
    intro:
      'When you reach a door or pick your hall, the booth finder may ask "Help line up the map?". This page says what happens if you tap "Send this spot".',
    sections: [
      {
        h: 'What we receive',
        p: 'The event, the entrance or hall you are at, one GPS reading from your phone (latitude, longitude and how accurate your phone says it is) and the hour it was sent.',
      },
      {
        h: "What we don't keep",
        p: 'No name, email, phone number, phone ID, IP address or browser details. Nothing links two spots to the same person. While you use "Use my location", your position stays on your phone. Only the one reading you choose to send leaves it.',
      },
      {
        h: 'Why we ask',
        p: 'Readings from many guests at the same door show where that door really is on the street map, so we can line up the floor plan for the next guests. Hall readings only help us check the map.',
      },
      {
        h: 'Who sees it',
        p: 'Only the site owner, on a review screen that needs a passkey. We look at readings together, never one guest on their own. If we move a map pin, only the middle of many readings goes into the site.',
      },
      { h: 'How long we keep it', p: `We delete each reading ${SPOT_KEEP_DAYS} days after the event's last day.` },
      {
        h: 'Where it is stored',
        p: 'In a Cloudflare database. Cloudflare hosts this site and handles every request to it.',
      },
      {
        h: 'Saying no',
        p: 'Tap "No thanks". Tick "Don\'t ask again at this event" too and we won\'t ask again at this event. Your phone remembers only that choice, not your location.',
      },
    ],
  },
};
```

- [ ] **Step 4: Build the page**

Create `src/routes/what-we-keep/+page.svelte`:

```svelte
<script lang="ts">
  import { KEEP } from '$lib/i18n/keep';
  import { STRINGS } from '$lib/i18n/strings';
  import { lang } from '$lib/i18n/lang.svelte';
  import Header from '$lib/ui/Header.svelte';
  const k = $derived(KEEP[lang.current]);
  const s = $derived(STRINGS[lang.current]);
</script>

<svelte:head>
  <title>{k.title} · {s.title}</title>
  <meta name="theme-color" content="#13306B" />
</svelte:head>

<div class="page">
  <Header title={s.title} subtitle={k.title} backHref="/" backLabel={s.allEvents} />
  <main class="keep">
    <h1>{k.title}</h1>
    <p>{k.intro}</p>
    {#each k.sections as sec (sec.h)}
      <h2>{sec.h}</h2>
      <p>{sec.p}</p>
    {/each}
  </main>
</div>
```

Append to `src/lib/styles/app.css`:

```css
.keep {
  max-width: 640px;
  margin: 0 auto;
  padding: 20px 16px 48px;
  color: var(--text);
  line-height: 1.6;
}
.keep h1 {
  margin: 0 0 12px;
  font-family: Mitr, sans-serif;
  font-weight: 500;
  font-size: 24px;
}
.keep h2 {
  margin: 24px 0 6px;
  font-family: Mitr, sans-serif;
  font-weight: 500;
  font-size: 18px;
}
.keep p {
  margin: 0;
}
```

- [ ] **Step 5: Run the tests and the build**

Run: `bun test tests/keep.test.ts && bun run build && bun test tests/build.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/i18n/keep.ts src/routes/what-we-keep src/lib/styles/app.css tests/keep.test.ts tests/build.test.ts
git commit -m "feat(app): explain what guest map spots keep"
```

---

### Task 8: The guest card

**Files:**

- Modify: `src/lib/i18n/strings.ts` (type and both languages)
- Modify: `tests/strings.test.ts` (call the new function strings)
- Create: `src/lib/ui/spotConfig.ts`
- Create: `src/lib/ui/SpotAsk.svelte`
- Modify: `src/lib/ui/locate.ts` (`LocView.ask`)
- Modify: `src/lib/ui/ResultCard.svelte` (render the card)
- Modify: `src/lib/ui/FinderView.svelte` (offer, remember, send)
- Modify: `src/lib/styles/app.css` (append `.spotask` styles)
- Modify: `playwright.config.ts` (build with `VITE_SPOTS=1`)
- Test: `tests/e2e/spots.e2e.ts`

**Interfaces:**

- Consumes: `canOffer`, `acceptsSpots`, `Reading`, `SpotKind` (Tasks 2, 6); `askKey`, `mayAsk`, `afterAnswer` (Task 6); `Locator.fixAt` (Task 6); `/what-we-keep/` (Task 7); `POST /api/spots` (Task 5).
- Produces: `LocView.ask: { kind: SpotKind; onAnswer: (send: boolean, never: boolean) => void } | null`; `SPOTS_ON: boolean`; `.spotask` card in the result card.

- [ ] **Step 1: Add the strings**

In `src/lib/i18n/strings.ts`, add to `type Strings` after `you: string;`:

```ts
spotTitle: string;
spotBody: string;
spotBodyHall: string;
spotSend: string;
spotNo: string;
spotNever: string;
spotFine: (door: boolean) => string;
whatWeKeep: string;
spotSent: string;
spotFailed: string;
```

In the `th` block, after `you: ...,` add:

```ts
    spotTitle: 'ช่วยให้แผนที่ตรงขึ้นไหม',
    spotBody: 'ส่งตำแหน่งที่โทรศัพท์ของคุณบอกว่าเป็นทางเข้านี้ ช่วยให้แผนที่วางตรงที่สำหรับผู้มาคนถัดไป',
    spotBodyHall: 'ส่งตำแหน่งที่โทรศัพท์ของคุณบอกว่าเป็นฮอลล์นี้ ช่วยให้เราตรวจแผนที่ได้',
    spotSend: 'ส่งจุดนี้',
    spotNo: 'ไม่เป็นไร',
    spotNever: 'ไม่ต้องถามอีกในงานนี้',
    spotFine: (door) =>
      `ส่ง${door ? 'ทางเข้านี้' : 'ฮอลล์นี้'} ค่า GPS หนึ่งครั้ง และเวลา ไม่มีชื่อ ไม่มีรหัสเครื่อง`,
    whatWeKeep: 'ข้อมูลที่เราเก็บ',
    spotSent: 'ขอบคุณ ส่งจุดแล้ว',
    spotFailed: 'ส่งจุดไม่สำเร็จ ใช้งานต่อได้ตามปกติ',
```

In the `en` block, after `you: 'You are here',` add:

```ts
    spotTitle: 'Help line up the map?',
    spotBody: 'Send where your phone thinks this entrance is. It helps the map sit in the right place for the next guest.',
    spotBodyHall: 'Send where your phone thinks this hall is. It helps us check the map.',
    spotSend: 'Send this spot',
    spotNo: 'No thanks',
    spotNever: "Don't ask again at this event",
    spotFine: (door) =>
      `Sends this ${door ? 'entrance' : 'hall'}, one GPS reading and the time. No name, no phone ID.`,
    whatWeKeep: 'What we keep',
    spotSent: 'Thanks. Spot sent.',
    spotFailed: "Couldn't send the spot. You can carry on.",
```

In `tests/strings.test.ts`, in the `no exclamation marks in copy` test, extend the mapped string with `+ s.spotFine(true) + s.spotFine(false)`.

- [ ] **Step 2: Run the string tests**

Run: `bun test tests/strings.test.ts`
Expected: PASS.

- [ ] **Step 3: Write the failing e2e test**

In `playwright.config.ts`, change the `webServer.command` so the build gets the flag:

```ts
    command:
      'VITE_SPOTS=1 VITE_TILE_URL=/__tiles/{z}/{x}/{y}.png VITE_TILE_CREDIT="Test tiles" bun run build && bunx serve _site -l 4173',
```

Create `tests/e2e/spots.e2e.ts`:

```ts
import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { loadVenue } from '../../src/lib/server/catalog';
import { georef, planToLatLng } from '../../src/lib/core/geo';

const venue = loadVenue('qsncc-lg-5-8');
const g = venue.geo ? georef(venue.geo.pins) : null;
const at = (x: number, y: number, accuracy = 15) => {
  const ll = planToLatLng(g!, [x, y]);
  return { latitude: ll.lat, longitude: ll.lng, accuracy };
};
const DURING_FAIR = new Date('2026-03-27T03:00:00Z');

test.skip(!g, 'qsncc-lg-5-8 has no map pins yet');

async function open(context: BrowserContext, page: Page, x: number, y: number, accuracy = 15) {
  await page.clock.setFixedTime(DURING_FAIR);
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation(at(x, y, accuracy));
  await page.goto('/e/bkkibf-2026/#to=A42');
  await page.getByRole('button', { name: 'EN', exact: true }).click();
  await page.locator('.locbtn').click();
}

async function arriveAtMrt(context: BrowserContext, page: Page, accuracy = 15) {
  await open(context, page, -200, 560, accuracy);
  await expect(page.locator('.outleg')).toBeVisible();
  await context.setGeolocation(at(260, 560, accuracy));
  await expect(page.locator('.mapbanner')).toContainText("You're at");
}

test('at the door: sends one spot, then does not ask again at this event', async ({ page, context }) => {
  const sent: Record<string, unknown>[] = [];
  await page.route('**/api/spots', async (route) => {
    sent.push(route.request().postDataJSON());
    await route.fulfill({ status: 204 });
  });
  await arriveAtMrt(context, page);
  await expect(page.locator('.spotask')).toContainText('Help line up the map?');
  await expect(page.getByRole('link', { name: 'What we keep' })).toHaveAttribute('href', '/what-we-keep/');
  await page.getByRole('button', { name: 'Send this spot' }).click();
  await expect(page.locator('.toast')).toContainText('Thanks. Spot sent.');
  await expect(page.locator('.spotask')).toHaveCount(0);
  expect(sent).toHaveLength(1);
  expect(sent[0]).toMatchObject({ event: 'bkkibf-2026', kind: 'door', place: 'mrt', accuracy: 15 });
  expect(Object.keys(sent[0]).sort()).toEqual(['accuracy', 'event', 'kind', 'lat', 'lng', 'place']);
  await arriveAtMrt(context, page);
  await expect(page.locator('.spotask')).toHaveCount(0);
});

test('a failed send says so and lets the guest carry on', async ({ page, context }) => {
  await page.route('**/api/spots', (route) => route.fulfill({ status: 500, body: '{}' }));
  await arriveAtMrt(context, page);
  await page.getByRole('button', { name: 'Send this spot' }).click();
  await expect(page.locator('.toast')).toContainText("Couldn't send the spot. You can carry on.");
  await expect(page.locator('#from')).toHaveValue('mrt');
});

test('no thanks with the box ticked never asks again at this event', async ({ page, context }) => {
  let calls = 0;
  await page.route('**/api/spots', (route) => {
    calls++;
    return route.fulfill({ status: 204 });
  });
  await arriveAtMrt(context, page);
  await page.getByLabel("Don't ask again at this event").check();
  await page.getByRole('button', { name: 'No thanks' }).click();
  await expect(page.locator('.spotask')).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('bf:bkkibf-2026:asked'))).toBe('never');
  expect(calls).toBe(0);
});

test('picking a hall indoors offers a hall spot', async ({ page, context }) => {
  const sent: Record<string, unknown>[] = [];
  await page.route('**/api/spots', async (route) => {
    sent.push(route.request().postDataJSON());
    await route.fulfill({ status: 204 });
  });
  await open(context, page, 1000, 900);
  await page.locator('.hallbtn', { hasText: 'Hall 6' }).click();
  await expect(page.locator('.spotask')).toContainText('this hall');
  await page.getByRole('button', { name: 'Send this spot' }).click();
  await expect.poll(() => sent.length).toBe(1);
  expect(sent[0]).toMatchObject({ kind: 'hall', place: 'hall6' });
});

test('a rough reading at the door does not ask', async ({ page, context }) => {
  await arriveAtMrt(context, page, 70);
  await expect(page.locator('.spotask')).toHaveCount(0);
});
```

- [ ] **Step 4: Run it to see it fail**

Run: `bunx playwright test tests/e2e/spots.e2e.ts --project=phone`
Expected: FAIL, because `.spotask` never appears.

- [ ] **Step 5: Add the flag and the card**

Create `src/lib/ui/spotConfig.ts`:

```ts
export const SPOTS_ON: boolean = import.meta.env.VITE_SPOTS === '1';
```

Create `src/lib/ui/SpotAsk.svelte`:

```svelte
<script lang="ts">
  import type { SpotKind } from '$lib/core/spots';
  import { STRINGS, type Lang } from '$lib/i18n/strings';
  let {
    lang,
    kind,
    onAnswer,
  }: { lang: Lang; kind: SpotKind; onAnswer: (send: boolean, never: boolean) => void } = $props();
  const s = $derived(STRINGS[lang]);
  let never = $state(false);
</script>

<div class="spotask" role="group" aria-labelledby="spotask-t">
  <div class="spotask-head">
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.5" />
    </svg>
    <div>
      <h2 class="sec" id="spotask-t">{s.spotTitle}</h2>
      <p class="hint first">{kind === 'door' ? s.spotBody : s.spotBodyHall}</p>
    </div>
  </div>
  <div class="spotask-btns">
    <button type="button" class="btn" onclick={() => onAnswer(false, never)}>{s.spotNo}</button>
    <button type="button" class="btn primary" onclick={() => onAnswer(true, never)}>{s.spotSend}</button>
  </div>
  <p class="spotask-fine">
    {s.spotFine(kind === 'door')}
    <a href="/what-we-keep/" target="_blank" rel="noopener">{s.whatWeKeep}</a>
  </p>
  <label class="spotask-never"><input type="checkbox" bind:checked={never} /> {s.spotNever}</label>
</div>
```

In `src/lib/ui/locate.ts`, add `import type { SpotKind } from '$lib/core/spots';` and add this member to `LocView` after `hall: ...;`:

```ts
  ask: { kind: SpotKind; onAnswer: (send: boolean, never: boolean) => void } | null;
```

In `src/lib/ui/ResultCard.svelte`, add `import SpotAsk from './SpotAsk.svelte';` with the other imports, and insert just before `<div class="actions">`:

```svelte
  {#if loc?.ask}
    <SpotAsk {lang} kind={loc.ask.kind} onAnswer={loc.ask.onAnswer} />
  {/if}
```

Append to `src/lib/styles/app.css`:

```css
.spotask {
  margin-top: 12px;
  padding: 14px;
  border-radius: 14px;
  background: var(--chip);
  border: 1px solid var(--line);
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.spotask-head {
  display: flex;
  gap: 10px;
  align-items: flex-start;
}
.spotask-head svg {
  flex: none;
  margin-top: 2px;
  color: var(--blue);
}
.spotask .sec {
  margin: 0;
}
.spotask-btns {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}
.spotask-fine {
  margin: 0;
  font-size: 12.5px;
  color: var(--muted);
}
.spotask-never {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 44px;
  font-size: 14px;
}
.spotask-never input {
  width: 20px;
  height: 20px;
  accent-color: var(--ink);
}
```

- [ ] **Step 6: Wire it in FinderView**

In `src/lib/ui/FinderView.svelte`:

Change `import { georef } from '$lib/core/geo';` to `import { georef, planToLatLng } from '$lib/core/geo';`, change `import { eventStatus } from '$lib/core/status';` to `import { eventStatus, todayIn } from '$lib/core/status';`, add `LatLng` to the `import type { Booth, Dest, Landmark, Point, Surroundings } from '$lib/core/types';` list, and add:

```ts
import { acceptsSpots, canOffer, type Reading, type SpotKind } from '$lib/core/spots';
import { afterAnswer, askKey, mayAsk } from '$lib/ui/spotAsk';
import { SPOTS_ON } from '$lib/ui/spotConfig';
```

Under `const FROM_KEY = ...;` add:

```ts
const ASK_KEY = askKey(data.event.id);
```

Replace `let hall = $state<{ guess: string | null } | null>(null);` with:

```ts
let hall = $state<{ guess: string | null; reading: Reading | null } | null>(null);
let ask = $state<{ kind: SpotKind; place: string; reading: Reading } | null>(null);
```

In the `locView` object, after the `hall: ...,` line add:

```ts
          ask: ask ? { kind: ask.kind, onAnswer: answerSpot } : null,
```

In the `$effect` that reacts to `where`, replace the `inside` branch:

```ts
      } else if (w.kind === 'inside') {
        const r = reading();
        stopLocating(true);
        hall = { guess: w.hall, reading: r };
```

In `clearRoute()` add `ask = null;` after `hall = null;`. In `startLocating()` add `ask = null;` after `hall = null;`.

Replace `handOff` and `pickHall` with:

```ts
const reading = (): Reading | null => (loc.fix ? { ...loc.fix, at: loc.fixAt } : null);
function offerSpot(kind: SpotKind, place: string, r: Reading | null, doorAt: LatLng | null) {
  if (!SPOTS_ON || !geo || !r) return;
  if (!acceptsSpots(data.event.dates, data.venue.timezone, new Date())) return;
  const today = todayIn(data.venue.timezone);
  if (!mayAsk(store.get(ASK_KEY), today) || !canOffer(r, Date.now(), doorAt)) return;
  store.set(ASK_KEY, today);
  ask = { kind, place, reading: r };
}
async function answerSpot(send: boolean, never: boolean) {
  const a = ask;
  ask = null;
  if (!a) return;
  store.set(ASK_KEY, afterAnswer(send, never, todayIn(data.venue.timezone)));
  if (!send) return;
  try {
    const res = await fetch('/api/spots', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        event: data.event.id,
        kind: a.kind,
        place: a.place,
        lat: a.reading.lat,
        lng: a.reading.lng,
        accuracy: a.reading.accuracy,
      }),
    });
    showToast(res.ok ? s.spotSent : s.spotFailed);
  } catch {
    showToast(s.spotFailed);
  }
}
function handOff(lm: Landmark) {
  const r = reading();
  setFrom(lm.id);
  showBanner(s.arrived(nameOf(lm)));
  if (geo) offerSpot('door', lm.id, r, planToLatLng(geo, [lm.x, lm.y]));
}
function pickHall(id: string) {
  const start = hallStart(data, id),
    r = hall?.reading ?? null;
  hall = null;
  if (start) setFrom(start);
  offerSpot('hall', id, r, null);
}
```

`reading()` runs before `setFrom` and before `stopLocating`, because both clear `loc.fix`.

- [ ] **Step 7: Run the e2e tests, old and new**

Run: `bunx playwright test tests/e2e/spots.e2e.ts tests/e2e/locate.e2e.ts`
Expected: PASS on both projects. `locate.e2e.ts` does not fix the clock, so `bkkibf-2026` has ended, no card appears and its tests are unchanged.

- [ ] **Step 8: Run unit tests, lint and type checks**

Run: `bun run test && bun run lint && bun run check`
Expected: PASS, 0 errors.

- [ ] **Step 9: Commit**

```bash
git add src/lib/i18n/strings.ts tests/strings.test.ts src/lib/ui src/lib/styles/app.css playwright.config.ts tests/e2e/spots.e2e.ts
git commit -m "feat(app): ask guests at the door to send one map spot"
```

---

### Task 9: Passkey sign-in pieces

**Files:**

- Modify: `package.json`, `bun.lock` (add `@simplewebauthn/server@14.0.3` as a devDependency, like every other package here)
- Create: `src/lib/api/auth.ts`
- Create: `src/lib/api/webauthn.ts`
- Test: `tests/api-auth.test.ts`

**Interfaces:**

- Consumes: `Db`, `Env` (Task 5); tables `sessions`, `challenges`, `meta`, `passkeys` (Task 5).
- Produces (all in `auth.ts`):
  - `type Options = { challenge: string } & Record<string, unknown>`
  - `type StoredCredential = { id: string; publicKey: Uint8Array; counter: number; transports?: string[] }`
  - `type Ceremonies = { registrationOptions({ rpID, excludeIds }): Promise<Options>; verifyRegistration({ response, challenge, origin, rpID }): Promise<StoredCredential | null>; authenticationOptions({ rpID }): Promise<Options>; verifyAuthentication({ response, challenge, origin, rpID, credential }): Promise<{ newCounter: number } | null> }`
  - `SESSION_COOKIE`, `SESSION_HOURS = 12`, `CHALLENGE_MINUTES = 5`, `MIN_SETUP_CODE = 16`, `CLEAR_COOKIE`
  - `b64url(bytes)`, `fromB64url(s)`, `sha256(s): Promise<string>`, `challengeOf(response: unknown): string | null`
  - `saveChallenge(db, challenge, kind: 'register' | 'signin', now)`, `takeChallenge(db, challenge, kind, now): Promise<boolean>`
  - `startSession(db, now): Promise<string>` (a `Set-Cookie` value), `signedIn(db, req, now): Promise<boolean>`, `endSession(db, req)`
  - `type CodeCheck = 'ok' | 'none' | 'wrong' | 'used'`, `checkSetupCode(db, env, code: unknown): Promise<CodeCheck>`, `markSetupUsed(db, env)`, `CODE_ERRORS`
  - `passkeyIds(db)`, `savePasskey(db, cred, name, now)`, `findPasskey(db, id)`, `touchPasskey(db, id, counter, now)`, `listPasskeys(db)`
- `webauthn.ts`: `webauthn: Ceremonies` backed by `@simplewebauthn/server` (rp name "Booth finder admin", resident key and user verification required, attestation `none`).

- [ ] **Step 1: Add the library**

Run: `bun add -d @simplewebauthn/server@14.0.3`
Expected: `package.json` lists it under `devDependencies` and `bun.lock` changes.

- [ ] **Step 2: Write the failing tests**

Create `tests/api-auth.test.ts`:

```ts
import { test, expect } from 'bun:test';
import {
  b64url,
  challengeOf,
  checkSetupCode,
  endSession,
  fromB64url,
  markSetupUsed,
  saveChallenge,
  signedIn,
  startSession,
  takeChallenge,
} from '../src/lib/api/auth';
import type { Env } from '../src/lib/api/db';
import { fakeDb } from './helpers/fake-d1';

const now = new Date('2026-10-16T03:00:00Z');
const later = (ms: number) => new Date(now.getTime() + ms);
const withCookie = (setCookie: string) =>
  new Request('https://booth.example/api/admin/me', { headers: { cookie: setCookie.split(';')[0] } });

test('a session cookie is locked down and lasts 12 hours', async () => {
  const db = fakeDb();
  const cookie = await startSession(db, now);
  expect(cookie).toMatch(
    /^__Host-bf_admin=[A-Za-z0-9_-]{43}; Path=\/; HttpOnly; Secure; SameSite=Strict; Max-Age=43200$/,
  );
  expect(await signedIn(db, withCookie(cookie), later(11 * 3_600_000))).toBe(true);
  expect(await signedIn(db, withCookie(cookie), later(13 * 3_600_000))).toBe(false);
  expect(db.raw.query('SELECT COUNT(*) AS n FROM sessions').get()).toEqual({ n: 0 });
});

test('only the hash is stored, and signing out ends the session', async () => {
  const db = fakeDb();
  const cookie = await startSession(db, now);
  const token = cookie.split(';')[0].split('=')[1];
  expect(JSON.stringify(db.raw.query('SELECT * FROM sessions').all())).not.toContain(token);
  await endSession(db, withCookie(cookie));
  expect(await signedIn(db, withCookie(cookie), now)).toBe(false);
  expect(await signedIn(db, new Request('https://booth.example/'), now)).toBe(false);
});

test('a challenge works once, for its own kind, before it expires', async () => {
  const db = fakeDb();
  await saveChallenge(db, 'c1', 'signin', now);
  expect(await takeChallenge(db, 'c1', 'register', now)).toBe(false);
  expect(await takeChallenge(db, 'c1', 'signin', now)).toBe(true);
  expect(await takeChallenge(db, 'c1', 'signin', now)).toBe(false);
  await saveChallenge(db, 'c2', 'signin', now);
  expect(await takeChallenge(db, 'c2', 'signin', later(6 * 60_000))).toBe(false);
});

test('the setup code must be set, long enough, right and unused', async () => {
  const db = fakeDb();
  const env = (code?: string): Env => ({
    DB: db,
    ASSETS: { fetch: async () => new Response() },
    ADMIN_SETUP_CODE: code,
  });
  const code = 'correct horse battery';
  expect(await checkSetupCode(db, env(), code)).toBe('none');
  expect(await checkSetupCode(db, env('short'), 'short')).toBe('none');
  expect(await checkSetupCode(db, env(code), 'nope')).toBe('wrong');
  expect(await checkSetupCode(db, env(code), 42)).toBe('wrong');
  expect(await checkSetupCode(db, env(code), code)).toBe('ok');
  await markSetupUsed(db, env(code));
  expect(await checkSetupCode(db, env(code), code)).toBe('used');
  expect(await checkSetupCode(db, env(`${code} again`), `${code} again`)).toBe('ok');
});

test('challengeOf reads the challenge the browser signed', () => {
  const clientDataJSON = b64url(new TextEncoder().encode(JSON.stringify({ type: 'webauthn.get', challenge: 'abc' })));
  expect(challengeOf({ response: { clientDataJSON } })).toBe('abc');
  expect(challengeOf({})).toBeNull();
  expect(challengeOf({ response: { clientDataJSON: '%%%' } })).toBeNull();
  expect([...fromB64url(b64url(new Uint8Array([0, 250, 255, 7])))]).toEqual([0, 250, 255, 7]);
});
```

- [ ] **Step 3: Run them to see them fail**

Run: `bun test tests/api-auth.test.ts`
Expected: FAIL with `Cannot find module '../src/lib/api/auth'`.

- [ ] **Step 4: Implement**

Create `src/lib/api/auth.ts`:

```ts
import type { Db, Env } from './db';

export type Options = { challenge: string } & Record<string, unknown>;
export type StoredCredential = { id: string; publicKey: Uint8Array; counter: number; transports?: string[] };
export type Ceremonies = {
  registrationOptions(o: { rpID: string; excludeIds: string[] }): Promise<Options>;
  verifyRegistration(o: {
    response: unknown;
    challenge: string;
    origin: string;
    rpID: string;
  }): Promise<StoredCredential | null>;
  authenticationOptions(o: { rpID: string }): Promise<Options>;
  verifyAuthentication(o: {
    response: unknown;
    challenge: string;
    origin: string;
    rpID: string;
    credential: StoredCredential;
  }): Promise<{ newCounter: number } | null>;
};
export type CodeCheck = 'ok' | 'none' | 'wrong' | 'used';
type Kind = 'register' | 'signin';

export const SESSION_COOKIE = '__Host-bf_admin';
export const SESSION_HOURS = 12;
export const CHALLENGE_MINUTES = 5;
export const MIN_SETUP_CODE = 16;
export const CLEAR_COOKIE = `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
export const CODE_ERRORS: Record<Exclude<CodeCheck, 'ok'>, string> = {
  none: 'Set ADMIN_SETUP_CODE in Cloudflare (16 characters or more), then try again',
  wrong: 'That setup code is wrong',
  used: 'That setup code was already used. Set a new setup code in Cloudflare, then try again',
};

const later = (now: Date, ms: number) => new Date(now.getTime() + ms).toISOString();

export function b64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromB64url(s: string): Uint8Array {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

export async function sha256(s: string): Promise<string> {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
  return [...d].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function challengeOf(response: unknown): string | null {
  try {
    const data = (response as { response: { clientDataJSON: string } }).response.clientDataJSON;
    const c = JSON.parse(new TextDecoder().decode(fromB64url(data))).challenge;
    return typeof c === 'string' ? c : null;
  } catch {
    return null;
  }
}

export async function saveChallenge(db: Db, challenge: string, kind: Kind, now: Date) {
  await db
    .prepare('INSERT INTO challenges (challenge, kind, expires) VALUES (?, ?, ?)')
    .bind(challenge, kind, later(now, CHALLENGE_MINUTES * 60_000))
    .run();
}

export async function takeChallenge(db: Db, challenge: string, kind: Kind, now: Date): Promise<boolean> {
  await db.prepare('DELETE FROM challenges WHERE expires < ?').bind(now.toISOString()).run();
  const row = await db
    .prepare('DELETE FROM challenges WHERE challenge = ? AND kind = ? RETURNING expires')
    .bind(challenge, kind)
    .first();
  return !!row;
}

function cookieToken(req: Request): string | null {
  const m = (req.headers.get('cookie') ?? '').match(/(?:^|;\s*)__Host-bf_admin=([A-Za-z0-9_-]{43})(?:;|$)/);
  return m ? m[1] : null;
}

export async function startSession(db: Db, now: Date): Promise<string> {
  const token = b64url(crypto.getRandomValues(new Uint8Array(32)));
  await db
    .prepare('INSERT INTO sessions (token_hash, expires) VALUES (?, ?)')
    .bind(await sha256(token), later(now, SESSION_HOURS * 3_600_000))
    .run();
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_HOURS * 3600}`;
}

export async function signedIn(db: Db, req: Request, now: Date): Promise<boolean> {
  const t = cookieToken(req);
  if (!t) return false;
  await db.prepare('DELETE FROM sessions WHERE expires < ?').bind(now.toISOString()).run();
  return !!(await db
    .prepare('SELECT 1 AS ok FROM sessions WHERE token_hash = ?')
    .bind(await sha256(t))
    .first());
}

export async function endSession(db: Db, req: Request) {
  const t = cookieToken(req);
  if (t)
    await db
      .prepare('DELETE FROM sessions WHERE token_hash = ?')
      .bind(await sha256(t))
      .run();
}

export async function checkSetupCode(db: Db, env: Env, code: unknown): Promise<CodeCheck> {
  const want = env.ADMIN_SETUP_CODE ?? '';
  if (want.length < MIN_SETUP_CODE) return 'none';
  const wantHash = await sha256(want);
  if (typeof code !== 'string' || (await sha256(code)) !== wantHash) return 'wrong';
  const used = await db.prepare("SELECT value FROM meta WHERE key = 'setup_used'").first<{ value: string }>();
  return used?.value === wantHash ? 'used' : 'ok';
}

export async function markSetupUsed(db: Db, env: Env) {
  await db
    .prepare(
      "INSERT INTO meta (key, value) VALUES ('setup_used', ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value",
    )
    .bind(await sha256(env.ADMIN_SETUP_CODE ?? ''))
    .run();
}

export async function passkeyIds(db: Db): Promise<string[]> {
  return (await db.prepare('SELECT id FROM passkeys').all<{ id: string }>()).results.map((r) => r.id);
}

export async function savePasskey(db: Db, c: StoredCredential, name: string, now: Date) {
  await db
    .prepare('INSERT INTO passkeys (id, public_key, counter, transports, name, created) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(c.id, c.publicKey, c.counter, JSON.stringify(c.transports ?? []), name, now.toISOString())
    .run();
}

export async function findPasskey(db: Db, id: string): Promise<StoredCredential | null> {
  const r = await db
    .prepare('SELECT id, public_key, counter, transports FROM passkeys WHERE id = ?')
    .bind(id)
    .first<{ id: string; public_key: ArrayBuffer | Uint8Array | number[]; counter: number; transports: string }>();
  return r
    ? { id: r.id, publicKey: new Uint8Array(r.public_key), counter: r.counter, transports: JSON.parse(r.transports) }
    : null;
}

export async function touchPasskey(db: Db, id: string, counter: number, now: Date) {
  await db
    .prepare('UPDATE passkeys SET counter = ?, last_used = ? WHERE id = ?')
    .bind(counter, now.toISOString(), id)
    .run();
}

export async function listPasskeys(db: Db) {
  return (
    await db
      .prepare('SELECT name, created, last_used AS lastUsed FROM passkeys ORDER BY created')
      .all<{ name: string; created: string; lastUsed: string | null }>()
  ).results;
}
```

Create `src/lib/api/webauthn.ts`:

```ts
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type RegistrationResponseJSON,
} from '@simplewebauthn/server';
import type { Ceremonies, Options } from './auth';

export const webauthn: Ceremonies = {
  registrationOptions: async ({ rpID, excludeIds }) =>
    (await generateRegistrationOptions({
      rpName: 'Booth finder admin',
      rpID,
      userName: 'owner',
      userID: new TextEncoder().encode('owner'),
      attestationType: 'none',
      excludeCredentials: excludeIds.map((id) => ({ id })),
      authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
    })) as unknown as Options,
  async verifyRegistration({ response, challenge, origin, rpID }) {
    try {
      const v = await verifyRegistrationResponse({
        response: response as RegistrationResponseJSON,
        expectedChallenge: challenge,
        expectedOrigin: origin,
        expectedRPID: rpID,
        requireUserVerification: true,
      });
      if (!v.verified) return null;
      const c = v.registrationInfo.credential;
      return { id: c.id, publicKey: c.publicKey, counter: c.counter, transports: c.transports ?? [] };
    } catch {
      return null;
    }
  },
  authenticationOptions: async ({ rpID }) =>
    (await generateAuthenticationOptions({ rpID, userVerification: 'required' })) as unknown as Options,
  async verifyAuthentication({ response, challenge, origin, rpID, credential }) {
    try {
      const v = await verifyAuthenticationResponse({
        response: response as AuthenticationResponseJSON,
        expectedChallenge: challenge,
        expectedOrigin: origin,
        expectedRPID: rpID,
        credential,
        requireUserVerification: true,
      });
      return v.verified ? { newCounter: v.authenticationInfo.newCounter } : null;
    } catch {
      return null;
    }
  },
};
```

- [ ] **Step 5: Run the tests and type checks**

Run: `bun test tests/api-auth.test.ts && bun run check`
Expected: PASS, 0 errors.

- [ ] **Step 6: Commit**

```bash
git add package.json bun.lock src/lib/api/auth.ts src/lib/api/webauthn.ts tests/api-auth.test.ts
git commit -m "feat(app): add passkey sign-in pieces for the admin"
```

---

### Task 10: Open a pull request with a pin move

**Files:**

- Create: `src/lib/api/github.ts`
- Create: `tests/helpers/fake-github.ts`
- Test: `tests/api-github.test.ts`

**Interfaces:**

- Consumes: nothing from earlier tasks.
- Produces:
  - `type GitHub = { token: string; repo: string; fetch?: typeof fetch }`
  - `class GitHubError extends Error`
  - `toBase64(text: string): string`, `fromBase64(b64: string): string` (UTF-8 safe, GitHub's line breaks allowed)
  - `type Change = { path: string; branch: string; title: string; body: string; edit: (text: string) => { text: string; message: string } }`
  - `proposeChange(g: GitHub, c: Change): Promise<string>` (the PR's `html_url`). It reads the file from the branch if a PR is open, else from `main`, and runs `edit` before writing anything. It makes or resets the branch only when no PR is open, commits once, and opens a PR only when none is open.
  - `tests/helpers/fake-github.ts`: `fakeGitHub(fileText, { openPr?, branch?, fail? })` returning `{ calls, github }`.

- [ ] **Step 1: Write the fake**

Create `tests/helpers/fake-github.ts`:

```ts
import { toBase64, type GitHub } from '../../src/lib/api/github';

type Call = { method: string; path: string; body?: Record<string, unknown> };
const REPO = 'apisak-w/book-booth-finder';

export function fakeGitHub(fileText: string, opts: { openPr?: boolean; branch?: boolean; fail?: string } = {}) {
  const calls: Call[] = [];
  const reply = (status: number, data: unknown) => Response.json(data, { status });
  const fake = async (url: string | URL | Request, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    const path = String(url).replace(`https://api.github.com/repos/${REPO}`, '');
    calls.push({ method, path, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    if (opts.fail && path.startsWith(opts.fail)) return reply(422, { message: 'Validation Failed' });
    if (method === 'GET' && path === '/git/ref/heads/main') return reply(200, { object: { sha: 'main-sha' } });
    if (method === 'GET' && path.startsWith('/pulls'))
      return reply(200, opts.openPr ? [{ html_url: `https://github.com/${REPO}/pull/7` }] : []);
    if (method === 'GET' && path.startsWith('/git/ref/heads/'))
      return opts.branch ? reply(200, { object: { sha: 'old-sha' } }) : reply(404, { message: 'Not Found' });
    if (method === 'GET' && path.startsWith('/contents/'))
      return reply(200, { content: toBase64(fileText).replace(/(.{60})/g, '$1\n'), sha: 'file-sha' });
    if (method === 'POST' && path === '/git/refs') return reply(201, {});
    if (method === 'PATCH' || method === 'PUT') return reply(200, {});
    if (method === 'POST' && path === '/pulls') return reply(201, { html_url: `https://github.com/${REPO}/pull/8` });
    return reply(500, { message: `unexpected ${method} ${path}` });
  };
  const github: GitHub = { token: 't', repo: REPO, fetch: fake as typeof globalThis.fetch };
  return { calls, github };
}
```

- [ ] **Step 2: Write the failing tests**

Create `tests/api-github.test.ts`:

```ts
import { test, expect } from 'bun:test';
import { fromBase64, proposeChange, toBase64, type Change } from '../src/lib/api/github';
import { fakeGitHub } from './helpers/fake-github';

const text = '{\n  "name": { "th": "ฮอลล์ 5", "en": "Hall 5" }\n}\n';
const change = (
  edit: Change['edit'] = (t) => ({ text: t.replace('Hall 5', 'Hall 5 east'), message: 'fix(venue): test' }),
): Change => ({
  path: 'venues/v/venue.json',
  branch: 'spots/v',
  title: 'fix(venue): line up v map pins from guest spots',
  body: 'Check the preview.',
  edit,
});
const writes = (calls: { method: string; path: string }[]) =>
  calls.filter((c) => c.method !== 'GET').map((c) => `${c.method} ${c.path}`);

test('base64 keeps Thai text intact', () => {
  expect(fromBase64(toBase64('ฮอลล์ 5 · ประตู'))).toBe('ฮอลล์ 5 · ประตู');
  expect(fromBase64(toBase64(text).replace(/(.{10})/g, '$1\n'))).toBe(text);
});

test('first move: reads main, makes the branch, commits and opens a pull request', async () => {
  const gh = fakeGitHub(text);
  expect(await proposeChange(gh.github, change())).toBe('https://github.com/apisak-w/book-booth-finder/pull/8');
  expect(writes(gh.calls)).toEqual(['POST /git/refs', 'PUT /contents/venues/v/venue.json', 'POST /pulls']);
  expect(gh.calls.find((c) => c.method === 'GET' && c.path.startsWith('/contents/'))!.path).toBe(
    '/contents/venues/v/venue.json?ref=main',
  );
  const [ref, put, pr] = gh.calls.filter((c) => c.method !== 'GET');
  expect(ref.body).toEqual({ ref: 'refs/heads/spots/v', sha: 'main-sha' });
  expect(fromBase64(put.body!.content as string)).toBe(text.replace('Hall 5', 'Hall 5 east'));
  expect(put.body).toMatchObject({ message: 'fix(venue): test', sha: 'file-sha', branch: 'spots/v' });
  expect(pr.body).toEqual({
    title: 'fix(venue): line up v map pins from guest spots',
    head: 'spots/v',
    base: 'main',
    body: 'Check the preview.',
  });
});

test('a pull request already open: adds one commit to it', async () => {
  const gh = fakeGitHub(text, { openPr: true, branch: true });
  expect(await proposeChange(gh.github, change())).toBe('https://github.com/apisak-w/book-booth-finder/pull/7');
  expect(writes(gh.calls)).toEqual(['PUT /contents/venues/v/venue.json']);
  expect(gh.calls.find((c) => c.method === 'GET' && c.path.startsWith('/contents/'))!.path).toBe(
    '/contents/venues/v/venue.json?ref=spots%2Fv',
  );
});

test('a branch left from a merged pull request is reset to main first', async () => {
  const gh = fakeGitHub(text, { branch: true });
  await proposeChange(gh.github, change());
  expect(writes(gh.calls)).toEqual([
    'PATCH /git/refs/heads/spots/v',
    'PUT /contents/venues/v/venue.json',
    'POST /pulls',
  ]);
  expect(gh.calls.find((c) => c.method === 'PATCH')!.body).toEqual({ sha: 'main-sha', force: true });
});

test('a refused edit writes nothing, and GitHub errors are named', async () => {
  const gh = fakeGitHub(text);
  await expect(
    proposeChange(
      gh.github,
      change(() => {
        throw new Error('fit error is 9.0 m');
      }),
    ),
  ).rejects.toThrow('fit error is 9.0 m');
  expect(writes(gh.calls)).toEqual([]);
  const bad = fakeGitHub(text, { fail: '/contents' });
  await expect(proposeChange(bad.github, change())).rejects.toThrow(
    'GitHub refused GET /contents/venues/v/venue.json: 422 Validation Failed',
  );
});
```

- [ ] **Step 3: Run them to see them fail**

Run: `bun test tests/api-github.test.ts`
Expected: FAIL with `Cannot find module '../src/lib/api/github'`.

- [ ] **Step 4: Implement**

Create `src/lib/api/github.ts`:

```ts
export type GitHub = { token: string; repo: string; fetch?: typeof fetch };
export type Change = {
  path: string;
  branch: string;
  title: string;
  body: string;
  edit: (text: string) => { text: string; message: string };
};

export class GitHubError extends Error {}

export function toBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let s = '';
  for (let k = 0; k < bytes.length; k += 0x8000) s += String.fromCharCode(...bytes.subarray(k, k + 0x8000));
  return btoa(s);
}

export function fromBase64(b64: string): string {
  const bin = atob(b64.replace(/\s/g, ''));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

async function call<T>(g: GitHub, method: string, path: string, body?: unknown, allow404 = false): Promise<T | null> {
  const r = await (g.fetch ?? fetch)(`https://api.github.com/repos/${g.repo}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${g.token}`,
      accept: 'application/vnd.github+json',
      'x-github-api-version': '2022-11-28',
      'user-agent': 'booth-finder-admin',
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (allow404 && r.status === 404) return null;
  const data = (await r.json().catch(() => ({}))) as { message?: string };
  if (!r.ok)
    throw new GitHubError(`GitHub refused ${method} ${path.split('?')[0]}: ${r.status} ${data.message ?? ''}`.trim());
  return data as T;
}

export async function proposeChange(g: GitHub, c: Change): Promise<string> {
  const owner = g.repo.split('/')[0];
  const main = (await call<{ object: { sha: string } }>(g, 'GET', '/git/ref/heads/main'))!;
  const open = (await call<{ html_url: string }[]>(
    g,
    'GET',
    `/pulls?state=open&head=${encodeURIComponent(`${owner}:${c.branch}`)}`,
  ))!;
  const ref = open.length ? c.branch : 'main';
  const file = (await call<{ content: string; sha: string }>(
    g,
    'GET',
    `/contents/${c.path}?ref=${encodeURIComponent(ref)}`,
  ))!;
  const next = c.edit(fromBase64(file.content));
  if (!open.length) {
    const branch = await call(g, 'GET', `/git/ref/heads/${c.branch}`, undefined, true);
    if (branch) await call(g, 'PATCH', `/git/refs/heads/${c.branch}`, { sha: main.object.sha, force: true });
    else await call(g, 'POST', '/git/refs', { ref: `refs/heads/${c.branch}`, sha: main.object.sha });
  }
  await call(g, 'PUT', `/contents/${c.path}`, {
    message: next.message,
    content: toBase64(next.text),
    sha: file.sha,
    branch: c.branch,
  });
  if (open.length) return open[0].html_url;
  return (await call<{ html_url: string }>(g, 'POST', '/pulls', {
    title: c.title,
    head: c.branch,
    base: 'main',
    body: c.body,
  }))!.html_url;
}
```

The file `sha` read from `main` stays valid after the branch is made or reset to `main`, because the file is the same blob there.

- [ ] **Step 5: Run the tests**

Run: `bun test tests/api-github.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/api/github.ts tests/helpers/fake-github.ts tests/api-github.test.ts
git commit -m "feat(app): open a pull request with a map pin move"
```

---

### Task 11: Admin API

**Files:**

- Create: `src/lib/api/admin.ts`
- Create: `functions/api/admin/[[path]].ts`
- Test: `tests/api-admin.test.ts`

**Interfaces:**

- Consumes: everything in `auth.ts` (Task 9), `proposeChange`, `GitHubError`, `GitHub` (Task 10), `jsonResponse`, `loadConfig`, `purge`, `Env` (Task 5), `reviewDoor`, `entrancePin`, `moveProblems`, `movePin`, `withPins`, `Filters`, `EventDays`, `StoredSpot` (Task 3), `webauthn` (Task 9).
- Produces:
  - `type AdminDeps = { ceremonies: Ceremonies; github: (env: Env) => GitHub | null; now: () => Date }`
  - `type Decision = { venue: string; place: string; action: 'keep' | 'move'; lat: number | null; lng: number | null; spots: number; pr: string | null; at: string }`
  - `handleAdmin(req: Request, env: Env, deps: AdminDeps): Promise<Response>` with routes:
    - `GET /api/admin/me` → `{ signedIn, hasPasskeys, passkeys: { name, created, lastUsed }[] }`
    - `POST /api/admin/setup/options` `{ code? }` → registration options
    - `POST /api/admin/setup/verify` `{ code?, name, response }` → `{ ok }` plus `Set-Cookie`
    - `POST /api/admin/signin/options` `{}` → authentication options
    - `POST /api/admin/signin/verify` `{ response }` → `{ ok }` plus `Set-Cookie`
    - `POST /api/admin/signout` `{}` → `{ ok }` plus a clearing `Set-Cookie`
    - `GET /api/admin/spots?venue=<id>` (signed in) → `{ spots: StoredSpot[], decisions: Decision[] }`
    - `POST /api/admin/decisions` `{ venue, place, action, filters? }` (signed in) → `{ ok }` for keep, `{ pr }` for move
  - Errors: 401 not signed in, 403 bad origin or setup code, 404 unknown route or venue, 409 move refused (problem named), 415 not JSON, 502 GitHub refused, 503 GitHub not set.

- [ ] **Step 1: Write the failing tests**

Create `tests/api-admin.test.ts`:

```ts
import { test, expect, beforeEach } from 'bun:test';
import { readFileSync } from 'node:fs';
import { handleAdmin, type AdminDeps } from '../src/lib/api/admin';
import { b64url, type Ceremonies } from '../src/lib/api/auth';
import type { Env } from '../src/lib/api/db';
import { fromBase64 } from '../src/lib/api/github';
import { georef, planToLatLng } from '../src/lib/core/geo';
import type { SpotsConfig } from '../src/lib/core/spots';
import type { Venue } from '../src/lib/core/types';
import { fakeDb } from './helpers/fake-d1';
import { fakeGitHub } from './helpers/fake-github';

const ORIGIN = 'https://booth.example';
const CODE = 'correct horse battery staple';
const PR8 = 'https://github.com/apisak-w/book-booth-finder/pull/8';
const venueText = readFileSync('venues/qsncc-lg-5-8/venue.json', 'utf8');
const venue = JSON.parse(venueText) as Venue;
const mrt = venue.landmarks.find((l) => l.id === 'mrt')!;
const g = georef(venue.geo!.pins);
const cfg: SpotsConfig = {
  events: {
    fair: {
      venue: 'qsncc-lg-5-8',
      start: '2026-10-15',
      end: '2026-10-25',
      tz: 'Asia/Bangkok',
      doors: ['mrt', 'door5'],
      halls: ['hall5'],
    },
    expo: {
      venue: 'qsncc-lg-5-7',
      start: '2026-10-15',
      end: '2026-10-25',
      tz: 'Asia/Bangkok',
      doors: ['mrt'],
      halls: ['hall5'],
    },
  },
  venues: { 'qsncc-lg-5-8': { lat: 13.7236, lng: 100.5597 }, 'qsncc-lg-5-7': { lat: 13.7236, lng: 100.5597 } },
};

let now: Date;
let n = 0;
let db: ReturnType<typeof fakeDb>;
let env: Env;
let gh: ReturnType<typeof fakeGitHub>;

const ceremonies: Ceremonies = {
  registrationOptions: async () => ({ challenge: `reg-${++n}` }),
  verifyRegistration: async ({ response }) => ({
    id: (response as { id: string }).id,
    publicKey: new Uint8Array([1, 2, 3]),
    counter: 0,
    transports: ['internal'],
  }),
  authenticationOptions: async () => ({ challenge: `sign-${++n}` }),
  verifyAuthentication: async ({ response, credential }) =>
    (response as { bad?: boolean }).bad ? null : { newCounter: credential.counter + 1 },
};
const deps = (over: Partial<AdminDeps> = {}): AdminDeps => ({
  ceremonies,
  github: () => gh.github,
  now: () => now,
  ...over,
});

beforeEach(() => {
  now = new Date('2026-10-16T03:00:00Z');
  db = fakeDb();
  gh = fakeGitHub(venueText);
  env = { DB: db, ASSETS: { fetch: async () => Response.json(cfg) }, ADMIN_SETUP_CODE: CODE };
});

const call = (method: string, path: string, body?: unknown, cookie = '', d = deps(), origin = ORIGIN) =>
  handleAdmin(
    new Request(`${ORIGIN}/api/admin/${path}`, {
      method,
      headers: { origin, 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    env,
    d,
  );
const cookieOf = (r: Response) => (r.headers.get('set-cookie') ?? '').split(';')[0];
const clientData = (type: string, challenge: string) =>
  b64url(new TextEncoder().encode(JSON.stringify({ type, challenge })));

async function setUp(id = 'pk1', code: string | undefined = CODE, cookie = '') {
  const { challenge } = await (await call('POST', 'setup/options', { code }, cookie)).json();
  const response = { id, response: { clientDataJSON: clientData('webauthn.create', String(challenge)) } };
  return call('POST', 'setup/verify', { code, name: 'Phone', response }, cookie);
}
async function signInBody(id = 'pk1', extra: Record<string, unknown> = {}) {
  const { challenge } = await (await call('POST', 'signin/options', {})).json();
  return { response: { id, response: { clientDataJSON: clientData('webauthn.get', String(challenge)) }, ...extra } };
}
function addSpot(event: string, x: number, y: number) {
  const ll = planToLatLng(g, [x, y]);
  db.raw
    .query(
      'INSERT INTO spots (event, kind, place, lat, lng, accuracy, hour, purge_after) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    )
    .run(event, 'door', 'mrt', ll.lat, ll.lng, 8, '2026-10-16T02', '2026-11-24');
}
const sixShifted = () => {
  for (let k = 0; k < 6; k++) addSpot('fair', mrt.x + 59 + 5 * Math.cos(k), mrt.y + 5 * Math.sin(k));
};

test('first set-up with the code signs the owner in and uses up the code', async () => {
  const r = await setUp();
  expect(r.status).toBe(200);
  expect(r.headers.get('set-cookie')).toContain('HttpOnly; Secure; SameSite=Strict');
  const me = await (await call('GET', 'me', undefined, cookieOf(r))).json();
  expect(me).toEqual({
    signedIn: true,
    hasPasskeys: true,
    passkeys: [{ name: 'Phone', created: now.toISOString(), lastUsed: null }],
  });
  const again = await setUp('pk2');
  expect(again.status).toBe(403);
  expect((await again.json()).error).toContain('already used');
});

test('set-up refuses a wrong or missing code, and a code that is not set', async () => {
  expect((await setUp('pk1', 'wrong code entirely')).status).toBe(403);
  expect((await setUp('pk1', undefined)).status).toBe(403);
  env.ADMIN_SETUP_CODE = undefined;
  const r = await setUp();
  expect(r.status).toBe(403);
  expect((await r.json()).error).toContain('Set ADMIN_SETUP_CODE');
  expect(db.raw.query('SELECT COUNT(*) AS n FROM passkeys').get()).toEqual({ n: 0 });
});

test('a signed-in owner adds a spare passkey without the code', async () => {
  const cookie = cookieOf(await setUp());
  expect((await setUp('pk2', undefined, cookie)).status).toBe(200);
  expect(db.raw.query('SELECT COUNT(*) AS n FROM passkeys').get()).toEqual({ n: 2 });
});

test('sign-in works with a known passkey and refuses unknown ones and replays', async () => {
  await setUp();
  const body = await signInBody();
  const r = await call('POST', 'signin/verify', body);
  expect(r.status).toBe(200);
  expect(cookieOf(r)).toMatch(/^__Host-bf_admin=/);
  expect(db.raw.query('SELECT counter FROM passkeys').get()).toEqual({ counter: 1 });
  expect((await call('POST', 'signin/verify', body)).status).toBe(400);
  expect((await call('POST', 'signin/verify', await signInBody('nope'))).status).toBe(400);
  expect((await call('POST', 'signin/verify', await signInBody('pk1', { bad: true }))).status).toBe(400);
});

test('sign-in before any passkey says to set one up', async () => {
  const r = await call('POST', 'signin/options', {});
  expect(r.status).toBe(404);
  expect((await r.json()).error).toBe('No passkeys yet. Set one up first');
});

test('admin writes must come from this site as JSON', async () => {
  expect((await call('POST', 'signin/options', {}, '', deps(), 'https://evil.example')).status).toBe(403);
  const r = await handleAdmin(
    new Request(`${ORIGIN}/api/admin/signin/options`, {
      method: 'POST',
      headers: { origin: ORIGIN, 'content-type': 'text/plain' },
      body: '{}',
    }),
    env,
    deps(),
  );
  expect(r.status).toBe(415);
  expect((await call('GET', 'nothing-here')).status).toBe(404);
});

test('spots and decisions need a live session', async () => {
  expect((await call('GET', 'spots?venue=qsncc-lg-5-8')).status).toBe(401);
  expect((await call('POST', 'decisions', { venue: 'qsncc-lg-5-8', place: 'mrt', action: 'keep' })).status).toBe(401);
  const cookie = cookieOf(await setUp());
  expect((await call('GET', 'spots?venue=qsncc-lg-5-8', undefined, cookie)).status).toBe(200);
  now = new Date(now.getTime() + 13 * 3_600_000);
  expect((await call('GET', 'spots?venue=qsncc-lg-5-8', undefined, cookie)).status).toBe(401);
});

test('signing out ends the session', async () => {
  const cookie = cookieOf(await setUp());
  const out = await call('POST', 'signout', {}, cookie);
  expect(out.headers.get('set-cookie')).toContain('Max-Age=0');
  expect((await call('GET', 'spots?venue=qsncc-lg-5-8', undefined, cookie)).status).toBe(401);
});

test('spots lists only the events at that venue', async () => {
  const cookie = cookieOf(await setUp());
  addSpot('fair', mrt.x, mrt.y);
  addSpot('expo', mrt.x, mrt.y);
  const r = await (await call('GET', 'spots?venue=qsncc-lg-5-8', undefined, cookie)).json();
  expect(r.spots.map((s: { event: string }) => s.event)).toEqual(['fair']);
  expect(r.decisions).toEqual([]);
  expect((await call('GET', 'spots?venue=nowhere', undefined, cookie)).status).toBe(404);
});

test('keep records a decision, and only doors can be decided', async () => {
  const cookie = cookieOf(await setUp());
  expect(
    (await call('POST', 'decisions', { venue: 'qsncc-lg-5-8', place: 'mrt', action: 'keep' }, cookie)).status,
  ).toBe(200);
  expect(db.raw.query('SELECT venue, place, action, pr FROM decisions').all()).toEqual([
    { venue: 'qsncc-lg-5-8', place: 'mrt', action: 'keep', pr: null },
  ]);
  expect(
    (await call('POST', 'decisions', { venue: 'qsncc-lg-5-8', place: 'hall5', action: 'keep' }, cookie)).status,
  ).toBe(400);
});

test('move commits the new pin to a pull request and records it', async () => {
  const cookie = cookieOf(await setUp());
  sixShifted();
  const r = await call('POST', 'decisions', { venue: 'qsncc-lg-5-8', place: 'mrt', action: 'move' }, cookie);
  expect(await r.json()).toEqual({ pr: PR8 });
  const put = gh.calls.find((c) => c.method === 'PUT')!;
  const next = JSON.parse(fromBase64(put.body!.content as string)) as Venue;
  expect(next.geo!.pins.find((p) => p.id === 'mrt')).toMatchObject({ x: mrt.x, y: mrt.y });
  expect(String(put.body!.message)).toStartWith('fix(venue): move the mrt map pin from guest spots');
  expect(db.raw.query('SELECT action, spots, pr FROM decisions').all()).toEqual([
    { action: 'move', spots: 6, pr: PR8 },
  ]);
});

test('move is refused with too few spots and writes nothing', async () => {
  const cookie = cookieOf(await setUp());
  addSpot('fair', mrt.x + 59, mrt.y);
  const r = await call('POST', 'decisions', { venue: 'qsncc-lg-5-8', place: 'mrt', action: 'move' }, cookie);
  expect(r.status).toBe(409);
  expect((await r.json()).error).toBe('Only 1 good spot. Moving a pin needs 5.');
  expect(gh.calls.filter((c) => c.method !== 'GET')).toEqual([]);
  expect(db.raw.query('SELECT COUNT(*) AS n FROM decisions').get()).toEqual({ n: 0 });
});

test('move without GitHub settings says what to set, and GitHub errors come back as 502', async () => {
  const cookie = cookieOf(await setUp());
  sixShifted();
  const body = { venue: 'qsncc-lg-5-8', place: 'mrt', action: 'move' };
  const none = await call('POST', 'decisions', body, cookie, deps({ github: () => null }));
  expect(none.status).toBe(503);
  expect((await none.json()).error).toBe('Set GITHUB_TOKEN and GITHUB_REPO in Cloudflare first');
  gh = fakeGitHub(venueText, { fail: '/git/refs' });
  const bad = await call('POST', 'decisions', body, cookie);
  expect(bad.status).toBe(502);
  expect(db.raw.query('SELECT COUNT(*) AS n FROM decisions').get()).toEqual({ n: 0 });
});
```

In the last test, `fail: '/git/refs'` matches the `POST /git/refs` that makes the branch. That call comes after the edit and before the commit, so nothing is committed and no decision is recorded.

- [ ] **Step 2: Run them to see them fail**

Run: `bun test tests/api-admin.test.ts`
Expected: FAIL with `Cannot find module '../src/lib/api/admin'`.

- [ ] **Step 3: Implement the router**

Create `src/lib/api/admin.ts`:

```ts
import {
  entrancePin,
  movePin,
  moveProblems,
  reviewDoor,
  withPins,
  type EventDays,
  type Filters,
  type StoredSpot,
} from '../core/spotReview';
import type { SpotsConfig } from '../core/spots';
import type { Venue } from '../core/types';
import {
  CLEAR_COOKIE,
  CODE_ERRORS,
  challengeOf,
  checkSetupCode,
  endSession,
  findPasskey,
  listPasskeys,
  markSetupUsed,
  passkeyIds,
  saveChallenge,
  savePasskey,
  signedIn,
  startSession,
  takeChallenge,
  touchPasskey,
  type Ceremonies,
} from './auth';
import { jsonResponse, loadConfig, purge, type Env } from './db';
import { GitHubError, proposeChange, type GitHub } from './github';

export type AdminDeps = { ceremonies: Ceremonies; github: (env: Env) => GitHub | null; now: () => Date };
export type Decision = {
  venue: string;
  place: string;
  action: 'keep' | 'move';
  lat: number | null;
  lng: number | null;
  spots: number;
  pr: string | null;
  at: string;
};
type Ctx = { req: Request; env: Env; deps: AdminDeps; now: Date; url: URL; body: Record<string, unknown> };
type Handler = (c: Ctx) => Promise<Response>;

class Refused extends Error {}

const withCookie = (res: Response, cookie: string) => {
  res.headers.append('set-cookie', cookie);
  return res;
};
const EXPIRED = { error: 'This request expired. Try again' };
const BAD_PASSKEY = { error: "That passkey didn't check out. Try again" };

export async function handleAdmin(req: Request, env: Env, deps: AdminDeps): Promise<Response> {
  const url = new URL(req.url),
    now = deps.now();
  const path = url.pathname.replace(/^\/api\/admin\/?/, '').replace(/\/$/, '');
  let body: Record<string, unknown> = {};
  if (req.method === 'POST') {
    if (req.headers.get('origin') !== url.origin)
      return jsonResponse(403, { error: 'Admin changes only come from this site' });
    if (!(req.headers.get('content-type') ?? '').toLowerCase().startsWith('application/json'))
      return jsonResponse(415, { error: 'Send JSON' });
    try {
      const b = await req.json();
      if (b && typeof b === 'object' && !Array.isArray(b)) body = b as Record<string, unknown>;
    } catch {
      return jsonResponse(400, { error: 'Send JSON' });
    }
  } else if (req.method !== 'GET') return jsonResponse(405, { error: 'Use GET or POST' });
  await purge(env.DB, now);
  const ctx: Ctx = { req, env, deps, now, url, body };
  const key = `${req.method} ${path}`;
  const open: Record<string, Handler> = {
    'GET me': me,
    'POST setup/options': setupOptions,
    'POST setup/verify': setupVerify,
    'POST signin/options': signinOptions,
    'POST signin/verify': signinVerify,
    'POST signout': signout,
  };
  const closed: Record<string, Handler> = { 'GET spots': spots, 'POST decisions': decide };
  if (Object.hasOwn(open, key)) return open[key](ctx);
  if (!Object.hasOwn(closed, key)) return jsonResponse(404, { error: 'Unknown admin endpoint' });
  if (!(await signedIn(env.DB, req, now))) return jsonResponse(401, { error: 'Sign in first' });
  return closed[key](ctx);
}

async function me(c: Ctx) {
  const ok = await signedIn(c.env.DB, c.req, c.now);
  return jsonResponse(200, {
    signedIn: ok,
    hasPasskeys: (await passkeyIds(c.env.DB)).length > 0,
    passkeys: ok ? await listPasskeys(c.env.DB) : [],
  });
}

async function mayRegister(c: Ctx): Promise<{ viaCode: boolean } | Response> {
  if (await signedIn(c.env.DB, c.req, c.now)) return { viaCode: false };
  const check = await checkSetupCode(c.env.DB, c.env, c.body.code);
  return check === 'ok' ? { viaCode: true } : jsonResponse(403, { error: CODE_ERRORS[check] });
}

async function setupOptions(c: Ctx) {
  const may = await mayRegister(c);
  if (may instanceof Response) return may;
  const options = await c.deps.ceremonies.registrationOptions({
    rpID: c.url.hostname,
    excludeIds: await passkeyIds(c.env.DB),
  });
  await saveChallenge(c.env.DB, options.challenge, 'register', c.now);
  return jsonResponse(200, options);
}

async function setupVerify(c: Ctx) {
  const may = await mayRegister(c);
  if (may instanceof Response) return may;
  const challenge = challengeOf(c.body.response);
  if (!challenge || !(await takeChallenge(c.env.DB, challenge, 'register', c.now))) return jsonResponse(400, EXPIRED);
  const cred = await c.deps.ceremonies.verifyRegistration({
    response: c.body.response,
    challenge,
    origin: c.url.origin,
    rpID: c.url.hostname,
  });
  if (!cred) return jsonResponse(400, BAD_PASSKEY);
  const name = typeof c.body.name === 'string' && c.body.name.trim() ? c.body.name.trim().slice(0, 40) : 'Passkey';
  await savePasskey(c.env.DB, cred, name, c.now);
  if (may.viaCode) await markSetupUsed(c.env.DB, c.env);
  return withCookie(jsonResponse(200, { ok: true }), await startSession(c.env.DB, c.now));
}

async function signinOptions(c: Ctx) {
  if (!(await passkeyIds(c.env.DB)).length) return jsonResponse(404, { error: 'No passkeys yet. Set one up first' });
  const options = await c.deps.ceremonies.authenticationOptions({ rpID: c.url.hostname });
  await saveChallenge(c.env.DB, options.challenge, 'signin', c.now);
  return jsonResponse(200, options);
}

async function signinVerify(c: Ctx) {
  const challenge = challengeOf(c.body.response);
  if (!challenge || !(await takeChallenge(c.env.DB, challenge, 'signin', c.now))) return jsonResponse(400, EXPIRED);
  const id = (c.body.response as { id?: unknown } | undefined)?.id;
  const credential = typeof id === 'string' ? await findPasskey(c.env.DB, id) : null;
  if (!credential) return jsonResponse(400, { error: "This passkey isn't set up here" });
  const ok = await c.deps.ceremonies.verifyAuthentication({
    response: c.body.response,
    challenge,
    origin: c.url.origin,
    rpID: c.url.hostname,
    credential,
  });
  if (!ok) return jsonResponse(400, BAD_PASSKEY);
  await touchPasskey(c.env.DB, credential.id, ok.newCounter, c.now);
  return withCookie(jsonResponse(200, { ok: true }), await startSession(c.env.DB, c.now));
}

async function signout(c: Ctx) {
  await endSession(c.env.DB, c.req);
  return withCookie(jsonResponse(200, { ok: true }), CLEAR_COOKIE);
}

const eventsAt = (cfg: SpotsConfig, venue: string) => Object.entries(cfg.events).filter(([, e]) => e.venue === venue);

async function venueSpots(c: Ctx, cfg: SpotsConfig, venue: string, place?: string): Promise<StoredSpot[]> {
  const ids = eventsAt(cfg, venue).map(([id]) => id);
  if (!ids.length) return [];
  const where = place ? " AND kind = 'door' AND place = ?" : '';
  const sql = `SELECT event, kind, place, lat, lng, accuracy, hour FROM spots WHERE event IN (${ids.map(() => '?').join(', ')})${where} ORDER BY id`;
  return (
    await c.env.DB.prepare(sql)
      .bind(...ids, ...(place ? [place] : []))
      .all<StoredSpot>()
  ).results;
}

async function spots(c: Ctx) {
  const cfg = await loadConfig(c.env, c.req.url);
  const venue = c.url.searchParams.get('venue') ?? '';
  if (!Object.hasOwn(cfg.venues, venue)) return jsonResponse(404, { error: 'Unknown venue' });
  const decisions = (
    await c.env.DB.prepare(
      'SELECT venue, place, action, lat, lng, spots, pr, at FROM decisions WHERE venue = ? ORDER BY at',
    )
      .bind(venue)
      .all<Decision>()
  ).results;
  return jsonResponse(200, { spots: await venueSpots(c, cfg, venue), decisions });
}

function readFilters(v: unknown): Filters {
  const f = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  return { accuracy: f.accuracy !== false, near: f.near !== false, eventDays: f.eventDays !== false };
}

async function decide(c: Ctx) {
  const cfg = await loadConfig(c.env, c.req.url);
  const { venue, place, action } = c.body;
  if (typeof venue !== 'string' || !Object.hasOwn(cfg.venues, venue))
    return jsonResponse(400, { error: 'Unknown venue' });
  const events = eventsAt(cfg, venue);
  if (typeof place !== 'string' || !events.some(([, e]) => e.doors.includes(place)))
    return jsonResponse(400, { error: 'Only doors can be kept or moved' });
  if (action !== 'keep' && action !== 'move') return jsonResponse(400, { error: 'Choose keep or move' });
  const record = (lat: number | null, lng: number | null, n: number, pr: string | null) =>
    c.env.DB.prepare(
      'INSERT INTO decisions (venue, place, action, lat, lng, spots, pr, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    )
      .bind(venue, place, action, lat, lng, n, pr, c.now.toISOString())
      .run();
  if (action === 'keep') {
    await record(null, null, 0, null);
    return jsonResponse(200, { ok: true });
  }
  const gh = c.deps.github(c.env);
  if (!gh) return jsonResponse(503, { error: 'Set GITHUB_TOKEN and GITHUB_REPO in Cloudflare first' });
  const filters = readFilters(c.body.filters);
  const days: EventDays = Object.fromEntries(events.map(([id, e]) => [id, { start: e.start, end: e.end, tz: e.tz }]));
  const doorSpots = await venueSpots(c, cfg, venue, place);
  const moved = { lat: 0, lng: 0, n: 0 };
  try {
    const pr = await proposeChange(gh, {
      path: `venues/${venue}/venue.json`,
      branch: `spots/${venue}`,
      title: `fix(venue): line up ${venue} map pins from guest spots`,
      body: 'Map pin moves from the guest spots review. Check the street map on the Cloudflare preview before merging.',
      edit: (text) => {
        const v = JSON.parse(text) as Venue;
        const lm = v.landmarks.find((l) => l.id === place);
        if (!lm || !v.geo) throw new Refused(`${place} is not a map entrance in venue.json`);
        const r = reviewDoor(doorSpots, entrancePin(v.geo.pins, lm), filters, days);
        const problems = moveProblems(r, v.geo.pins, lm, v.metersPerPx);
        if (problems.length || !r.middle) throw new Refused(problems.join('; '));
        Object.assign(moved, { lat: r.middle.lat, lng: r.middle.lng, n: r.good.length });
        return {
          text: withPins(text, movePin(v.geo.pins, lm, r.middle)),
          message: `fix(venue): move the ${place} map pin from guest spots\n\n${r.good.length} spots, spread ${r.spreadM.toFixed(1)} m, moved ${r.offsetM.toFixed(1)} m.`,
        };
      },
    });
    await record(moved.lat, moved.lng, moved.n, pr);
    return jsonResponse(200, { pr });
  } catch (e) {
    if (e instanceof Refused) return jsonResponse(409, { error: e.message });
    if (e instanceof GitHubError) return jsonResponse(502, { error: e.message });
    throw e;
  }
}
```

Create `functions/api/admin/[[path]].ts`:

```ts
import { handleAdmin } from '../../../src/lib/api/admin';
import type { Env } from '../../../src/lib/api/db';
import { webauthn } from '../../../src/lib/api/webauthn';

export const onRequest = ({ request, env }: { request: Request; env: Env }) =>
  handleAdmin(request, env, {
    ceremonies: webauthn,
    github: (e) => (e.GITHUB_TOKEN && e.GITHUB_REPO ? { token: e.GITHUB_TOKEN, repo: e.GITHUB_REPO } : null),
    now: () => new Date(),
  });
```

- [ ] **Step 4: Run the tests**

Run: `bun test tests/api-admin.test.ts tests/api-auth.test.ts tests/api-github.test.ts tests/api-spots.test.ts`
Expected: PASS.

- [ ] **Step 5: Run everything and lint**

Run: `bun run test && bun run lint && bun run fmt:check`
Expected: PASS. Run `bun run fmt` first if `fmt:check` lists the new files.

- [ ] **Step 6: Commit**

```bash
git add src/lib/api/admin.ts "functions/api/admin/[[path]].ts" tests/api-admin.test.ts
git commit -m "feat(app): add the admin API for guest spots"
```

---

### Task 12: Admin screen

**Files:**

- Modify: `package.json`, `bun.lock` (add `@simplewebauthn/browser@14.0.0` as a devDependency)
- Create: `src/lib/admin/types.ts`
- Modify: `src/lib/server/spotsCatalog.ts` (add `adminVenues`)
- Create: `src/lib/admin/places.ts`
- Create: `src/lib/admin/api.ts`
- Create: `src/lib/admin/admin.css`
- Create: `src/lib/admin/Admin.svelte`, `SignIn.svelte`, `SpotsMap.svelte`, `DecisionPanel.svelte`
- Create: `src/routes/admin/+page.server.ts`, `src/routes/admin/+page.svelte`
- Modify: `tests/spots-catalog.test.ts`, `tests/build.test.ts`
- Test: `tests/admin-places.test.ts`, `tests/e2e/admin.e2e.ts`

**Interfaces:**

- Consumes: `reviewDoor`, `entrancePin`, `doorStatus`, `moveProblems`, `hallCheck`, `ALL_FILTERS`, `GOOD_ACCURACY_M`, `NEAR_PIN_M` and types (Task 3); `SPOT_KEEP_DAYS` (Task 2); the admin API (Task 11); `StreetLayer.svelte` (plan 1) with props `{ geo, surroundings, tileUrl, vb, pxPerUnit, onTiles }`; `/v/<venue>/surroundings.json` (plan 1).
- Produces:
  - `type AdminEvent = { id: string; name: I18n; start: string; end: string }`, `type AdminVenue = { id; name: I18n; timezone; metersPerPx; walls: Point[][]; areas: Area[]; pins: GeoPin[]; entrances: Landmark[]; events: AdminEvent[] }`
  - `adminVenues(root?): AdminVenue[]` (venues with map pins, with their events)
  - `places.ts`: `type Decision` (same shape as Task 11), `type DoorPlace`, `type HallPlace`, `type Place`, `STATUS_TEXT`, `eventDays(v)`, `placesFor(v, spots, decisions, filters): Place[]`, `placeNote(p, v): string`
  - `/admin/` page (prerendered, `noindex`)

- [ ] **Step 1: Add the browser library**

Run: `bun add -d @simplewebauthn/browser@14.0.0`
Expected: `package.json` lists it under `devDependencies`.

- [ ] **Step 2: Write the failing unit tests**

Append to `tests/spots-catalog.test.ts` (add `adminVenues` to the `spotsCatalog` import):

```ts
test('adminVenues lists venues with map pins, their entrances and events', () => {
  const v = adminVenues().find((x) => x.id === 'qsncc-lg-5-8')!;
  expect(v.entrances.map((l) => l.id)).toEqual(loadEvent('bkkibf-2026').venue.geo!.entrances);
  expect(v.events.map((e) => e.id)).toContain('bkkibf-2026');
  expect(v.pins.length).toBeGreaterThanOrEqual(3);
});
```

Create `tests/admin-places.test.ts`:

```ts
import { test, expect } from 'bun:test';
import { placeNote, placesFor, type Decision } from '../src/lib/admin/places';
import { georef, planToLatLng } from '../src/lib/core/geo';
import { ALL_FILTERS, type StoredSpot } from '../src/lib/core/spotReview';
import { adminVenues } from '../src/lib/server/spotsCatalog';

const v = adminVenues().find((x) => x.id === 'qsncc-lg-5-8')!;
const mrt = v.entrances.find((l) => l.id === 'mrt')!;
const g = georef(v.pins);
const ev = v.events[0];
const at = (x: number, y: number, kind: 'door' | 'hall', place: string): StoredSpot => ({
  event: ev.id,
  kind,
  place,
  ...planToLatLng(g, [x, y]),
  accuracy: 8,
  hour: `${ev.start}T03`,
});
const ring = Array.from({ length: 6 }, (_, k) =>
  at(mrt.x + 59 + 5 * Math.cos(k), mrt.y + 5 * Math.sin(k), 'door', 'mrt'),
);

test('each entrance and hall becomes a place with a status', () => {
  const places = placesFor(v, ring, [], ALL_FILTERS);
  expect(places.map((p) => p.id)).toEqual([...v.entrances.map((l) => l.id), ...v.areas.map((a) => a.id)]);
  const p = places.find((x) => x.id === 'mrt')!;
  expect(p.kind === 'door' && p.status).toBe('move');
  expect(p.kind === 'door' && p.problems).toEqual([]);
  expect(placeNote(p, v)).toBe('6 spots · suggests a move');
  expect(
    placeNote(
      places.find((x) => x.id === 'door5')!,
      v,
    ),
  ).toBe('0 spots · too few to judge');
});

test('a keep after the latest spot shows kept', () => {
  const keep: Decision = {
    venue: v.id,
    place: 'mrt',
    action: 'keep',
    lat: null,
    lng: null,
    spots: 0,
    pr: null,
    at: `${ev.start}T05:00:00.000Z`,
  };
  const p = placesFor(v, ring, [keep], ALL_FILTERS).find((x) => x.id === 'mrt')!;
  expect(placeNote(p, v)).toBe('6 spots · kept');
});

test('hall confirms that mostly land in another hall are flagged', () => {
  const h6 = v.areas.find((a) => a.id === 'hall6')!,
    h7 = v.areas.find((a) => a.id === 'hall7')!;
  const spots = [h7, h7, h7, h7, h6, h6].map((a) => at(a.label.x, a.label.y, 'hall', 'hall6'));
  const p = placesFor(v, spots, [], ALL_FILTERS).find((x) => x.id === 'hall6')!;
  expect(placeNote(p, v)).toBe(`6 spots · 4 of 6 land in ${h7.name.en}`);
  expect(
    placeNote(
      placesFor(v, [], [], ALL_FILTERS).find((x) => x.id === 'hall5')!,
      v,
    ),
  ).toBe('0 spots · used to check only');
});
```

- [ ] **Step 3: Run them to see them fail**

Run: `bun test tests/admin-places.test.ts tests/spots-catalog.test.ts`
Expected: FAIL with `Export named 'adminVenues' not found`.

- [ ] **Step 4: Add the venue data and the place logic**

Create `src/lib/admin/types.ts`:

```ts
import type { Area, GeoPin, I18n, Landmark, Point } from '../core/types';

export type AdminEvent = { id: string; name: I18n; start: string; end: string };
export type AdminVenue = {
  id: string;
  name: I18n;
  timezone: string;
  metersPerPx: number;
  walls: Point[][];
  areas: Area[];
  pins: GeoPin[];
  entrances: Landmark[];
  events: AdminEvent[];
};
```

Append to `src/lib/server/spotsCatalog.ts` (add `import type { AdminVenue } from '../admin/types';` and `import type { Landmark } from '../core/types';` at the top):

```ts
export function adminVenues(root = process.cwd()): AdminVenue[] {
  const byVenue = new Map<string, AdminVenue>();
  for (const id of listEventIds(root)) {
    const { event, venue } = loadEvent(id, root);
    if (!venue.geo) continue;
    let v = byVenue.get(venue.id);
    if (!v) {
      const entrances = venue.geo.entrances
        .map((e) => venue.landmarks.find((l) => l.id === e))
        .filter((l): l is Landmark => !!l);
      v = {
        id: venue.id,
        name: venue.name,
        timezone: venue.timezone,
        metersPerPx: venue.metersPerPx,
        walls: venue.walls,
        areas: venue.areas,
        pins: venue.geo.pins,
        entrances,
        events: [],
      };
      byVenue.set(venue.id, v);
    }
    v.events.push({ id, name: event.name, start: event.dates.start, end: event.dates.end });
  }
  return [...byVenue.values()];
}
```

Create `src/lib/admin/places.ts`:

```ts
import {
  doorStatus,
  entrancePin,
  hallCheck,
  moveProblems,
  reviewDoor,
  type DoorStatus,
  type EventDays,
  type Filters,
  type HallCheck,
  type PlaceReview,
  type StoredSpot,
} from '../core/spotReview';
import type { I18n, Landmark } from '../core/types';
import type { AdminVenue } from './types';

export type Decision = {
  venue: string;
  place: string;
  action: 'keep' | 'move';
  lat: number | null;
  lng: number | null;
  spots: number;
  pr: string | null;
  at: string;
};
export type DoorPlace = {
  kind: 'door';
  id: string;
  name: I18n;
  lm: Landmark;
  spots: StoredSpot[];
  review: PlaceReview;
  status: DoorStatus;
  problems: string[];
  last: Decision | null;
};
export type HallPlace = { kind: 'hall'; id: string; name: I18n; spots: StoredSpot[]; check: HallCheck };
export type Place = DoorPlace | HallPlace;

export const STATUS_TEXT: Record<DoorStatus, string> = {
  few: 'too few to judge',
  move: 'suggests a move',
  right: 'pin looks right',
  kept: 'kept',
};

export const eventDays = (v: AdminVenue): EventDays =>
  Object.fromEntries(v.events.map((e) => [e.id, { start: e.start, end: e.end, tz: v.timezone }]));

export function placesFor(v: AdminVenue, spots: StoredSpot[], decisions: Decision[], filters: Filters): Place[] {
  const days = eventDays(v);
  const doors = v.entrances.map((lm): DoorPlace => {
    const mine = spots.filter((s) => s.kind === 'door' && s.place === lm.id);
    const review = reviewDoor(mine, entrancePin(v.pins, lm), filters, days);
    const last = decisions.filter((d) => d.place === lm.id).at(-1) ?? null;
    return {
      kind: 'door',
      id: lm.id,
      name: { th: lm.th, en: lm.en },
      lm,
      spots: mine,
      review,
      status: doorStatus(review, last?.action === 'keep' ? last.at : null),
      problems: moveProblems(review, v.pins, lm, v.metersPerPx),
      last,
    };
  });
  const halls = v.areas.map((a): HallPlace => {
    const mine = spots.filter((s) => s.kind === 'hall' && s.place === a.id);
    return { kind: 'hall', id: a.id, name: a.name, spots: mine, check: hallCheck(mine, a.id, v.areas, v.pins) };
  });
  return [...doors, ...halls];
}

export function placeNote(p: Place, v: AdminVenue): string {
  const n = `${p.spots.length} spot${p.spots.length === 1 ? '' : 's'}`;
  if (p.kind === 'door') return `${n} · ${STATUS_TEXT[p.status]}`;
  if (!p.check.flagged) return `${n} · used to check only`;
  const where = v.areas.find((a) => a.id === p.check.topArea)?.name.en ?? 'outside the walls';
  return `${n} · ${p.check.elsewhere} of ${p.spots.length} land in ${where}`;
}
```

- [ ] **Step 5: Run the unit tests**

Run: `bun test tests/admin-places.test.ts tests/spots-catalog.test.ts`
Expected: PASS.

- [ ] **Step 6: Write the failing e2e and build tests**

Create `tests/e2e/admin.e2e.ts`:

```ts
import { test, expect, type Page } from '@playwright/test';
import { loadVenue } from '../../src/lib/server/catalog';
import { georef, planToLatLng } from '../../src/lib/core/geo';

const venue = loadVenue('qsncc-lg-5-8');
test.skip(!venue.geo, 'qsncc-lg-5-8 has no map pins yet');
const g = venue.geo ? georef(venue.geo.pins) : null;
const mrt = venue.landmarks.find((l) => l.id === 'mrt')!;
const spots = Array.from({ length: 6 }, (_, k) => ({
  event: 'bkkibf-2026',
  kind: 'door',
  place: 'mrt',
  ...planToLatLng(g!, [mrt.x + 59 + 5 * Math.cos(k), mrt.y + 5 * Math.sin(k)]),
  accuracy: 8,
  hour: '2026-03-27T03',
}));

async function mock(page: Page, signedIn: boolean, list = spots) {
  await page.route(/\/api\/admin\/me$/, (r) => r.fulfill({ json: { signedIn, hasPasskeys: true, passkeys: [] } }));
  await page.route(/\/api\/admin\/spots/, (r) => r.fulfill({ json: { spots: list, decisions: [] } }));
}

test('signed out: offers passkey sign-in and set-up', async ({ page }) => {
  await mock(page, false);
  await page.goto('/admin/');
  await expect(page.getByRole('button', { name: 'Sign in with a passkey' })).toBeVisible();
  await expect(page.getByText('Set up a passkey')).toBeVisible();
});

test('signed in: shows what guests suggest and opens a pull request on Move pin', async ({ page }) => {
  await mock(page, true);
  let posted: unknown = null;
  await page.route(/\/api\/admin\/decisions$/, async (r) => {
    posted = r.request().postDataJSON();
    await r.fulfill({ json: { pr: 'https://github.com/apisak-w/book-booth-finder/pull/8' } });
  });
  await page.goto('/admin/');
  const place = page.getByRole('button', { name: /MRT QSNCC station \(exit 3\)/ });
  await expect(place).toContainText('6 spots · suggests a move');
  await place.click();
  await expect(page.getByText('Map pin checks pass after the move.')).toBeVisible();
  await page.getByRole('button', { name: 'Move pin' }).click();
  await expect(page.getByRole('link', { name: 'Open the pull request' })).toHaveAttribute(
    'href',
    'https://github.com/apisak-w/book-booth-finder/pull/8',
  );
  expect(posted).toEqual({
    venue: 'qsncc-lg-5-8',
    place: 'mrt',
    action: 'move',
    filters: { accuracy: true, near: true, eventDays: true },
  });
});

test('Move pin stays off with too few spots and says why', async ({ page }) => {
  await mock(page, true, spots.slice(0, 2));
  await page.goto('/admin/');
  await expect(page.getByRole('button', { name: 'Move pin' })).toBeDisabled();
  await expect(page.getByText('Only 2 good spots. Moving a pin needs 5.')).toBeVisible();
});
```

Append to `tests/build.test.ts` (`join` and `readFileSync` are already imported there):

```ts
test.skipIf(!built)('the admin page is not indexed and passkey code stays out of the guest pages', () => {
  expect(readFileSync('_site/admin/index.html', 'utf8')).toContain('noindex');
  const dir = '_site/e/bkkibf-2026';
  const html = readFileSync(join(dir, 'index.html'), 'utf8');
  const chunks = [...html.matchAll(/href="([^"]*_app\/[^"]+\.js)"/g)].map((m) =>
    m[1].startsWith('/') ? join('_site', m[1]) : join(dir, m[1]),
  );
  expect(chunks.length).toBeGreaterThan(0);
  expect(chunks.filter((f) => readFileSync(f, 'utf8').includes('WebAuthn is not supported'))).toEqual([]);
});
```

- [ ] **Step 7: Run them to see them fail**

Run: `bunx playwright test tests/e2e/admin.e2e.ts --project=desktop`
Expected: FAIL, because `/admin/` is a 404 page.

- [ ] **Step 8: Build the admin client**

Create `src/lib/admin/api.ts`:

```ts
import { startAuthentication, startRegistration } from '@simplewebauthn/browser';
import type { Filters, StoredSpot } from '$lib/core/spotReview';
import type { Decision } from './places';

export type Me = {
  signedIn: boolean;
  hasPasskeys: boolean;
  passkeys: { name: string; created: string; lastUsed: string | null }[];
};
type CreateOptions = Parameters<typeof startRegistration>[0]['optionsJSON'];
type GetOptions = Parameters<typeof startAuthentication>[0]['optionsJSON'];

async function call<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  const r = await fetch(`/api/admin/${path}`, {
    method,
    headers: body === undefined ? {} : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = (await r.json().catch(() => ({}))) as { error?: string };
  if (!r.ok) throw new Error(data.error ?? `The server said ${r.status}. Try again`);
  return data as T;
}

export const getMe = () => call<Me>('GET', 'me');

export async function setUp(code: string, name: string) {
  const optionsJSON = await call<CreateOptions>('POST', 'setup/options', { code });
  const response = await startRegistration({ optionsJSON });
  await call('POST', 'setup/verify', { code, name, response });
}

export async function signIn() {
  const optionsJSON = await call<GetOptions>('POST', 'signin/options', {});
  await call('POST', 'signin/verify', { response: await startAuthentication({ optionsJSON }) });
}

export const signOut = () => call('POST', 'signout', {});
export const getSpots = (venue: string) =>
  call<{ spots: StoredSpot[]; decisions: Decision[] }>('GET', `spots?venue=${encodeURIComponent(venue)}`);
export const decide = (venue: string, place: string, action: 'keep' | 'move', filters: Filters) =>
  call<{ ok?: true; pr?: string }>('POST', 'decisions', { venue, place, action, filters });
```

Create `src/lib/admin/SignIn.svelte`:

```svelte
<script lang="ts">
  let {
    hasPasskeys,
    busy,
    onSignIn,
    onSetUp,
  }: { hasPasskeys: boolean; busy: boolean; onSignIn: () => void; onSetUp: (code: string, name: string) => void } =
    $props();
  let code = $state('');
  let name = $state('My phone');
</script>

<section class="admin-signin" aria-label="Sign in">
  {#if hasPasskeys}
    <button type="button" class="btn primary" disabled={busy} onclick={onSignIn}>Sign in with a passkey</button>
  {/if}
  <details open={!hasPasskeys}>
    <summary>Set up a passkey</summary>
    <form
      onsubmit={(e) => {
        e.preventDefault();
        onSetUp(code, name);
      }}
    >
      <label>Setup code <input type="password" autocomplete="off" bind:value={code} required /></label>
      <label>Name this passkey <input bind:value={name} maxlength="40" required /></label>
      <button type="submit" class="btn" disabled={busy}>Set up</button>
    </form>
    <p class="admin-note">
      The setup code is the ADMIN_SETUP_CODE secret in Cloudflare. It works once. To recover, set a new one and redeploy.
    </p>
  </details>
</section>
```

Create `src/lib/admin/SpotsMap.svelte`:

```svelte
<script lang="ts">
  import { georef, latLngToPlan } from '$lib/core/geo';
  import type { LatLng, Point, Surroundings } from '$lib/core/types';
  import StreetLayer from '$lib/map/StreetLayer.svelte';
  import type { Place } from './places';
  import type { AdminVenue } from './types';

  let { venue, place, surroundings }: { venue: AdminVenue; place: Place; surroundings: Surroundings | null } =
    $props();
  const W = 700,
    H = 744;
  const g = $derived(georef(venue.pins));
  const half = $derived(150 / venue.metersPerPx);
  const centre = $derived.by((): Point => {
    if (place.kind === 'door') return [place.lm.x, place.lm.y];
    const a = venue.areas.find((x) => x.id === place.id)!;
    return [a.label.x, a.label.y];
  });
  const vb = $derived({ x: centre[0] - (half * W) / H, y: centre[1] - half, w: (2 * half * W) / H, h: 2 * half });
  const r = $derived(vb.h / 120);
  const at = (s: LatLng) => latLngToPlan(g, s);
  const good = $derived(new Set(place.kind === 'door' ? place.review.good : place.check.inside));
  const mid = $derived(place.kind === 'door' && place.review.middle ? at(place.review.middle) : null);
</script>

<section class="admin-map" aria-label="Spots on the map">
  <svg viewBox="{vb.x} {vb.y} {vb.w} {vb.h}" role="img" aria-label="{place.spots.length} spots near {place.name.en}">
    <StreetLayer geo={g} {surroundings} tileUrl="" {vb} pxPerUnit={W / vb.w} onTiles={() => {}} />
    {#each venue.walls as w, k (k)}
      <path d={'M' + w.map((p) => p.join(',')).join('L') + 'Z'} class="am-wall" />
    {/each}
    {#each place.spots as s, k (k)}
      {@const p = at(s)}
      <circle cx={p[0]} cy={p[1]} {r} class={good.has(s) ? 'am-good' : 'am-left'} />
    {/each}
    {#if place.kind === 'door'}
      {#if mid}
        <line x1={place.lm.x} y1={place.lm.y} x2={mid[0]} y2={mid[1]} class="am-move" stroke-width={r / 2} />
        <circle cx={mid[0]} cy={mid[1]} r={r * 3} class="am-mid" stroke-width={r / 1.5} />
      {/if}
      <circle cx={place.lm.x} cy={place.lm.y} r={r * 2.5} class="am-pin" stroke-width={r / 2} />
    {/if}
  </svg>
  <ul class="am-key">
    <li><span class="k-pin"></span>Pin now</li>
    <li><span class="k-mid"></span>Middle of good spots</li>
    <li><span class="k-good"></span>Good</li>
    <li><span class="k-left"></span>Left out</li>
  </ul>
</section>
```

Create `src/lib/admin/DecisionPanel.svelte`:

```svelte
<script lang="ts">
  import { GOOD_ACCURACY_M, NEAR_PIN_M, type Filters } from '$lib/core/spotReview';
  import { SPOT_KEEP_DAYS } from '$lib/core/spots';
  import type { DoorPlace } from './places';
  let {
    place,
    filters = $bindable(),
    busy,
    onKeep,
    onMove,
  }: { place: DoorPlace; filters: Filters; busy: boolean; onKeep: () => void; onMove: () => void } = $props();
  const r = $derived(place.review);
</script>

<aside class="admin-decision" aria-label="Decision">
  <h2>{place.name.en}</h2>
  <p class="admin-note">
    {r.middle
      ? `Good spots sit ${r.offsetM.toFixed(1)} m from the pin. Moving it also shifts every hall a little.`
      : 'No good spots yet.'}
  </p>
  <fieldset>
    <legend>Which spots count</legend>
    <label><input type="checkbox" bind:checked={filters.accuracy} /> GPS better than {GOOD_ACCURACY_M} m</label>
    <label><input type="checkbox" bind:checked={filters.near} /> Within {NEAR_PIN_M} m of the pin</label>
    <label><input type="checkbox" bind:checked={filters.eventDays} /> Sent during event days</label>
  </fieldset>
  <dl>
    <dt>Good spots</dt>
    <dd>{r.good.length}</dd>
    <dt>Left out</dt>
    <dd>{r.left.length}</dd>
    <dt>Spread</dt>
    <dd>{r.spreadM.toFixed(1)} m</dd>
  </dl>
  {#if place.problems.length}
    <ul class="admin-problems">
      {#each place.problems as p (p)}<li>{p}</li>{/each}
    </ul>
  {:else}
    <p class="admin-ok">Map pin checks pass after the move.</p>
  {/if}
  {#if place.last}
    <p class="admin-note">
      Last decision: {place.last.action === 'move' ? 'moved' : 'kept'} on {place.last.at.slice(0, 10)}
      {#if place.last.pr}· <a href={place.last.pr} target="_blank" rel="noopener">pull request</a>{/if}
    </p>
  {/if}
  <p class="admin-note">Spots are deleted {SPOT_KEEP_DAYS} days after the event.</p>
  <div class="admin-btns">
    <button type="button" class="btn" disabled={busy} onclick={onKeep}>Keep pin</button>
    <button type="button" class="btn move" disabled={busy || place.problems.length > 0} onclick={onMove}>Move pin</button>
  </div>
</aside>
```

Create `src/lib/admin/Admin.svelte`:

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import { ALL_FILTERS, type Filters, type StoredSpot } from '$lib/core/spotReview';
  import type { Surroundings } from '$lib/core/types';
  import { decide, getMe, getSpots, setUp, signIn, signOut, type Me } from './api';
  import { placeNote, placesFor, type Decision } from './places';
  import type { AdminVenue } from './types';
  import SignIn from './SignIn.svelte';
  import SpotsMap from './SpotsMap.svelte';
  import DecisionPanel from './DecisionPanel.svelte';
  import './admin.css';

  let { venues }: { venues: AdminVenue[] } = $props();
  let me = $state<Me | null>(null);
  let venueId = $state('');
  let spots = $state<StoredSpot[]>([]);
  let decisions = $state<Decision[]>([]);
  let placeId = $state('');
  let filters = $state<Filters>({ ...ALL_FILTERS });
  let surroundings = $state<Surroundings | null>(null);
  let message = $state('');
  let link = $state('');
  let busy = $state(false);

  const venue = $derived(venues.find((v) => v.id === venueId) ?? venues[0] ?? null);
  const places = $derived(venue ? placesFor(venue, spots, decisions, filters) : []);
  const place = $derived(places.find((p) => p.id === placeId) ?? places[0] ?? null);

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
    if (!me.signedIn || !venue) return;
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
  const addPasskey = () =>
    run(async () => {
      const name = prompt('Name this passkey', 'Spare passkey');
      if (!name) return;
      await setUp('', name);
      await load();
      message = 'Spare passkey added.';
    });
  const keep = () =>
    run(async () => {
      if (!venue || !place) return;
      await decide(venue.id, place.id, 'keep', filters);
      await load();
      message = 'Pin kept.';
    });
  const move = () =>
    run(async () => {
      if (!venue || !place) return;
      const r = await decide(venue.id, place.id, 'move', filters);
      await load();
      message = 'Pull request ready. Check the preview, then merge.';
      link = r.pr ?? '';
    });

  onMount(() => {
    run(load);
  });
</script>

<div class="admin">
  <header class="admin-top">
    <b>Review guest spots</b>
    {#if me?.signedIn}
      {#if venues.length > 1}
        <label
          >Venue
          <select value={venue?.id} onchange={(e) => chooseVenue(e.currentTarget.value)}>
            {#each venues as v (v.id)}<option value={v.id}>{v.name.en}</option>{/each}
          </select>
        </label>
      {/if}
      <button type="button" class="btn" disabled={busy} onclick={addPasskey}>Add a passkey</button>
      <button type="button" class="btn" disabled={busy} onclick={() => run(async () => { await signOut(); await load(); })}>Sign out</button>
    {/if}
  </header>
  <p class="admin-msg" role="status">
    {message}
    {#if link}<a href={link} target="_blank" rel="noopener">Open the pull request</a>{/if}
  </p>
  {#if !me}
    <p class="admin-wait">Checking sign-in…</p>
  {:else if !me.signedIn}
    <SignIn
      hasPasskeys={me.hasPasskeys}
      {busy}
      onSignIn={() => run(async () => { await signIn(); await load(); })}
      onSetUp={(code, name) => run(async () => { await setUp(code, name); await load(); })}
    />
  {:else if !venue}
    <p class="admin-wait">No venue has map pins yet.</p>
  {:else}
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
</div>
```

Create `src/lib/admin/admin.css`:

```css
.admin {
  min-height: 100vh;
  background: var(--panel);
  color: var(--text);
}
.admin-top {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  padding: 10px 16px;
  background: var(--ink);
  color: #fff;
}
.admin-top b {
  margin-right: auto;
  font-family: Mitr, sans-serif;
  font-weight: 500;
  font-size: 18px;
}
.admin-msg {
  margin: 0;
  min-height: 1.5em;
  padding: 8px 16px;
  color: var(--muted);
}
.admin-wait,
.admin-signin {
  max-width: 420px;
  padding: 16px;
}
.admin-signin form {
  display: grid;
  gap: 10px;
  margin: 10px 0;
}
.admin-signin label {
  display: grid;
  gap: 4px;
  font-size: 14px;
}
.admin-signin input {
  min-height: 44px;
  padding: 0 10px;
  border: 1px solid var(--line);
  border-radius: 10px;
  font: inherit;
}
.admin-note {
  margin: 0;
  font-size: 13px;
  color: var(--muted);
}
.admin-body {
  display: grid;
  grid-template-columns: 280px minmax(0, 1fr) 320px;
  min-height: calc(100vh - 100px);
}
.admin-places {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 16px;
  border-right: 1px solid var(--line);
}
.admin-places h2,
.admin-decision h2 {
  margin: 0 0 4px;
  font-family: Mitr, sans-serif;
  font-weight: 500;
  font-size: 17px;
}
.admin-place {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  min-height: 44px;
  padding: 10px 12px;
  border: 0;
  border-radius: 10px;
  background: var(--chip);
  color: var(--text);
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.admin-place span {
  font-size: 12.5px;
  color: var(--muted);
}
.admin-place[aria-current='true'] {
  background: var(--ink);
  color: #fff;
}
.admin-place[aria-current='true'] span {
  color: #fff;
  opacity: 0.85;
}
.admin-map {
  position: relative;
  background: var(--s-ground);
  border-right: 1px solid var(--line);
}
.admin-map svg {
  display: block;
  width: 100%;
  height: 100%;
  min-height: 360px;
}
.am-wall {
  fill: var(--floor);
  fill-opacity: 0.85;
  stroke: var(--wall);
  stroke-width: 3;
}
.am-good {
  fill: var(--blue);
  fill-opacity: 0.55;
}
.am-left {
  fill: #8a8f99;
  fill-opacity: 0.5;
}
.am-pin {
  fill: var(--sun);
  stroke: var(--ink);
}
.am-mid {
  fill: none;
  stroke: var(--blue);
}
.am-move {
  stroke: var(--ink);
  stroke-dasharray: 6 5;
}
.am-key {
  position: absolute;
  left: 12px;
  top: 12px;
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin: 0;
  padding: 6px 10px;
  list-style: none;
  border-radius: 8px;
  background: var(--panel);
  font-size: 13px;
}
.am-key li {
  display: flex;
  align-items: center;
  gap: 6px;
}
.am-key span {
  width: 12px;
  height: 12px;
  border-radius: 99px;
}
.k-pin {
  background: var(--sun);
  border: 2px solid var(--ink);
}
.k-mid {
  border: 3px solid var(--blue);
}
.k-good {
  background: var(--blue);
  opacity: 0.6;
}
.k-left {
  background: #8a8f99;
  opacity: 0.6;
}
.admin-decision {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 20px;
}
.admin-decision fieldset {
  display: grid;
  gap: 8px;
  margin: 0;
  padding: 0;
  border: 0;
}
.admin-decision legend {
  margin-bottom: 6px;
  font-size: 13px;
  font-weight: 600;
}
.admin-decision label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
}
.admin-decision dl {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px 12px;
  margin: 0;
  font-size: 13px;
}
.admin-decision dt {
  color: var(--muted);
}
.admin-decision dd {
  margin: 0;
  font-weight: 600;
}
.admin-problems {
  margin: 0;
  padding-left: 18px;
  font-size: 13px;
  color: #b3261e;
}
.admin-ok {
  margin: 0;
  font-size: 13px;
}
.admin-btns {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin-top: auto;
}
.btn.move {
  background: var(--sun);
  border-color: var(--sun);
  color: var(--sunInk);
  font-weight: 600;
}
@media (max-width: 899px) {
  .admin-body {
    grid-template-columns: 1fr;
  }
  .admin-places {
    border-right: 0;
    border-bottom: 1px solid var(--line);
  }
  .admin-map svg {
    height: 60vh;
  }
}
```

Create `src/routes/admin/+page.server.ts`:

```ts
import { adminVenues } from '$lib/server/spotsCatalog';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = () => ({ venues: adminVenues() });
```

Create `src/routes/admin/+page.svelte`:

```svelte
<script lang="ts">
  import Admin from '$lib/admin/Admin.svelte';
  let { data } = $props();
</script>

<svelte:head>
  <title>Review guest spots</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<Admin venues={data.venues} />
```

- [ ] **Step 9: Run the e2e and build tests**

Run: `bunx playwright test tests/e2e/admin.e2e.ts && bun test tests/build.test.ts`
Expected: PASS on both projects. The build test finds no WebAuthn code in the event page's chunks.

- [ ] **Step 10: Run everything**

Run: `bun run test && bun run lint && bun run fmt:check && bun run check && bun run test:e2e`
Expected: PASS, 0 errors.

- [ ] **Step 11: Commit**

```bash
git add package.json bun.lock src/lib/admin src/lib/server/spotsCatalog.ts src/routes/admin tests/admin-places.test.ts tests/spots-catalog.test.ts tests/build.test.ts tests/e2e/admin.e2e.ts
git commit -m "feat(app): add the admin screen to review guest spots"
```

---

### Task 13: Setup notes and handover

**Files:**

- Modify: `README.md` (new section "Guest spots and the admin screen")
- Modify: `CLAUDE.md` (layout, storage keys, gotchas)

**Interfaces:**

- Consumes: everything above.
- Produces: the steps the owner follows once in Cloudflare and GitHub, and the notes the next session needs.

- [ ] **Step 1: Write the README section**

Append to `README.md`:

````markdown
## Guest spots and the admin screen

Guests at a door can send one GPS reading to `/api/spots`. The owner reviews them at `/admin/` and turns a "Move pin" into a pull request. The code is in `functions/`, `src/lib/api/` and `src/lib/admin/`, and the schema is in `migrations/`.

### One-time setup

1. Sign in to Cloudflare from this folder:

   ```bash
   bunx wrangler login
   ```

2. Make the two databases:

   ```bash
   bunx wrangler d1 create booth-spots
   bunx wrangler d1 create booth-spots-preview
   ```

3. Create the tables in both:

   ```bash
   bunx wrangler d1 execute booth-spots --remote --file migrations/0001_spots.sql
   bunx wrangler d1 execute booth-spots-preview --remote --file migrations/0001_spots.sql
   ```

4. In the Pages project, go to Settings, then Bindings, and add a D1 binding named `DB`: `booth-spots` for Production and `booth-spots-preview` for Preview. Bindings live in the dashboard, so the repo has no `wrangler.toml`.
5. In Settings, then Variables and secrets, for Production only, add these secrets:
   - `ADMIN_SETUP_CODE`: 16 characters or more, for example the output of `openssl rand -base64 24`.
   - `GITHUB_TOKEN`: a fine-grained token for `apisak-w/book-booth-finder` only, with Contents and Pull requests set to read and write and a 90-day expiry.
   - `GITHUB_REPO`: `apisak-w/book-booth-finder`.
6. Redeploy, open `/admin/`, enter the setup code under "Set up a passkey", then use "Add a passkey" to add a spare on a second device.
7. Once the "What we keep" page is approved, add the build variable `VITE_SPOTS` = `1` for Production and redeploy. The guest card stays hidden until then.

### Recovery

If both passkeys are lost, set a new `ADMIN_SETUP_CODE`, redeploy and set up again. A passkey belongs to one web address, so moving to a custom domain also means setting up again there. Replace `GITHUB_TOKEN` before it expires.

### Trying it locally

Create a `wrangler.toml` (git ignores it, so Cloudflare's Git builds never see it) and a `.dev.vars`:

```toml
pages_build_output_dir = "_site"

[[d1_databases]]
binding = "DB"
database_name = "booth-spots"
database_id = "local"
preview_database_id = "DB"
```

```
ADMIN_SETUP_CODE=a-local-code-of-16-chars
```

Then run:

```bash
bunx wrangler d1 execute booth-spots --local --file migrations/0001_spots.sql
```

```bash
VITE_SPOTS=1 bun run build
```

```bash
bunx wrangler pages dev
```

Passkeys work on `http://localhost`. Leave `GITHUB_TOKEN` unset locally, and Move pin will say what is missing instead of touching the real repo.
````

- [ ] **Step 2: Update CLAUDE.md**

In `CLAUDE.md`:

- In the Layout block, add these lines:

```
functions/           Cloudflare Pages Functions; they only forward to src/lib/api/
migrations/          D1 schema for guest spots, decisions, passkeys and sessions
src/lib/api/         server code for /api/spots and /api/admin/* (no Svelte, no Zod)
src/lib/admin/       the /admin/ screen; the only place that imports @simplewebauthn/browser
```

- In Content rules, replace the storage keys line with: `- Storage keys \`bf:lang\`, \`bf:<eventId>:from\` and \`bf:<eventId>:asked\` (\`sent\`, \`never\` or a date), always in try/catch.`
- In Gotchas, add:

```
- The guest spot card only shows when built with `VITE_SPOTS=1`, during the event's spot window (7 days before to the last day).
- Move pin edits `venue.json` through `withPins`, which keeps the file oxfmt-clean. Don't reformat the pins block by hand into another style.
- `/admin/` is English only and owner-only. Guest-facing copy still needs th and en.
```

- [ ] **Step 3: Format and check**

Run: `bun run fmt && bun run fmt:check && bun run test`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add README.md CLAUDE.md
git commit -m "docs: explain guest spots, the admin screen and their setup"
```

- [ ] **Step 5: Manual check before turning the card on**

On a deploy with the setup done, check each of these and note the result in the PR:

1. `/admin/` on a phone: set up with the code, sign out, sign in with Face ID or Touch ID, add a spare passkey.
2. Using the same code again is refused.
3. Build a preview with `VITE_SPOTS=1`. During an event's spot window, walk to a door with "Use my location", send a spot and see it at `/admin/`.
4. With 5 or more good spots at one door, press Move pin. A PR appears on branch `spots/<venue-id>`, CI passes and the Cloudflare preview shows the moved street map.
5. Press Move pin at another door while that PR is open. The same PR gets a second commit.

---

## Self-review notes

- Spec coverage:
  - 2.1 → Task 5
  - 2.2, 5.2 → Task 12
  - 2.3, 5.1 → Tasks 9 and 11
  - 2.4, 5.4 → Tasks 10 and 11
  - 2.5, 4.1 → Tasks 2 and 5
  - 2.6, 5.3 → Tasks 3 and 11 (hall spots never reach `decide`)
  - 2.7 → Tasks 2 and 5 (`purgeAfter`, `purge`)
  - 2.8 → Task 7
  - 2.9 and 3 → Tasks 6 and 8
  - 4.2 → Task 4
  - 4.3 → Task 5
  - 4.4 → Task 13 (README setup) and Task 5 (`.gitignore`)
  - 6 → File Structure
  - 7 → every task's tests, plus Task 13 step 6
- Types used across tasks:
  - `StoredSpot`, `Filters`, `PlaceReview` (Task 3) are used unchanged in Tasks 11 and 12.
  - `Decision` has the same fields in `admin.ts` (Task 11) and `places.ts` (Task 12).
  - `Ceremonies` (Task 9) is implemented by `webauthn` and by the test fake.
  - `Change.edit` returns `{ text, message }` in both Task 10 and Task 11.
- `withPins` keeps `venue.json` byte-identical on a round trip and oxfmt-clean after a move. Both were checked against the real `qsncc-lg-5-8` file while writing this plan.
- Move-check thresholds were checked numerically against the fake pins and the real `qsncc-lg-5-8` pins:
  - a 6 m move passes
  - a 91 m move fails on fit error
  - the bent-corner and mirrored cases fail as the tests expect
