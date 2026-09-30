// Walking-route engine. No DOM access: runs in the browser and in `node --test`.
//
// 1. Rasterise the venue into a grid (GRID_CELL px per cell): walkable areas on,
//    booths / pillars / desks / stage off, doors punched through the walls.
// 2. Clearance = distance to the nearest blocked cell. Cells hugging booths cost
//    more, so routes run down the middle of aisles.
// 3. 8-way A* from the start cell to any walkable cell near the destination.
// 4. String-pull the cell path into a few straight segments (line of sight).

import { VIEW, GRID_CELL as G, WALKABLE, RECESSES, DOORS, INFO_DESKS, STAGE, HALL_SPLITS, M_PER_PX, WALK_M_PER_MIN } from './config.js';

const X0 = VIEW.x, Y0 = VIEW.y;
const GW = Math.ceil(VIEW.w / G), GH = Math.ceil(VIEW.h / G);
const BOOTH_PAD = 2; // px kept clear around every obstacle

/** Hall number at a point, or null for the foyer / MRT corridor. */
export function hallAt(x, y) {
  if (y > 1466) return null;
  const inBay = (y > 556 && y < 772) || (y > 976 && y < 1205);
  if (x < 446 && !inBay) return null;
  return HALL_SPLITS.find((s) => x < s.maxX).hall;
}

export function createGrid({ booths, pillars }) {
  const N = GW * GH;
  const walk = new Uint8Array(N), clear = new Uint8Array(N), doorCell = new Int8Array(N).fill(-1);

  const cells = (x0, y0, x1, y1, fn) => {
    const c0 = Math.max(0, Math.ceil((x0 - X0) / G - 0.5)), c1 = Math.min(GW - 1, Math.floor((x1 - X0) / G - 0.5));
    const r0 = Math.max(0, Math.ceil((y0 - Y0) / G - 0.5)), r1 = Math.min(GH - 1, Math.floor((y1 - Y0) / G - 0.5));
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) fn(r * GW + c);
  };
  const set = (x0, y0, x1, y1, v) => cells(x0, y0, x1, y1, (i) => { walk[i] = v; });
  const block = (x, y, w, h) => set(x - BOOTH_PAD, y - BOOTH_PAD, x + w + BOOTH_PAD, y + h + BOOTH_PAD, 0);

  set(...WALKABLE.hall, 1);
  for (const [a, b] of RECESSES) { set(a, 1436, b, 1470, 0); set(a, 1446, b, 1470, 1); } // set-back wall + foyer pocket
  WALKABLE.sideBays.forEach((r) => set(...r, 1));
  WALKABLE.mrtCorridor.forEach((r) => set(...r, 1));
  set(...WALKABLE.foyer, 1);
  DOORS.forEach((d, k) => {
    const mark = (i) => { walk[i] = 1; doorCell[i] = k; };
    if (d.id === 'west') cells(436, 848, 456, 912, mark);
    else cells(d.x - 30, 1430, d.x + 30, 1474, mark);
  });
  booths.forEach((b) => { block(b.x, b.y, b.w, b.h); (b.extra || []).forEach((e) => block(...e)); });
  pillars.forEach((p) => block(p.x, p.y, p.w, p.h));
  INFO_DESKS.forEach(([x, y, w, h]) => block(x, y, w, h));
  block(...STAGE);

  // clearance via multi-source BFS, capped at 6
  const q = new Int32Array(N); let head = 0, tail = 0;
  clear.fill(255);
  for (let i = 0; i < N; i++) if (!walk[i]) { clear[i] = 0; q[tail++] = i; }
  while (head < tail) {
    const i = q[head++], d = clear[i]; if (d >= 6) continue;
    const r = (i / GW) | 0, c = i - r * GW;
    for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const rr = r + dr, cc = c + dc; if (rr < 0 || cc < 0 || rr >= GH || cc >= GW) continue;
      const j = rr * GW + cc; if (clear[j] > d + 1) { clear[j] = d + 1; q[tail++] = j; }
    }
  }
  return { walk, clear, doorCell, cells };
}

const cellOf = (x, y) => {
  const c = Math.max(0, Math.min(GW - 1, Math.round((x - X0) / G - 0.5)));
  const r = Math.max(0, Math.min(GH - 1, Math.round((y - Y0) / G - 0.5)));
  return r * GW + c;
};
const cellXY = (i) => { const r = (i / GW) | 0, c = i - r * GW; return [X0 + (c + 0.5) * G, Y0 + (r + 0.5) * G]; };

export function nearestWalkable(grid, x, y) {
  const s = cellOf(x, y); if (grid.walk[s]) return s;
  const r0 = (s / GW) | 0, c0 = s % GW;
  for (let rad = 1; rad < 40; rad++) {
    let best = -1, bd = Infinity;
    for (let r = r0 - rad; r <= r0 + rad; r++) for (let c = c0 - rad; c <= c0 + rad; c++) {
      if (r < 0 || c < 0 || r >= GH || c >= GW) continue;
      const j = r * GW + c; if (!grid.walk[j]) continue;
      const [jx, jy] = cellXY(j), d = (jx - x) ** 2 + (jy - y) ** 2;
      if (d < bd) { bd = d; best = j; }
    }
    if (best >= 0) return best;
  }
  return -1;
}

/** Cells that count as "arrived". Booths: any aisle cell next to the booth, widening if boxed in. */
function goalCells(grid, dest) {
  const set = new Set();
  if (dest.kind === 'booth') {
    const b = dest.b;
    for (const e of [16, 30, 48]) {
      grid.cells(b.x - e, b.y - e, b.x + b.w + e, b.y + b.h + e, (i) => { if (grid.walk[i]) set.add(i); });
      if (set.size) break;
    }
  } else {
    const i = nearestWalkable(grid, dest.lm.x, dest.lm.y); if (i >= 0) set.add(i);
  }
  return set;
}

function astar(grid, start, goals) {
  const { walk, clear } = grid, N = GW * GH;
  const g = new Float32Array(N).fill(Infinity), came = new Int32Array(N).fill(-1), closed = new Uint8Array(N);
  let targets = [...goals].map(cellXY);
  if (targets.length > 40) { // bounding-box corners keep the heuristic cheap and admissible enough
    const xs = targets.map((t) => t[0]), ys = targets.map((t) => t[1]);
    const [ax, bx, ay, by] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    targets = [[ax, ay], [bx, by], [ax, by], [bx, ay]];
  }
  const h = (i) => {
    const [x, y] = cellXY(i); let m = Infinity;
    for (const [tx, ty] of targets) {
      const dx = Math.abs(tx - x) / G, dy = Math.abs(ty - y) / G;
      m = Math.min(m, Math.max(dx, dy) + 0.4142 * Math.min(dx, dy));
    }
    return m;
  };
  const cost = (i) => 1 + Math.max(0, 3 - clear[i]) * 0.9;
  const heap = [];
  const push = (f, i) => { heap.push([f, i]); let k = heap.length - 1; while (k > 0) { const p = (k - 1) >> 1; if (heap[p][0] <= heap[k][0]) break; [heap[p], heap[k]] = [heap[k], heap[p]]; k = p; } };
  const pop = () => {
    const top = heap[0], last = heap.pop();
    if (heap.length) {
      heap[0] = last; let k = 0;
      for (;;) { const l = 2 * k + 1, r = l + 1; let m = k; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === k) break; [heap[m], heap[k]] = [heap[k], heap[m]]; k = m; }
    }
    return top;
  };
  g[start] = 0; push(h(start), start);
  while (heap.length) {
    const [, i] = pop(); if (closed[i]) continue; closed[i] = 1;
    if (goals.has(i)) { const path = []; for (let k = i; k >= 0; k = came[k]) path.push(k); return path.reverse(); }
    const r = (i / GW) | 0, c = i - r * GW;
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      if (!dr && !dc) continue;
      const rr = r + dr, cc = c + dc; if (rr < 0 || cc < 0 || rr >= GH || cc >= GW) continue;
      const j = rr * GW + cc; if (!walk[j] || closed[j]) continue;
      if (dr && dc && (!walk[r * GW + cc] || !walk[rr * GW + c])) continue; // no corner cutting
      const ng = g[i] + (dr && dc ? Math.SQRT2 : 1) * cost(j);
      if (ng < g[j]) { g[j] = ng; came[j] = i; push(ng + h(j), j); }
    }
  }
  return null;
}

function lineOfSight(grid, ax, ay, bx, by) {
  const n = Math.ceil(Math.hypot(bx - ax, by - ay) / (G / 2));
  for (let k = 1; k < n; k++) {
    const i = cellOf(ax + ((bx - ax) * k) / n, ay + ((by - ay) * k) / n);
    if (!grid.walk[i] || grid.clear[i] < 2) return false;
  }
  return true;
}
function stringPull(grid, pts) {
  if (pts.length < 3) return pts;
  const out = [pts[0]]; let a = 0;
  while (a < pts.length - 1) {
    let b = pts.length - 1;
    while (b > a + 1 && !lineOfSight(grid, ...pts[a], ...pts[b])) b--;
    out.push(pts[b]); a = b;
  }
  return out;
}

/**
 * @param start landmark {id, x, y}
 * @param dest {kind:'booth', b} | {kind:'place', lm}
 * @returns {{P:number[][], len:number, meters:number, minutes:number, doorsUsed:number[], halls:number[]}|{same:true}|{fail:true}}
 */
export function findRoute(grid, start, dest) {
  if (dest.kind === 'place' && dest.lm.id === start.id) return { same: true };
  const s = nearestWalkable(grid, start.x, start.y), goals = goalCells(grid, dest);
  if (s < 0 || !goals.size) return { fail: true };
  const path = astar(grid, s, goals);
  if (!path) return { fail: true };

  const doorsUsed = [], halls = [];
  for (const i of path) {
    const k = grid.doorCell[i]; if (k >= 0 && !doorsUsed.includes(k)) doorsUsed.push(k);
    const hl = hallAt(...cellXY(i)); if (hl && halls[halls.length - 1] !== hl) halls.push(hl);
  }
  const P = stringPull(grid, path.map(cellXY));
  P.unshift([start.x, start.y]);
  const [lx, ly] = P[P.length - 1];
  if (dest.kind === 'booth') {
    const b = dest.b; P.push([Math.max(b.x, Math.min(b.x + b.w, lx)), Math.max(b.y, Math.min(b.y + b.h, ly))]);
  } else P.push([dest.lm.x, dest.lm.y]);

  let len = 0; for (let k = 1; k < P.length; k++) len += Math.hypot(P[k][0] - P[k - 1][0], P[k][1] - P[k - 1][1]);
  const m = len * M_PER_PX;
  return { P, len, meters: Math.max(5, Math.round(m / 5) * 5), minutes: Math.max(1, Math.round(m / WALK_M_PER_MIN)), doorsUsed, halls };
}
