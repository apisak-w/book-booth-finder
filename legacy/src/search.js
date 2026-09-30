import { ZONES, LANDMARKS, STRINGS } from './content.js';

/** Lowercase and strip spaces/punctuation so "k 16", "K-16" and "k16" match. Thai is kept as-is. */
export const norm = (s) => String(s).toLowerCase().replace(/[\s\-_.·,'’()]/g, '');

/**
 * Build a search function over booths, exhibitors and landmarks.
 * Result items: {type:'booth'|'exh', b, ex?} or {type:'place', lm}
 */
export function createSearch({ booths, exhibitors, byCode }) {
  const items = [];
  for (const b of booths) items.push({ type: 'booth', b, code: b.c, names: ZONES[b.c] ? [ZONES[b.c].th, ZONES[b.c].en] : [] });
  for (const e of exhibitors) for (const b of byCode[e.booth] || []) items.push({ type: 'exh', b, ex: e, code: b.c, names: [e.th, e.en].filter(Boolean) });
  for (const lm of LANDMARKS) items.push({ type: 'place', lm, names: [lm.th, lm.en, STRINGS.th.groups[lm.group], STRINGS.en.groups[lm.group]] });
  const prepared = items.map((it) => ({ it, code: it.code?.toLowerCase(), names: it.names.map(norm) }));

  return function search(query, limit = 40) {
    const n = norm(query); if (!n) return [];
    const codeQ = /^([a-u])(\d{0,2})$/.exec(n); // "k", "k1", "k16", "k01"
    const scored = [];
    for (const p of prepared) {
      let score = 0;
      if (p.code) {
        if (p.code === n) score = 100;
        else if (codeQ && p.code[0] === codeQ[1]) {
          const num = codeQ[2], rest = p.code.slice(1);
          if (num === '' || rest.startsWith(num) || (num.length === 1 && rest === '0' + num)) score = 80;
        }
      }
      for (const nm of p.names) {
        if (!nm) continue;
        if (nm.startsWith(n)) score = Math.max(score, 65);
        else if (nm.includes(n)) score = Math.max(score, 45);
      }
      if (p.it.type === 'exh' && score === 80) score = 0; // code prefix hits show the booth row, not every publisher
      if (score) scored.push([score, p.it]);
    }
    scored.sort((a, b) => b[0] - a[0] || String(a[1].code || '').localeCompare(String(b[1].code || '')));
    const seen = new Set(), out = [];
    for (const [, it] of scored) {
      const key = it.type === 'place' ? 'p:' + it.lm.id : it.type + ':' + it.b.i + ':' + (it.ex ? it.ex.th + it.ex.en : '');
      if (seen.has(key)) continue; seen.add(key); out.push(it);
      if (out.length >= limit) break;
    }
    return out;
  };
}
