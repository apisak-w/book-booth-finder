import {
  doorStatus,
  entrancePin,
  hallCheck,
  moveProblems,
  reviewDoor,
  type DoorStatus,
  type EventDays,
  type Filters,
  type HallCheck,
  type PlaceReview,
  type StoredSpot,
} from '../core/spotReview';
import type { I18n, Landmark } from '../core/types';
import type { AdminVenue } from './types';

export type Decision = {
  venue: string;
  place: string;
  action: 'keep' | 'move';
  lat: number | null;
  lng: number | null;
  spots: number;
  pr: string | null;
  at: string;
};
export type DoorPlace = {
  kind: 'door';
  id: string;
  name: I18n;
  lm: Landmark;
  spots: StoredSpot[];
  review: PlaceReview;
  status: DoorStatus;
  problems: string[];
  last: Decision | null;
};
export type HallPlace = { kind: 'hall'; id: string; name: I18n; spots: StoredSpot[]; check: HallCheck };
export type Place = DoorPlace | HallPlace;

export const STATUS_TEXT: Record<DoorStatus, string> = {
  few: 'too few to judge',
  move: 'suggests a move',
  right: 'pin looks right',
  kept: 'kept',
};

export const eventDays = (v: AdminVenue): EventDays =>
  Object.fromEntries(v.events.map((e) => [e.id, { start: e.start, end: e.end, tz: v.timezone }]));

export function placesFor(v: AdminVenue, spots: StoredSpot[], decisions: Decision[], filters: Filters): Place[] {
  const days = eventDays(v);
  const doors = v.entrances.map((lm): DoorPlace => {
    const mine = spots.filter((s) => s.kind === 'door' && s.place === lm.id);
    const review = reviewDoor(mine, entrancePin(v.pins, lm), filters, days);
    const last = decisions.filter((d) => d.place === lm.id).at(-1) ?? null;
    return {
      kind: 'door',
      id: lm.id,
      name: { th: lm.th, en: lm.en },
      lm,
      spots: mine,
      review,
      status: doorStatus(review, last?.action === 'keep' ? last.at : null),
      problems: moveProblems(review, v.pins, lm, v.metersPerPx),
      last,
    };
  });
  const halls = v.areas.map((a): HallPlace => {
    const mine = spots.filter((s) => s.kind === 'hall' && s.place === a.id);
    return { kind: 'hall', id: a.id, name: a.name, spots: mine, check: hallCheck(mine, a.id, v.areas, v.pins) };
  });
  return [...doors, ...halls];
}

export function placeNote(p: Place, v: AdminVenue): string {
  const n = `${p.spots.length} spot${p.spots.length === 1 ? '' : 's'}`;
  if (p.kind === 'door') return `${n} · ${STATUS_TEXT[p.status]}`;
  if (!p.check.flagged) return `${n} · used to check only`;
  const where = v.areas.find((a) => a.id === p.check.topArea)?.name.en ?? 'outside the walls';
  return `${n} · ${p.check.elsewhere} of ${p.spots.length} land in ${where}`;
}
