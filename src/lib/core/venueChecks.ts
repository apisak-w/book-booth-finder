import { pinProblems } from './geo';
import { createGrid, nearestWalkable } from './grid';
import type { I18n, Venue } from './types';
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
  'origin',
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
    if (!l.th.trim() || !l.en.trim()) out.push(`${l.id} needs a name in Thai and English`);
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

export function draftProblems(v: Venue): string[] {
  const out = v.landmarks
    .filter((l) => !l.th.trim() || !l.en.trim())
    .map((l) => `${l.id} needs a name in Thai and English`);
  if (v.geo) {
    if (!v.geo.entrances.length) out.push('Pick at least one street entrance');
    out.push(...pinProblems(v.geo.pins, v.metersPerPx).map((p) => `Map pins: ${p}`));
  }
  return out;
}

export function unreachableLandmarks(v: Venue): string[] {
  const origin = v.landmarks.find((l) => l.id === v.origin);
  if (!origin) return [];
  const grid = createGrid(v, []),
    { walk, gw, gh } = grid;
  const seen = new Uint8Array(gw * gh);
  const start = nearestWalkable(grid, origin.x, origin.y);
  if (start >= 0) {
    const stack = [start];
    seen[start] = 1;
    while (stack.length) {
      const i = stack.pop()!,
        r = (i / gw) | 0,
        c = i - r * gw;
      for (let dr = -1; dr <= 1; dr++)
        for (let dc = -1; dc <= 1; dc++) {
          const rr = r + dr,
            cc = c + dc;
          if ((!dr && !dc) || rr < 0 || cc < 0 || rr >= gh || cc >= gw) continue;
          const j = rr * gw + cc;
          if (seen[j] || !walk[j]) continue;
          if (dr && dc && (!walk[r * gw + cc] || !walk[rr * gw + c])) continue;
          seen[j] = 1;
          stack.push(j);
        }
    }
  }
  return v.landmarks
    .filter((l) => {
      if (l.id === origin.id) return false;
      const i = nearestWalkable(grid, l.x, l.y);
      return i < 0 || !seen[i];
    })
    .map((l) => l.id);
}
