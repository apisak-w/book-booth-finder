import {
  components,
  crop,
  erode2,
  farFromColour,
  gray,
  median,
  modeColour,
  openLine,
  type Mask,
  type RGB,
} from './image';
import type { Box, Rect, Venue } from '../../../src/lib/core/types';
import { toPlan, type Transform } from './register';

export type DetectParams = {
  roi: Box;
  floor: [number, number, number];
  threshold: number;
  lineLength: number;
  lighterDelta: number;
  minIsland: number;
  minCell: { w: number; h: number; area: number };
  exclude: Box[];
};

export type Cell = Rect & { rgb: [number, number, number]; inner?: Rect; outer?: [number, number, number] };

export function defaultDetectParams(img: RGB, venue: Venue, t: Transform): DetectParams {
  const hall = venue.walls[0];
  const [x0, y0] = toPlan(t, [Math.min(...hall.map((p) => p[0])), Math.min(...hall.map((p) => p[1]))]);
  const [x1, y1] = toPlan(t, [Math.max(...hall.map((p) => p[0])), Math.max(...hall.map((p) => p[1]))]);
  const roi: Box = [
    Math.max(0, Math.round(x0)),
    Math.max(0, Math.round(y0)),
    Math.min(img.width, Math.round(x1)),
    Math.min(img.height, Math.round(y1)),
  ];
  return {
    roi,
    floor: modeColour(crop(img, roi)),
    threshold: 55,
    lineLength: 18,
    lighterDelta: 35,
    minIsland: 18,
    minCell: { w: 14, h: 12, area: 200 },
    exclude: [],
  };
}

export function detectCells(img: RGB, p: DetectParams): Cell[] {
  const roi = crop(img, p.roi),
    W = roi.width,
    H = roi.height;
  const coloured = farFromColour(roi, p.floor, p.threshold);
  const g = gray(roi);
  const { labels, stats } = components(coloured);
  const lines = new Uint8Array(W * H),
    blocks: Rect[] = [];

  for (let id = 1; id < stats.length; id++) {
    const { x, y, w, h } = stats[id];
    if (w < p.minIsland || h < p.minIsland) continue;
    blocks.push({ x, y, w, h });
    const inIsland = (i: number) => labels[i] === id;
    const vals: number[] = [];
    for (let yy = y; yy < y + h; yy++)
      for (let xx = x; xx < x + w; xx++) if (inIsland(yy * W + xx)) vals.push(g[yy * W + xx]);
    const base = median(vals);
    const lighter: Mask = { width: w, height: h, data: new Uint8Array(w * h) };
    for (let yy = 0; yy < h; yy++)
      for (let xx = 0; xx < w; xx++) {
        const i = (y + yy) * W + (x + xx);
        lighter.data[yy * w + xx] = g[i] > base + p.lighterDelta || !inIsland(i) ? 1 : 0;
      }
    const vl = openLine(lighter, p.lineLength, 'v'),
      hl = openLine(lighter, p.lineLength, 'h');
    for (let yy = 0; yy < h; yy++)
      for (let xx = 0; xx < w; xx++) {
        const i = (y + yy) * W + (x + xx),
          k = yy * w + xx;
        if ((vl.data[k] || hl.data[k]) && inIsland(i)) lines[i] = 1;
        if (!inIsland(i)) lines[i] = 1;
      }
  }

  const cell: Mask = { width: W, height: H, data: new Uint8Array(W * H) };
  for (const b of blocks) for (let yy = b.y; yy < b.y + b.h; yy++) cell.data.fill(1, yy * W + b.x, yy * W + b.x + b.w);
  for (let i = 0; i < W * H; i++) cell.data[i] &= 1 - lines[i];
  const eroded = erode2(cell);
  const cc = components(eroded);

  const [ox, oy] = p.roi;
  const cells: Cell[] = [];
  for (let id = 1; id < cc.stats.length; id++) {
    const { x, y, w, h, area } = cc.stats[id];
    if (w < p.minCell.w || h < p.minCell.h || area < p.minCell.area) continue;
    const gx = x + ox,
      gy = y + oy;
    if (p.exclude.some(([a, b, c, d]) => a < gx && gx < c && b < gy && gy < d)) continue;
    const rs: number[] = [],
      gs: number[] = [],
      bs: number[] = [];
    for (let yy = y; yy < y + h; yy++)
      for (let xx = x; xx < x + w; xx++)
        if (cc.labels[yy * W + xx] === id) {
          const i = (yy * W + xx) * 3;
          rs.push(roi.data[i]);
          gs.push(roi.data[i + 1]);
          bs.push(roi.data[i + 2]);
        }
    const c: Cell = {
      x: gx,
      y: gy,
      w,
      h,
      rgb: [Math.trunc(median(rs)), Math.trunc(median(gs)), Math.trunc(median(bs))],
    };
    const white = whiteSquare(img, c);
    if (white) Object.assign(c, white);
    cells.push(c);
  }
  cells.sort((a, b) => a.x - b.x || a.y - b.y);
  return cells;
}

function whiteSquare(img: RGB, c: Rect): { inner: Rect; outer: [number, number, number] } | null {
  let x0 = Infinity,
    y0 = Infinity,
    x1 = -1,
    y1 = -1;
  const rs: number[] = [],
    gs: number[] = [],
    bs: number[] = [];
  for (let y = c.y; y < c.y + c.h; y++)
    for (let x = c.x; x < c.x + c.w; x++) {
      const i = (y * img.width + x) * 3,
        r = img.data[i],
        g = img.data[i + 1],
        b = img.data[i + 2];
      if (Math.min(r, g, b) > 225) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      } else {
        rs.push(r);
        gs.push(g);
        bs.push(b);
      }
    }
  if (x1 < 0) return null;
  return {
    inner: { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 },
    outer: [Math.trunc(median(rs)), Math.trunc(median(gs)), Math.trunc(median(bs))],
  };
}
