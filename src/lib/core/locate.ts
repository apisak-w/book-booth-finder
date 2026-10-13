import { areaAt, pointInPolygon } from './geometry';
import { latLngToPlan, type Georef } from './geo';
import type { EventData, Landmark, LatLng, Point, Venue } from './types';

export const FAR_M = 1500;
export const ARRIVE_M = 30;
export const WEAK_M = 100;

export type Fix = LatLng & { accuracy: number };
export type Where =
  | { kind: 'weak' }
  | { kind: 'far'; meters: number }
  | { kind: 'inside'; p: Point; hall: string | null }
  | { kind: 'arrived'; entrance: Landmark }
  | { kind: 'outside'; p: Point; accuracyPx: number; entrance: Landmark; meters: number };

export function streetEntrances(data: EventData): Landmark[] {
  const ids = data.venue.geo?.entrances;
  if (!ids) return data.landmarks.filter((l) => l.group === 'entry');
  return ids.map((id) => data.landmarkById[id]).filter((l): l is Landmark => !!l);
}

export function pickEntrance(
  p: Point,
  entrances: Landmark[],
  indoorM: Record<string, number> | null,
  mPerPx: number,
): { entrance: Landmark; meters: number } | null {
  let best: { entrance: Landmark; meters: number } | null = null,
    cost = Infinity;
  for (const e of entrances) {
    const inside = indoorM ? indoorM[e.id] : 0;
    if (inside === undefined) continue;
    const out = Math.hypot(e.x - p[0], e.y - p[1]) * mPerPx;
    if (out + inside < cost) {
      cost = out + inside;
      best = { entrance: e, meters: Math.round(out) };
    }
  }
  return best ?? (indoorM ? pickEntrance(p, entrances, null, mPerPx) : null);
}

export function classify(fix: Fix, data: EventData, g: Georef, indoorM: Record<string, number> | null = null): Where {
  if (fix.accuracy > WEAK_M) return { kind: 'weak' };
  const v = data.venue,
    p = latLngToPlan(g, fix);
  if (v.walls.some((w) => pointInPolygon(p[0], p[1], w))) return { kind: 'inside', p, hall: areaAt(v, p[0], p[1]) };
  const pick = pickEntrance(p, streetEntrances(data), indoorM, v.metersPerPx);
  if (!pick) return { kind: 'weak' };
  if (pick.meters > FAR_M) return { kind: 'far', meters: pick.meters };
  if (pick.meters <= ARRIVE_M) return { kind: 'arrived', entrance: pick.entrance };
  return { kind: 'outside', p, accuracyPx: fix.accuracy / v.metersPerPx, entrance: pick.entrance, meters: pick.meters };
}

export function hallChoices(v: Venue, guess: string | null): string[] {
  const ids = v.areas.map((a) => a.id),
    k = guess ? ids.indexOf(guess) : -1;
  return k < 0 ? ids : ids.slice(Math.max(0, k - 1), k + 2);
}

export function hallStart(data: EventData, hall: string): string | null {
  const door = data.venue.doors.find((d) => d.area === hall && data.landmarkById[d.id]);
  if (door) return door.id;
  return data.landmarks.find((l) => areaAt(data.venue, l.x, l.y) === hall)?.id ?? null;
}
