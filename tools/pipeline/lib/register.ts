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
  const xs = hall.map((p) => p[0]),
    ys = hall.map((p) => p[1]);
  const vx0 = Math.min(...xs),
    vx1 = Math.max(...xs),
    vy0 = Math.min(...ys),
    vy1 = Math.max(...ys);
  const sx = (vx1 - vx0) / plan.w,
    sy = (vy1 - vy0) / plan.h;
  const dx = vx0 - plan.x * sx,
    dy = vy0 - plan.y * sy;
  const ix = Math.max(0, Math.min(vx1, plan.x * sx + dx + plan.w * sx) - Math.max(vx0, plan.x * sx + dx));
  const iy = Math.max(0, Math.min(vy1, plan.y * sy + dy + plan.h * sy) - Math.max(vy0, plan.y * sy + dy));
  const score = (ix * iy) / ((vx1 - vx0) * (vy1 - vy0));
  return { sx, sy, dx, dy, score: Math.min(score, Math.min(sx, sy) / Math.max(sx, sy)), method: 'auto' };
}
