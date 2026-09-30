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
