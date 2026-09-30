import type { EventData, Rect, Venue } from './types';

export type Grid = {
  walk: Uint8Array;
  clear: Uint8Array;
  doorCell: Int16Array;
  gw: number;
  gh: number;
  x0: number;
  y0: number;
  g: number;
};
export type Blocker = Rect & { extra?: Rect[] };

const PAD = 2;
const MAX_CLEAR = 6;

export function forCells(grid: Grid, x0: number, y0: number, x1: number, y1: number, fn: (i: number) => void) {
  const { g, gw, gh } = grid;
  const c0 = Math.max(0, Math.ceil((x0 - grid.x0) / g - 0.5)),
    c1 = Math.min(gw - 1, Math.floor((x1 - grid.x0) / g - 0.5));
  const r0 = Math.max(0, Math.ceil((y0 - grid.y0) / g - 0.5)),
    r1 = Math.min(gh - 1, Math.floor((y1 - grid.y0) / g - 0.5));
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) fn(r * gw + c);
}

export function cellOf(grid: Grid, x: number, y: number) {
  const c = Math.max(0, Math.min(grid.gw - 1, Math.round((x - grid.x0) / grid.g - 0.5)));
  const r = Math.max(0, Math.min(grid.gh - 1, Math.round((y - grid.y0) / grid.g - 0.5)));
  return r * grid.gw + c;
}

export function cellXY(grid: Grid, i: number): [number, number] {
  const r = (i / grid.gw) | 0,
    c = i - r * grid.gw;
  return [grid.x0 + (c + 0.5) * grid.g, grid.y0 + (r + 0.5) * grid.g];
}

export const obstaclesOf = (d: EventData): Blocker[] => [...d.booths, ...d.pillars, ...d.event.obstacles];

export function createGrid(venue: Venue, blockers: Blocker[]): Grid {
  const g = venue.gridCell,
    v = venue.view;
  const gw = Math.ceil(v.w / g),
    gh = Math.ceil(v.h / g),
    n = gw * gh;
  const grid: Grid = {
    walk: new Uint8Array(n),
    clear: new Uint8Array(n),
    doorCell: new Int16Array(n).fill(-1),
    gw,
    gh,
    x0: v.x,
    y0: v.y,
    g,
  };
  const set = (b: number[], val: number) =>
    forCells(grid, b[0], b[1], b[2], b[3], (i) => {
      grid.walk[i] = val;
    });
  const block = (r: Rect) => set([r.x - PAD, r.y - PAD, r.x + r.w + PAD, r.y + r.h + PAD], 0);

  for (const f of venue.floor) set(f.box, f.op === 'add' ? 1 : 0);
  venue.doors.forEach((d, k) =>
    forCells(grid, ...d.punch, (i) => {
      grid.walk[i] = 1;
      grid.doorCell[i] = k;
    }),
  );
  for (const o of blockers) {
    block(o);
    for (const e of o.extra ?? []) block(e);
  }

  const q = new Int32Array(n);
  let head = 0,
    tail = 0;
  grid.clear.fill(255);
  for (let i = 0; i < n; i++)
    if (!grid.walk[i]) {
      grid.clear[i] = 0;
      q[tail++] = i;
    }
  while (head < tail) {
    const i = q[head++],
      d = grid.clear[i];
    if (d >= MAX_CLEAR) continue;
    const r = (i / gw) | 0,
      c = i - r * gw;
    for (const [dr, dc] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const rr = r + dr,
        cc = c + dc;
      if (rr < 0 || cc < 0 || rr >= gh || cc >= gw) continue;
      const j = rr * gw + cc;
      if (grid.clear[j] > d + 1) {
        grid.clear[j] = d + 1;
        q[tail++] = j;
      }
    }
  }
  return grid;
}

export function nearestWalkable(grid: Grid, x: number, y: number): number {
  const s = cellOf(grid, x, y);
  if (grid.walk[s]) return s;
  const r0 = (s / grid.gw) | 0,
    c0 = s % grid.gw;
  for (let rad = 1; rad < 40; rad++) {
    let best = -1,
      bd = Infinity;
    for (let r = r0 - rad; r <= r0 + rad; r++)
      for (let c = c0 - rad; c <= c0 + rad; c++) {
        if (r < 0 || c < 0 || r >= grid.gh || c >= grid.gw) continue;
        const j = r * grid.gw + c;
        if (!grid.walk[j]) continue;
        const [jx, jy] = cellXY(grid, j),
          d = (jx - x) ** 2 + (jy - y) ** 2;
        if (d < bd) {
          bd = d;
          best = j;
        }
      }
    if (best >= 0) return best;
  }
  return -1;
}
