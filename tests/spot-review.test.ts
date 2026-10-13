import { test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import {
  ALL_FILTERS,
  doorStatus,
  entrancePin,
  hallCheck,
  movePin,
  moveProblems,
  reviewDoor,
  withPins,
  type StoredSpot,
} from '../src/lib/core/spotReview';
import type { Area } from '../src/lib/core/types';
import { fakeLatLng, fakePins, M } from './helpers/fake-geo';
import { pinnedVenue } from './helpers/pinned-venue';

const mrt = { id: 'mrt', x: 252, y: 560 };
const days = { fair: { start: '2026-10-15', end: '2026-10-25', tz: 'Asia/Bangkok' } };
const spot = (x: number, y: number, extra: Partial<StoredSpot> = {}): StoredSpot => ({
  event: 'fair',
  kind: 'door',
  place: 'mrt',
  ...fakeLatLng(x, y),
  accuracy: 8,
  hour: '2026-10-16T03',
  ...extra,
});
const ring = (cx: number, cy: number, n = 6) =>
  Array.from({ length: n }, (_, k) => spot(cx + 5 * Math.cos(k), cy + 5 * Math.sin(k)));
const pin = entrancePin(fakePins(), mrt);

test('entrancePin puts the entrance where the pins say it is', () => {
  const ll = fakeLatLng(mrt.x, mrt.y);
  expect(pin.lat).toBeCloseTo(ll.lat, 7);
  expect(pin.lng).toBeCloseTo(ll.lng, 7);
});

test('spots clustered 10 m from the pin suggest a move', () => {
  const r = reviewDoor(ring(mrt.x + 100, mrt.y), pin, ALL_FILTERS, days);
  expect(r.status).toBe('move');
  expect(r.good).toHaveLength(6);
  expect(r.offsetM).toBeCloseTo(100 * M, 0);
  expect(r.spreadM).toBeLessThan(1);
});

test('spots around the pin say it looks right, and fewer than 5 are too few', () => {
  expect(reviewDoor(ring(mrt.x, mrt.y), pin, ALL_FILTERS, days).status).toBe('right');
  expect(reviewDoor(ring(mrt.x + 100, mrt.y, 4), pin, ALL_FILTERS, days).status).toBe('few');
  expect(reviewDoor([], pin, ALL_FILTERS, days)).toMatchObject({ status: 'few', middle: null });
});

test('each filter leaves out its spots, and turning it off lets them back in', () => {
  const rough = spot(mrt.x, mrt.y, { accuracy: 40 });
  const far = spot(mrt.x + 1500, mrt.y);
  const late = spot(mrt.x, mrt.y, { hour: '2026-10-25T17' });
  const stray = spot(mrt.x, mrt.y, { event: 'gone' });
  expect(reviewDoor([rough, far, late, stray], pin, ALL_FILTERS, days).left).toEqual([rough, far, late, stray]);
  expect(reviewDoor([rough], pin, { ...ALL_FILTERS, accuracy: false }, days).good).toEqual([rough]);
  expect(reviewDoor([far], pin, { ...ALL_FILTERS, near: false }, days).good).toEqual([far]);
  expect(reviewDoor([late, stray], pin, { ...ALL_FILTERS, eventDays: false }, days).good).toEqual([late, stray]);
});

test('kept shows right after Keep and until a spot from a later hour arrives', () => {
  const r = reviewDoor(ring(mrt.x + 100, mrt.y), pin, ALL_FILTERS, days);
  expect(doorStatus(r, '2026-10-16T05:00:00.000Z')).toBe('kept');
  expect(doorStatus(r, '2026-10-16T03:30:00.000Z')).toBe('kept');
  expect(doorStatus(r, '2026-10-16T02:59:00.000Z')).toBe('move');
  expect(doorStatus(r, null)).toBe('move');
});

test('movePin adds or replaces the entrance pin and the checks run on the result', () => {
  const to = fakeLatLng(mrt.x + 59, mrt.y);
  const added = movePin(fakePins(), mrt, to);
  expect(added).toHaveLength(5);
  expect(added[4]).toEqual({
    id: 'mrt',
    x: 252,
    y: 560,
    lat: Math.round(to.lat * 1e7) / 1e7,
    lng: Math.round(to.lng * 1e7) / 1e7,
  });
  expect(movePin(added, mrt, fakeLatLng(mrt.x, mrt.y))).toHaveLength(5);
  expect(moveProblems(reviewDoor(ring(mrt.x + 59, mrt.y), pin, ALL_FILTERS, days), fakePins(), mrt, M)).toEqual([]);
  const wild = reviewDoor(ring(mrt.x + 900, mrt.y), pin, ALL_FILTERS, days);
  expect(moveProblems(wild, fakePins(), mrt, M).some((p) => p.startsWith('fit error'))).toBe(true);
  expect(moveProblems(reviewDoor([], pin, ALL_FILTERS, days), fakePins(), mrt, M)).toEqual([
    'Only 0 good spots. Moving a pin needs 5.',
  ]);
  expect(moveProblems(reviewDoor([spot(mrt.x, mrt.y)], pin, ALL_FILTERS, days), fakePins(), mrt, M)).toEqual([
    'Only 1 good spot. Moving a pin needs 5.',
  ]);
});

const square = (id: string, x0: number): Area => ({
  id,
  name: { th: id, en: id },
  label: { x: x0 + 500, y: 500, text: id },
  bounds: [
    [x0, 0],
    [x0 + 1000, 0],
    [x0 + 1000, 1000],
    [x0, 1000],
  ],
});
const areas = [square('h1', 0), square('h2', 1000)];
const hallSpot = (x: number) => spot(x, 500, { kind: 'hall', place: 'h1' });

test('hall confirms are flagged when most land in another hall', () => {
  const c = hallCheck([500, 600, 1500, 1600, 1700, 1800].map(hallSpot), 'h1', areas, fakePins());
  expect(c).toMatchObject({ elsewhere: 4, topArea: 'h2', flagged: true });
  expect(c.inside).toHaveLength(2);
  expect(hallCheck([1500, 1600, 1700].map(hallSpot), 'h1', areas, fakePins()).flagged).toBe(false);
  expect(hallCheck([500, 600, 700, 1500, 1600].map(hallSpot), 'h1', areas, fakePins()).flagged).toBe(false);
});

test('withPins rewrites only the pins and keeps the file format', () => {
  const { venue, text } = pinnedVenue();
  expect(withPins(text, venue.geo!.pins)).toBe(text);
  const pins = movePin(venue.geo!.pins, mrt, { lat: 13.7231, lng: 100.5612 });
  const next = withPins(text, pins);
  expect(JSON.parse(next)).toEqual({ ...venue, geo: { ...venue.geo, pins } });
  expect(next.split('\n').length).toBe(text.split('\n').length + 7);
  expect(() => withPins('{}', pins)).toThrow('venue.json has no map pins');
});

const realText = readFileSync('venues/qsncc-lg-5-8/venue.json', 'utf8');
test.skipIf(!JSON.parse(realText).geo)('withPins leaves the real venue file byte for byte', () => {
  expect(withPins(realText, JSON.parse(realText).geo.pins)).toBe(realText);
});
