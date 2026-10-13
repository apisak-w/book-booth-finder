import type { EventRef } from './venueChecks';
import type { GeoPin, IconName, Landmark, LandmarkGroup, Venue } from './types';

export class EditError extends Error {}

export const ID_PREFIX: Record<LandmarkGroup, string> = {
  entry: 'entry',
  wc: 'wc',
  info: 'info',
  charge: 'ch',
  stage: 'stage',
  other: 'place',
};
export const DEFAULT_ICON: Record<LandmarkGroup, IconName> = {
  entry: 'door',
  wc: 'wc',
  info: 'info',
  charge: 'charge',
  stage: 'stage',
  other: 'lift',
};
export type NewLandmark = { group: LandmarkGroup; icon: IconName; th: string; en: string; x: number; y: number };

const round7 = (v: number) => Math.round(v * 1e7) / 1e7;

export const isDoor = (v: Venue, id: string) => v.doors.some((d) => d.id === id);

export function nextLandmarkId(v: Venue, group: LandmarkGroup, taken: string[] = []): string {
  const used = new Set([...v.landmarks.map((l) => l.id), ...taken]);
  for (let n = 1; ; n++) if (!used.has(`${ID_PREFIX[group]}${n}`)) return `${ID_PREFIX[group]}${n}`;
}

export function addLandmark(v: Venue, d: NewLandmark, taken: string[] = []): { venue: Venue; id: string } {
  const id = nextLandmarkId(v, d.group, taken);
  const lm: Landmark = {
    id,
    group: d.group,
    x: Math.round(d.x),
    y: Math.round(d.y),
    th: d.th,
    en: d.en,
    icon: d.icon,
  };
  return { venue: { ...v, landmarks: [...v.landmarks, lm] }, id };
}

function mapLandmark(v: Venue, id: string, fn: (l: Landmark) => Landmark): Venue {
  if (!v.landmarks.some((l) => l.id === id)) throw new EditError(`No landmark ${id}`);
  return { ...v, landmarks: v.landmarks.map((l) => (l.id === id ? fn(l) : l)) };
}

export function moveLandmark(v: Venue, id: string, x: number, y: number): Venue {
  if (isDoor(v, id)) throw new EditError(`${id} is a door. Its position is part of the floor plan`);
  return mapLandmark(v, id, (l) => ({ ...l, x: Math.round(x), y: Math.round(y) }));
}

export const updateLandmark = (v: Venue, id: string, patch: Partial<Pick<Landmark, 'th' | 'en' | 'group' | 'icon'>>) =>
  mapLandmark(v, id, (l) => ({ ...l, ...patch }));

export function deleteBlockers(v: Venue, id: string, events: EventRef[] = []): string[] {
  const why: string[] = [];
  if (v.origin === id) why.push('it is the starting point');
  if (isDoor(v, id)) why.push('it is a door');
  if (v.geo?.entrances.includes(id)) why.push('it is a street entrance');
  for (const e of events) if (e.refs.includes(id)) why.push(`${e.name.en} uses it as a quick pick`);
  return why;
}

export function deleteLandmark(v: Venue, id: string, events: EventRef[] = []): Venue {
  const why = deleteBlockers(v, id, events);
  if (why.length) throw new EditError(`${id} can't be deleted: ${why.join('; ')}`);
  return { ...v, landmarks: v.landmarks.filter((l) => l.id !== id) };
}

export const defaultEntrances = (v: Venue) => v.landmarks.filter((l) => l.group === 'entry').map((l) => l.id);

export function setEntrance(v: Venue, id: string, on: boolean): Venue {
  if (!v.geo) throw new EditError('Add map pins first');
  const now = new Set(v.geo.entrances);
  if (on) now.add(id);
  else now.delete(id);
  return { ...v, geo: { ...v.geo, entrances: v.landmarks.map((l) => l.id).filter((x) => now.has(x)) } };
}

export function nextPinId(v: Venue): string {
  const used = new Set(v.geo?.pins.map((p) => p.id) ?? []);
  for (let n = 1; ; n++) if (!used.has(`p${n}`)) return `p${n}`;
}

export function setPin(v: Venue, pin: GeoPin): Venue {
  const p: GeoPin = {
    id: pin.id,
    x: Math.round(pin.x),
    y: Math.round(pin.y),
    lat: round7(pin.lat),
    lng: round7(pin.lng),
  };
  if (!v.geo) return { ...v, geo: { pins: [p], entrances: defaultEntrances(v) } };
  const pins = v.geo.pins.some((q) => q.id === p.id)
    ? v.geo.pins.map((q) => (q.id === p.id ? p : q))
    : [...v.geo.pins, p];
  return { ...v, geo: { ...v.geo, pins } };
}

export function removePin(v: Venue, id: string): Venue {
  if (!v.geo) return v;
  const pins = v.geo.pins.filter((p) => p.id !== id);
  if (pins.length) return { ...v, geo: { ...v.geo, pins } };
  const rest = { ...v };
  delete rest.geo;
  return rest;
}

export function diffVenue(base: Venue, next: Venue): string[] {
  const out: string[] = [];
  const before = new Map(base.landmarks.map((l) => [l.id, l]));
  const after = new Set(next.landmarks.map((l) => l.id));
  const added: string[] = [];
  for (const l of next.landmarks) {
    const o = before.get(l.id);
    if (!o) {
      added.push(`Added ${l.id} (${l.en})`);
      continue;
    }
    if (o.x !== l.x || o.y !== l.y) out.push(`Moved ${l.id} (${l.en})`);
    if (o.th !== l.th || o.en !== l.en) out.push(`Renamed ${l.id} to ${l.en}`);
    if (o.group !== l.group || o.icon !== l.icon) out.push(`Changed the type of ${l.id}`);
  }
  out.push(...added);
  for (const l of base.landmarks) if (!after.has(l.id)) out.push(`Deleted ${l.id} (${l.en})`);
  const bp = new Map((base.geo?.pins ?? []).map((p) => [p.id, p]));
  const np = new Set((next.geo?.pins ?? []).map((p) => p.id));
  for (const p of next.geo?.pins ?? []) {
    const o = bp.get(p.id);
    if (!o) out.push(`Added map pin ${p.id}`);
    else if (JSON.stringify(o) !== JSON.stringify(p)) out.push(`Moved map pin ${p.id}`);
  }
  for (const p of base.geo?.pins ?? []) if (!np.has(p.id)) out.push(`Removed map pin ${p.id}`);
  const be = base.geo?.entrances ?? [],
    ne = next.geo?.entrances ?? [];
  for (const e of ne) if (!be.includes(e)) out.push(`Made ${e} a street entrance`);
  for (const e of be) if (!ne.includes(e)) out.push(`${e} is no longer a street entrance`);
  return out;
}
