import { createGrid, obstaclesOf } from '../core/grid';
import { findRoute } from '../core/routing';
import { ICON_NAMES, isRouteOk, type EventData } from '../core/types';

export function checkEvent(data: EventData): string[] {
  const { event, venue } = data;
  const problems: string[] = [];
  const re = new RegExp(event.codePattern);

  const badCodes = data.booths.filter((b) => !re.test(b.c)).map((b) => b.c);
  if (badCodes.length) problems.push(`booth codes not matching ${event.codePattern}: ${badCodes.join(', ')}`);

  for (const [c, list] of Object.entries(data.byCode))
    if (list.length > 1 && !event.allowedDuplicateCodes.includes(c)) problems.push(`duplicate booth code ${c}`);

  const bs = data.booths.filter((b) => !b.foyer);
  for (let i = 0; i < bs.length; i++)
    for (let j = i + 1; j < bs.length; j++) {
      const a = bs[i],
        b = bs[j];
      const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
      const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
      if (ox > 3 && oy > 3) problems.push(`booths ${a.c} and ${b.c} overlap`);
    }

  const used = new Set([...data.booths.map((b) => b.cat), ...data.pillars.map((p) => p.cat)]);
  for (const c of used) if (!event.categories[c]) problems.push(`category "${c}" is used but not defined`);
  if (event.foyerZones.length && !event.categories.special) problems.push('foyer zones need a "special" category');

  if (data.unknownExhibitorBooths.length)
    problems.push(`exhibitors.csv lists booths not on the map: ${data.unknownExhibitorBooths.join(', ')}`);

  for (const c of Object.keys(event.zones)) if (!data.byCode[c]) problems.push(`zone ${c} is not on the map`);

  const ids = [...venue.landmarks, ...event.landmarks].map((l) => l.id);
  for (const id of new Set(ids.filter((id, k) => ids.indexOf(id) !== k)))
    problems.push(`landmark id ${id} is used twice`);
  for (const l of data.landmarks)
    if (!ICON_NAMES.includes(l.icon)) problems.push(`landmark ${l.id} has unknown icon ${l.icon}`);

  for (const [kind, id] of event.quickPicks)
    if (kind === 'booth' ? !data.byCode[id] : !data.landmarkById[id])
      problems.push(`quick pick ${kind} ${id} does not exist`);

  const origin = data.landmarkById[venue.origin];
  if (!origin) problems.push(`venue origin ${venue.origin} is not a landmark`);
  else {
    const grid = createGrid(venue, obstaclesOf(data));
    const unreachable = [
      ...data.booths.filter((b) => !isRouteOk(findRoute(grid, venue, origin, { kind: 'booth', b }))).map((b) => b.c),
      ...data.landmarks
        .filter((l) => l.id !== origin.id && !isRouteOk(findRoute(grid, venue, origin, { kind: 'place', lm: l })))
        .map((l) => l.id),
    ];
    if (unreachable.length) problems.push(`not reachable from ${origin.id}: ${unreachable.join(', ')}`);
  }
  return problems;
}
