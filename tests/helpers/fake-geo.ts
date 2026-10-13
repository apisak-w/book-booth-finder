import type { GeoPin, LatLng } from '../../src/lib/core/types';

export const LAT0 = 13.7236;
export const LNG0 = 100.5597;
export const M = 0.1016949152542373;
const M_PER_DEG = (2 * Math.PI * 6378137) / 360;

export function fakeLatLng(x: number, y: number): LatLng {
  const east = -(x - 1400) * M,
    north = (y - 900) * M;
  return { lat: LAT0 + north / M_PER_DEG, lng: LNG0 + east / (M_PER_DEG * Math.cos((LAT0 * Math.PI) / 180)) };
}

export const fakePins = (
  pts: [string, number, number][] = [
    ['a', 446, 280],
    ['b', 2391, 280],
    ['c', 2391, 1440],
    ['d', 446, 1464],
  ],
): GeoPin[] => pts.map(([id, x, y]) => ({ id, x, y, ...fakeLatLng(x, y) }));
