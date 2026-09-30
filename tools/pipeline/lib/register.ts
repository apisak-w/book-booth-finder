import { components, farFromColour, modeColour, type Mask, type RGB } from './image';
import type { Venue } from '../../../src/lib/core/types';

export { IDENTITY, fitAxes, rectToPlan, rectToVenue, toPlan, toVenue, type Transform } from './transform';
import type { Transform } from './transform';

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
