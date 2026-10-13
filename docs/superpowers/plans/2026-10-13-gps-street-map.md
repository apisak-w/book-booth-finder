# GPS and Street Map Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a guest tap "Use my location", see themselves on a street map around the venue, walk to the best entrance, and get handed over to the hall plan at the door; indoors, ask which hall they are in.

**Architecture:** Each venue gets map pins that tie plan pixels to latitude and longitude. A pure `geo` module fits an affine transform between plan pixels and Web Mercator pixels, so the street map is drawn inside the existing SVG in plan coordinates and the plan keeps its printed orientation. Street images come from a raster tile provider when configured and reachable, over a small bundled street drawing generated from OpenStreetMap; GPS fixes are classified by a pure `locate` module and the Svelte UI only reacts to that classification.

**Tech Stack:** SvelteKit 2 (adapter-static), Svelte 5 runes, TypeScript, Bun test, Playwright, Zod (build time only), OpenStreetMap Overpass API (pipeline only).

**Spec:** `docs/superpowers/specs/2026-10-13-gps-street-map-design.md`

## Global Constraints

- Every guest-facing string exists in `th` and `en` in `src/lib/i18n/strings.ts`; `tests/strings.test.ts` enforces matching keys.
- Copy: plain verbs, sentence case, no exclamation marks, errors say what to do next.
- `src/lib/core/` stays free of DOM, Svelte and Zod. Zod never reaches the client bundle (`tests/build.test.ts`).
- Storage keys stay `bf:lang` and `bf:<eventId>:from` only; the guest's position is never stored or sent anywhere.
- No verbose code comments.
- Map layer ids: existing `layer-base|booths|zones|marks|route|pins` keep their names; new ones are `layer-street`, `layer-you`, and the wrapper group `map-turn`. CSS still targets `#layer-route`.
- `viewport.frame()` keeps waiting one animation frame before measuring; `clampVB` keeps the viewBox aspect equal to the element's.
- Commits follow Conventional Commits with scopes `core`, `venue`, `pipeline`, `map`, `app`, `docs`.
- Run `bun run test` after any change to `venues/`, `events/`, `src/lib/core/` or `src/lib/i18n/`. `tests/golden/v1.json` must keep passing unchanged.
- Walking speed is 55 m/min (`WALK_M_PER_MIN`).
- Tile provider is configured only through `VITE_TILE_URL` and `VITE_TILE_CREDIT` at build time; the style must have no text labels.

## Review Focus

1. GPS accuracy worse than 100 m (common indoors or near tall buildings): the guest sees "GPS is weak here", no dashed line, no hand-off. Pinned by `classify` tests in Task 4.
2. The guest picks a start from the list while locating: locating stops and their pick stays. Pinned by an e2e test in Task 10.
3. Tile server refuses (403 quota, 404, no network): the "Offline map" chip shows and the bundled drawing stays visible. Pinned by an e2e test in Task 10 (the e2e build points tiles at a path that 404s).
4. The guest changes the destination while locating: the entrance is picked again against the new destination. Pinned by a `pickEntrance` test in Task 4.
5. A venue without map pins: no button, no fetch, nothing breaks. Pinned by the `streetEntrances` fallback test in Task 4 and the `geo`-optional schema test in Task 2; the UI guards on `data.venue.geo`.

---

## File Structure

```
src/lib/core/geo.ts                 plan ⇄ lat/lng ⇄ Web Mercator, affine fit, georef quality numbers
src/lib/core/locate.ts              classify a GPS fix: weak | far | inside | arrived | outside; entrance and hall helpers
src/lib/core/compass.ts             heading from device orientation, map turn angle, smoothing
src/lib/core/panzoom.ts             + unionRect, boxAround
src/lib/core/types.ts               + LatLng, GeoPin, VenueGeo, Venue.geo, SHAPE_KINDS, Surroundings
src/lib/server/schema.ts            + geo on VenueSchema, SurroundingsSchema
src/lib/server/catalog.ts           + surroundingsPath, loadSurroundings
src/routes/v/[id]/surroundings.json/+server.ts   prerendered street drawing per venue
src/lib/map/tiles.ts                tile zoom, visible tiles, tile matrix, URL template
src/lib/map/tileConfig.ts           reads VITE_TILE_URL / VITE_TILE_CREDIT
src/lib/map/street.ts               shared map prop types
src/lib/map/StreetLayer.svelte      bundled drawing + tiles, in plan coordinates
src/lib/map/YouLayer.svelte         dot, accuracy circle, dashed line to the entrance
src/lib/map/viewport.ts             + hooks (onView, onPan), setBounds, frameBox
src/lib/map/FloorMap.svelte         wires new layers, turn group, compass button, offline chip
src/lib/ui/locate.ts                LocState, LocView types
src/lib/ui/locator.svelte.ts        thin wrapper on navigator.geolocation
src/lib/ui/finder.svelte.ts         + entranceMeters(dest)
src/lib/ui/StartPicker.svelte       + Use my location button and notes
src/lib/ui/OutdoorLeg.svelte        outside card
src/lib/ui/HallConfirm.svelte       which hall card
src/lib/ui/MapBanner.svelte         hand-off banner
src/lib/ui/ResultCard.svelte        + loc prop
src/lib/ui/FinderView.svelte        orchestration
src/lib/i18n/strings.ts             + new strings
src/lib/styles/app.css              + tokens and classes
tools/pipeline/lib/surroundings.ts  OSM → plan-space drawing
tools/pipeline/cli.ts               + surroundings command
venues/<id>/venue.json              + geo
venues/<id>/surroundings.json       generated
tests/helpers/fake-geo.ts           synthetic pins with a known transform
tests/geo.test.ts, locate.test.ts, compass.test.ts, tiles.test.ts, surroundings.test.ts
tests/e2e/locate.e2e.ts
```

---

### Task 1: Geo core

**Files:**
- Create: `src/lib/core/geo.ts`
- Modify: `src/lib/core/types.ts` (add types after `Point`)
- Create: `tests/helpers/fake-geo.ts`
- Test: `tests/geo.test.ts`

**Interfaces:**
- Consumes: `Point` from `src/lib/core/types.ts`.
- Produces:
  - types `LatLng = { lat: number; lng: number }`, `GeoPin = { id: string; x: number; y: number; lat: number; lng: number }`, `VenueGeo = { pins: GeoPin[]; entrances: string[] }` in `types.ts`.
  - `geo.ts`: `TILE = 256`, `FIT_Z = 20`, `norm360(d)`, `worldPx(lat, lng, z?) : Point`, `latLngOf(p: Point, z?) : LatLng`, `metersPerWorldPx(lat, z?)`, `type Affine = [a,b,c,d,e,f]` (SVG `matrix()` order), `apply(m, p) : Point`, `invert(m) : Affine`, `fitAffine(src: Point[], dst: Point[]) : Affine`, `type Georef = { toWorld; toPlan; scale; mPerPx; aspect; skewDeg; mirrored; residualM; northDeg }`, `georef(pins: GeoPin[]) : Georef`, `latLngToPlan(g, ll) : Point`, `planToLatLng(g, p) : LatLng`.
  - `tests/helpers/fake-geo.ts`: `LAT0`, `LNG0`, `M`, `fakeLatLng(x, y): LatLng`, `fakePins(points?): GeoPin[]`. The fake turns the plan 180° (plan right is west, plan down is north) at 0.1017 m per pixel.

- [ ] **Step 1: Add the types**

In `src/lib/core/types.ts`, after the line `export type Point = [number, number];` add:

```ts
export type LatLng = { lat: number; lng: number };
export type GeoPin = { id: string; x: number; y: number; lat: number; lng: number };
export type VenueGeo = { pins: GeoPin[]; entrances: string[] };
```

- [ ] **Step 2: Write the fake helper**

Create `tests/helpers/fake-geo.ts`:

```ts
import type { GeoPin, LatLng } from '../../src/lib/core/types';

export const LAT0 = 13.7236;
export const LNG0 = 100.5597;
export const M = 0.1016949152542373;
const M_PER_DEG = (2 * Math.PI * 6378137) / 360;

export function fakeLatLng(x: number, y: number): LatLng {
  const east = -(x - 1400) * M,
    north = (y - 900) * M;
  return { lat: LAT0 + north / M_PER_DEG, lng: LNG0 + east / (M_PER_DEG * Math.cos((LAT0 * Math.PI) / 180)) };
}

export const fakePins = (
  pts: [string, number, number][] = [
    ['a', 446, 280],
    ['b', 2391, 280],
    ['c', 2391, 1440],
    ['d', 446, 1464],
  ],
): GeoPin[] => pts.map(([id, x, y]) => ({ id, x, y, ...fakeLatLng(x, y) }));
```

- [ ] **Step 3: Write the failing tests**

Create `tests/geo.test.ts`:

```ts
import { test, expect } from 'bun:test';
import {
  apply,
  fitAffine,
  georef,
  invert,
  latLngOf,
  latLngToPlan,
  metersPerWorldPx,
  norm360,
  planToLatLng,
  worldPx,
  type Affine,
} from '../src/lib/core/geo';
import type { Point } from '../src/lib/core/types';
import { fakeLatLng, fakePins, M } from './helpers/fake-geo';

test('worldPx and latLngOf are inverses', () => {
  const p = worldPx(13.7236, 100.5597);
  const ll = latLngOf(p);
  expect(ll.lat).toBeCloseTo(13.7236, 9);
  expect(ll.lng).toBeCloseTo(100.5597, 9);
});

test('metersPerWorldPx at the equator and zoom 0 is the Earth circumference over 256', () => {
  expect(metersPerWorldPx(0, 0)).toBeCloseTo((2 * Math.PI * 6378137) / 256, 6);
});

test('fitAffine recovers an exact affine transform', () => {
  const m: Affine = [2, 0.5, -1, 3, 10, 20];
  const src: Point[] = [
    [0, 0],
    [100, 0],
    [0, 100],
    [100, 100],
  ];
  const got = fitAffine(
    src,
    src.map((p) => apply(m, p)),
  );
  got.forEach((v, k) => expect(v).toBeCloseTo(m[k], 9));
});

test('fitAffine refuses points in a line', () => {
  const line: Point[] = [
    [0, 0],
    [1, 1],
    [2, 2],
  ];
  expect(() => fitAffine(line, line)).toThrow('not in a line');
  expect(() =>
    fitAffine(
      [
        [5, 0],
        [5, 1],
        [5, 2],
      ],
      line,
    ),
  ).toThrow('not in a line');
});

test('invert undoes apply', () => {
  const m: Affine = [1.2, -0.3, 0.4, 0.9, 50, -7];
  const [x, y] = apply(invert(m), apply(m, [12, 34]));
  expect(x).toBeCloseTo(12, 9);
  expect(y).toBeCloseTo(34, 9);
});

test('georef of a 180° plan reports scale, north and a clean fit', () => {
  const g = georef(fakePins());
  expect(g.mPerPx / M).toBeCloseTo(1, 3);
  expect(g.northDeg).toBeCloseTo(180, 1);
  expect(g.mirrored).toBe(false);
  expect(g.aspect).toBeGreaterThan(0.999);
  expect(g.skewDeg).toBeLessThan(0.1);
  expect(g.residualM).toBeLessThan(0.05);
});

test('latLngToPlan and planToLatLng round trip through the pins', () => {
  const g = georef(fakePins());
  const [x, y] = latLngToPlan(g, fakeLatLng(1000, 700));
  expect(x).toBeCloseTo(1000, 1);
  expect(y).toBeCloseTo(700, 1);
  const ll = planToLatLng(g, [1000, 700]);
  const back = fakeLatLng(1000, 700);
  expect(ll.lat).toBeCloseTo(back.lat, 7);
  expect(ll.lng).toBeCloseTo(back.lng, 7);
});

test('norm360 wraps any angle into [0, 360)', () => {
  expect(norm360(-90)).toBe(270);
  expect(norm360(720)).toBe(0);
});
```

- [ ] **Step 4: Run the tests to see them fail**

Run: `bun test tests/geo.test.ts`
Expected: FAIL, `Cannot find module '../src/lib/core/geo'`.

- [ ] **Step 5: Implement `src/lib/core/geo.ts`**

```ts
import type { GeoPin, LatLng, Point } from './types';

export type Affine = [number, number, number, number, number, number];
export type Georef = {
  toWorld: Affine;
  toPlan: Affine;
  scale: number;
  mPerPx: number;
  aspect: number;
  skewDeg: number;
  mirrored: boolean;
  residualM: number;
  northDeg: number;
};

export const TILE = 256;
export const FIT_Z = 20;
const R = 6378137;
const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

export const norm360 = (d: number) => ((d % 360) + 360) % 360 || 0;

export function worldPx(lat: number, lng: number, z = FIT_Z): Point {
  const s = TILE * 2 ** z,
    r = rad(lat);
  return [((lng + 180) / 360) * s, ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * s];
}

export function latLngOf([x, y]: Point, z = FIT_Z): LatLng {
  const s = TILE * 2 ** z;
  return { lat: deg(Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / s)))), lng: (x / s) * 360 - 180 };
}

export const metersPerWorldPx = (lat: number, z = FIT_Z) => (Math.cos(rad(lat)) * 2 * Math.PI * R) / (TILE * 2 ** z);

export const apply = (m: Affine, [x, y]: Point): Point => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

export function invert(m: Affine): Affine {
  const [a, b, c, d, e, f] = m,
    det = a * d - b * c;
  return [d / det, -b / det, -c / det, a / det, (c * f - d * e) / det, (b * e - a * f) / det];
}

export function fitAffine(src: Point[], dst: Point[]): Affine {
  const n = src.length;
  const mean = (ps: Point[], k: 0 | 1) => ps.reduce((s, p) => s + p[k], 0) / n;
  const mx = mean(src, 0),
    my = mean(src, 1),
    MX = mean(dst, 0),
    MY = mean(dst, 1);
  let sxx = 0,
    sxy = 0,
    syy = 0,
    sxX = 0,
    syX = 0,
    sxY = 0,
    syY = 0;
  for (let k = 0; k < n; k++) {
    const x = src[k][0] - mx,
      y = src[k][1] - my,
      X = dst[k][0] - MX,
      Y = dst[k][1] - MY;
    sxx += x * x;
    sxy += x * y;
    syy += y * y;
    sxX += x * X;
    syX += y * X;
    sxY += x * Y;
    syY += y * Y;
  }
  const det = sxx * syy - sxy * sxy;
  if (n < 3 || sxx === 0 || syy === 0 || Math.abs(det) <= 1e-9 * sxx * syy)
    throw new Error('map pins must be at least 3 points that are not in a line');
  const a = (sxX * syy - sxy * syX) / det,
    c = (sxx * syX - sxy * sxX) / det,
    b = (sxY * syy - sxy * syY) / det,
    d = (sxx * syY - sxy * sxY) / det;
  return [a, b, c, d, MX - a * mx - c * my, MY - b * mx - d * my];
}

export function georef(pins: GeoPin[]): Georef {
  const src = pins.map((p): Point => [p.x, p.y]),
    dst = pins.map((p) => worldPx(p.lat, p.lng));
  const toWorld = fitAffine(src, dst),
    toPlan = invert(toWorld);
  const [a, b, c, d] = toWorld;
  const det = a * d - b * c,
    scale = Math.sqrt(Math.abs(det));
  const n1 = Math.hypot(a, b),
    n2 = Math.hypot(c, d);
  const lat0 = pins.reduce((s, p) => s + p.lat, 0) / pins.length;
  const mw = metersPerWorldPx(lat0);
  const sq = src.reduce((s, p, k) => {
    const [X, Y] = apply(toWorld, p);
    return s + (X - dst[k][0]) ** 2 + (Y - dst[k][1]) ** 2;
  }, 0);
  const nx = -toPlan[2],
    ny = -toPlan[3];
  return {
    toWorld,
    toPlan,
    scale,
    mPerPx: scale * mw,
    aspect: Math.min(n1, n2) / Math.max(n1, n2),
    skewDeg: Math.abs(90 - deg(Math.acos((a * c + b * d) / (n1 * n2)))),
    mirrored: det < 0,
    residualM: Math.sqrt(sq / pins.length) * mw,
    northDeg: norm360(deg(Math.atan2(nx, -ny))),
  };
}

export const latLngToPlan = (g: Georef, ll: LatLng): Point => apply(g.toPlan, worldPx(ll.lat, ll.lng));
export const planToLatLng = (g: Georef, p: Point): LatLng => latLngOf(apply(g.toWorld, p));
```

- [ ] **Step 6: Run the tests to see them pass**

Run: `bun test tests/geo.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 7: Run lint and the type check**

Run: `bun run lint && bun run check`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add src/lib/core/geo.ts src/lib/core/types.ts tests/geo.test.ts tests/helpers/fake-geo.ts
git commit -m "feat(core): fit plan pixels to map coordinates"
```

---

### Task 2: Map pins on the venue schema

**Files:**
- Modify: `src/lib/core/types.ts` (`Venue` type)
- Modify: `src/lib/server/schema.ts` (`VenueSchema`)
- Modify: `tests/schema.test.ts`
- Modify: `tests/venues.test.ts`

**Interfaces:**
- Consumes: `VenueGeo`, `georef` from Task 1.
- Produces: `Venue.geo?: VenueGeo`. Schema rule: `geo.pins` has at least 3 items with `lat` in [-85, 85], `lng` in [-180, 180]; `geo.entrances` has at least 1 landmark id.

- [ ] **Step 1: Write the failing schema tests**

Append to `tests/schema.test.ts` (keep the existing imports; add the ones below at the top of the file if missing):

```ts
import { readFileSync } from 'node:fs';
import { VenueSchema } from '../src/lib/server/schema';
import { fakePins } from './helpers/fake-geo';

const venueJson = () => JSON.parse(readFileSync('venues/qsncc-lg-5-8/venue.json', 'utf8'));

test('a venue may have map pins', () => {
  const r = VenueSchema.safeParse({ ...venueJson(), geo: { pins: fakePins(), entrances: ['mrt'] } });
  expect(r.success).toBe(true);
});

test('a venue without map pins is still valid', () => {
  const v = venueJson();
  delete v.geo;
  expect(VenueSchema.safeParse(v).success).toBe(true);
});

test('map pins need at least 3 pins and 1 entrance', () => {
  expect(VenueSchema.safeParse({ ...venueJson(), geo: { pins: fakePins().slice(0, 2), entrances: ['mrt'] } }).success).toBe(false);
  expect(VenueSchema.safeParse({ ...venueJson(), geo: { pins: fakePins(), entrances: [] } }).success).toBe(false);
});

test('map pins reject impossible coordinates', () => {
  const pins = fakePins().map((p, k) => (k === 0 ? { ...p, lat: 95 } : p));
  expect(VenueSchema.safeParse({ ...venueJson(), geo: { pins, entrances: ['mrt'] } }).success).toBe(false);
});
```

- [ ] **Step 2: Run them to see the first two fail or the last two pass for the wrong reason**

Run: `bun test tests/schema.test.ts`
Expected: FAIL on "map pins need at least 3 pins and 1 entrance" and "map pins reject impossible coordinates" (Zod strips the unknown `geo` key, so both parse).

- [ ] **Step 3: Add `geo` to the type and the schema**

In `src/lib/core/types.ts`, inside `export type Venue = {`, after `landmarks: Landmark[];` add:

```ts
  geo?: VenueGeo;
```

In `src/lib/server/schema.ts`, inside `VenueSchema`'s `z.object({`, after `landmarks: z.array(landmark),` add:

```ts
  geo: z
    .object({
      pins: z
        .array(
          z.object({
            id: z.string().min(1),
            x: num,
            y: num,
            lat: num.min(-85).max(85),
            lng: num.min(-180).max(180),
          }),
        )
        .min(3),
      entrances: z.array(z.string().min(1)).min(1),
    })
    .optional(),
```

- [ ] **Step 4: Run the schema tests to see them pass**

Run: `bun test tests/schema.test.ts`
Expected: PASS.

- [ ] **Step 5: Add the venue pin check**

In `tests/venues.test.ts`, add the import:

```ts
import { georef } from '../src/lib/core/geo';
```

and inside the `describe(`venue ${id}`, () => {` block, after the last test, add:

```ts
    test.skipIf(!venue.geo)('map pins match the plan', () => {
      const geo = venue.geo!;
      const g = georef(geo.pins);
      expect(g.mirrored).toBe(false);
      expect(Math.abs(g.mPerPx / venue.metersPerPx - 1)).toBeLessThan(0.05);
      expect(g.aspect).toBeGreaterThan(0.95);
      expect(g.skewDeg).toBeLessThan(3);
      if (geo.pins.length >= 4) expect(g.residualM).toBeLessThan(5);
      for (const e of geo.entrances) expect(venue.landmarks.some((l) => l.id === e)).toBe(true);
    });
```

- [ ] **Step 6: Run the whole suite**

Run: `bun run test`
Expected: PASS. The new venue test is skipped for both venues (no pins yet).

- [ ] **Step 7: Commit**

```bash
git add src/lib/core/types.ts src/lib/server/schema.ts tests/schema.test.ts tests/venues.test.ts
git commit -m "feat(venue): accept map pins and street entrances"
```

---

### Task 3: Map pins for the QSNCC venues

**Needs:** a person, or an agent with the in-app browser. Coordinates must come from a satellite or map view. Never guess them.

**Files:**
- Modify: `venues/qsncc-lg-5-8/venue.json`
- Modify: `venues/qsncc-lg-5-7/venue.json`

**Interfaces:**
- Consumes: the schema from Task 2 and the check in `tests/venues.test.ts`.
- Produces: `geo` on both venues. Both venues share one plan coordinate space, so they share the same pins. Entrances: `["mrt", "door5", "door6", "door7", "door8"]` for `qsncc-lg-5-8` and `["mrt", "door5", "door6", "door7"]` for `qsncc-lg-5-7`. `west` is not a street entrance: it opens onto the MRT corridor.

- [ ] **Step 1: Pick four features you can see on both the plan and a satellite view**

Open `venues/qsncc-lg-5-8/reference.jpg` next to a satellite view of Queen Sirikit National Convention Center (for example, Esri World Imagery or a map app's satellite layer). Choose four features spread across the plan, not in a line, that you can see in both: the outer corners of the lakeside facade, a corner of the MRT corridor, door openings on the lakeside. For each one, write down the plan pixel (from the reference image) and the latitude and longitude (from the satellite view, at least 6 decimal places).

- [ ] **Step 2: Add `geo` to `venues/qsncc-lg-5-8/venue.json`**

Add this key after `"landmarks": [...]`, using your four measurements (ids name what each pin is):

```json
  "geo": {
    "pins": [
      { "id": "<feature-1>", "x": <plan x>, "y": <plan y>, "lat": <lat>, "lng": <lng> },
      { "id": "<feature-2>", "x": <plan x>, "y": <plan y>, "lat": <lat>, "lng": <lng> },
      { "id": "<feature-3>", "x": <plan x>, "y": <plan y>, "lat": <lat>, "lng": <lng> },
      { "id": "<feature-4>", "x": <plan x>, "y": <plan y>, "lat": <lat>, "lng": <lng> }
    ],
    "entrances": ["mrt", "door5", "door6", "door7", "door8"]
  }
```

The angle-bracket values are the measurements from Step 1. They are data, not code.

- [ ] **Step 3: Run the venue check**

Run: `bun test tests/venues.test.ts`
Expected: PASS for `map pins match the plan` on `qsncc-lg-5-8`. If the scale check fails, a pin is matched to the wrong feature; if `mirrored` is true, two pins are swapped. Fix the measurement, not the test.

- [ ] **Step 4: Copy the same pins to `venues/qsncc-lg-5-7/venue.json`**

Same `pins` array, with `"entrances": ["mrt", "door5", "door6", "door7"]`.

- [ ] **Step 5: Run the suite**

Run: `bun run test`
Expected: PASS, including the golden snapshot.

- [ ] **Step 6: Commit, saying where each pin came from**

```bash
git add venues/qsncc-lg-5-8/venue.json venues/qsncc-lg-5-7/venue.json
git commit -m "feat(venue): pin the QSNCC LG plans to the map" -m "Pins measured from <imagery source> on <date>: <feature-1>, <feature-2>, <feature-3>, <feature-4>."
```

---

### Task 4: Classify a GPS fix

**Files:**
- Create: `src/lib/core/locate.ts`
- Test: `tests/locate.test.ts`

**Interfaces:**
- Consumes: `Georef`, `georef`, `latLngToPlan` (Task 1); `pointInPolygon`, `areaAt` from `src/lib/core/geometry.ts`; `EventData`, `Landmark`, `LatLng`, `Point`, `Venue`.
- Produces:
  - `FAR_M = 1500`, `ARRIVE_M = 30`, `WEAK_M = 100`
  - `type Fix = LatLng & { accuracy: number }`
  - `type Where = { kind: 'weak' } | { kind: 'far'; meters: number } | { kind: 'inside'; p: Point; hall: string | null } | { kind: 'arrived'; entrance: Landmark } | { kind: 'outside'; p: Point; accuracyPx: number; entrance: Landmark; meters: number }`
  - `streetEntrances(data: EventData): Landmark[]`
  - `pickEntrance(p: Point, entrances: Landmark[], indoorM: Record<string, number> | null, mPerPx: number): { entrance: Landmark; meters: number } | null`
  - `classify(fix: Fix, data: EventData, g: Georef, indoorM?: Record<string, number> | null): Where`
  - `hallChoices(v: Venue, guess: string | null): string[]`
  - `hallStart(data: EventData, hall: string): string | null`

- [ ] **Step 1: Write the failing tests**

Create `tests/locate.test.ts`:

```ts
import { test, expect } from 'bun:test';
import { loadEvent } from '../src/lib/server/catalog';
import { loadData } from '../src/lib/core/prepare';
import { georef } from '../src/lib/core/geo';
import { classify, hallChoices, hallStart, pickEntrance, streetEntrances } from '../src/lib/core/locate';
import { fakeLatLng, fakePins } from './helpers/fake-geo';

const bundle = loadEvent('bkkibf-2026');
const geo = { pins: fakePins(), entrances: ['mrt', 'door5', 'door6', 'door7', 'door8'] };
const data = loadData({ ...bundle, venue: { ...bundle.venue, geo } });
const g = georef(geo.pins);
const fix = (x: number, y: number, accuracy = 15) => ({ ...fakeLatLng(x, y), accuracy });

test('accuracy worse than 100 m is weak, wherever the fix lands', () => {
  expect(classify(fix(-200, 560, 150), data, g).kind).toBe('weak');
  expect(classify(fix(1000, 900, 150), data, g).kind).toBe('weak');
});

test('a fix inside the walls asks for the hall it falls in', () => {
  const w = classify(fix(1000, 900), data, g);
  expect(w.kind).toBe('inside');
  if (w.kind === 'inside') expect(w.hall).toBe('hall6');
});

test('near a street entrance counts as arrived', () => {
  const w = classify(fix(260, 560), data, g);
  expect(w).toEqual({ kind: 'arrived', entrance: data.landmarkById.mrt });
});

test('outside within reach walks to the nearest street entrance', () => {
  const w = classify(fix(-200, 560), data, g);
  expect(w.kind).toBe('outside');
  if (w.kind === 'outside') {
    expect(w.entrance.id).toBe('mrt');
    expect(w.meters).toBe(46);
    expect(w.accuracyPx).toBeCloseTo(15 / data.venue.metersPerPx, 3);
  }
});

test('the MRT-corridor door is never offered as a street entrance', () => {
  expect(streetEntrances(data).map((l) => l.id)).not.toContain('west');
});

test('more than 1.5 km away is far', () => {
  const w = classify(fix(-20000, 560), data, g);
  expect(w.kind).toBe('far');
  if (w.kind === 'far') expect(w.meters).toBeGreaterThan(1500);
});

test('pickEntrance weighs the walk inside', () => {
  const p: [number, number] = [687, 2200];
  const doors = streetEntrances(data);
  expect(pickEntrance(p, doors, null, data.venue.metersPerPx)?.entrance.id).toBe('door5');
  const indoor = { mrt: 500, door5: 100, door6: 0, door7: 300, door8: 300 };
  expect(pickEntrance(p, doors, indoor, data.venue.metersPerPx)?.entrance.id).toBe('door6');
});

test('pickEntrance ignores entrances with no indoor route, then falls back to distance', () => {
  const p: [number, number] = [687, 2200];
  const doors = streetEntrances(data);
  expect(pickEntrance(p, doors, { door7: 10 }, data.venue.metersPerPx)?.entrance.id).toBe('door7');
  expect(pickEntrance(p, doors, {}, data.venue.metersPerPx)?.entrance.id).toBe('door5');
});

test('streetEntrances falls back to every entry landmark when the venue has no pins', () => {
  const plain = loadData(bundle);
  const bare = { ...plain, venue: { ...plain.venue, geo: undefined } };
  expect(streetEntrances(bare).map((l) => l.id)).toEqual(bare.landmarks.filter((l) => l.group === 'entry').map((l) => l.id));
});

test('hallChoices offers the guess and its neighbours, or every hall', () => {
  expect(hallChoices(data.venue, 'hall6')).toEqual(['hall5', 'hall6', 'hall7']);
  expect(hallChoices(data.venue, 'hall5')).toEqual(['hall5', 'hall6']);
  expect(hallChoices(data.venue, null)).toEqual(['hall5', 'hall6', 'hall7', 'hall8']);
});

test('hallStart uses the hall door landmark', () => {
  expect(hallStart(data, 'hall6')).toBe('door6');
  expect(hallStart(data, 'nowhere')).toBeNull();
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `bun test tests/locate.test.ts`
Expected: FAIL, `Cannot find module '../src/lib/core/locate'`.

- [ ] **Step 3: Implement `src/lib/core/locate.ts`**

```ts
import { areaAt, pointInPolygon } from './geometry';
import { latLngToPlan, type Georef } from './geo';
import type { EventData, Landmark, LatLng, Point, Venue } from './types';

export const FAR_M = 1500;
export const ARRIVE_M = 30;
export const WEAK_M = 100;

export type Fix = LatLng & { accuracy: number };
export type Where =
  | { kind: 'weak' }
  | { kind: 'far'; meters: number }
  | { kind: 'inside'; p: Point; hall: string | null }
  | { kind: 'arrived'; entrance: Landmark }
  | { kind: 'outside'; p: Point; accuracyPx: number; entrance: Landmark; meters: number };

export function streetEntrances(data: EventData): Landmark[] {
  const ids = data.venue.geo?.entrances;
  if (!ids) return data.landmarks.filter((l) => l.group === 'entry');
  return ids.map((id) => data.landmarkById[id]).filter((l): l is Landmark => !!l);
}

export function pickEntrance(
  p: Point,
  entrances: Landmark[],
  indoorM: Record<string, number> | null,
  mPerPx: number,
): { entrance: Landmark; meters: number } | null {
  let best: { entrance: Landmark; meters: number } | null = null,
    cost = Infinity;
  for (const e of entrances) {
    const inside = indoorM ? indoorM[e.id] : 0;
    if (inside === undefined) continue;
    const out = Math.hypot(e.x - p[0], e.y - p[1]) * mPerPx;
    if (out + inside < cost) {
      cost = out + inside;
      best = { entrance: e, meters: Math.round(out) };
    }
  }
  return best ?? (indoorM ? pickEntrance(p, entrances, null, mPerPx) : null);
}

export function classify(fix: Fix, data: EventData, g: Georef, indoorM: Record<string, number> | null = null): Where {
  if (fix.accuracy > WEAK_M) return { kind: 'weak' };
  const v = data.venue,
    p = latLngToPlan(g, fix);
  if (v.walls.some((w) => pointInPolygon(p[0], p[1], w))) return { kind: 'inside', p, hall: areaAt(v, p[0], p[1]) };
  const pick = pickEntrance(p, streetEntrances(data), indoorM, v.metersPerPx);
  if (!pick) return { kind: 'weak' };
  if (pick.meters > FAR_M) return { kind: 'far', meters: pick.meters };
  if (pick.meters <= ARRIVE_M) return { kind: 'arrived', entrance: pick.entrance };
  return { kind: 'outside', p, accuracyPx: fix.accuracy / v.metersPerPx, entrance: pick.entrance, meters: pick.meters };
}

export function hallChoices(v: Venue, guess: string | null): string[] {
  const ids = v.areas.map((a) => a.id),
    k = guess ? ids.indexOf(guess) : -1;
  return k < 0 ? ids : ids.slice(Math.max(0, k - 1), k + 2);
}

export function hallStart(data: EventData, hall: string): string | null {
  const door = data.venue.doors.find((d) => d.area === hall && data.landmarkById[d.id]);
  if (door) return door.id;
  return data.landmarks.find((l) => areaAt(data.venue, l.x, l.y) === hall)?.id ?? null;
}
```

- [ ] **Step 4: Run them to see them pass**

Run: `bun test tests/locate.test.ts`
Expected: PASS, 11 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/core/locate.ts tests/locate.test.ts
git commit -m "feat(core): classify a GPS fix against the venue"
```

---

### Task 5: Compass maths

**Files:**
- Create: `src/lib/core/compass.ts`
- Test: `tests/compass.test.ts`

**Interfaces:**
- Consumes: `norm360` from Task 1.
- Produces: `norm180(d)`, `turnAngle(northDeg, heading)`, `smoothAngle(prev: number | null, next: number, k?)`, `headingFrom(e: { webkitCompassHeading?: number | null; alpha: number | null; absolute?: boolean }, screenAngle?): number | null`.
  - `turnAngle` is the SVG `rotate()` in degrees that makes the direction the guest faces point up. `northDeg` is where north points on the plan, clockwise from plan-up.

- [ ] **Step 1: Write the failing tests**

Create `tests/compass.test.ts`:

```ts
import { test, expect } from 'bun:test';
import { headingFrom, norm180, smoothAngle, turnAngle } from '../src/lib/core/compass';

test('norm180 wraps into (-180, 180]', () => {
  expect(norm180(190)).toBe(-170);
  expect(norm180(-190)).toBe(170);
  expect(norm180(180)).toBe(180);
  expect(norm180(-180)).toBe(180);
});

test('turnAngle points the way you face up', () => {
  expect(turnAngle(0, 0)).toBe(0);
  expect(turnAngle(180, 0)).toBe(180);
  expect(turnAngle(180, 90)).toBe(90);
  expect(turnAngle(0, 90)).toBe(-90);
});

test('smoothAngle eases across north without spinning the long way', () => {
  expect(smoothAngle(null, 42)).toBe(42);
  expect(smoothAngle(350, 10, 0.5)).toBe(0);
  expect(smoothAngle(10, 350, 0.5)).toBe(0);
});

test('headingFrom reads iOS, absolute Android, and ignores relative readings', () => {
  expect(headingFrom({ webkitCompassHeading: 30, alpha: 0 })).toBe(30);
  expect(headingFrom({ alpha: 90, absolute: true })).toBe(270);
  expect(headingFrom({ alpha: 90, absolute: false })).toBeNull();
  expect(headingFrom({ alpha: null, absolute: true })).toBeNull();
  expect(headingFrom({ webkitCompassHeading: 350, alpha: 0 }, 90)).toBe(80);
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `bun test tests/compass.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement `src/lib/core/compass.ts`**

```ts
import { norm360 } from './geo';

export function norm180(d: number): number {
  const r = norm360(d + 180) - 180;
  return r === -180 ? 180 : r;
}

export const turnAngle = (northDeg: number, heading: number) => norm180(-(northDeg + heading));

export const smoothAngle = (prev: number | null, next: number, k = 0.25) =>
  prev === null ? next : norm360(prev + norm180(next - prev) * k);

export function headingFrom(
  e: { webkitCompassHeading?: number | null; alpha: number | null; absolute?: boolean },
  screenAngle = 0,
): number | null {
  if (typeof e.webkitCompassHeading === 'number') return norm360(e.webkitCompassHeading + screenAngle);
  if (e.absolute && typeof e.alpha === 'number') return norm360(360 - e.alpha + screenAngle);
  return null;
}
```

- [ ] **Step 4: Run them to see them pass**

Run: `bun test tests/compass.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/core/compass.ts tests/compass.test.ts
git commit -m "feat(core): turn the map to the way the guest faces"
```

---

### Task 6: Bundled street drawing (code)

**Files:**
- Modify: `src/lib/core/types.ts` (add `SHAPE_KINDS`, `ShapeKind`, `Surroundings`)
- Modify: `src/lib/server/schema.ts` (add `SurroundingsSchema`)
- Modify: `src/lib/server/catalog.ts` (add `surroundingsPath`, `loadSurroundings`)
- Create: `src/routes/v/[id]/surroundings.json/+server.ts`
- Create: `tools/pipeline/lib/surroundings.ts`
- Modify: `tools/pipeline/cli.ts` (add the `surroundings` command)
- Modify: `package.json` (add `venue:surroundings` script)
- Test: `tests/surroundings.test.ts`, `tests/venues.test.ts`, `tests/build.test.ts`

**Interfaces:**
- Consumes: `georef`, `latLngToPlan`, `planToLatLng`, `Georef` (Task 1); `Venue`, `Box`, `I18n`, `Point`.
- Produces:
  - `SHAPE_KINDS = ['park', 'water', 'building', 'road', 'path'] as const`, `ShapeKind`, `Surroundings = { credit: string; bounds: Box; shapes: { kind: ShapeKind; d: string; w?: number }[]; labels: { x: number; y: number; text: I18n; size: number }[] }` in `types.ts`. `d` is an SVG path in plan pixels made of `M x yLx y…Z` with integers. `w` is the stroke width in plan pixels for roads and paths.
  - `SurroundingsSchema` in `schema.ts`.
  - `surroundingsPath(id, root?)`, `loadSurroundings(id, root?): Surroundings | null` in `catalog.ts`.
  - `GET /v/<venue-id>/surroundings.json`, prerendered for every venue that has the file.
  - `tools/pipeline/lib/surroundings.ts`: `CREDIT`, `ROAD_M`, `OsmElement`, `extentBox(v, meters): Box`, `latLngBox(g, box): { s; w; n; e }`, `overpassQuery(bb): string`, `kindOf(tags): ShapeKind | null`, `simplify(pts, tol): Point[]`, `stitch(parts): Geom[]`, `osmToSurroundings(els, g, bounds, mPerPx): Surroundings`.
  - CLI: `bun run venue:surroundings <venue-id> [--meters 400]`.

- [ ] **Step 1: Add the types**

In `src/lib/core/types.ts`, after the `VenueGeo` line add:

```ts
export const SHAPE_KINDS = ['park', 'water', 'building', 'road', 'path'] as const;
export type ShapeKind = (typeof SHAPE_KINDS)[number];
export type Surroundings = {
  credit: string;
  bounds: Box;
  shapes: { kind: ShapeKind; d: string; w?: number }[];
  labels: { x: number; y: number; text: I18n; size: number }[];
};
```

(`Box` and `I18n` are already declared above it in the same file.)

- [ ] **Step 2: Write the failing pipeline tests**

Create `tests/surroundings.test.ts`:

```ts
import { test, expect } from 'bun:test';
import { georef } from '../src/lib/core/geo';
import { SurroundingsSchema } from '../src/lib/server/schema';
import {
  kindOf,
  osmToSurroundings,
  overpassQuery,
  simplify,
  stitch,
  type OsmElement,
} from '../tools/pipeline/lib/surroundings';
import type { Box, Point } from '../src/lib/core/types';
import { fakeLatLng, fakePins, M } from './helpers/fake-geo';

const g = georef(fakePins());
const at = (x: number, y: number) => {
  const ll = fakeLatLng(x, y);
  return { lat: ll.lat, lon: ll.lng };
};
const bounds: Box = [-3000, -3000, 6000, 5000];

test('kindOf maps OSM tags to drawing kinds', () => {
  expect(kindOf({ natural: 'water' })).toBe('water');
  expect(kindOf({ leisure: 'park' })).toBe('park');
  expect(kindOf({ building: 'yes' })).toBe('building');
  expect(kindOf({ highway: 'primary' })).toBe('road');
  expect(kindOf({ highway: 'footway' })).toBe('path');
  expect(kindOf({ highway: 'motorway_link' })).toBeNull();
  expect(kindOf({ amenity: 'cafe' })).toBeNull();
});

test('simplify drops points on a straight line and keeps corners', () => {
  const line: Point[] = [
    [0, 0],
    [10, 0.2],
    [20, 0],
    [20, 20],
  ];
  expect(simplify(line, 1)).toEqual([
    [0, 0],
    [20, 0],
    [20, 20],
  ]);
});

test('stitch joins member ways that share ends', () => {
  const a = [at(0, 0), at(100, 0), at(100, 100)];
  const b = [at(0, 0), at(0, 100), at(100, 100)];
  const rings = stitch([a, b]);
  expect(rings.length).toBe(1);
  expect(rings[0][0]).toEqual(rings[0][rings[0].length - 1]);
});

test('osmToSurroundings projects, orders, sizes and labels', () => {
  const els: OsmElement[] = [
    {
      type: 'way',
      tags: { highway: 'primary', name: 'Ratchadaphisek', 'name:th': 'ถนนรัชดาภิเษก', 'name:en': 'Ratchadaphisek Road' },
      geometry: [at(-500, 0), at(-500, 1000)],
    },
    {
      type: 'way',
      tags: { highway: 'primary', name: 'Ratchadaphisek', 'name:th': 'ถนนรัชดาภิเษก', 'name:en': 'Ratchadaphisek Road' },
      geometry: [at(-500, 1000), at(-500, 3000)],
    },
    { type: 'way', tags: { building: 'yes' }, geometry: [at(9000, 9000), at(9100, 9000), at(9100, 9100), at(9000, 9000)] },
    {
      type: 'relation',
      tags: { natural: 'water', name: 'Lake', 'name:en': 'Benjakitti Lake' },
      members: [
        { role: 'outer', geometry: [at(0, 1600), at(800, 1600), at(800, 2200)] },
        { role: 'outer', geometry: [at(0, 1600), at(0, 2200), at(800, 2200)] },
      ],
    },
  ];
  const s = osmToSurroundings(els, g, bounds, M);
  expect(s.credit).toBe('© OpenStreetMap contributors');
  expect(s.shapes.map((x) => x.kind)).toEqual(['water', 'road', 'road']);
  expect(s.shapes[1].w).toBe(Math.round(18 / M));
  expect(s.shapes[0].d.endsWith('Z')).toBe(true);
  expect(s.shapes[0].d.match(/M/g)?.length).toBe(1);
  expect(s.labels.map((l) => l.text.en).sort()).toEqual(['Benjakitti Lake', 'Ratchadaphisek Road']);
  expect(SurroundingsSchema.safeParse(s).success).toBe(true);
});

test('overpassQuery asks for the bounding box with geometry', () => {
  const q = overpassQuery({ s: 13.7, w: 100.5, n: 13.8, e: 100.6 });
  expect(q).toContain('(13.700000,100.500000,13.800000,100.600000)');
  expect(q.endsWith('out geom;')).toBe(true);
});
```

- [ ] **Step 3: Run them to see them fail**

Run: `bun test tests/surroundings.test.ts`
Expected: FAIL, module `../tools/pipeline/lib/surroundings` not found.

- [ ] **Step 4: Add `SurroundingsSchema`**

In `src/lib/server/schema.ts`, change the import line to:

```ts
import { GROUP_ORDER, ICON_NAMES, SHAPE_KINDS } from '../core/types';
import type { Venue, EventFile, BoothsFile, Surroundings } from '../core/types';
```

and add before `export const formatIssues`:

```ts
export const SurroundingsSchema: z.ZodType<Surroundings, unknown> = z.object({
  credit: z.string().min(1),
  bounds: box,
  shapes: z.array(
    z.object({
      kind: z.enum(SHAPE_KINDS),
      d: z.string().regex(/^(M-?\d+ -?\d+(L-?\d+ -?\d+)*Z?)+$/),
      w: num.positive().optional(),
    }),
  ),
  labels: z.array(z.object({ x: num, y: num, text: i18n, size: num.positive() })),
});
```

- [ ] **Step 5: Implement `tools/pipeline/lib/surroundings.ts`**

```ts
import { latLngToPlan, planToLatLng, type Georef } from '../../../src/lib/core/geo';
import type { Box, I18n, Point, ShapeKind, Surroundings, Venue } from '../../../src/lib/core/types';

export type Geom = { lat: number; lon: number }[];
export type OsmElement = {
  type: string;
  tags?: Record<string, string>;
  geometry?: Geom;
  members?: { role: string; geometry?: Geom }[];
};

export const CREDIT = '© OpenStreetMap contributors';
export const ROAD_M: Record<string, number> = {
  trunk: 18,
  primary: 18,
  secondary: 12,
  tertiary: 9,
  residential: 6,
  unclassified: 6,
  service: 4,
  pedestrian: 4,
  footway: 3,
  path: 3,
};
const LABEL_ROAD_M = 9;
const ORDER: ShapeKind[] = ['park', 'water', 'building', 'path', 'road'];

export function extentBox(v: Venue, meters: number): Box {
  const e = meters / v.metersPerPx;
  return [v.view.x - e, v.view.y - e, v.view.x + v.view.w + e, v.view.y + v.view.h + e];
}

export function latLngBox(g: Georef, [x0, y0, x1, y1]: Box) {
  const c = (
    [
      [x0, y0],
      [x1, y0],
      [x0, y1],
      [x1, y1],
    ] as Point[]
  ).map((p) => planToLatLng(g, p));
  return {
    s: Math.min(...c.map((p) => p.lat)),
    n: Math.max(...c.map((p) => p.lat)),
    w: Math.min(...c.map((p) => p.lng)),
    e: Math.max(...c.map((p) => p.lng)),
  };
}

export function overpassQuery(b: { s: number; w: number; n: number; e: number }): string {
  const bb = `(${[b.s, b.w, b.n, b.e].map((v) => v.toFixed(6)).join(',')})`;
  const hw = Object.keys(ROAD_M).join('|');
  return `[out:json][timeout:60];(way["highway"~"^(${hw})$"]${bb};way["building"]${bb};way["natural"="water"]${bb};relation["natural"="water"]${bb};way["leisure"="park"]${bb};relation["leisure"="park"]${bb};);out geom;`;
}

export function kindOf(tags: Record<string, string> = {}): ShapeKind | null {
  if (tags.natural === 'water') return 'water';
  if (tags.leisure === 'park') return 'park';
  if (tags.building) return 'building';
  const m = tags.highway ? ROAD_M[tags.highway] : undefined;
  if (m === undefined) return null;
  return m >= 6 ? 'road' : 'path';
}

export function simplify(pts: Point[], tol: number): Point[] {
  if (pts.length < 3) return pts;
  const a = pts[0],
    b = pts[pts.length - 1],
    len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  let worst = 0,
    at = 0;
  for (let k = 1; k < pts.length - 1; k++) {
    const p = pts[k];
    const d = len
      ? Math.abs((b[0] - a[0]) * (a[1] - p[1]) - (a[0] - p[0]) * (b[1] - a[1])) / len
      : Math.hypot(p[0] - a[0], p[1] - a[1]);
    if (d > worst) {
      worst = d;
      at = k;
    }
  }
  if (worst <= tol) return [a, b];
  return [...simplify(pts.slice(0, at + 1), tol).slice(0, -1), ...simplify(pts.slice(at), tol)];
}

const same = (p: { lat: number; lon: number }, q: { lat: number; lon: number }) => p.lat === q.lat && p.lon === q.lon;

export function stitch(parts: Geom[]): Geom[] {
  const left = parts.map((p) => [...p]);
  const out: Geom[] = [];
  while (left.length) {
    let cur = left.shift()!,
      grew = true;
    while (grew && !same(cur[0], cur[cur.length - 1])) {
      grew = false;
      for (let k = 0; k < left.length; k++) {
        const p = left[k],
          end = cur[cur.length - 1];
        if (same(end, p[0])) cur = [...cur, ...p.slice(1)];
        else if (same(end, p[p.length - 1])) cur = [...cur, ...p.slice(0, -1).reverse()];
        else continue;
        left.splice(k, 1);
        grew = true;
        break;
      }
    }
    out.push(cur);
  }
  return out;
}

const project = (g: Georef, geom: Geom, tol: number): Point[] =>
  simplify(
    geom.map((p) => latLngToPlan(g, { lat: p.lat, lng: p.lon })),
    tol,
  ).map(([x, y]): Point => [Math.round(x), Math.round(y)]);
const pathD = (pts: Point[], closed: boolean) => 'M' + pts.map((p) => p.join(' ')).join('L') + (closed ? 'Z' : '');
const hits = (pts: Point[], [x0, y0, x1, y1]: Box) =>
  Math.max(...pts.map((p) => p[0])) >= x0 &&
  Math.min(...pts.map((p) => p[0])) <= x1 &&
  Math.max(...pts.map((p) => p[1])) >= y0 &&
  Math.min(...pts.map((p) => p[1])) <= y1;
const nameOf = (t: Record<string, string>): I18n | null => {
  const th = t['name:th'] || t.name,
    en = t['name:en'] || t.name;
  return th && en ? { th, en } : null;
};
const avg = (r: Point[], k: 0 | 1) => r.reduce((s, p) => s + p[k], 0) / r.length;
const lengthOf = (r: Point[]) => r.slice(1).reduce((s, p, k) => s + Math.hypot(p[0] - r[k][0], p[1] - r[k][1]), 0);
function midpoint(r: Point[]): Point {
  const half = lengthOf(r) / 2;
  let run = 0;
  for (let k = 1; k < r.length; k++) {
    const seg = Math.hypot(r[k][0] - r[k - 1][0], r[k][1] - r[k - 1][1]);
    if (run + seg >= half) {
      const t = seg ? (half - run) / seg : 0;
      return [r[k - 1][0] + (r[k][0] - r[k - 1][0]) * t, r[k - 1][1] + (r[k][1] - r[k - 1][1]) * t];
    }
    run += seg;
  }
  return r[0];
}

export function osmToSurroundings(els: OsmElement[], g: Georef, bounds: Box, mPerPx: number): Surroundings {
  const tol = 1 / mPerPx;
  const shapes: Surroundings['shapes'] = [];
  const labels: Surroundings['labels'] = [];
  const roads = new Map<string, { at: Point; len: number; text: I18n }>();
  for (const el of els) {
    const tags = el.tags ?? {};
    const kind = kindOf(tags);
    if (!kind) continue;
    const line = kind === 'road' || kind === 'path';
    const geoms =
      el.type === 'relation'
        ? stitch((el.members ?? []).filter((m) => m.geometry && (m.role === 'outer' || m.role === 'inner')).map((m) => m.geometry!))
        : el.geometry
          ? [el.geometry]
          : [];
    const rings = geoms.map((gm) => project(g, gm, tol)).filter((r) => r.length >= 2 && hits(r, bounds));
    if (!rings.length) continue;
    const d = rings.map((r) => pathD(r, !line)).join('');
    shapes.push(line ? { kind, d, w: Math.round(ROAD_M[tags.highway] / mPerPx) } : { kind, d });
    const text = nameOf(tags);
    if (!text || kind === 'building' || kind === 'path') continue;
    if (!line)
      labels.push({ x: Math.round(avg(rings[0], 0)), y: Math.round(avg(rings[0], 1)), text, size: Math.round(7 / mPerPx) });
    else if (ROAD_M[tags.highway] >= LABEL_ROAD_M) {
      const len = lengthOf(rings[0]),
        prev = roads.get(text.en);
      if (!prev || len > prev.len) roads.set(text.en, { at: midpoint(rings[0]), len, text });
    }
  }
  for (const { at, text } of roads.values())
    labels.push({ x: Math.round(at[0]), y: Math.round(at[1]), text, size: Math.round(6 / mPerPx) });
  shapes.sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind));
  return { credit: CREDIT, bounds: bounds.map(Math.round) as Box, shapes, labels };
}
```

- [ ] **Step 6: Run the pipeline tests to see them pass**

Run: `bun test tests/surroundings.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 7: Load the drawing in the catalog**

In `src/lib/server/catalog.ts`, change the schema import to:

```ts
import { BoothsFileSchema, EventSchema, SurroundingsSchema, VenueSchema, formatIssues } from './schema';
```

change the types import to:

```ts
import type { EventBundle, EventSummary, Surroundings, Venue } from '../core/types';
```

and add after `loadVenue`:

```ts
export const surroundingsPath = (id: string, root = cwd()) => join(root, 'venues', id, 'surroundings.json');

export function loadSurroundings(id: string, root = cwd()): Surroundings | null {
  const path = surroundingsPath(id, root);
  return existsSync(path) ? parseFile(SurroundingsSchema, path, root) : null;
}
```

- [ ] **Step 8: Serve it as a prerendered file**

Create `src/routes/v/[id]/surroundings.json/+server.ts`:

```ts
import { error, json } from '@sveltejs/kit';
import { existsSync } from 'node:fs';
import { listVenueIds, loadSurroundings, surroundingsPath } from '$lib/server/catalog';
import type { EntryGenerator, RequestHandler } from './$types';

export const prerender = true;

export const entries: EntryGenerator = () =>
  listVenueIds()
    .filter((id) => existsSync(surroundingsPath(id)))
    .map((id) => ({ id }));

export const GET: RequestHandler = ({ params }) => {
  const s = listVenueIds().includes(params.id) ? loadSurroundings(params.id) : null;
  if (!s) error(404, 'No street drawing for this venue');
  return json(s);
};
```

- [ ] **Step 9: Add the CLI command and script**

In `tools/pipeline/cli.ts`, add to the imports:

```ts
import { statSync } from 'node:fs';
import { join } from 'node:path';
import { georef } from '../../src/lib/core/geo';
import { extentBox, latLngBox, osmToSurroundings, overpassQuery } from './lib/surroundings';
```

add before `const commands`:

```ts
export async function surroundings(id: string) {
  const venue = loadVenue(id);
  if (!venue.geo) fail([`venues/${id}/venue.json has no map pins. Add "geo" first (see CLAUDE.md, Street map)`]);
  const g = georef(venue.geo!.pins);
  const bounds = extentBox(venue, Number(flag('meters') ?? 400));
  const res = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    headers: { 'user-agent': 'booth-finder venue pipeline' },
    body: new URLSearchParams({ data: overpassQuery(latLngBox(g, bounds)) }),
  });
  if (!res.ok) fail([`OpenStreetMap (Overpass) answered ${res.status}. Wait a minute and run the command again`]);
  const out = osmToSurroundings((await res.json()).elements, g, bounds, venue.metersPerPx);
  const path = join('venues', id, 'surroundings.json');
  writeFileSync(path, stringifyJson(out));
  console.log(`${out.shapes.length} shapes and ${out.labels.length} labels, ${Math.round(statSync(path).size / 1024)} KB, written to ${path}`);
}
```

and add `surroundings,` to the `commands` object. `loadVenue` is already imported at the top of the file; `flag`, `fail`, `writeFileSync` and `stringifyJson` already exist in it.

In `package.json` `scripts`, after `"event:categorise"` add:

```json
    "venue:surroundings": "bun tools/pipeline/cli.ts surroundings"
```

(add a comma after the `event:categorise` line).

- [ ] **Step 10: Add the venue and build checks**

In `tests/venues.test.ts`, add imports:

```ts
import { existsSync, statSync } from 'node:fs';
import { loadSurroundings, surroundingsPath } from '../src/lib/server/catalog';
```

and inside the venue `describe`, add:

```ts
    test.skipIf(!existsSync(surroundingsPath(id)))('street drawing covers the plan and stays small', () => {
      const s = loadSurroundings(id)!;
      const [x0, y0, x1, y1] = s.bounds,
        v = venue.view;
      expect(x0 <= v.x && y0 <= v.y && x1 >= v.x + v.w && y1 >= v.y + v.h).toBe(true);
      expect(s.shapes.length).toBeGreaterThan(0);
      expect(statSync(surroundingsPath(id)).size).toBeLessThanOrEqual(150_000);
    });
```

In `tests/build.test.ts`, add:

```ts
import { listVenueIds, surroundingsPath } from '../src/lib/server/catalog';

test.skipIf(!built)('each venue street drawing is published', () => {
  for (const id of listVenueIds().filter((v) => existsSync(surroundingsPath(v))))
    expect(existsSync(`_site/v/${id}/surroundings.json`)).toBe(true);
});
```

- [ ] **Step 11: Run checks and the suite**

Run: `bun run lint && bun run check && bun run build && bun run test`
Expected: all pass; the new venue and build tests skip because no venue has a drawing yet.

- [ ] **Step 12: Commit**

```bash
git add src/lib/core/types.ts src/lib/server/schema.ts src/lib/server/catalog.ts 'src/routes/v' tools/pipeline/lib/surroundings.ts tools/pipeline/cli.ts package.json tests/surroundings.test.ts tests/venues.test.ts tests/build.test.ts
git commit -m "feat(pipeline): draw the streets around a venue from OpenStreetMap"
```

---

### Task 7: Street drawings for the QSNCC venues

**Needs:** network access to overpass-api.de. Depends on Task 3.

**Files:**
- Create: `venues/qsncc-lg-5-8/surroundings.json`
- Create: `venues/qsncc-lg-5-7/surroundings.json`

- [ ] **Step 1: Generate both drawings**

Run: `bun run venue:surroundings qsncc-lg-5-8 && bun run venue:surroundings qsncc-lg-5-7`
Expected: two lines like `N shapes and M labels, K KB, written to venues/<id>/surroundings.json`.

- [ ] **Step 2: Check them**

Run: `bun test tests/venues.test.ts`
Expected: PASS, including "street drawing covers the plan and stays small". If a file is over 150 KB, run the command again with `--meters 300`.

- [ ] **Step 3: Check the build publishes them**

Run: `bun run build && bun test tests/build.test.ts`
Expected: PASS, including "each venue street drawing is published".

- [ ] **Step 4: Commit**

```bash
git add venues/qsncc-lg-5-8/surroundings.json venues/qsncc-lg-5-7/surroundings.json
git commit -m "feat(venue): add the street drawing around QSNCC"
```

---

### Task 8: Viewport bounds, view hook and framing a box

**Files:**
- Modify: `src/lib/core/panzoom.ts` (add `unionRect`, `boxAround`)
- Modify: `src/lib/map/viewport.ts` (full replacement below)
- Test: `tests/panzoom.test.ts`

**Interfaces:**
- Consumes: `Rect`, `Box`, `Point` from `types.ts`.
- Produces:
  - `unionRect(a: Rect, b: Rect | null): Rect`, `boxAround(ps: Point[]): Box` in `panzoom.ts`.
  - `createViewport(svg, venue, onTap, hooks?: ViewportHooks)` where `ViewportHooks = { onView?: (vb: VB, pxPerUnit: number) => void; onPan?: () => void }`.
  - `Viewport` gains `setBounds(r: Rect | null): void` (the area the guest may pan over, unioned with `venue.view`) and `frameBox(box: Box, pad: number): void` (animated, waits one frame like `frame`).

- [ ] **Step 1: Write the failing tests**

Append to `tests/panzoom.test.ts` (and add `unionRect, boxAround` to its import from `../src/lib/core/panzoom`):

```ts
test('unionRect grows to cover both rectangles', () => {
  expect(unionRect(view, null)).toEqual(view);
  expect(unionRect(view, { x: -500, y: 300, w: 100, h: 100 })).toEqual({ x: -500, y: 240, w: 2910, h: 1420 });
});

test('boxAround spans every point', () => {
  expect(
    boxAround([
      [5, 9],
      [-2, 4],
      [7, -1],
    ]),
  ).toEqual([-2, -1, 7, 9]);
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `bun test tests/panzoom.test.ts`
Expected: FAIL, `unionRect` is not exported.

- [ ] **Step 3: Implement the helpers**

In `src/lib/core/panzoom.ts`, change the import to:

```ts
import type { Box, Dest, Point, Rect, RouteOk } from './types';
```

and add at the end:

```ts
export function unionRect(a: Rect, b: Rect | null): Rect {
  if (!b) return a;
  const x = Math.min(a.x, b.x),
    y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
}

export const boxAround = (ps: Point[]): Box => [
  Math.min(...ps.map((p) => p[0])),
  Math.min(...ps.map((p) => p[1])),
  Math.max(...ps.map((p) => p[0])),
  Math.max(...ps.map((p) => p[1])),
];
```

- [ ] **Step 4: Run them to see them pass**

Run: `bun test tests/panzoom.test.ts`
Expected: PASS.

- [ ] **Step 5: Replace `src/lib/map/viewport.ts`**

```ts
import {
  boxFor,
  clampVB,
  ease,
  frameTarget,
  lerpVB,
  unionRect,
  zoomAt,
  LABEL_MIN_PX_PER_UNIT,
  type VB,
} from '../core/panzoom';
import type { Box, Dest, Rect, RouteOk, Venue } from '../core/types';

export type Viewport = {
  fitAll(animated?: boolean): void;
  zoomCenter(k: number): void;
  frame(dest: Dest | null, route: RouteOk | null): void;
  frameBox(box: Box, pad: number): void;
  setBounds(r: Rect | null): void;
  destroy(): void;
};

export type ViewportHooks = { onView?: (vb: VB, pxPerUnit: number) => void; onPan?: () => void };

export function createViewport(
  svg: SVGSVGElement,
  venue: Venue,
  onTap: (target: Element | null) => void,
  hooks: ViewportHooks = {},
): Viewport {
  const view = venue.view;
  let bounds: Rect = view;
  let vb: VB = { ...view },
    anim = 0;
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const aspect = () => {
    const r = svg.getBoundingClientRect();
    return r.width && r.height ? r.height / r.width : view.h / view.w;
  };
  const apply = () => {
    svg.setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.w} ${vb.h}`);
    const ppu = svg.getBoundingClientRect().width / vb.w;
    svg.classList.toggle('labels-off', ppu < LABEL_MIN_PX_PER_UNIT);
    hooks.onView?.(vb, ppu);
  };
  const set = (next: VB) => {
    vb = clampVB(next, bounds, aspect());
    apply();
  };
  const toSvg = (cx: number, cy: number) => {
    const p = svg.createSVGPoint();
    p.x = cx;
    p.y = cy;
    return p.matrixTransform(svg.getScreenCTM()!.inverse());
  };
  const animateTo = (target: VB) => {
    cancelAnimationFrame(anim);
    const from = { ...vb },
      t0 = performance.now(),
      dur = reduceMotion ? 0 : 450;
    const step = (now: number) => {
      const k = dur ? Math.min(1, (now - t0) / dur) : 1;
      vb = lerpVB(from, target, ease(k));
      if (k < 1) {
        apply();
        anim = requestAnimationFrame(step);
      } else set(vb);
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
    if (pointers.size === 1)
      down = {
        x: e.clientX,
        y: e.clientY,
        target: e.target as Element,
        moved: false,
        start: toSvg(e.clientX, e.clientY),
      };
    else if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
      if (down) down.moved = true;
      hooks.onPan?.();
    }
  };
  const onMove = (e: PointerEvent) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2 && pinch) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y),
        mx = (a.x + b.x) / 2,
        my = (a.y + b.y) / 2;
      const p0 = toSvg(pinch.mx, pinch.my);
      zoomAtClient(mx, my, pinch.d / d);
      const p1 = toSvg(mx, my);
      set({ ...vb, x: vb.x + p0.x - p1.x, y: vb.y + p0.y - p1.y });
      pinch = { d, mx, my };
    } else if (pointers.size === 1 && down) {
      if (!down.moved && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) {
        down.moved = true;
        svg.classList.add('dragging');
        hooks.onPan?.();
      }
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
  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    zoomAtClient(e.clientX, e.clientY, Math.exp(e.deltaY * 0.0016));
  };

  svg.addEventListener('pointerdown', onDown);
  svg.addEventListener('pointermove', onMove);
  svg.addEventListener('pointerup', onEnd);
  svg.addEventListener('pointercancel', onEnd);
  svg.addEventListener('wheel', onWheel, { passive: false });
  const ro = new ResizeObserver(() => {
    const cx = vb.x + vb.w / 2,
      cy = vb.y + vb.h / 2,
      h = vb.w * aspect();
    set({ x: cx - vb.w / 2, y: cy - h / 2, w: vb.w, h });
  });
  ro.observe(svg);

  return {
    fitAll(animated = false) {
      const b = overview();
      if (animated) animateTo(b);
      else set(b);
    },
    zoomCenter(k) {
      const r = svg.getBoundingClientRect();
      zoomAtClient(r.left + r.width / 2, r.top + r.height / 2, k);
    },
    frame(dest, route) {
      const t = frameTarget(dest, route);
      if (t) requestAnimationFrame(() => animateTo(boxFor(...t.box, t.pad, aspect())));
    },
    frameBox(box, pad) {
      requestAnimationFrame(() => animateTo(boxFor(...box, pad, aspect())));
    },
    setBounds(r) {
      bounds = unionRect(view, r);
      set(vb);
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

What changed against the current file: `bounds` replaces `view` in `set`; `apply` calls `hooks.onView`; drag start and pinch start call `hooks.onPan`; the drag threshold check now runs only until the first move; new `frameBox` and `setBounds`.

- [ ] **Step 6: Run the checks, unit tests and e2e for the map**

Run: `bun run check && bun run test && bunx playwright test tests/e2e/finder.e2e.ts`
Expected: all pass; pan, zoom, tap and framing behave as before.

- [ ] **Step 7: Commit**

```bash
git add src/lib/core/panzoom.ts src/lib/map/viewport.ts tests/panzoom.test.ts
git commit -m "feat(map): let the viewport report its view and pan beyond the plan"
```

---

### Task 9: Street and position layers, strings and styles

**Files:**
- Create: `src/lib/map/tiles.ts`, `src/lib/map/tileConfig.ts`, `src/lib/map/street.ts`
- Create: `src/lib/map/StreetLayer.svelte`, `src/lib/map/YouLayer.svelte`
- Modify: `src/lib/map/FloorMap.svelte` (full replacement)
- Modify: `src/lib/i18n/strings.ts`
- Modify: `src/lib/styles/app.css`
- Test: `tests/tiles.test.ts`

**Interfaces:**
- Consumes: `Georef`, `FIT_Z`, `TILE`, `apply`, `latLngOf`, `latLngToPlan` (Task 1); `VB` (panzoom); `ViewportHooks`, `setBounds`, `frameBox` (Task 8); `Surroundings` (Task 6).
- Produces:
  - `tiles.ts`: `MIN_TILE_Z = 13`, `MAX_TILE_Z = 19`, `MAX_TILES = 48`, `tileZoom(g, pxPerUnit): number`, `visibleTiles(vb, g, z, max?): { origin: Point; tiles: { x: number; y: number }[] }`, `tileMatrix(g, z, origin: Point): Affine`, `tileHref(tpl, z, x, y): string`.
  - `tileConfig.ts`: `TILE_URL: string`, `TILE_CREDIT: string`.
  - `street.ts`: `StreetView = { geo: Georef; surroundings: Surroundings | null; tileUrl: string; credit: string }`, `YouMark = { p: Point; accPx: number; leg: Point | null }`, `Turn = { deg: number; cx: number; cy: number }`, `CompassView = { on: boolean; northDeg: number; toggle: () => void }`.
  - `FloorMap` props gain `street?: StreetView | null`, `you?: YouMark | null`, `turn?: Turn | null`, `compass?: CompassView | null`, `onUserPan?: () => void`; exports gain `setBounds(r: Rect | null)` and `frameBox(b: Box, pad: number)`.
  - Strings (both languages): `useLocation`, `useLocationHint`, `locating`, `stopLocating`, `locOff`, `locUnavailable`, `locWeak`, `locFar(km)`, `walkTo(n)`, `thenInside(m)`, `imInside`, `arrived(n)`, `whichHall`, `hallHint`, `gpsGuess`, `pickFromList`, `turnWithMe`, `stopTurning`, `compassOff`, `offlineMap`, `you`.

- [ ] **Step 1: Write the failing tile tests**

Create `tests/tiles.test.ts`:

```ts
import { test, expect } from 'bun:test';
import { apply, georef, latLngOf, latLngToPlan, TILE } from '../src/lib/core/geo';
import { tileHref, tileMatrix, tileZoom, visibleTiles, MAX_TILES } from '../src/lib/map/tiles';
import { fakePins } from './helpers/fake-geo';

const g = georef(fakePins());
const view = { x: 180, y: 240, w: 2230, h: 1420 };

test('tileZoom matches tile pixels to screen pixels and stays in range', () => {
  expect(tileZoom(g, 0.175)).toBe(18);
  expect(tileZoom(g, 5)).toBe(19);
  expect(tileZoom(g, 0.0001)).toBe(13);
});

test('visibleTiles covers the view with a bounded number of tiles', () => {
  const { origin, tiles } = visibleTiles(view, g, 17);
  expect(tiles.length).toBeGreaterThan(0);
  expect(tiles.length).toBeLessThanOrEqual(MAX_TILES);
  expect(Math.min(...tiles.map((t) => t.x))).toBe(origin[0]);
  expect(Math.min(...tiles.map((t) => t.y))).toBe(origin[1]);
});

test('visibleTiles returns nothing rather than too many tiles', () => {
  expect(visibleTiles(view, g, 19, 4).tiles).toEqual([]);
});

test('tileMatrix puts each tile corner where the map says it is', () => {
  const z = 17;
  const { origin, tiles } = visibleTiles(view, g, z);
  const m = tileMatrix(g, z, origin);
  for (const t of tiles.slice(0, 3)) {
    const want = latLngToPlan(g, latLngOf([t.x * TILE, t.y * TILE], z));
    const got = apply(m, [(t.x - origin[0]) * TILE, (t.y - origin[1]) * TILE]);
    expect(got[0]).toBeCloseTo(want[0], 2);
    expect(got[1]).toBeCloseTo(want[1], 2);
  }
});

test('tileHref fills the template', () => {
  expect(tileHref('https://t.example/{z}/{x}/{y}.png?k=1', 17, 3, 4)).toBe('https://t.example/17/3/4.png?k=1');
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `bun test tests/tiles.test.ts`
Expected: FAIL, module `../src/lib/map/tiles` not found.

- [ ] **Step 3: Implement `src/lib/map/tiles.ts`**

```ts
import { apply, FIT_Z, TILE, type Affine, type Georef } from '../core/geo';
import type { VB } from '../core/panzoom';
import type { Point } from '../core/types';

export const MIN_TILE_Z = 13;
export const MAX_TILE_Z = 19;
export const MAX_TILES = 48;

export const tileZoom = (g: Georef, pxPerUnit: number) =>
  Math.max(MIN_TILE_Z, Math.min(MAX_TILE_Z, Math.round(FIT_Z + Math.log2(pxPerUnit / g.scale))));

export function visibleTiles(vb: VB, g: Georef, z: number, max = MAX_TILES) {
  const k = 2 ** (FIT_Z - z) * TILE;
  const c = (
    [
      [vb.x, vb.y],
      [vb.x + vb.w, vb.y],
      [vb.x, vb.y + vb.h],
      [vb.x + vb.w, vb.y + vb.h],
    ] as Point[]
  ).map((p) => apply(g.toWorld, p).map((v) => v / k));
  const x0 = Math.floor(Math.min(...c.map((p) => p[0]))),
    x1 = Math.floor(Math.max(...c.map((p) => p[0]))),
    y0 = Math.floor(Math.min(...c.map((p) => p[1]))),
    y1 = Math.floor(Math.max(...c.map((p) => p[1])));
  const origin: Point = [x0, y0];
  if ((x1 - x0 + 1) * (y1 - y0 + 1) > max) return { origin, tiles: [] };
  const tiles: { x: number; y: number }[] = [];
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) tiles.push({ x, y });
  return { origin, tiles };
}

export function tileMatrix(g: Georef, z: number, [x0, y0]: Point): Affine {
  const k = 2 ** (FIT_Z - z),
    ox = x0 * TILE * k,
    oy = y0 * TILE * k;
  const [a, b, c, d, e, f] = g.toPlan;
  return [a * k, b * k, c * k, d * k, a * ox + c * oy + e, b * ox + d * oy + f];
}

export const tileHref = (tpl: string, z: number, x: number, y: number) =>
  tpl.replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y));
```

`tileMatrix` folds the tile origin into the matrix, so the numbers the browser sees stay near plan size. Browsers draw SVG transforms in single precision, and raw Web Mercator pixels at zoom 20 would be off by metres.

- [ ] **Step 4: Run them to see them pass**

Run: `bun test tests/tiles.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Add config and shared types**

Create `src/lib/map/tileConfig.ts`:

```ts
export const TILE_URL: string = import.meta.env.VITE_TILE_URL ?? '';
export const TILE_CREDIT: string = import.meta.env.VITE_TILE_CREDIT ?? '';
```

Create `src/lib/map/street.ts`:

```ts
import type { Georef } from '$lib/core/geo';
import type { Point, Surroundings } from '$lib/core/types';

export type StreetView = { geo: Georef; surroundings: Surroundings | null; tileUrl: string; credit: string };
export type YouMark = { p: Point; accPx: number; leg: Point | null };
export type Turn = { deg: number; cx: number; cy: number };
export type CompassView = { on: boolean; northDeg: number; toggle: () => void };
```

- [ ] **Step 6: Add the strings**

In `src/lib/i18n/strings.ts`, add to the `Strings` type after `floorPlan: string;`:

```ts
  useLocation: string;
  useLocationHint: string;
  locating: string;
  stopLocating: string;
  locOff: string;
  locUnavailable: string;
  locWeak: string;
  locFar: (km: number) => string;
  walkTo: (n: string) => string;
  thenInside: (m: number) => string;
  imInside: string;
  arrived: (n: string) => string;
  whichHall: string;
  hallHint: string;
  gpsGuess: string;
  pickFromList: string;
  turnWithMe: string;
  stopTurning: string;
  compassOff: string;
  offlineMap: string;
  you: string;
```

In `STRINGS.th`, after `floorPlan: 'ผังงาน',` add:

```ts
    useLocation: 'ใช้ตำแหน่งของฉัน',
    useLocationHint: 'เลือกทางเข้าที่ดีที่สุดให้ ตำแหน่งของคุณอยู่ในเครื่องนี้เท่านั้น',
    locating: 'กำลังหาตำแหน่งของคุณ…',
    stopLocating: 'หยุดใช้ตำแหน่ง',
    locOff: 'เว็บนี้ปิดการใช้ตำแหน่งอยู่ เลือกจุดที่คุณอยู่จากรายการด้านล่าง หรือเปิดสิทธิ์ตำแหน่งในการตั้งค่าเบราว์เซอร์',
    locUnavailable: 'หาตำแหน่งของคุณไม่ได้ เลือกจุดที่คุณอยู่จากรายการด้านล่าง',
    locWeak: 'สัญญาณ GPS ตรงนี้อ่อน ลองออกไปที่โล่ง หรือเลือกจุดที่คุณอยู่จากรายการด้านล่าง',
    locFar: (km) => `คุณอยู่ห่างจากงานประมาณ ${km} กม. ใช้แอปแผนที่ที่ใช้ประจำเพื่อเดินทางมาก่อน`,
    walkTo: (n) => `เดินไปที่${n}`,
    thenInside: (m) => `จากนั้นเดินต่อด้านในอีก ${m} ม.`,
    imInside: 'ฉันเข้ามาด้านในแล้ว',
    arrived: (n) => `คุณถึง${n}แล้ว เปลี่ยนเป็นผังในงานให้แล้ว`,
    whichHall: 'คุณอยู่ฮอลล์ไหน',
    hallHint: 'ดูป้ายชื่อฮอลล์ใกล้ตัว ในอาคาร GPS อาจคลาดไปทั้งฮอลล์',
    gpsGuess: 'GPS คาดว่าอยู่ที่นี่',
    pickFromList: 'ไม่แน่ใจ เลือกจากรายการ',
    turnWithMe: 'หมุนแผนที่ตามทิศที่ฉันหัน',
    stopTurning: 'หยุดหมุนแผนที่',
    compassOff: 'ใช้เข็มทิศในเครื่องนี้ไม่ได้ แผนที่จะแสดงตามผังเดิม',
    offlineMap: 'แผนที่ออฟไลน์',
    you: 'ตำแหน่งของคุณ',
```

In `STRINGS.en`, after `floorPlan: 'Floor plan',` add:

```ts
    useLocation: 'Use my location',
    useLocationHint: 'Picks the best entrance for you. Your location stays on your phone.',
    locating: 'Finding you…',
    stopLocating: 'Stop using my location',
    locOff: 'Location is off for this site. Pick where you are below, or allow location in your browser settings.',
    locUnavailable: "We couldn't find your location. Pick where you are below.",
    locWeak: 'GPS is weak here. Move into the open, or pick where you are below.',
    locFar: (km) => `You're about ${km} km away. Use your usual map app to get here first.`,
    walkTo: (n) => `Walk to ${n}`,
    thenInside: (m) => `Then ${m} m inside`,
    imInside: "I'm inside now",
    arrived: (n) => `You're at ${n}. Switched to the hall plan.`,
    whichHall: 'Which hall are you in?',
    hallHint: 'Look for the hall sign near you. Indoors, GPS can be a whole hall out.',
    gpsGuess: 'GPS guess',
    pickFromList: 'Not sure? Pick from the list',
    turnWithMe: 'Turn the map as I turn',
    stopTurning: 'Stop turning the map',
    compassOff: "The compass isn't available on this phone. The map stays as printed.",
    offlineMap: 'Offline map',
    you: 'You are here',
```

Also extend the exclamation check in `tests/strings.test.ts` so the new functions are covered; replace `.map((s) => s.noRes('x') + s.ended('x'))` with:

```ts
      .map((s) => s.noRes('x') + s.ended('x') + s.locFar(1.2) + s.walkTo('x') + s.thenInside(9) + s.arrived('x'))
```

- [ ] **Step 7: Run the string tests**

Run: `bun test tests/strings.test.ts`
Expected: PASS.

- [ ] **Step 8: Create `src/lib/map/StreetLayer.svelte`**

```svelte
<script lang="ts">
  import type { Georef } from '$lib/core/geo';
  import type { VB } from '$lib/core/panzoom';
  import type { Surroundings } from '$lib/core/types';
  import { nameIn } from '$lib/i18n/strings';
  import { lang } from '$lib/i18n/lang.svelte';
  import { tileHref, tileMatrix, tileZoom, visibleTiles } from './tiles';

  let {
    geo,
    surroundings,
    tileUrl,
    vb,
    pxPerUnit,
    onTiles,
  }: {
    geo: Georef;
    surroundings: Surroundings | null;
    tileUrl: string;
    vb: VB;
    pxPerUnit: number;
    onTiles: (ok: boolean) => void;
  } = $props();

  let failed = $state(false);
  const z = $derived(tileZoom(geo, pxPerUnit));
  const vis = $derived(tileUrl && !failed ? visibleTiles(vb, geo, z) : null);
  const matrix = $derived(vis ? tileMatrix(geo, z, vis.origin).map((v) => +v.toFixed(6)).join(' ') : '');
  const nameOf = $derived(nameIn(lang.current));
  $effect(() => onTiles(!!tileUrl && !failed));
</script>

<g id="layer-street" aria-hidden="true">
  {#if surroundings}
    {@const [x0, y0, x1, y1] = surroundings.bounds}
    <rect x={x0} y={y0} width={x1 - x0} height={y1 - y0} class="s-ground" />
    {#each surroundings.shapes as sh, i (i)}
      {#if sh.kind === 'road' || sh.kind === 'path'}
        <path d={sh.d} class="s-{sh.kind}" stroke-width={sh.w} />
      {:else}
        <path d={sh.d} class="s-{sh.kind}" />
      {/if}
    {/each}
    {#if !vis?.tiles.length}
      <rect x={x0} y={y0} width={x1 - x0} height={y1 - y0} class="s-edge" />
    {/if}
  {/if}
  {#if vis?.tiles.length}
    <g transform="matrix({matrix})">
      {#each vis.tiles as t (`${z}/${t.x}/${t.y}`)}
        <image
          href={tileHref(tileUrl, z, t.x, t.y)}
          x={(t.x - vis.origin[0]) * 256}
          y={(t.y - vis.origin[1]) * 256}
          width="256.5"
          height="256.5"
          onerror={() => (failed = true)}
        />
      {/each}
    </g>
  {/if}
  {#if surroundings}
    {#each surroundings.labels as l, i (i)}
      <text x={l.x} y={l.y} class="s-label" font-size={l.size}>{nameOf(l.text)}</text>
    {/each}
  {/if}
</g>
```

- [ ] **Step 9: Create `src/lib/map/YouLayer.svelte`**

```svelte
<script lang="ts">
  import type { YouMark } from './street';
  let { you, unit, label }: { you: YouMark | null; unit: number; label: string } = $props();
</script>

<g id="layer-you">
  {#if you}
    {@const [x, y] = you.p}
    {#if you.leg}
      <path d="M{x} {y}L{you.leg[0]} {you.leg[1]}" class="you-leg" />
    {/if}
    <circle cx={x} cy={y} r={Math.max(you.accPx, 9 * unit)} class="you-acc" />
    <circle cx={x} cy={y} r={7 * unit} class="dot" role="img" aria-label={label} />
  {/if}
</g>
```

- [ ] **Step 10: Replace `src/lib/map/FloorMap.svelte`**

```svelte
<script lang="ts">
  import { onMount, type Snippet } from 'svelte';
  import type { Booth, Box, Dest, EventData, Landmark, Rect, RouteOk } from '$lib/core/types';
  import type { VB } from '$lib/core/panzoom';
  import { isAisleBooth } from '$lib/core/directions';
  import { STRINGS, nameIn } from '$lib/i18n/strings';
  import { lang } from '$lib/i18n/lang.svelte';
  import { createViewport, type Viewport } from './viewport';
  import type { CompassView, StreetView, Turn, YouMark } from './street';
  import StreetLayer from './StreetLayer.svelte';
  import BaseLayer from './BaseLayer.svelte';
  import BoothLayer from './BoothLayer.svelte';
  import ZoneLayer from './ZoneLayer.svelte';
  import MarkLayer from './MarkLayer.svelte';
  import RouteLayer from './RouteLayer.svelte';
  import PinLayer from './PinLayer.svelte';
  import YouLayer from './YouLayer.svelte';

  let {
    data,
    dest,
    route,
    onSelectBooth,
    onSelectPlace,
    onFit,
    street = null,
    you = null,
    turn = null,
    compass = null,
    onUserPan,
    children,
  }: {
    data: EventData;
    dest: Dest | null;
    route: RouteOk | null;
    onSelectBooth: (b: Booth) => void;
    onSelectPlace: (lm: Landmark) => void;
    onFit: () => void;
    street?: StreetView | null;
    you?: YouMark | null;
    turn?: Turn | null;
    compass?: CompassView | null;
    onUserPan?: () => void;
    children?: Snippet;
  } = $props();

  let svg: SVGSVGElement;
  let vp: Viewport | null = null;
  let view = $state<{ vb: VB; ppu: number }>({ vb: { ...data.venue.view }, ppu: 0.2 });
  let tilesOk = $state(false);
  const s = $derived(STRINGS[lang.current]);
  const destIndex = $derived(dest?.kind === 'booth' ? dest.b.i : -1);
  const activeAisle = $derived(dest?.kind === 'booth' && isAisleBooth(dest.b, data) ? dest.b.c[0] : '');
  const turnAttr = $derived(turn ? `rotate(${turn.deg.toFixed(1)} ${turn.cx.toFixed(1)} ${turn.cy.toFixed(1)})` : undefined);
  const needle = $derived(compass ? compass.northDeg + (turn?.deg ?? 0) : 0);

  export const fitAll = (animated = false) => vp?.fitAll(animated);
  export const zoomCenter = (k: number) => vp?.zoomCenter(k);
  export const frame = (d: Dest | null, r: RouteOk | null) => vp?.frame(d, r);
  export const frameBox = (b: Box, pad: number) => vp?.frameBox(b, pad);
  export const setBounds = (r: Rect | null) => vp?.setBounds(r);

  onMount(() => {
    vp = createViewport(
      svg,
      data.venue,
      (target) => {
        const bEl = target?.closest('[data-b]'),
          lEl = target?.closest('[data-lm]');
        if (bEl) onSelectBooth(data.booths[Number(bEl.getAttribute('data-b'))]);
        else if (lEl) {
          const lm = data.landmarkById[lEl.getAttribute('data-lm') ?? ''];
          if (lm) onSelectPlace(lm);
        }
      },
      { onView: (vb, ppu) => (view = { vb: { ...vb }, ppu }), onPan: () => onUserPan?.() },
    );
    return () => vp?.destroy();
  });
</script>

<div class="mapwrap">
  <svg
    bind:this={svg}
    id="map"
    class:dim={!!dest}
    class:street={!!street}
    xmlns="http://www.w3.org/2000/svg"
    preserveAspectRatio="xMidYMid meet"
    role="img"
    aria-label={s.floorPlan}
    viewBox="{data.venue.view.x} {data.venue.view.y} {data.venue.view.w} {data.venue.view.h}"
  >
    <g id="map-turn" transform={turnAttr}>
      {#if street}
        <StreetLayer
          geo={street.geo}
          surroundings={street.surroundings}
          tileUrl={street.tileUrl}
          vb={view.vb}
          pxPerUnit={view.ppu}
          onTiles={(ok) => (tilesOk = ok)}
        />
      {/if}
      <BaseLayer {data} {activeAisle} />
      <BoothLayer {data} {destIndex} />
      <ZoneLayer {data} {destIndex} />
      <MarkLayer landmarks={data.landmarks} nameOf={nameIn(lang.current)} />
      <RouteLayer {route} />
      <PinLayer {dest} {route} />
      <YouLayer {you} unit={1 / view.ppu} label={s.you} />
    </g>
  </svg>
  <div class="zoombar">
    <button type="button" aria-label={s.zoomIn} title={s.zoomIn} onclick={() => zoomCenter(0.7)}>+</button>
    <button type="button" aria-label={s.zoomOut} title={s.zoomOut} onclick={() => zoomCenter(1 / 0.7)}>−</button>
    <button type="button" aria-label={s.fit} title={s.fit} onclick={onFit}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" /></svg>
    </button>
    {#if compass}
      <button
        type="button"
        class="compass"
        aria-pressed={compass.on}
        aria-label={compass.on ? s.stopTurning : s.turnWithMe}
        title={compass.on ? s.stopTurning : s.turnWithMe}
        onclick={compass.toggle}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true"><g transform="rotate({needle.toFixed(0)} 12 12)"><path d="M12 3l4 9H8z" class="needle-n" /><path d="M12 21l-4-9h8z" class="needle-s" /></g></svg>
      </button>
    {/if}
  </div>
  {#if street}
    <div class="streetinfo">
      {#if !tilesOk}<span class="chip offline">{s.offlineMap}</span>{/if}
      <span class="credit">{tilesOk && street.credit ? `${street.credit} · ` : ''}© OpenStreetMap contributors</span>
    </div>
  {/if}
  {@render children?.()}
</div>
```

- [ ] **Step 11: Add tokens and styles**

In `src/lib/styles/app.css`, in the bare `:root` block, after `--focus: #2f7fd1;` add:

```css
  --s-ground: #f2efe9;
  --s-water: #aad3df;
  --s-park: #c8facc;
  --s-building: #d9d0c9;
  --s-road: #ffffff;
  --s-path: #e8e2d6;
  --s-label: #4a4a4a;
  --you: #2f7fd1;
  --tiles: 1;
```

In both dark blocks (`@media (prefers-color-scheme: dark) { :root:not([data-theme='light']) {` and `:root[data-theme='dark'] {`), after `--focus: #6aa8ff;` add:

```css
    --s-ground: #141d33;
    --s-water: #1f3a52;
    --s-park: #1c3328;
    --s-building: #2a3552;
    --s-road: #3a4668;
    --s-path: #2f3a58;
    --s-label: #c9d4ee;
    --you: #6aa8ff;
    --tiles: 0.7;
```

Append to the end of `src/lib/styles/app.css`:

```css
/* street map and position */
.street .outside {
  fill-opacity: 0;
}
.s-ground {
  fill: var(--s-ground);
}
.s-water {
  fill: var(--s-water);
  fill-rule: evenodd;
}
.s-park {
  fill: var(--s-park);
  fill-rule: evenodd;
}
.s-building {
  fill: var(--s-building);
}
.s-road,
.s-path {
  fill: none;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.s-road {
  stroke: var(--s-road);
}
.s-path {
  stroke: var(--s-path);
}
.s-edge {
  fill: none;
  stroke: var(--muted);
  stroke-width: 2;
  stroke-dasharray: 8 6;
  vector-effect: non-scaling-stroke;
}
.s-label {
  fill: var(--s-label);
  font-family: var(--body);
  text-anchor: middle;
  paint-order: stroke;
  stroke: var(--s-ground);
  stroke-width: 0.25em;
}
#layer-street image {
  opacity: var(--tiles);
}
.you-acc {
  fill: var(--you);
  fill-opacity: 0.14;
  stroke: var(--you);
  stroke-opacity: 0.45;
  vector-effect: non-scaling-stroke;
}
#layer-you .dot {
  fill: var(--you);
  stroke: var(--panel);
  stroke-width: 3;
  vector-effect: non-scaling-stroke;
}
.you-leg {
  fill: none;
  stroke: var(--you);
  stroke-width: 4;
  stroke-dasharray: 1 8;
  stroke-linecap: round;
  vector-effect: non-scaling-stroke;
}
.streetinfo {
  position: absolute;
  left: 10px;
  bottom: 10px;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
  pointer-events: none;
  max-width: calc(100% - 80px);
}
.chip.offline {
  background: var(--panel);
  color: var(--text);
  border: 1px solid var(--line);
  border-radius: 999px;
  padding: 4px 10px;
  font-size: 13px;
  font-weight: 600;
}
.credit {
  background: var(--panel);
  opacity: 0.85;
  color: var(--muted);
  font-size: 11px;
  padding: 1px 6px;
  border-radius: 4px;
}
.zoombar .compass[aria-pressed='true'] {
  background: var(--ink);
  color: var(--panel);
}
.needle-n {
  fill: #e3452f;
}
.needle-s {
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linejoin: round;
}
```

- [ ] **Step 12: Run checks, build and the existing e2e**

Run: `bun run lint && bun run fmt && bun run check && bun run build && bun run test && bunx playwright test tests/e2e/finder.e2e.ts`
Expected: all pass. Nothing new is visible yet: `street`, `you`, `turn` and `compass` default to `null`.

- [ ] **Step 13: Commit**

```bash
git add src/lib/map src/lib/i18n/strings.ts src/lib/styles/app.css tests/tiles.test.ts tests/strings.test.ts
git commit -m "feat(map): draw the street map and the guest's position in plan space"
```

---

### Task 10: Use my location, outdoor leg, hand-off and hall check

**Files:**
- Create: `src/lib/ui/locate.ts`, `src/lib/ui/locator.svelte.ts`
- Create: `src/lib/ui/OutdoorLeg.svelte`, `src/lib/ui/HallConfirm.svelte`, `src/lib/ui/MapBanner.svelte`
- Modify: `src/lib/ui/finder.svelte.ts`
- Modify: `src/lib/ui/StartPicker.svelte` (full replacement)
- Modify: `src/lib/ui/ResultCard.svelte` (full replacement)
- Modify: `src/lib/ui/FinderView.svelte` (full replacement)
- Modify: `src/lib/styles/app.css` (append)
- Modify: `playwright.config.ts`
- Test: `tests/e2e/locate.e2e.ts`

**Interfaces:**
- Consumes: `classify`, `hallChoices`, `hallStart`, `Fix`, `Where` (Task 4); `georef` (Task 1); `boxAround` (Task 8); `FloorMap` props and exports (Task 9); `TILE_URL`, `TILE_CREDIT`; strings from Task 9.
- Produces:
  - `src/lib/ui/locate.ts`: `LocState = 'idle' | 'asking' | 'on' | 'denied' | 'unavailable'`; `LocView = { state; weak: boolean; farKm: number | null; outside: { entrance: Landmark; meters: number; minutes: number; inside: number | null } | null; hall: { choices: string[]; guess: string | null } | null; onStart(); onStop(); onInside(); onHall(id: string); onList() }`.
  - `Locator` class: `state: LocState`, `fix: Fix | null`, `start()`, `stop(next?: LocState)`; pauses while the page is hidden.
  - `Finder.entranceMeters(dest: Dest): Record<string, number>`.
  - DOM hooks used by e2e: `.locbtn`, `.outleg`, `.hallq`, `.hallbtn`, `.mapbanner`, `#layer-you .dot`, `.chip.offline`, `.from .hint`.

- [ ] **Step 1: Point e2e builds at a tile path that 404s**

In `playwright.config.ts`, replace the `webServer` line with:

```ts
  webServer: {
    command: 'VITE_TILE_URL=/__tiles/{z}/{x}/{y}.png VITE_TILE_CREDIT="Test tiles" bun run build && bunx serve _site -l 4173',
    port: 4173,
    reuseExistingServer: !process.env.CI,
  },
```

`serve` answers 404 for `/__tiles/…`, which is exactly the "tile server refused" case. One test overrides it with a real image.

- [ ] **Step 2: Write the failing e2e tests**

Create `tests/e2e/locate.e2e.ts`:

```ts
import { test, expect, type BrowserContext } from '@playwright/test';
import { loadVenue } from '../../src/lib/server/catalog';
import { georef, planToLatLng } from '../../src/lib/core/geo';

const venue = loadVenue('qsncc-lg-5-8');
const g = venue.geo ? georef(venue.geo.pins) : null;
const at = (x: number, y: number, accuracy = 15) => {
  const ll = planToLatLng(g!, [x, y]);
  return { latitude: ll.lat, longitude: ll.lng, accuracy };
};
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
);

test.skip(!g, 'qsncc-lg-5-8 has no map pins yet');

async function open(context: BrowserContext, page: import('@playwright/test').Page, x: number, y: number, accuracy = 15) {
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation(at(x, y, accuracy));
  await page.goto('/e/bkkibf-2026/#to=A42');
  await page.getByRole('button', { name: 'EN', exact: true }).click();
  await page.locator('.locbtn').click();
}

test('outside: walks to the best entrance, then hands off at the door', async ({ page, context }) => {
  await open(context, page, -200, 560);
  await expect(page.locator('.outleg')).toContainText('Walk to MRT QSNCC station (exit 3)');
  await expect(page.locator('#layer-you .dot')).toHaveCount(1);
  await expect(page.locator('#layer-street')).toHaveCount(1);
  await context.setGeolocation(at(260, 560));
  await expect(page.locator('.mapbanner')).toContainText("You're at MRT QSNCC station (exit 3)");
  await expect(page.locator('#from')).toHaveValue('mrt');
  await expect(page.locator('#layer-you .dot')).toHaveCount(0);
  await page.reload();
  await expect(page.locator('#from')).toHaveValue('mrt');
});

test('inside: asks which hall and starts from that hall door', async ({ page, context }) => {
  await open(context, page, 1000, 900);
  await expect(page.locator('.hallq')).toContainText('Which hall are you in?');
  await expect(page.locator('.hallbtn.guess')).toContainText('Hall 6');
  await page.locator('.hallbtn', { hasText: 'Hall 6' }).click();
  await expect(page.locator('#from')).toHaveValue('door6');
  await expect(page.locator('.hallq')).toHaveCount(0);
});

test('weak GPS says so and does not hand off', async ({ page, context }) => {
  await open(context, page, 260, 560, 250);
  await expect(page.locator('.from .hint')).toContainText('GPS is weak here');
  await expect(page.locator('.mapbanner')).toHaveCount(0);
});

test('location refused shows the note and keeps the list', async ({ page, context }) => {
  await context.clearPermissions();
  await page.goto('/e/bkkibf-2026/#to=A42');
  await page.getByRole('button', { name: 'EN', exact: true }).click();
  await page.locator('.locbtn').click();
  await expect(page.locator('.from .hint')).toContainText('Location is off for this site');
  await expect(page.locator('#from')).toBeEnabled();
});

test('picking from the list while locating stops locating', async ({ page, context }) => {
  await open(context, page, -200, 560);
  await expect(page.locator('#layer-you .dot')).toHaveCount(1);
  await page.locator('#from').selectOption('door6');
  await expect(page.locator('#layer-you .dot')).toHaveCount(0);
  await context.setGeolocation(at(-150, 560));
  await page.waitForTimeout(500);
  await expect(page.locator('#from')).toHaveValue('door6');
});

test('tile errors fall back to the offline map', async ({ page, context }) => {
  await open(context, page, -200, 560);
  await expect(page.locator('.chip.offline')).toHaveText('Offline map');
});

test('working tiles hide the offline chip and show their credit', async ({ page, context }) => {
  await page.route('**/__tiles/**', (r) => r.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
  await open(context, page, -200, 560);
  await expect(page.locator('#layer-street image').first()).toBeAttached();
  await expect(page.locator('.chip.offline')).toHaveCount(0);
  await expect(page.locator('.credit')).toContainText('Test tiles');
});
```

- [ ] **Step 3: Run them to see them fail**

Run: `bunx playwright test tests/e2e/locate.e2e.ts --project=phone`
Expected: FAIL, `.locbtn` not found (or all skipped if Task 3 is not done yet; do Task 3 first).

- [ ] **Step 4: Add the UI types and the locator**

Create `src/lib/ui/locate.ts`:

```ts
import type { Landmark } from '$lib/core/types';

export type LocState = 'idle' | 'asking' | 'on' | 'denied' | 'unavailable';
export type LocView = {
  state: LocState;
  weak: boolean;
  farKm: number | null;
  outside: { entrance: Landmark; meters: number; minutes: number; inside: number | null } | null;
  hall: { choices: string[]; guess: string | null } | null;
  onStart: () => void;
  onStop: () => void;
  onInside: () => void;
  onHall: (id: string) => void;
  onList: () => void;
};
```

Create `src/lib/ui/locator.svelte.ts`:

```ts
import type { Fix } from '$lib/core/locate';
import type { LocState } from './locate';

export class Locator {
  state = $state<LocState>('idle');
  fix = $state<Fix | null>(null);
  #id: number | null = null;
  #paused = false;
  #onVis = () => {
    if (document.hidden && this.#id !== null) {
      this.#clear();
      this.#paused = true;
    } else if (!document.hidden && this.#paused) {
      this.#paused = false;
      this.#watch();
    }
  };

  start() {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      this.state = 'unavailable';
      return;
    }
    this.#clear();
    this.state = 'asking';
    this.fix = null;
    document.addEventListener('visibilitychange', this.#onVis);
    this.#watch();
  }

  stop(next: LocState = 'idle') {
    this.#clear();
    this.#paused = false;
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', this.#onVis);
    this.fix = null;
    this.state = next;
  }

  #watch() {
    this.#id = navigator.geolocation.watchPosition(
      (p) => {
        this.state = 'on';
        this.fix = { lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy };
      },
      (e) => this.stop(e.code === 1 ? 'denied' : 'unavailable'),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 },
    );
  }

  #clear() {
    if (this.#id !== null) navigator.geolocation.clearWatch(this.#id);
    this.#id = null;
  }
}
```

- [ ] **Step 5: Teach the finder the indoor distance from each entrance**

In `src/lib/ui/finder.svelte.ts`, inside `class Finder`, after the `get grid()` getter add:

```ts
  #em: { dest: Dest; m: Record<string, number> } | null = null;

  entranceMeters(dest: Dest): Record<string, number> {
    if (this.#em?.dest === dest) return this.#em.m;
    const m: Record<string, number> = {};
    for (const l of this.data.landmarks) {
      if (l.group !== 'entry') continue;
      const r = findRoute(this.grid, this.data.venue, l, dest);
      if (isRouteOk(r)) m[l.id] = r.meters;
      else if ('same' in r) m[l.id] = 0;
    }
    this.#em = { dest, m };
    return m;
  }
```

- [ ] **Step 6: Create the small components**

Create `src/lib/ui/MapBanner.svelte`:

```svelte
<script lang="ts">
  let { message }: { message: string } = $props();
</script>

{#if message}
  <div class="mapbanner" role="status">{message}</div>
{/if}
```

Create `src/lib/ui/OutdoorLeg.svelte`:

```svelte
<script lang="ts">
  import { STRINGS, type Lang } from '$lib/i18n/strings';
  let {
    lang,
    name,
    meters,
    minutes,
    inside,
    onInside,
  }: { lang: Lang; name: string; meters: number; minutes: number; inside: number | null; onInside: () => void } = $props();
  const s = $derived(STRINGS[lang]);
</script>

<div class="outleg" role="status">
  <p class="olt">{s.walkTo(name)}</p>
  <div class="summary"><span class="m">{meters} {s.meters}</span><span class="t">{s.min(minutes)}</span></div>
  {#if inside !== null}<p class="hint first">{s.thenInside(inside)}</p>{/if}
  <div class="actions"><button type="button" class="btn primary" onclick={onInside}>{s.imInside}</button></div>
</div>
```

Create `src/lib/ui/HallConfirm.svelte`:

```svelte
<script lang="ts">
  import type { EventData } from '$lib/core/types';
  import { STRINGS, nameIn, type Lang } from '$lib/i18n/strings';
  let {
    data,
    lang,
    choices,
    guess,
    onPick,
    onList,
  }: {
    data: EventData;
    lang: Lang;
    choices: string[];
    guess: string | null;
    onPick: (id: string) => void;
    onList: () => void;
  } = $props();
  const s = $derived(STRINGS[lang]);
  const nameOf = $derived(nameIn(lang));
  const areas = $derived(data.venue.areas.filter((a) => choices.includes(a.id)));
</script>

<div class="hallq" role="group" aria-labelledby="hallq-t">
  <h2 class="sec" id="hallq-t">{s.whichHall}</h2>
  <p class="hint first">{s.hallHint}</p>
  <div class="halls">
    {#each areas as a (a.id)}
      <button type="button" class="hallbtn" class:guess={a.id === guess} onclick={() => onPick(a.id)}>
        <b>{nameOf(a.name)}</b>
        {#if a.id === guess}<span>{s.gpsGuess}</span>{/if}
      </button>
    {/each}
  </div>
  <button type="button" class="linkbtn" onclick={onList}>{s.pickFromList}</button>
</div>
```

- [ ] **Step 7: Replace `src/lib/ui/StartPicker.svelte`**

```svelte
<script lang="ts">
  import { GROUP_ORDER, type EventData } from '$lib/core/types';
  import { STRINGS, nameIn, type Lang } from '$lib/i18n/strings';
  import type { LocView } from './locate';
  let {
    data,
    lang,
    value,
    onChange,
    loc = null,
  }: { data: EventData; lang: Lang; value: string; onChange: (id: string) => void; loc?: LocView | null } = $props();
  const s = $derived(STRINGS[lang]);
  const nameOf = $derived(nameIn(lang));
  const groups = $derived(GROUP_ORDER.map((g) => [g, data.landmarks.filter((l) => l.group === g)] as const).filter(([, l]) => l.length));
  const active = $derived(loc?.state === 'on' || loc?.state === 'asking');
</script>

<div class="from">
  <label for="from">{s.from}</label>
  {#if loc}
    <button type="button" class="locbtn" aria-pressed={active} onclick={active ? loc.onStop : loc.onStart}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" /></svg>
      <span class="lt">
        <b>{loc.state === 'asking' ? s.locating : active ? s.stopLocating : s.useLocation}</b>
        {#if !active}<span>{s.useLocationHint}</span>{/if}
      </span>
    </button>
    {#if loc.state === 'denied'}<p class="hint" role="status">{s.locOff}</p>{/if}
    {#if loc.state === 'unavailable'}<p class="hint" role="status">{s.locUnavailable}</p>{/if}
    {#if loc.weak}<p class="hint" role="status">{s.locWeak}</p>{/if}
    {#if loc.farKm !== null}<p class="hint" role="status">{s.locFar(loc.farKm)}</p>{/if}
  {/if}
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

- [ ] **Step 8: Replace `src/lib/ui/ResultCard.svelte`**

```svelte
<script lang="ts">
  import type { Dest, EventData, RouteResult } from '$lib/core/types';
  import { isRouteOk } from '$lib/core/types';
  import { boothSub, cardTitle, exhibitorsAt, PLACE_GLYPH } from '$lib/core/describe';
  import { buildSteps } from '$lib/core/directions';
  import { STRINGS, nameIn, textFor, type Lang } from '$lib/i18n/strings';
  import StartPicker from './StartPicker.svelte';
  import OutdoorLeg from './OutdoorLeg.svelte';
  import HallConfirm from './HallConfirm.svelte';
  import type { LocView } from './locate';
  let {
    data, lang, dest, fromId, route, loc = null, onFrom, onClear, onShare,
  }: {
    data: EventData; lang: Lang; dest: Dest; fromId: string; route: RouteResult | null; loc?: LocView | null;
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

  <StartPicker {data} {lang} value={fromId} onChange={onFrom} {loc} />

  {#if loc?.hall}
    <HallConfirm {data} {lang} choices={loc.hall.choices} guess={loc.hall.guess} onPick={loc.onHall} onList={loc.onList} />
  {:else if loc?.outside}
    <OutdoorLeg
      {lang}
      name={nameOf(loc.outside.entrance)}
      meters={loc.outside.meters}
      minutes={loc.outside.minutes}
      inside={loc.outside.inside}
      onInside={loc.onInside}
    />
  {:else if !fromId}
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

- [ ] **Step 9: Replace `src/lib/ui/FinderView.svelte`**

```svelte
<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { replaceState } from '$app/navigation';
  import { loadData } from '$lib/core/prepare';
  import { createSearch, type SearchItem } from '$lib/core/search';
  import { parseHash, formatHash } from '$lib/core/hash';
  import { boxAround } from '$lib/core/panzoom';
  import { georef } from '$lib/core/geo';
  import { classify, hallChoices, hallStart } from '$lib/core/locate';
  import { headingFrom, smoothAngle, turnAngle } from '$lib/core/compass';
  import { WALK_M_PER_MIN } from '$lib/core/types';
  import type { Booth, Dest, Landmark, Point, Surroundings } from '$lib/core/types';
  import { STRINGS, fmtRange, nameIn, textFor } from '$lib/i18n/strings';
  import { eventStatus } from '$lib/core/status';
  import { lang } from '$lib/i18n/lang.svelte';
  import { store } from '$lib/storage';
  import { Finder } from '$lib/ui/finder.svelte';
  import { Locator } from '$lib/ui/locator.svelte';
  import type { LocView } from '$lib/ui/locate';
  import { TILE_CREDIT, TILE_URL } from '$lib/map/tileConfig';
  import type { CompassView, StreetView, Turn, YouMark } from '$lib/map/street';
  import Header from '$lib/ui/Header.svelte';
  import FloorMap from '$lib/map/FloorMap.svelte';
  import Sheet from '$lib/ui/Sheet.svelte';
  import SearchBox from '$lib/ui/SearchBox.svelte';
  import Results from '$lib/ui/Results.svelte';
  import IdleView from '$lib/ui/IdleView.svelte';
  import ResultCard from '$lib/ui/ResultCard.svelte';
  import Toast from '$lib/ui/Toast.svelte';
  import MapBanner from '$lib/ui/MapBanner.svelte';

  import type { EventBundle } from '$lib/core/types';

  let { bundle }: { bundle: EventBundle } = $props();
  const data = untrack(() => loadData(bundle));
  const f = new Finder(data);
  const search = createSearch(data);
  const FROM_KEY = `bf:${data.event.id}:from`;
  const geo = data.venue.geo ? georef(data.venue.geo.pins) : null;
  const loc = new Locator();

  let map: FloorMap;
  let toast = $state({ message: '', show: false });
  let toastTimer: ReturnType<typeof setTimeout>;
  let isPast = $state(false);
  let surroundings = $state<Surroundings | null>(null);
  let hall = $state<{ guess: string | null } | null>(null);
  let farKm = $state<number | null>(null);
  let banner = $state('');
  let bannerTimer: ReturnType<typeof setTimeout>;
  let framed = '';
  let turning = $state(false);
  let heading = $state<number | null>(null);

  const s = $derived(STRINGS[lang.current]);
  const nameOf = $derived(nameIn(lang.current));
  const notice = $derived(isPast ? s.ended(fmtRange(data.event.dates.end, data.event.dates.end, lang.current)) : '');
  const results = $derived(f.query.trim() ? search(f.query) : []);

  const where = $derived(geo && loc.fix ? classify(loc.fix, data, geo, f.dest ? f.entranceMeters(f.dest) : null) : null);
  const outside = $derived(where?.kind === 'outside' ? where : null);
  const street: StreetView | null = $derived(geo && outside ? { geo, surroundings, tileUrl: TILE_URL, credit: TILE_CREDIT } : null);
  const you: YouMark | null = $derived(
    outside ? { p: outside.p, accPx: outside.accuracyPx, leg: [outside.entrance.x, outside.entrance.y] } : null,
  );
  const turn: Turn | null = $derived(
    geo && turning && heading !== null && outside ? { deg: turnAngle(geo.northDeg, heading), cx: outside.p[0], cy: outside.p[1] } : null,
  );
  const compass: CompassView | null = $derived(
    geo && outside ? { on: turning, northDeg: geo.northDeg, toggle: () => (turning ? stopTurning() : startTurning()) } : null,
  );
  const locView: LocView | null = $derived(
    geo
      ? {
          state: loc.state,
          weak: where?.kind === 'weak',
          farKm,
          outside: outside
            ? {
                entrance: outside.entrance,
                meters: outside.meters,
                minutes: Math.max(1, Math.round(outside.meters / WALK_M_PER_MIN)),
                inside: f.routeOk?.meters ?? null,
              }
            : null,
          hall: hall ? { choices: hallChoices(data.venue, hall.guess), guess: hall.guess } : null,
          onStart: startLocating,
          onStop: () => stopLocating(true),
          onInside: () => outside && handOff(outside.entrance),
          onHall: pickHall,
          onList: () => {
            hall = null;
            document.getElementById('from')?.focus();
          },
        }
      : null,
  );

  $effect(() => {
    const w = where;
    if (!w) return;
    untrack(() => {
      if (w.kind === 'arrived') handOff(w.entrance);
      else if (w.kind === 'inside') {
        stopLocating(true);
        hall = { guess: w.hall };
      } else if (w.kind === 'far') {
        stopLocating(true);
        farKm = Math.round(w.meters / 100) / 10;
      } else if (w.kind === 'outside') {
        if (f.fromId !== w.entrance.id) f.fromId = w.entrance.id;
        const key = `${w.entrance.id}:${f.dest?.kind === 'booth' ? f.dest.b.i : (f.dest?.lm.id ?? '')}`;
        if (framed !== key) {
          framed = key;
          const pts: Point[] = [w.p, [w.entrance.x, w.entrance.y], ...(f.routeOk?.P ?? [])];
          const b = boxAround(pts);
          map.setBounds({ x: b[0] - 300, y: b[1] - 300, w: b[2] - b[0] + 600, h: b[3] - b[1] + 600 });
          map.frameBox(b, 80);
        }
      }
    });
  });

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
    if (loc.state === 'on' || loc.state === 'asking') stopLocating(false);
    hall = null;
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
  function showBanner(message: string) {
    banner = message;
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => (banner = ''), 5000);
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

  function startLocating() {
    farKm = null;
    hall = null;
    loc.start();
    if (!surroundings)
      fetch(`/v/${data.venue.id}/surroundings.json`)
        .then((r) => (r.ok ? r.json() : null))
        .then((v: Surroundings | null) => (surroundings = v))
        .catch(() => (surroundings = null));
  }
  function stopLocating(restore: boolean) {
    loc.stop();
    stopTurning();
    framed = '';
    map.setBounds(null);
    if (restore) {
      const saved = store.get(FROM_KEY);
      f.fromId = saved && data.landmarkById[saved] ? saved : '';
      map.frame(f.dest, f.routeOk);
    }
  }
  function handOff(lm: Landmark) {
    setFrom(lm.id);
    showBanner(s.arrived(nameOf(lm)));
  }
  function pickHall(id: string) {
    const start = hallStart(data, id);
    hall = null;
    if (start) setFrom(start);
  }

  const onOrient = (e: DeviceOrientationEvent) => {
    const ios = (e as DeviceOrientationEvent & { webkitCompassHeading?: number }).webkitCompassHeading;
    const h = headingFrom(
      { webkitCompassHeading: ios, alpha: e.alpha, absolute: e.absolute || e.type === 'deviceorientationabsolute' },
      screen.orientation?.angle ?? 0,
    );
    if (h !== null) heading = smoothAngle(heading, h);
  };
  async function startTurning() {
    const DOE = globalThis.DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> } | undefined;
    if (!DOE) return showToast(s.compassOff);
    try {
      if (DOE.requestPermission && (await DOE.requestPermission()) !== 'granted') return showToast(s.compassOff);
    } catch {
      return showToast(s.compassOff);
    }
    heading = null;
    turning = true;
    addEventListener('deviceorientationabsolute', onOrient as EventListener);
    addEventListener('deviceorientation', onOrient);
  }
  function stopTurning() {
    turning = false;
    heading = null;
    removeEventListener('deviceorientationabsolute', onOrient as EventListener);
    removeEventListener('deviceorientation', onOrient);
  }

  onMount(() => {
    isPast = eventStatus(data.event.dates, data.venue.timezone) === 'past';
    const stored = store.get(FROM_KEY);
    if (stored && data.landmarkById[stored]) f.fromId = stored;
    requestAnimationFrame(() => {
      map.fitAll();
      if (readHash()) map.frame(f.dest, f.routeOk);
    });
    const onHash = () => { if (readHash()) map.frame(f.dest, f.routeOk); };
    addEventListener('hashchange', onHash);
    return () => {
      removeEventListener('hashchange', onHash);
      loc.stop();
      stopTurning();
    };
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
    {street}
    {you}
    {turn}
    {compass}
    onUserPan={() => turning && stopTurning()}
    onSelectBooth={selectBooth}
    onSelectPlace={selectPlace}
    onFit={() => (f.dest ? map.frame(f.dest, f.routeOk) : map.fitAll(true))}
  >
    <MapBanner message={banner} />
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
      <ResultCard {data} lang={lang.current} dest={f.dest} fromId={f.fromId} route={f.route} loc={locView} onFrom={setFrom} onClear={clearRoute} onShare={share} />
    {:else}
      <IdleView {data} lang={lang.current} {notice} onPick={(kind, id) => (kind === 'booth' ? selectBooth(data.byCode[id][0]) : selectPlace(data.landmarkById[id]))} />
    {/if}
  </Sheet>
</div>
```

What changed against the current file: the locate, compass and banner state and functions; `setFrom` stops locating and clears the hall question; `ResultCard` gets `loc`; `FloorMap` gets the street, position, turn and compass props and the banner child; cleanup stops locating.

- [ ] **Step 10: Add the card styles**

Append to `src/lib/styles/app.css`:

```css
/* locate */
.locbtn {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 56px;
  padding: 8px 12px;
  margin-bottom: 8px;
  border-radius: 12px;
  border: 1.5px solid var(--blue);
  background: var(--chip);
  color: var(--text);
  text-align: left;
  cursor: pointer;
}
.locbtn svg {
  width: 24px;
  height: 24px;
  flex: none;
  color: var(--blue);
}
.locbtn .lt {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.locbtn .lt span {
  font-size: 13px;
  color: var(--muted);
}
.locbtn[aria-pressed='true'] {
  background: var(--panel);
  border-color: var(--line);
}
.from .hint {
  margin: 0 0 8px;
}
.outleg .olt {
  font-family: var(--display);
  font-weight: 500;
  font-size: 19px;
  margin: 12px 0 0;
}
.hallq .halls {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}
.hallbtn {
  min-height: 60px;
  padding: 8px 6px;
  border-radius: 12px;
  border: 1.5px solid var(--line);
  background: var(--panel);
  color: var(--ink);
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
}
.hallbtn b {
  font-family: var(--display);
  font-weight: 500;
  font-size: 17px;
}
.hallbtn span {
  font-size: 12px;
  color: var(--muted);
}
.hallbtn.guess {
  border: 2px solid var(--blue);
  background: var(--chip);
}
.linkbtn {
  border: 0;
  background: transparent;
  color: var(--blue);
  font-weight: 600;
  min-height: 44px;
  padding: 0;
  cursor: pointer;
}
.mapbanner {
  position: absolute;
  left: 12px;
  right: 12px;
  top: 12px;
  z-index: 2;
  background: var(--ink);
  color: var(--panel);
  border-radius: 14px;
  padding: 10px 14px;
  font-weight: 600;
  box-shadow: 0 3px 12px rgba(19, 48, 107, 0.3);
}
```

- [ ] **Step 11: Run the checks and all tests**

Run: `bun run lint && bun run fmt && bun run check && bun run test && bun run test:e2e`
Expected: all pass, including the 7 tests in `tests/e2e/locate.e2e.ts` on both projects.

- [ ] **Step 12: Commit**

```bash
git add src/lib/ui src/lib/styles/app.css playwright.config.ts tests/e2e/locate.e2e.ts
git commit -m "feat(app): walk guests to the best entrance and hand off to the hall plan"
```

---

### Task 11: Compass button behaviour

**Files:**
- Test: `tests/e2e/locate.e2e.ts` (append)

**Interfaces:**
- Consumes: `CompassView` wired in Task 10; `turnAngle`, `headingFrom`, `smoothAngle` (Task 5).
- Produces: nothing new. This task proves the button appears only on the street map, toggles, and that dragging turns it off.

- [ ] **Step 1: Write the failing e2e test**

Append to `tests/e2e/locate.e2e.ts`:

```ts
test('the compass button shows on the street map, turns the map and stops on drag', async ({ page, context }) => {
  await page.goto('/e/bkkibf-2026/#to=A42');
  await page.getByRole('button', { name: 'EN', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Turn the map as I turn' })).toHaveCount(0);
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation(at(-200, 560));
  await page.locator('.locbtn').click();
  const btn = page.getByRole('button', { name: 'Turn the map as I turn' });
  await expect(btn).toBeVisible();
  await btn.click();
  await expect(page.getByRole('button', { name: 'Stop turning the map' })).toHaveAttribute('aria-pressed', 'true');
  await page.evaluate(() => {
    const e = new Event('deviceorientationabsolute') as Event & { alpha: number; absolute: boolean };
    Object.assign(e, { alpha: 0, absolute: true });
    dispatchEvent(e);
  });
  await expect(page.locator('#map-turn')).toHaveAttribute('transform', /rotate\(/);
  const box = (await page.locator('#map').boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2 + 10, { steps: 5 });
  await page.mouse.up();
  await expect(page.getByRole('button', { name: 'Turn the map as I turn' })).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('#map-turn')).not.toHaveAttribute('transform', /rotate\(/);
});
```

- [ ] **Step 2: Run it**

Run: `bunx playwright test tests/e2e/locate.e2e.ts -g compass`
Expected: PASS if Task 10 wired everything. If the transform assertion fails, check that `onOrient` treats `e.type === 'deviceorientationabsolute'` as absolute and that `turn` needs `heading !== null`.

- [ ] **Step 3: Check it by hand on a real phone**

On an iPhone (Safari) and an Android phone (Chrome), on the deployed preview: open an event, tap Use my location outdoors, tap the compass button. Expected: iPhone asks for motion and orientation access; allowing turns the map as the phone turns; refusing shows "The compass isn't available on this phone. The map stays as printed." Dragging the map turns compass mode off.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/locate.e2e.ts
git commit -m "test(app): cover the compass button on the street map"
```

---

### Task 12: Handover notes

**Files:**
- Modify: `CLAUDE.md`
- Modify: `README.md`

- [ ] **Step 1: Update `CLAUDE.md`**

In the Commands block, after the `bun run event:...` line add:

```
bun run venue:surroundings <venue-id> [--meters 400]   street drawing from OpenStreetMap (needs map pins)
```

In the Layout block, after the `venues/<id>/venue.json + reference.jpg` line add:

```
venues/<id>/surroundings.json            generated street drawing in plan pixels, served at /v/<id>/surroundings.json
```

Add a section before `## Content rules`:

```markdown
## Street map and GPS

`venue.geo` pins plan pixels to latitude and longitude (`src/lib/core/geo.ts` fits an affine to Web Mercator) and lists the street entrances. The street map is drawn inside the plan SVG, so the plan keeps its printed orientation and the streets turn to match it. Tiles come from `VITE_TILE_URL` (`{z}/{x}/{y}` template, a style with no text labels) and `VITE_TILE_CREDIT`; unset or failing tiles fall back to `surroundings.json` with an "Offline map" chip. `src/lib/core/locate.ts` turns a fix into weak, far, inside, arrived or outside; the UI only reacts to that. GPS is never used to place a guest in an aisle. The position never leaves the phone and is never stored.
```

In Gotchas, replace the layer id line with:

```markdown
- Map layer ids `layer-street|base|booths|zones|marks|route|pins|you`, all inside `#map-turn` (compass rotation). CSS targets `#layer-route`.
```

- [ ] **Step 2: Update `README.md`**

Add a section:

```markdown
## Street map tiles

Set these in the Cloudflare Pages build settings to show street tiles while a guest is locating:

- `VITE_TILE_URL`: a raster tile URL template with `{z}`, `{x}` and `{y}`, for a style without text labels (labels would appear upside down, because tiles are turned to match the plan). Restrict the key to this site's domain.
- `VITE_TILE_CREDIT`: the provider's credit line.

Without them, guests see the bundled street drawing with an "Offline map" chip.
```

- [ ] **Step 3: Format and commit**

Run: `bun run fmt:check`
Expected: PASS.

```bash
git add CLAUDE.md README.md
git commit -m "docs: explain the street map, map pins and tile settings"
```

---

## Self-review notes

- Spec coverage: §2.1 Tasks 4 and 10; §2.2 Tasks 1, 5, 9 and 11; §2.3 Tasks 6, 7 and 9; §2.4 Tasks 2 and 3; §2.5 Task 10; §3 weak/far/outside/arrived/inside Tasks 4 and 10, list pick stops locating Task 10, background pause Task 10 (`Locator`), street only while outside Task 10 (`street` derived from `outside`), compass drag-off Tasks 8 and 11; §4 Tasks 2, 3, 6, 7 and 12. §5 is plan 2.
- Data steps in Tasks 3 and 7 depend on measurements and network access, not code. The e2e file skips cleanly until Task 3 lands.
- Names used across tasks: `georef`, `latLngToPlan`, `planToLatLng`, `classify`, `pickEntrance`, `streetEntrances`, `hallChoices`, `hallStart`, `turnAngle`, `smoothAngle`, `headingFrom`, `unionRect`, `boxAround`, `tileZoom`, `visibleTiles`, `tileMatrix`, `tileHref`, `setBounds`, `frameBox`, `entranceMeters`, `LocView`, `StreetView`, `YouMark`, `Turn`, `CompassView`.
