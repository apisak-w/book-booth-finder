import { georef, latLngToPlan, metersBetween, pinProblems, planToLatLng } from './geo';
import { areaAt } from './geometry';
import { todayIn } from './status';
import type { SpotKind } from './spots';
import type { Area, GeoPin, LatLng } from './types';

export type StoredSpot = {
  event: string;
  kind: SpotKind;
  place: string;
  lat: number;
  lng: number;
  accuracy: number;
  hour: string;
};
export type Filters = { accuracy: boolean; near: boolean; eventDays: boolean };
export type EventDays = Record<string, { start: string; end: string; tz: string }>;
export type PlaceReview = {
  pin: LatLng;
  good: StoredSpot[];
  left: StoredSpot[];
  middle: LatLng | null;
  spreadM: number;
  offsetM: number;
  status: 'few' | 'move' | 'right';
};
export type DoorStatus = PlaceReview['status'] | 'kept';
export type HallCheck = { inside: StoredSpot[]; elsewhere: number; topArea: string | null; flagged: boolean };
type PinPlace = { id: string; x: number; y: number };

export const ALL_FILTERS: Filters = { accuracy: true, near: true, eventDays: true };
export const GOOD_ACCURACY_M = 15;
export const NEAR_PIN_M = 100;
export const MIN_SPOTS = 5;
export const MIN_MOVE_M = 5;

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b),
    k = s.length >> 1;
  return s.length % 2 ? s[k] : (s[k - 1] + s[k]) / 2;
};
const round7 = (v: number) => Math.round(v * 1e7) / 1e7;

export const spotDay = (hour: string, tz: string) => todayIn(tz, new Date(`${hour}:00:00Z`));
export const entrancePin = (pins: GeoPin[], p: { x: number; y: number }): LatLng =>
  planToLatLng(georef(pins), [p.x, p.y]);

export function reviewDoor(spots: StoredSpot[], pin: LatLng, filters: Filters, days: EventDays): PlaceReview {
  const good: StoredSpot[] = [],
    left: StoredSpot[] = [];
  for (const s of spots) {
    const d = days[s.event],
      day = d ? spotDay(s.hour, d.tz) : '';
    const ok =
      (!filters.accuracy || s.accuracy <= GOOD_ACCURACY_M) &&
      (!filters.near || metersBetween(s, pin) <= NEAR_PIN_M) &&
      (!filters.eventDays || (!!d && day >= d.start && day <= d.end));
    (ok ? good : left).push(s);
  }
  if (!good.length) return { pin, good, left, middle: null, spreadM: 0, offsetM: 0, status: 'few' };
  const middle = { lat: median(good.map((s) => s.lat)), lng: median(good.map((s) => s.lng)) };
  const spreadM = median(good.map((s) => metersBetween(s, middle)));
  const offsetM = metersBetween(middle, pin);
  const status = good.length < MIN_SPOTS ? 'few' : offsetM > Math.max(MIN_MOVE_M, spreadM) ? 'move' : 'right';
  return { pin, good, left, middle, spreadM, offsetM, status };
}

export function doorStatus(r: PlaceReview, keptAt: string | null): DoorStatus {
  const all = [...r.good, ...r.left];
  return keptAt && all.every((s) => `${s.hour}:59:59.999Z` < keptAt) ? 'kept' : r.status;
}

export function movePin(pins: GeoPin[], p: PinPlace, to: LatLng): GeoPin[] {
  const pin: GeoPin = { id: p.id, x: p.x, y: p.y, lat: round7(to.lat), lng: round7(to.lng) };
  return pins.some((q) => q.id === p.id) ? pins.map((q) => (q.id === p.id ? pin : q)) : [...pins, pin];
}

export function moveProblems(r: PlaceReview, pins: GeoPin[], p: PinPlace, metersPerPx: number): string[] {
  const n = r.good.length;
  if (!r.middle || n < MIN_SPOTS) return [`Only ${n} good spot${n === 1 ? '' : 's'}. Moving a pin needs ${MIN_SPOTS}.`];
  return pinProblems(movePin(pins, p, r.middle), metersPerPx);
}

export function hallCheck(spots: StoredSpot[], hall: string, areas: Area[], pins: GeoPin[]): HallCheck {
  const g = georef(pins),
    inside: StoredSpot[] = [],
    other = new Map<string, number>();
  for (const s of spots) {
    const [x, y] = latLngToPlan(g, s);
    const a = areaAt({ areas }, x, y) ?? 'outside';
    if (a === hall) inside.push(s);
    else other.set(a, (other.get(a) ?? 0) + 1);
  }
  const elsewhere = spots.length - inside.length;
  const topArea = [...other].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  return { inside, elsewhere, topArea, flagged: spots.length >= MIN_SPOTS && elsewhere * 2 > spots.length };
}

export function withPins(text: string, pins: GeoPin[]): string {
  const start = text.indexOf('"pins": [');
  if (start < 0) throw new Error('venue.json has no map pins');
  const open = start + '"pins": '.length;
  let depth = 0,
    end = open;
  for (; end < text.length; end++) {
    if (text[end] === '[') depth++;
    else if (text[end] === ']' && --depth === 0) break;
  }
  const indent = text.slice(text.lastIndexOf('\n', start) + 1, start);
  return text.slice(0, open) + JSON.stringify(pins, null, 2).replace(/\n/g, `\n${indent}`) + text.slice(end + 1);
}
