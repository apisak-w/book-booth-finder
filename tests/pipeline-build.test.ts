import { test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { loadImage, crop, median } from '../tools/pipeline/lib/image';
import { detectCells } from '../tools/pipeline/lib/detect';
import { IDENTITY } from '../tools/pipeline/lib/register';
import { parseCorrections } from '../tools/pipeline/lib/corrections';
import { buildBooths, computeAisles } from '../tools/pipeline/lib/build';
import { loadEvent } from '../src/lib/server/catalog';
import type { Rect } from '../src/lib/core/types';

const bundle = loadEvent('bkkibf-2026');

test('the 2026 plan plus committed corrections reproduces booths.json', async () => {
  const img = await loadImage('events/bkkibf-2026/source/plan.jpg');
  const cells = detectCells(img, JSON.parse(readFileSync('events/bkkibf-2026/source/detect.json', 'utf8')));
  const corrections = parseCorrections(JSON.parse(readFileSync('events/bkkibf-2026/source/corrections.json', 'utf8')));
  const sample = (r: Rect) => {
    const c = crop(img, [
      Math.round(r.x + 3),
      Math.round(r.y + 3),
      Math.round(r.x + r.w - 3),
      Math.round(r.y + r.h - 3),
    ]);
    const ch = (k: number) =>
      Math.trunc(median(Array.from({ length: c.width * c.height }, (_, i) => c.data[i * 3 + k])));
    return [ch(0), ch(1), ch(2)] as [number, number, number];
  };
  const { booths, problems } = buildBooths({
    cells,
    reads: [],
    corrections,
    t: IDENTITY,
    sample,
    codePattern: bundle.event.codePattern,
  });
  expect(problems).toEqual([]);

  const want = bundle.booths;
  const byKey = <T extends { c: string; x: number; y: number }>(list: T[]) =>
    [...list].sort((a, b) => a.c.localeCompare(b.c) || a.x - b.x || a.y - b.y);
  const got = byKey(booths.booths),
    exp = byKey(want.booths);
  expect(got.map((b) => b.c)).toEqual(exp.map((b) => b.c));
  const off: string[] = [];
  got.forEach((b, k) => {
    const e = exp[k];
    const far =
      Math.abs(b.x - e.x) > 2 || Math.abs(b.y - e.y) > 2 || Math.abs(b.w - e.w) > 2 || Math.abs(b.h - e.h) > 2;
    if (far || b.cat !== e.cat || JSON.stringify(b.extra ?? null) !== JSON.stringify(e.extra ?? null))
      off.push(`${b.c}: ${JSON.stringify(b)} vs ${JSON.stringify(e)}`);
  });
  expect(off).toEqual([]);

  expect(booths.pillars.length).toBe(want.pillars.length);
  const pk = (p: Rect) => p.x * 10000 + p.y;
  const gp = [...booths.pillars].sort((a, b) => pk(a) - pk(b)),
    ep = [...want.pillars].sort((a, b) => pk(a) - pk(b));
  gp.forEach((p, k) => {
    expect(Math.abs(p.x - ep[k].x)).toBeLessThanOrEqual(2);
    expect(Math.abs(p.inner.x - ep[k].inner.x)).toBeLessThanOrEqual(2);
    expect(p.cat).toBe(ep[k].cat);
  });
}, 60_000);

test('computeAisles reproduces the 2026 aisle letters within 3 px', () => {
  const a = computeAisles(bundle.booths.booths, bundle.venue, bundle.event.codePattern)!;
  expect(a.signY).toBe(322);
  expect(a.boothMinY).toBe(340);
  for (const [letter, x] of Object.entries(bundle.event.aisles!.x))
    expect(Math.abs(a.x[letter] - x)).toBeLessThanOrEqual(3);
});

test('a cell with no code and no correction is a problem, not a guess', () => {
  const cell = { x: 0, y: 0, w: 30, h: 30, rgb: [0, 0, 0] as [number, number, number] };
  const { problems } = buildBooths({
    cells: [cell],
    reads: [],
    corrections: { cells: [], add: [], categoryColours: { general: [0, 0, 0] } },
    t: IDENTITY,
    sample: () => [0, 0, 0],
    codePattern: '^[A-Z]\\d{2}$',
  });
  expect(problems[0]).toContain('15,15');
});

test('a correction inside an L-shaped cell bounding box belongs to the smaller cell it sits in', () => {
  const big = { x: 0, y: 0, w: 60, h: 50, rgb: [0, 0, 0] as [number, number, number] };
  const small = { x: 0, y: 20, w: 28, h: 28, rgb: [0, 0, 0] as [number, number, number] };
  const { booths, problems } = buildBooths({
    cells: [big, small],
    reads: [],
    corrections: {
      cells: [
        { at: [14, 34], code: 'D28' },
        { at: [45, 25], code: 'D30' },
      ],
      add: [],
      categoryColours: { general: [0, 0, 0] },
    },
    t: IDENTITY,
    sample: () => [0, 0, 0],
    codePattern: '^[A-Z]\\d{2}$',
  });
  expect(problems).toEqual([]);
  expect(booths.booths.map((b) => `${b.c}:${b.w}`).sort()).toEqual(['D28:28', 'D30:60']);
});
