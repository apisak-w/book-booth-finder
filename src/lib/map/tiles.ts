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
