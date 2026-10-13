import { test, expect } from 'bun:test';
import {
  apply,
  fitAffine,
  georef,
  invert,
  latLngOf,
  latLngToPlan,
  metersPerWorldPx,
  norm360,
  planToLatLng,
  worldPx,
  type Affine,
} from '../src/lib/core/geo';
import type { Point } from '../src/lib/core/types';
import { fakeLatLng, fakePins, M } from './helpers/fake-geo';

test('worldPx and latLngOf are inverses', () => {
  const p = worldPx(13.7236, 100.5597);
  const ll = latLngOf(p);
  expect(ll.lat).toBeCloseTo(13.7236, 9);
  expect(ll.lng).toBeCloseTo(100.5597, 9);
});

test('metersPerWorldPx at the equator and zoom 0 is the Earth circumference over 256', () => {
  expect(metersPerWorldPx(0, 0)).toBeCloseTo((2 * Math.PI * 6378137) / 256, 6);
});

test('fitAffine recovers an exact affine transform', () => {
  const m: Affine = [2, 0.5, -1, 3, 10, 20];
  const src: Point[] = [
    [0, 0],
    [100, 0],
    [0, 100],
    [100, 100],
  ];
  const got = fitAffine(
    src,
    src.map((p) => apply(m, p)),
  );
  got.forEach((v, k) => expect(v).toBeCloseTo(m[k], 9));
});

test('fitAffine refuses points in a line', () => {
  const line: Point[] = [
    [0, 0],
    [1, 1],
    [2, 2],
  ];
  expect(() => fitAffine(line, line)).toThrow('not in a line');
  expect(() =>
    fitAffine(
      [
        [5, 0],
        [5, 1],
        [5, 2],
      ],
      line,
    ),
  ).toThrow('not in a line');
});

test('invert undoes apply', () => {
  const m: Affine = [1.2, -0.3, 0.4, 0.9, 50, -7];
  const [x, y] = apply(invert(m), apply(m, [12, 34]));
  expect(x).toBeCloseTo(12, 9);
  expect(y).toBeCloseTo(34, 9);
});

test('georef of a 180° plan reports scale, north and a clean fit', () => {
  const g = georef(fakePins());
  expect(g.mPerPx / M).toBeCloseTo(1, 3);
  expect(g.northDeg).toBeCloseTo(180, 1);
  expect(g.mirrored).toBe(false);
  expect(g.aspect).toBeGreaterThan(0.999);
  expect(g.skewDeg).toBeLessThan(0.1);
  expect(g.residualM).toBeLessThan(0.05);
});

test('latLngToPlan and planToLatLng round trip through the pins', () => {
  const g = georef(fakePins());
  const [x, y] = latLngToPlan(g, fakeLatLng(1000, 700));
  expect(x).toBeCloseTo(1000, 1);
  expect(y).toBeCloseTo(700, 1);
  const ll = planToLatLng(g, [1000, 700]);
  const back = fakeLatLng(1000, 700);
  expect(ll.lat).toBeCloseTo(back.lat, 7);
  expect(ll.lng).toBeCloseTo(back.lng, 7);
});

test('norm360 wraps any angle into [0, 360)', () => {
  expect(norm360(-90)).toBe(270);
  expect(norm360(720)).toBe(0);
});
