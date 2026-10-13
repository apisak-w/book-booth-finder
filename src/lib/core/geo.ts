import type { GeoPin, LatLng, Point } from './types';

export type Affine = [number, number, number, number, number, number];
export type Georef = {
  toWorld: Affine;
  toPlan: Affine;
  scale: number;
  mPerPx: number;
  aspect: number;
  skewDeg: number;
  mirrored: boolean;
  residualM: number;
  northDeg: number;
};

export const TILE = 256;
export const FIT_Z = 20;
const R = 6378137;
const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

export const norm360 = (d: number) => ((d % 360) + 360) % 360 || 0;

export function worldPx(lat: number, lng: number, z = FIT_Z): Point {
  const s = TILE * 2 ** z,
    r = rad(lat);
  return [((lng + 180) / 360) * s, ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * s];
}

export function latLngOf([x, y]: Point, z = FIT_Z): LatLng {
  const s = TILE * 2 ** z;
  return { lat: deg(Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / s)))), lng: (x / s) * 360 - 180 };
}

export const metersPerWorldPx = (lat: number, z = FIT_Z) => (Math.cos(rad(lat)) * 2 * Math.PI * R) / (TILE * 2 ** z);

export const apply = (m: Affine, [x, y]: Point): Point => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

export function invert(m: Affine): Affine {
  const [a, b, c, d, e, f] = m,
    det = a * d - b * c;
  return [d / det, -b / det, -c / det, a / det, (c * f - d * e) / det, (b * e - a * f) / det];
}

export function fitAffine(src: Point[], dst: Point[]): Affine {
  const n = src.length;
  const mean = (ps: Point[], k: 0 | 1) => ps.reduce((s, p) => s + p[k], 0) / n;
  const mx = mean(src, 0),
    my = mean(src, 1),
    MX = mean(dst, 0),
    MY = mean(dst, 1);
  let sxx = 0,
    sxy = 0,
    syy = 0,
    sxX = 0,
    syX = 0,
    sxY = 0,
    syY = 0;
  for (let k = 0; k < n; k++) {
    const x = src[k][0] - mx,
      y = src[k][1] - my,
      X = dst[k][0] - MX,
      Y = dst[k][1] - MY;
    sxx += x * x;
    sxy += x * y;
    syy += y * y;
    sxX += x * X;
    syX += y * X;
    sxY += x * Y;
    syY += y * Y;
  }
  const det = sxx * syy - sxy * sxy;
  if (n < 3 || sxx === 0 || syy === 0 || Math.abs(det) <= 1e-9 * sxx * syy)
    throw new Error('map pins must be at least 3 points that are not in a line');
  const a = (sxX * syy - sxy * syX) / det,
    c = (sxx * syX - sxy * sxX) / det,
    b = (sxY * syy - sxy * syY) / det,
    d = (sxx * syY - sxy * sxY) / det;
  return [a, b, c, d, MX - a * mx - c * my, MY - b * mx - d * my];
}

export function georef(pins: GeoPin[]): Georef {
  const src = pins.map((p): Point => [p.x, p.y]),
    dst = pins.map((p) => worldPx(p.lat, p.lng));
  const toWorld = fitAffine(src, dst),
    toPlan = invert(toWorld);
  const [a, b, c, d] = toWorld;
  const det = a * d - b * c,
    scale = Math.sqrt(Math.abs(det));
  const n1 = Math.hypot(a, b),
    n2 = Math.hypot(c, d);
  const lat0 = pins.reduce((s, p) => s + p.lat, 0) / pins.length;
  const mw = metersPerWorldPx(lat0);
  const sq = src.reduce((s, p, k) => {
    const [X, Y] = apply(toWorld, p);
    return s + (X - dst[k][0]) ** 2 + (Y - dst[k][1]) ** 2;
  }, 0);
  const nx = -toPlan[2],
    ny = -toPlan[3];
  return {
    toWorld,
    toPlan,
    scale,
    mPerPx: scale * mw,
    aspect: Math.min(n1, n2) / Math.max(n1, n2),
    skewDeg: Math.abs(90 - deg(Math.acos((a * c + b * d) / (n1 * n2)))),
    mirrored: det < 0,
    residualM: Math.sqrt(sq / pins.length) * mw,
    northDeg: norm360(deg(Math.atan2(nx, -ny))),
  };
}

export const latLngToPlan = (g: Georef, ll: LatLng): Point => apply(g.toPlan, worldPx(ll.lat, ll.lng));
export const planToLatLng = (g: Georef, p: Point): LatLng => latLngOf(apply(g.toWorld, p));

const M_PER_DEG = (2 * Math.PI * R) / 360;

export function metersBetween(a: LatLng, b: LatLng): number {
  const k = Math.cos(rad((a.lat + b.lat) / 2));
  return Math.hypot((b.lat - a.lat) * M_PER_DEG, (b.lng - a.lng) * M_PER_DEG * k);
}

export function pinProblems(pins: GeoPin[], metersPerPx: number): string[] {
  if (pins.length < 3) return ['needs at least 3 map pins'];
  const g = georef(pins),
    out: string[] = [];
  const off = g.mPerPx / metersPerPx - 1;
  if (g.mirrored) out.push('the fit is mirrored');
  if (Math.abs(off) >= 0.05) out.push(`scale is ${(off * 100).toFixed(1)}% off metersPerPx`);
  if (g.aspect <= 0.88) out.push(`the fit is stretched (aspect ${g.aspect.toFixed(3)})`);
  if (g.skewDeg >= 3) out.push(`the fit is skewed by ${g.skewDeg.toFixed(1)}°`);
  if (pins.length >= 4 && g.residualM >= 5) out.push(`fit error is ${g.residualM.toFixed(1)} m`);
  return out;
}
