import { FIT_Z } from '../core/geo';
import type { LatLng, Point } from '../core/types';

export const OSM_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
export const OSM_CREDIT = '© OpenStreetMap contributors';
export const OSM_MIN_Z = 15;
export const OSM_MAX_Z = 19;

export type OsmTile = { key: string; href: string; x: number; y: number; size: number };

export function osmTiles(c: Point, z: number, w: number, h: number): OsmTile[] {
  const s = 2 ** (FIT_Z - z),
    size = 256 * s,
    n = 2 ** z;
  const x0 = Math.floor((c[0] - (w * s) / 2) / size),
    x1 = Math.floor((c[0] + (w * s) / 2) / size);
  const y0 = Math.max(0, Math.floor((c[1] - (h * s) / 2) / size)),
    y1 = Math.min(n - 1, Math.floor((c[1] + (h * s) / 2) / size));
  const out: OsmTile[] = [];
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      const wrapped = ((x % n) + n) % n;
      out.push({
        key: `${z}/${x}/${y}`,
        href: OSM_URL.replace('{z}', String(z)).replace('{x}', String(wrapped)).replace('{y}', String(y)),
        x: x * size,
        y: y * size,
        size,
      });
    }
  return out;
}

export function screenToWorld(c: Point, z: number, w: number, h: number, [sx, sy]: Point): Point {
  const s = 2 ** (FIT_Z - z);
  return [c[0] + (sx - w / 2) * s, c[1] + (sy - h / 2) * s];
}

export function parseLatLng(text: string): LatLng | null {
  const m = text.match(/(-?\d{1,3}(?:\.\d+)?)\s*[,\s]\s*(-?\d{1,3}(?:\.\d+)?)/);
  if (!m) return null;
  const lat = Number(m[1]),
    lng = Number(m[2]);
  return Math.abs(lat) <= 85 && Math.abs(lng) <= 180 ? { lat, lng } : null;
}
