import type { I18n, Point, Venue } from './types';

export function pointInPolygon(x: number, y: number, poly: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i],
      [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function areaAt(venue: Venue, x: number, y: number): string | null {
  for (const a of venue.areas) if (pointInPolygon(x, y, a.bounds)) return a.id;
  return null;
}

export function areaName(venue: Venue, id: string | null): I18n {
  return venue.areas.find((a) => a.id === id)?.name ?? venue.outside;
}
