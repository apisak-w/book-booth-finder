import { norm360 } from './geo';

export function norm180(d: number): number {
  const r = norm360(d + 180) - 180;
  return r === -180 ? 180 : r;
}

export const turnAngle = (northDeg: number, heading: number) => norm180(-(northDeg + heading));

export const smoothAngle = (prev: number | null, next: number, k = 0.25) =>
  prev === null ? next : norm360(prev + norm180(next - prev) * k);

export function headingFrom(
  e: { webkitCompassHeading?: number | null; alpha: number | null; absolute?: boolean },
  screenAngle = 0,
): number | null {
  if (typeof e.webkitCompassHeading === 'number') return norm360(e.webkitCompassHeading + screenAngle);
  if (e.absolute && typeof e.alpha === 'number') return norm360(360 - e.alpha + screenAngle);
  return null;
}
