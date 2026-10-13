import { metersBetween } from './geo';
import { todayIn } from './status';
import type { LatLng } from './types';

export type SpotKind = 'door' | 'hall';
export type SpotRow = {
  event: string;
  kind: SpotKind;
  place: string;
  lat: number;
  lng: number;
  accuracy: number;
  hour: string;
  purgeAfter: string;
};
export type SpotsEvent = { venue: string; start: string; end: string; tz: string; doors: string[]; halls: string[] };
export type SpotsConfig = { events: Record<string, SpotsEvent>; venues: Record<string, LatLng> };

export const SPOT_MAX_ACCURACY_M = 100;
export const SPOT_RADIUS_M = 2000;
export const SPOT_OPENS_DAYS = 7;
export const SPOT_KEEP_DAYS = 30;
export const SPOTS_PER_EVENT = 5000;

export const addDays = (iso: string, n: number) =>
  new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

export function acceptsSpots(dates: { start: string; end: string }, tz: string, now: Date): boolean {
  const today = todayIn(tz, now);
  return today >= addDays(dates.start, -SPOT_OPENS_DAYS) && today <= dates.end;
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const round = (v: number, d: number) => Math.round(v * 10 ** d) / 10 ** d;

export function parseSpot(body: unknown, cfg: SpotsConfig, now: Date): { row: SpotRow } | { error: string } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: 'Send a JSON object' };
  const b = body as Record<string, unknown>;
  const id = typeof b.event === 'string' && Object.hasOwn(cfg.events, b.event) ? b.event : null;
  if (!id) return { error: 'Unknown event' };
  const ev = cfg.events[id];
  if (!acceptsSpots(ev, ev.tz, now)) return { error: 'This event is not taking spots now' };
  const places = b.kind === 'door' ? ev.doors : b.kind === 'hall' ? ev.halls : null;
  if (!places || typeof b.place !== 'string' || !places.includes(b.place)) return { error: 'Unknown place' };
  const { lat, lng, accuracy } = b;
  if (!isNum(lat) || !isNum(lng) || !isNum(accuracy)) return { error: 'lat, lng and accuracy must be numbers' };
  if (accuracy <= 0 || accuracy > SPOT_MAX_ACCURACY_M) return { error: 'This GPS reading is too rough' };
  const centre = cfg.venues[ev.venue];
  if (!centre || metersBetween({ lat, lng }, centre) > SPOT_RADIUS_M)
    return { error: 'This spot is too far from the venue' };
  return {
    row: {
      event: id,
      kind: b.kind as SpotKind,
      place: b.place,
      lat: round(lat, 6),
      lng: round(lng, 6),
      accuracy: Math.max(1, Math.round(accuracy)),
      hour: now.toISOString().slice(0, 13),
      purgeAfter: addDays(ev.end, SPOT_KEEP_DAYS),
    },
  };
}
