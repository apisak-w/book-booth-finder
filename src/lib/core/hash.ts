import type { Dest, EventData } from './types';

export function parseHash(hash: string, data: EventData): { dest: Dest | null; fromId: string | null } {
  const p = new URLSearchParams(hash.replace(/^#/, ''));
  const f = p.get('from');
  const fromId = f && data.landmarkById[f] ? f : null;
  const to = (p.get('to') || '').trim();
  if (!to) return { dest: null, fromId };
  const lm = data.landmarkById[to];
  if (lm) return { dest: { kind: 'place', lm }, fromId };
  const list = data.byCode[to.toUpperCase()];
  if (!list) return { dest: null, fromId };
  return { dest: { kind: 'booth', b: list[Number(p.get('n') || 0)] || list[0] }, fromId };
}

export function formatHash(dest: Dest | null, fromId: string, data: EventData): string {
  const p = new URLSearchParams();
  if (dest) {
    p.set('to', dest.kind === 'booth' ? dest.b.c : dest.lm.id);
    if (dest.kind === 'booth' && data.byCode[dest.b.c].length > 1)
      p.set('n', String(data.byCode[dest.b.c].indexOf(dest.b)));
  }
  if (fromId) p.set('from', fromId);
  return p.toString();
}
