import { pinProblems } from './geo';
import { createGrid } from './grid';
import { findRoute } from './routing';
import { isRouteOk, type I18n, type Venue } from './types';
import { deleteBlockers, isDoor } from './venueEdit';

export type EventRef = { id: string; name: I18n; refs: string[]; ids: string[] };

export const LOCKED_FIELDS = [
  'id',
  'name',
  'timezone',
  'reference',
  'view',
  'overview',
  'metersPerPx',
  'gridCell',
  'walls',
  'floor',
  'areas',
  'outside',
  'doors',
  'depth',
] as const;

export function venueEditProblems(base: Venue, next: Venue, events: EventRef[]): string[] {
  const out: string[] = [];
  for (const k of [...LOCKED_FIELDS].sort())
    if (JSON.stringify(base[k]) !== JSON.stringify(next[k])) out.push(`${k} can't be changed in the admin yet`);
  const ids = next.landmarks.map((l) => l.id);
  const dup = [...new Set(ids.filter((id, i) => ids.indexOf(id) !== i))];
  if (dup.length) out.push(`Landmark ids must be unique: ${dup.join(', ')}`);
  const now = new Set(ids);
  for (const l of base.landmarks) {
    if (now.has(l.id)) continue;
    const why = deleteBlockers(base, l.id, events);
    if (why.length) out.push(`${l.id} can't be deleted: ${why.join('; ')}`);
  }
  for (const l of next.landmarks) {
    const b = base.landmarks.find((x) => x.id === l.id);
    if (b && isDoor(base, l.id) && (b.x !== l.x || b.y !== l.y)) out.push(`${l.id} is a door and can't move`);
    if (!b) {
      const clash = events.find((e) => e.ids.includes(l.id));
      if (clash) out.push(`${l.id} is already used by ${clash.name.en}`);
    }
  }
  if (!now.has(next.origin)) out.push(`The starting point ${next.origin} must stay`);
  if (next.geo) {
    for (const id of next.geo.entrances) if (!now.has(id)) out.push(`Street entrance ${id} is not a landmark`);
    out.push(...pinProblems(next.geo.pins, next.metersPerPx).map((p) => `Map pins: ${p}`));
  }
  return out;
}

export function unreachableLandmarks(v: Venue): string[] {
  const origin = v.landmarks.find((l) => l.id === v.origin);
  if (!origin) return [];
  const grid = createGrid(v, []);
  return v.landmarks
    .filter((l) => l.id !== origin.id && !isRouteOk(findRoute(grid, v, origin, { kind: 'place', lm: l })))
    .map((l) => l.id);
}
