import { test, expect } from 'bun:test';
import { components, erode2, median, openLine, farFromColour, type Mask } from '../tools/pipeline/lib/image';

const mask = (rows: string[]): Mask => {
  const h = rows.length,
    w = rows[0].length,
    data = new Uint8Array(w * h);
  rows.forEach((r, y) =>
    [...r].forEach((c, x) => {
      data[y * w + x] = c === '#' ? 1 : 0;
    }),
  );
  return { width: w, height: h, data };
};
const rows = (m: Mask) =>
  Array.from({ length: m.height }, (_, y) =>
    Array.from({ length: m.width }, (_, x) => (m.data[y * m.width + x] ? '#' : '.')).join(''),
  );

test('median follows NumPy', () => {
  expect(median([3, 1, 2])).toBe(2);
  expect(median([4, 1, 3, 2])).toBe(2.5);
});

test('components are 4-connected with raster-order labels', () => {
  const m = mask(['#..#', '#..#', '.##.']);
  const { stats } = components(m);
  expect(stats.length - 1).toBe(3);
  expect(stats[1]).toEqual({ x: 0, y: 0, w: 1, h: 2, area: 2 });
  expect(stats[2]).toEqual({ x: 3, y: 0, w: 1, h: 2, area: 2 });
  expect(stats[3]).toEqual({ x: 1, y: 2, w: 2, h: 1, area: 2 });
});

test('openLine keeps interior runs of at least L', () => {
  const m = mask(['.......', '.#####.', '.###...', '.......']);
  expect(rows(openLine(m, 4, 'h'))).toEqual(['.......', '.#####.', '.......', '.......']);
});

test('openLine keeps edge runs of at least L - floor(L/2) at the start and floor(L/2) + 1 at the end', () => {
  expect(rows(openLine(mask(['##......']), 4, 'h'))).toEqual(['##......']);
  expect(rows(openLine(mask(['#.......']), 4, 'h'))).toEqual(['........']);
  expect(rows(openLine(mask(['.....###']), 4, 'h'))).toEqual(['.....###']);
  expect(rows(openLine(mask(['......##']), 4, 'h'))).toEqual(['........']);
});

test('openLine works vertically', () => {
  const m = mask(['.#', '.#', '.#', '##', '..']);
  expect(rows(openLine(m, 3, 'v'))).toEqual(['.#', '.#', '.#', '.#', '..']);
});

test('erode2 uses the 2x2 window up and to the left with foreground borders', () => {
  const m = mask(['###', '###', '##.']);
  expect(rows(erode2(m))).toEqual(['###', '###', '##.']);
  const n = mask(['.##', '###', '###']);
  expect(rows(erode2(n))).toEqual(['..#', '..#', '###']);
});

test('farFromColour uses the max channel difference', () => {
  const img = { width: 2, height: 1, data: new Uint8Array([255, 253, 240, 200, 253, 240]) };
  expect([...farFromColour(img, [255, 253, 240], 55).data]).toEqual([0, 0]);
  expect([...farFromColour(img, [255, 253, 240], 50).data]).toEqual([0, 1]);
});
