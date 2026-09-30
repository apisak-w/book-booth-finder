import { areaAt } from './geometry';
import { normCode } from './codes';
import { GROUP_ORDER } from './types';
import type {
  Booth,
  BoothRaw,
  BoothsFile,
  EventData,
  EventFile,
  Exhibitor,
  ExhibitorRow,
  Landmark,
  Venue,
} from './types';

const rank = (l: Landmark) => GROUP_ORDER.indexOf(l.group);

export function prepareData(venue: Venue, event: EventFile, file: BoothsFile, rows: ExhibitorRow[]): EventData {
  const booths: Booth[] = [];
  const byCode: Record<string, Booth[]> = {};
  const add = (raw: BoothRaw, foyer: boolean) => {
    const cx = raw.x + raw.w / 2,
      cy = raw.y + raw.h / 2;
    const b: Booth = { ...raw, i: booths.length, cx, cy, area: foyer ? null : areaAt(venue, cx, cy) };
    if (foyer) b.foyer = true;
    booths.push(b);
    (byCode[b.c] ||= []).push(b);
  };
  for (const b of file.booths) add(b, false);
  for (const z of event.foyerZones)
    if (!byCode[z.c]) add({ c: z.c, x: z.x, y: z.y, w: z.w, h: z.h, cat: 'special' }, true);

  const exhibitors: Exhibitor[] = rows
    .map((r) => ({ booth: normCode(r.booth || ''), th: r.name_th || '', en: r.name_en || '' }))
    .filter((e) => e.booth && (e.th || e.en));
  const unknownExhibitorBooths = [...new Set(exhibitors.filter((e) => !byCode[e.booth]).map((e) => e.booth))];

  const landmarks = [...venue.landmarks, ...event.landmarks]
    .map((l, k) => ({ l, k }))
    .sort((a, b) => rank(a.l) - rank(b.l) || a.k - b.k)
    .map(({ l }) => l);
  const landmarkById = Object.fromEntries(landmarks.map((l) => [l.id, l]));

  return {
    venue,
    event,
    booths,
    pillars: file.pillars,
    byCode,
    exhibitors,
    unknownExhibitorBooths,
    landmarks,
    landmarkById,
  };
}

export const loadData = (b: { venue: Venue; event: EventFile; booths: BoothsFile; exhibitors: ExhibitorRow[] }) =>
  prepareData(b.venue, b.event, b.booths, b.exhibitors);
