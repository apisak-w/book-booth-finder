import { readFileSync, writeFileSync } from 'node:fs';
import { loadImage } from '../pipeline/lib/image';
import { detectCells } from '../pipeline/lib/detect';
import { IDENTITY } from '../pipeline/lib/register';
import { ownerIndex } from '../pipeline/lib/build';

const MANUAL = ['C06', 'C04', 'E20', 'E16', 'F21', 'F17', 'F15', 'C17', 'G16', 'A31', 'A15'];
const MANUAL_RECTS: Record<string, [number, number, number, number]> = {
  C06: [673, 1283, 29, 29],
  C04: [673, 1313, 29, 29],
  E20: [857, 938, 28, 91],
  E16: [857, 1030, 28, 60],
  F21: [887, 938, 29, 60],
  F17: [887, 999, 29, 60],
  F15: [887, 1060, 29, 30],
  C17: [611, 1030, 29, 29],
  G16: [1041, 1031, 29, 59],
  A31: [407, 659, 61, 61],
  A15: [406, 1013, 61, 62],
};
const RECT_OVERRIDES: Record<string, [number, number, number, number]> = {
  C11: [611, 1125, 29, 59],
  D30: [794, 831, 30, 49],
};
const BGR: Record<string, [number, number, number]> = {
  kids: [179, 136, 250],
  fiction: [41, 66, 224],
  bl: [185, 125, 155],
  intl: [1, 207, 255],
  rare: [71, 137, 196],
  general: [198, 132, 27],
  comic: [34, 134, 246],
  nonbook: [109, 188, 91],
  special: [32, 31, 35],
};

const booths = JSON.parse(readFileSync('events/bkkibf-2026/booths.json', 'utf8'));
const img = await loadImage('events/bkkibf-2026/source/plan.jpg');
const cells = detectCells(img, JSON.parse(readFileSync('events/bkkibf-2026/source/detect.json', 'utf8')));
const centre = (r: { x: number; y: number; w: number; h: number }): [number, number] => [r.x + r.w / 2, r.y + r.h / 2];
const rect = ([x, y, w, h]: number[]) => ({ x, y, w, h });

const out: { at: [number, number]; code?: string; pillar?: true; drop?: true; rect?: object; extra?: object[] }[] = [];
const matched = new Set<string>();
const owner = (r: { x: number; y: number; w: number; h: number }) => ownerIndex(centre(r), cells);
cells.forEach((cell, k) => {
  const inB = booths.booths.filter((b: { c: string }) => !MANUAL.includes(b.c) && owner(b as never) === k);
  const inP = booths.pillars.filter((p: object) => owner(p as never) === k);
  const hasManual = booths.booths.some((b: { c: string }) => MANUAL.includes(b.c) && owner(b as never) === k);
  if (inP.length === 1 && !inB.length) out.push({ at: centre(cell), pillar: true });
  else if (inB.length === 1 && !hasManual) {
    const b = inB[0];
    const fix: (typeof out)[number] = { at: centre(b), code: b.c };
    if (RECT_OVERRIDES[b.c]) fix.rect = rect(RECT_OVERRIDES[b.c]);
    if (b.extra) fix.extra = b.extra;
    out.push(fix);
    matched.add(`${b.c}@${b.x},${b.y}`);
  } else out.push({ at: centre(cell), drop: true });
});
const missing = booths.booths.filter(
  (b: { c: string; x: number; y: number }) => !MANUAL.includes(b.c) && !matched.has(`${b.c}@${b.x},${b.y}`),
);
if (missing.length) console.warn('not matched to a detected cell:', missing.map((b: { c: string }) => b.c).join(', '));

const corrections = {
  cells: out,
  add: MANUAL.map((c) => ({ code: c, rect: rect(MANUAL_RECTS[c]) })),
  categoryColours: Object.fromEntries(Object.entries(BGR).map(([k, [b, g, r]]) => [k, [r, g, b]])),
};
writeFileSync('events/bkkibf-2026/source/corrections.json', JSON.stringify(corrections, null, 2) + '\n');
writeFileSync('events/bkkibf-2026/source/registration.json', JSON.stringify(IDENTITY, null, 2) + '\n');
console.log(`${out.length} cell corrections, ${missing.length} unmatched booths`);
