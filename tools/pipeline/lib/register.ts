import { components, farFromColour, modeColour, type Mask, type RGB } from './image';
import type { Venue } from '../../../src/lib/core/types';
import { pointInPolygon } from '../../../src/lib/core/geometry';

export { IDENTITY, fitAxes, rectToPlan, rectToVenue, toPlan, toVenue, type Transform } from './transform';
import type { Transform } from './transform';

function filledLargest(m: Mask) {
  const { labels, stats } = components(m);
  let id = 1;
  for (let k = 2; k < stats.length; k++) if (stats[k].area > stats[id].area) id = k;
  const { x, y, w, h } = stats[id];
  const outside = new Uint8Array(w * h),
    stack: number[] = [];
  const isComp = (i: number) => labels[(y + ((i / w) | 0)) * m.width + x + (i % w)] === id;
  for (let k = 0; k < w * h; k++) {
    const cx = k % w,
      cy = (k / w) | 0;
    if ((cx === 0 || cy === 0 || cx === w - 1 || cy === h - 1) && !isComp(k)) {
      outside[k] = 1;
      stack.push(k);
    }
  }
  while (stack.length) {
    const k = stack.pop()!,
      cx = k % w,
      cy = (k / w) | 0;
    for (const j of [cx > 0 ? k - 1 : -1, cx < w - 1 ? k + 1 : -1, cy > 0 ? k - w : -1, cy < h - 1 ? k + w : -1])
      if (j >= 0 && !outside[j] && !isComp(j)) {
        outside[j] = 1;
        stack.push(j);
      }
  }
  return {
    box: stats[id],
    inside: (px: number, py: number) =>
      px >= x && py >= y && px < x + w && py < y + h && !outside[(py - y) * w + (px - x)],
  };
}

export function autoRegister(img: RGB, venue: Venue): Transform {
  const floor = modeColour(img);
  const near = farFromColour(img, floor, 24);
  for (let i = 0; i < near.data.length; i++) near.data[i] = near.data[i] ? 0 : 1;
  const plan = filledLargest(near);
  const hall = venue.walls[0];
  const xs = hall.map((p) => p[0]),
    ys = hall.map((p) => p[1]);
  const vx0 = Math.min(...xs),
    vx1 = Math.max(...xs),
    vy0 = Math.min(...ys),
    vy1 = Math.max(...ys);
  const sx = (vx1 - vx0) / plan.box.w,
    sy = (vy1 - vy0) / plan.box.h;
  const dx = vx0 - plan.box.x * sx,
    dy = vy0 - plan.box.y * sy;
  const step = Math.max(1, Math.round(Math.min(vx1 - vx0, vy1 - vy0) / 200));
  let inter = 0,
    union = 0;
  for (let vy = vy0 + step / 2; vy < vy1; vy += step)
    for (let vx = vx0 + step / 2; vx < vx1; vx += step) {
      const a = pointInPolygon(vx, vy, hall);
      const b = plan.inside(Math.floor((vx - dx) / sx), Math.floor((vy - dy) / sy));
      if (a && b) inter++;
      if (a || b) union++;
    }
  return { sx, sy, dx, dy, score: union ? inter / union : 0, method: 'auto' };
}
