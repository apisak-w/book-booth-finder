import { test, expect } from 'bun:test';
import { OSM_CREDIT, osmTiles, parseLatLng, screenToWorld } from '../src/lib/admin/osm';
import { latLngOf, worldPx } from '../src/lib/core/geo';

const c = worldPx(13.7236, 100.5597);

test('tiles cover the view at their world-pixel positions', () => {
  const tiles = osmTiles(c, 17, 512, 256);
  const size = 256 * 2 ** 3;
  expect(tiles.every((t) => t.size === size)).toBe(true);
  expect(Math.min(...tiles.map((t) => t.x))).toBeLessThanOrEqual(c[0] - 256 * 8);
  expect(Math.max(...tiles.map((t) => t.x + t.size))).toBeGreaterThanOrEqual(c[0] + 256 * 8);
  expect(tiles[0].href).toMatch(/^https:\/\/tile\.openstreetmap\.org\/17\/\d+\/\d+\.png$/);
  expect(new Set(tiles.map((t) => t.key)).size).toBe(tiles.length);
  expect(tiles.length).toBeLessThanOrEqual(12);
  expect(OSM_CREDIT).toBe('© OpenStreetMap contributors');
});

test('the middle of the screen is the centre, and offsets scale with zoom', () => {
  expect(screenToWorld(c, 17, 400, 300, [200, 150])).toEqual(c);
  const p = screenToWorld(c, 18, 400, 300, [300, 150]);
  expect(p[0] - c[0]).toBe(100 * 4);
  const ll = latLngOf(screenToWorld(c, 19, 400, 300, [200, 150]));
  expect(ll.lat).toBeCloseTo(13.7236, 6);
});

test('pasted coordinates are read from common formats', () => {
  expect(parseLatLng('13.7236, 100.5597')).toEqual({ lat: 13.7236, lng: 100.5597 });
  expect(parseLatLng('(13.72361,100.55972)')).toEqual({ lat: 13.72361, lng: 100.55972 });
  expect(parseLatLng('-33.9 151.2')).toEqual({ lat: -33.9, lng: 151.2 });
  expect(parseLatLng('100.5, 13.7')).toBeNull();
  expect(parseLatLng('hello')).toBeNull();
});
