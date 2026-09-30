import { test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { pointInPolygon, areaAt, areaName } from '../src/lib/core/geometry';
import { VenueSchema } from '../src/lib/server/schema';

const venue = VenueSchema.parse(JSON.parse(readFileSync('venues/qsncc-lg-5-8/venue.json', 'utf8')));
const golden = JSON.parse(readFileSync('tests/golden/v1.json', 'utf8'));

test('pointInPolygon is half-open on the right edge', () => {
  const sq: [number, number][] = [
    [0, 0],
    [10, 0],
    [10, 10],
    [0, 10],
  ];
  expect(pointInPolygon(0, 5, sq)).toBe(true);
  expect(pointInPolygon(10, 5, sq)).toBe(false);
  expect(pointInPolygon(5, 5, sq)).toBe(true);
  expect(pointInPolygon(-1, 5, sq)).toBe(false);
});

test('areaAt matches v1 hallAt on every grid cell centre', () => {
  const { x0, y0, step, cols, rows, halls } = golden.lattice;
  const bad: string[] = [];
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const x = x0 + (c + 0.5) * step,
        y = y0 + (r + 0.5) * step;
      const want = halls[r * cols + c] === '0' ? null : `hall${halls[r * cols + c]}`;
      const got = areaAt(venue, x, y);
      if (got !== want && bad.length < 10) bad.push(`${x},${y}: ${got} != ${want}`);
    }
  expect(bad).toEqual([]);
});

test('areaName falls back to outside', () => {
  expect(areaName(venue, 'hall7').en).toBe('Hall 7');
  expect(areaName(venue, null).en).toBe('Outside the halls');
});
