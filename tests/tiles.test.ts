import { test, expect } from 'bun:test';
import { apply, georef, latLngOf, latLngToPlan, TILE } from '../src/lib/core/geo';
import { tileHref, tileMatrix, tileZoom, visibleTiles, MAX_TILES } from '../src/lib/map/tiles';
import { fakePins } from './helpers/fake-geo';

const g = georef(fakePins());
const view = { x: 180, y: 240, w: 2230, h: 1420 };

test('tileZoom matches tile pixels to screen pixels and stays in range', () => {
  expect(tileZoom(g, 0.175)).toBe(18);
  expect(tileZoom(g, 5)).toBe(19);
  expect(tileZoom(g, 0.0001)).toBe(13);
});

test('visibleTiles covers the view with a bounded number of tiles', () => {
  const { origin, tiles } = visibleTiles(view, g, 17);
  expect(tiles.length).toBeGreaterThan(0);
  expect(tiles.length).toBeLessThanOrEqual(MAX_TILES);
  expect(Math.min(...tiles.map((t) => t.x))).toBe(origin[0]);
  expect(Math.min(...tiles.map((t) => t.y))).toBe(origin[1]);
});

test('visibleTiles returns nothing rather than too many tiles', () => {
  expect(visibleTiles(view, g, 19, 4).tiles).toEqual([]);
});

test('tileMatrix puts each tile corner where the map says it is', () => {
  const z = 17;
  const { origin, tiles } = visibleTiles(view, g, z);
  const m = tileMatrix(g, z, origin);
  for (const t of tiles.slice(0, 3)) {
    const want = latLngToPlan(g, latLngOf([t.x * TILE, t.y * TILE], z));
    const got = apply(m, [(t.x - origin[0]) * TILE, (t.y - origin[1]) * TILE]);
    expect(got[0]).toBeCloseTo(want[0], 2);
    expect(got[1]).toBeCloseTo(want[1], 2);
  }
});

test('tileHref fills the template', () => {
  expect(tileHref('https://t.example/{z}/{x}/{y}.png?k=1', 17, 3, 4)).toBe('https://t.example/17/3/4.png?k=1');
});
