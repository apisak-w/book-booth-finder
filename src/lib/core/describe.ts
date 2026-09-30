import { areaName } from './geometry';
import { isAisleBooth } from './directions';
import { STRINGS, nameIn, type Lang } from '../i18n/strings';
import type { Booth, EventData, LandmarkGroup } from './types';

export const PLACE_GLYPH: Record<LandmarkGroup, string> = {
  entry: '⇅',
  wc: 'WC',
  info: 'i',
  charge: '⚡',
  stage: '★',
  other: '↥',
};

export const exhibitorsAt = (data: EventData, code: string) => data.exhibitors.filter((e) => e.booth === code);

export function boothTitle(b: Booth, data: EventData, lang: Lang): string {
  const nameOf = nameIn(lang),
    z = data.event.zones[b.c];
  if (z) return nameOf(z);
  const ex = exhibitorsAt(data, b.c);
  return ex.length ? ex.map(nameOf).join(', ') : nameOf(data.event.categories[b.cat]);
}

export function cardTitle(b: Booth, data: EventData, lang: Lang): string {
  const nameOf = nameIn(lang),
    z = data.event.zones[b.c],
    ex = exhibitorsAt(data, b.c);
  return z ? nameOf(z) : ex.length === 1 ? nameOf(ex[0]) : nameOf(data.event.categories[b.cat]);
}

export function boothSub(b: Booth, data: EventData, lang: Lang): string {
  const nameOf = nameIn(lang),
    s = STRINGS[lang],
    z = data.event.zones[b.c];
  const parts = [nameOf(areaName(data.venue, b.area))];
  if (isAisleBooth(b, data) && !z) parts.push(s.aisle(b.c[0]));
  if (z || exhibitorsAt(data, b.c).length) parts.push(nameOf(data.event.categories[b.cat]));
  return parts.join(' · ');
}
