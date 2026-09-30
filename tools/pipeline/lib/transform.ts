import type { Point, Rect } from '../../../src/lib/core/types';

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
  const n = a.length,
    ma = a.reduce((s, v) => s + v, 0) / n,
    mb = b.reduce((s, v) => s + v, 0) / n;
  let num = 0,
    den = 0;
  for (let k = 0; k < n; k++) {
    num += (a[k] - ma) * (b[k] - mb);
    den += (a[k] - ma) ** 2;
  }
  const s = num / den;
  return { s, d: mb - s * ma };
};

export function fitAxes(pairs: { plan: Point; venue: Point }[]): Transform {
  if (pairs.length < 2) throw new Error('Need at least two point pairs to register the plan');
  const x = fit1(
    pairs.map((p) => p.plan[0]),
    pairs.map((p) => p.venue[0]),
  );
  const y = fit1(
    pairs.map((p) => p.plan[1]),
    pairs.map((p) => p.venue[1]),
  );
  return { sx: x.s, sy: y.s, dx: x.d, dy: y.d, score: 1, method: 'manual' };
}

const inside = ([x, y]: Point, r: Rect) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;

export function ownerIndex(pt: Point, rects: Rect[]): number {
  let best = -1;
  rects.forEach((r, k) => {
    if (inside(pt, r) && (best < 0 || r.w * r.h < rects[best].w * rects[best].h)) best = k;
  });
  return best;
}
