import { areaAt } from './geometry';
import { cellOf, cellXY, forCells, nearestWalkable, type Grid } from './grid';
import { WALK_M_PER_MIN, type Dest, type Landmark, type Point, type RouteResult, type Venue } from './types';

function goalCells(grid: Grid, dest: Dest): Set<number> {
  const set = new Set<number>();
  if (dest.kind === 'booth') {
    const b = dest.b;
    for (const e of [16, 30, 48]) {
      forCells(grid, b.x - e, b.y - e, b.x + b.w + e, b.y + b.h + e, (i) => {
        if (grid.walk[i]) set.add(i);
      });
      if (set.size) break;
    }
  } else {
    const i = nearestWalkable(grid, dest.lm.x, dest.lm.y);
    if (i >= 0) set.add(i);
  }
  return set;
}

function astar(grid: Grid, start: number, goals: Set<number>): number[] | null {
  const { walk, clear, gw, gh, g: G } = grid,
    n = gw * gh;
  const g = new Float32Array(n).fill(Infinity),
    came = new Int32Array(n).fill(-1),
    closed = new Uint8Array(n);
  let targets = [...goals].map((i) => cellXY(grid, i));
  if (targets.length > 40) {
    const xs = targets.map((t) => t[0]),
      ys = targets.map((t) => t[1]);
    const [ax, bx, ay, by] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    targets = [
      [ax, ay],
      [bx, by],
      [ax, by],
      [bx, ay],
    ];
  }
  const h = (i: number) => {
    const [x, y] = cellXY(grid, i);
    let m = Infinity;
    for (const [tx, ty] of targets) {
      const dx = Math.abs(tx - x) / G,
        dy = Math.abs(ty - y) / G;
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
    const top = heap[0],
      last = heap.pop()!;
    if (heap.length) {
      heap[0] = last;
      let k = 0;
      for (;;) {
        const l = 2 * k + 1,
          r = l + 1;
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
    const r = (i / gw) | 0,
      c = i - r * gw;
    for (let dr = -1; dr <= 1; dr++)
      for (let dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue;
        const rr = r + dr,
          cc = c + dc;
        if (rr < 0 || cc < 0 || rr >= gh || cc >= gw) continue;
        const j = rr * gw + cc;
        if (!walk[j] || closed[j]) continue;
        if (dr && dc && (!walk[r * gw + cc] || !walk[rr * gw + c])) continue;
        const ng = g[i] + (dr && dc ? Math.SQRT2 : 1) * cost(j);
        if (ng < g[j]) {
          g[j] = ng;
          came[j] = i;
          push(ng + h(j), j);
        }
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
  const s = nearestWalkable(grid, start.x, start.y),
    goals = goalCells(grid, dest);
  if (s < 0 || !goals.size) return { fail: true };
  const path = astar(grid, s, goals);
  if (!path) return { fail: true };

  const doorsUsed: number[] = [],
    areas: string[] = [];
  for (const i of path) {
    const k = grid.doorCell[i];
    if (k >= 0 && !doorsUsed.includes(k)) doorsUsed.push(k);
    const a = areaAt(venue, ...cellXY(grid, i));
    if (a && areas[areas.length - 1] !== a) areas.push(a);
  }
  const P = stringPull(
    grid,
    path.map((i) => cellXY(grid, i)),
  );
  P.unshift([start.x, start.y]);
  const [lx, ly] = P[P.length - 1];
  if (dest.kind === 'booth') {
    const b = dest.b;
    P.push([Math.max(b.x, Math.min(b.x + b.w, lx)), Math.max(b.y, Math.min(b.y + b.h, ly))]);
  } else P.push([dest.lm.x, dest.lm.y]);

  let len = 0;
  for (let k = 1; k < P.length; k++) len += Math.hypot(P[k][0] - P[k - 1][0], P[k][1] - P[k - 1][1]);
  const m = len * venue.metersPerPx;
  return {
    P,
    len,
    meters: Math.max(5, Math.round(m / 5) * 5),
    minutes: Math.max(1, Math.round(m / WALK_M_PER_MIN)),
    doorsUsed,
    areas,
  };
}
