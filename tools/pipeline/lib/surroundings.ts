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
        ? stitch(
            (el.members ?? [])
              .filter((m) => m.geometry && (m.role === 'outer' || m.role === 'inner'))
              .map((m) => m.geometry!),
          )
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
      labels.push({
        x: Math.round(avg(rings[0], 0)),
        y: Math.round(avg(rings[0], 1)),
        text,
        size: Math.round(7 / mPerPx),
      });
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
