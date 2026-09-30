import { STRINGS } from '../i18n/strings';
import type { Booth, EventData, Exhibitor, Landmark } from './types';

export type SearchItem =
  | { type: 'booth'; b: Booth }
  | { type: 'exh'; b: Booth; ex: Exhibitor }
  | { type: 'place'; lm: Landmark };

export const norm = (s: string) =>
  String(s)
    .toLowerCase()
    .replace(/[\s\-_.·,'’()]/g, '');

export function createSearch(data: EventData) {
  const { zones } = data.event;
  const items: { it: SearchItem; code?: string; names: string[] }[] = [];
  for (const b of data.booths)
    items.push({ it: { type: 'booth', b }, code: b.c, names: zones[b.c] ? [zones[b.c].th, zones[b.c].en] : [] });
  for (const ex of data.exhibitors)
    for (const b of data.byCode[ex.booth] || [])
      items.push({ it: { type: 'exh', b, ex }, code: b.c, names: [ex.th, ex.en].filter(Boolean) });
  for (const lm of data.landmarks)
    items.push({
      it: { type: 'place', lm },
      names: [lm.th, lm.en, STRINGS.th.groups[lm.group], STRINGS.en.groups[lm.group]],
    });
  const prepared = items.map((p) => ({ it: p.it, code: p.code?.toLowerCase(), names: p.names.map(norm) }));

  return function search(query: string, limit = 40): SearchItem[] {
    const n = norm(query);
    if (!n) return [];
    const codeQ = /^([a-z])(\d{0,2})$/.exec(n);
    const scored: [number, SearchItem, string][] = [];
    for (const p of prepared) {
      let score = 0;
      if (p.code) {
        if (p.code === n) score = 100;
        else if (codeQ && p.code[0] === codeQ[1]) {
          const num = codeQ[2],
            rest = p.code.slice(1);
          if (num === '' || rest.startsWith(num) || (num.length === 1 && rest === '0' + num)) score = 80;
        }
      }
      for (const nm of p.names) {
        if (!nm) continue;
        if (nm.startsWith(n)) score = Math.max(score, 65);
        else if (nm.includes(n)) score = Math.max(score, 45);
      }
      if (p.it.type === 'exh' && score === 80) score = 0;
      if (score) scored.push([score, p.it, p.it.type === 'place' ? '' : p.it.b.c]);
    }
    scored.sort((a, b) => b[0] - a[0] || a[2].localeCompare(b[2]));
    const seen = new Set<string>(),
      out: SearchItem[] = [];
    for (const [, it] of scored) {
      const key =
        it.type === 'place' ? 'p:' + it.lm.id : `${it.type}:${it.b.i}:${it.type === 'exh' ? it.ex.th + it.ex.en : ''}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(it);
      if (out.length >= limit) break;
    }
    return out;
  };
}
