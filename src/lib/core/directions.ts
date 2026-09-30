import { areaAt, areaName } from './geometry';
import { STRINGS, nameIn, type Lang } from '../i18n/strings';
import type { Booth, Dest, EventData, Landmark, RouteOk } from './types';

export function isAisleBooth(b: Booth, data: EventData): boolean {
  const a = data.event.aisles;
  if (!a || !b.area || b.y <= a.boothMinY) return false;
  if (!new RegExp(data.event.codePattern).test(b.c)) return false;
  return /^[A-Z]/.test(b.c) && b.c[0] in a.x;
}

export function buildSteps(route: RouteOk, start: Landmark, dest: Dest, data: EventData, lang: Lang): string[] {
  const s = STRINGS[lang],
    nameOf = nameIn(lang),
    { venue } = data;
  const steps = [s.s_start(nameOf(start))];
  const startArea = areaAt(venue, start.x, start.y);

  const firstDoor = route.doorsUsed.length ? venue.doors[route.doorsUsed[0]] : null;
  if (firstDoor && firstDoor.id !== start.id) {
    const lm = data.landmarkById[firstDoor.id];
    if (lm) steps.push(s.s_door(nameOf(lm)));
  }

  const destArea = dest.kind === 'booth' ? dest.b.area : areaAt(venue, dest.lm.x, dest.lm.y);
  const entryArea = startArea || firstDoor?.area || null;
  if (destArea && entryArea && entryArea !== destArea) steps.push(s.s_area(nameOf(areaName(venue, destArea))));

  if (dest.kind === 'booth') {
    const b = dest.b;
    if (isAisleBooth(b, data)) {
      const hint = venue.depth ? ' ' + nameOf(venue.depth.aisleHint) : '';
      steps.push(s.s_aisle(b.c[0]) + hint);
      if (venue.depth) {
        const { back, front, text } = venue.depth;
        const f = (b.cy - back) / (front - back);
        steps.push(nameOf(f < 0.36 ? text.back : f < 0.66 ? text.mid : text.front));
      }
    }
    steps.push(s.s_arrive(b.c));
  } else {
    steps.push(s.s_arrivePlace(nameOf(dest.lm)));
  }
  return steps;
}
