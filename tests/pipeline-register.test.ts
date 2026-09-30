import { test, expect } from 'bun:test';
import { loadImage } from '../tools/pipeline/lib/image';
import { autoRegister, fitAxes, toVenue, toPlan } from '../tools/pipeline/lib/register';
import { loadVenue } from '../src/lib/server/catalog';

test('fitAxes recovers scale and offset', () => {
  const t = fitAxes([
    { plan: [0, 0], venue: [10, 20] },
    { plan: [100, 0], venue: [210, 20] },
    { plan: [0, 50], venue: [10, 120] },
    { plan: [100, 50], venue: [210, 120] },
  ]);
  expect(t.sx).toBeCloseTo(2);
  expect(t.sy).toBeCloseTo(2);
  expect(toVenue(t, [50, 25])).toEqual([110, 70]);
  expect(toPlan(t, [110, 70])).toEqual([50, 25]);
});

test('the 2026 plan registers onto its own venue as identity', async () => {
  const venue = loadVenue('qsncc-lg-5-8');
  const t = autoRegister(await loadImage('venues/qsncc-lg-5-8/reference.jpg'), venue);
  expect(Math.abs(t.sx - 1)).toBeLessThan(0.01);
  expect(Math.abs(t.sy - 1)).toBeLessThan(0.01);
  expect(Math.abs(t.dx)).toBeLessThan(10);
  expect(Math.abs(t.dy)).toBeLessThan(10);
  expect(t.score).toBeGreaterThan(0.9);
});

test('the score measures shape overlap, not just matching proportions', () => {
  const W = 200,
    H = 150,
    data = new Uint8Array(W * H * 3);
  for (let i = 0; i < W * H; i++) data.set([60, 60, 60], i * 3);
  for (let y = 20; y < 130; y++) for (let x = 20; x < 180; x++) data.set([255, 253, 240], (y * W + x) * 3);
  const venue = {
    walls: [
      [
        [0, 0],
        [160, 0],
        [160, 55],
        [80, 55],
        [80, 110],
        [0, 110],
      ],
    ],
  } as unknown as Parameters<typeof autoRegister>[1];
  const t = autoRegister({ width: W, height: H, data }, venue);
  expect(t.score).toBeLessThan(0.9);
  expect(t.score).toBeGreaterThan(0.6);
});
