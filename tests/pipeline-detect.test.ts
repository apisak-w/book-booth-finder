import { test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { loadImage } from '../tools/pipeline/lib/image';
import { detectCells } from '../tools/pipeline/lib/detect';

test('detects about as many cells on the 2026 plan as the Python detector', async () => {
  const img = await loadImage('events/bkkibf-2026/source/plan.jpg');
  const params = JSON.parse(readFileSync('events/bkkibf-2026/source/detect.json', 'utf8'));
  const cells = detectCells(img, params);
  expect(cells.length).toBeGreaterThan(360);
  expect(cells.length).toBeLessThan(400);
  for (let k = 1; k < cells.length; k++) {
    const a = cells[k - 1],
      b = cells[k];
    expect(a.x < b.x || (a.x === b.x && a.y <= b.y)).toBe(true);
  }
});

test('a thin dark outline touching two booths does not merge them', () => {
  const W = 100,
    H = 40,
    data = new Uint8Array(W * H * 3);
  const paint = (x0: number, y0: number, x1: number, y1: number, [r, g, b]: number[]) => {
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) data.set([r, g, b], (y * W + x) * 3);
  };
  paint(0, 0, W, H, [255, 253, 240]);
  paint(10, 10, 30, 30, [245, 139, 184]);
  paint(60, 10, 80, 30, [245, 139, 184]);
  paint(20, 30, 70, 32, [20, 20, 20]);
  const cells = detectCells(
    { width: W, height: H, data },
    {
      roi: [0, 0, W, H],
      floor: [255, 253, 240],
      threshold: 55,
      lineLength: 18,
      lighterDelta: 35,
      minIsland: 18,
      minCell: { w: 14, h: 12, area: 200 },
      exclude: [],
    },
  );
  expect(cells.length).toBe(2);
  for (const c of cells) {
    expect(c.w).toBeGreaterThanOrEqual(18);
    expect(c.w).toBeLessThanOrEqual(20);
    expect(c.h).toBeLessThanOrEqual(22);
  }
});
