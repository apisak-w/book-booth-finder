import type { BoothRaw, BoothsFile, EventFile, Pillar, Point, Rect, Venue } from '../../../src/lib/core/types';
import type { Cell } from './detect';
import type { Corrections } from './corrections';
import { nearestCategory } from './categorise';
import { rectToVenue, type Transform } from './transform';

export type Read = { at: Point; text: string; conf: number; code: string | null; flags: string[] };
export type BuildInput = {
  cells: Cell[];
  reads: Read[];
  corrections: Corrections;
  t: Transform;
  sample: (r: Rect) => [number, number, number];
  codePattern: string;
};

const inside = ([x, y]: Point, r: Rect) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;
export function ownerIndex(pt: Point, rects: Rect[]): number {
  let best = -1;
  rects.forEach((r, k) => {
    if (inside(pt, r) && (best < 0 || r.w * r.h < rects[best].w * rects[best].h)) best = k;
  });
  return best;
}

const roundRect = (r: Rect): Rect => ({
  x: Math.round(r.x),
  y: Math.round(r.y),
  w: Math.round(r.w),
  h: Math.round(r.h),
});

export function buildBooths(input: BuildInput): { booths: BoothsFile; problems: string[] } {
  const { cells, reads, corrections, t, codePattern } = input;
  const re = new RegExp(codePattern),
    colours = corrections.categoryColours;
  const booths: BoothRaw[] = [],
    pillars: Pillar[] = [],
    problems: string[] = [];
  const used = new Set<number>();

  const vrs = cells.map((c) => roundRect(rectToVenue(t, c)));
  const fixOwner = corrections.cells.map((c) => ownerIndex(c.at, vrs));
  const readOwner = reads.map((r) => ownerIndex(r.at, vrs));

  for (const [k, cell] of cells.entries()) {
    const vr = vrs[k];
    const fixIdx = fixOwner.indexOf(k);
    const fix = fixIdx >= 0 ? corrections.cells[fixIdx] : undefined;
    if (fixIdx >= 0) used.add(fixIdx);
    const centre: Point = [vr.x + vr.w / 2, vr.y + vr.h / 2];
    if (fix?.drop) continue;
    if (fix?.pillar) {
      if (!cell.inner || !cell.outer) {
        problems.push(`cell at ${centre.join(',')} is marked as a pillar but has no white square`);
        continue;
      }
      pillars.push({ ...vr, cat: nearestCategory(cell.outer, colours), inner: roundRect(rectToVenue(t, cell.inner)) });
      continue;
    }
    const read = reads[readOwner.indexOf(k)];
    const code = fix?.code ?? (read && read.code && !read.flags.length ? read.code : undefined);
    if (!code) {
      problems.push(`cell at ${centre.join(',')} has no code. Set one in the review tool`);
      continue;
    }
    if (!re.test(code)) {
      problems.push(`cell at ${centre.join(',')}: code "${code}" does not match ${codePattern}`);
      continue;
    }
    const b: BoothRaw = { c: code, ...(fix?.rect ? roundRect(fix.rect) : vr), cat: nearestCategory(cell.rgb, colours) };
    if (fix?.extra) b.extra = fix.extra.map(roundRect);
    booths.push(b);
  }

  corrections.cells.forEach((c, k) => {
    if (!used.has(k)) problems.push(`correction at ${c.at.join(',')} matches no detected cell`);
  });

  for (const a of corrections.add) {
    if (!re.test(a.code)) {
      problems.push(`added booth "${a.code}" does not match ${codePattern}`);
      continue;
    }
    const r = roundRect(a.rect);
    const [px, py] = [(r.x - t.dx) / t.sx, (r.y - t.dy) / t.sy];
    const cat = a.cat ?? nearestCategory(input.sample({ x: px, y: py, w: r.w / t.sx, h: r.h / t.sy }), colours);
    const b: BoothRaw = { c: a.code, ...r, cat };
    if (a.extra) b.extra = a.extra.map(roundRect);
    booths.push(b);
  }
  return { booths: { booths, pillars }, problems };
}

export function computeAisles(booths: BoothRaw[], venue: Venue, codePattern: string): EventFile['aisles'] {
  const re = new RegExp(codePattern);
  const signY = (venue.depth?.back ?? Math.min(...booths.map((b) => b.y))) + 38;
  const boothMinY = signY + 18;
  const byLetter: Record<string, number[]> = {};
  for (const b of booths)
    if (re.test(b.c) && /^[A-Z]/.test(b.c) && b.y > boothMinY) (byLetter[b.c[0]] ||= []).push(b.x);
  const x: Record<string, number> = {};
  for (const [letter, all] of Object.entries(byLetter).sort()) {
    const xs = [...new Set(all)].sort((p, q) => p - q);
    let gap = 0,
      cut = xs[0];
    for (let k = 1; k < xs.length; k++)
      if (xs[k] - xs[k - 1] > gap) {
        gap = xs[k] - xs[k - 1];
        cut = xs[k];
      }
    if (gap <= 20) cut = xs[0];
    const counts = new Map<number, number>();
    for (const v of all) if (v >= cut) counts.set(v, (counts.get(v) ?? 0) + 1);
    const mode = [...counts.entries()].sort((p, q) => q[1] - p[1] || p[0] - q[0])[0][0];
    x[letter] = Math.round(mode - 18);
  }
  return Object.keys(x).length ? { signY, boothMinY, x } : undefined;
}
