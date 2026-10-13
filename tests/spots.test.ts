import { test, expect } from 'bun:test';
import { acceptsSpots, addDays, canOffer, parseSpot, type SpotsConfig } from '../src/lib/core/spots';
import { fakeLatLng, LAT0, LNG0 } from './helpers/fake-geo';

const cfg: SpotsConfig = {
  events: {
    fair: { venue: 'v', start: '2026-10-15', end: '2026-10-25', tz: 'Asia/Bangkok', doors: ['mrt'], halls: ['hall5'] },
  },
  venues: { v: { lat: LAT0, lng: LNG0 } },
};
const good = {
  event: 'fair',
  kind: 'door',
  place: 'mrt',
  lat: LAT0 + 0.00012345678,
  lng: LNG0 - 0.0001,
  accuracy: 8.4,
};
const at = (iso: string) => new Date(iso);

test('a good spot becomes a row with rounded numbers, the hour and a delete date', () => {
  expect(parseSpot(good, cfg, at('2026-10-16T03:20:11Z'))).toEqual({
    row: {
      event: 'fair',
      kind: 'door',
      place: 'mrt',
      lat: 13.723723,
      lng: 100.5596,
      accuracy: 8,
      hour: '2026-10-16T03',
      purgeAfter: '2026-11-24',
    },
  });
});

test('spots are taken from 7 days before the start to the last day, in the venue time zone', () => {
  const dates = { start: '2026-10-15', end: '2026-10-25' };
  expect(addDays('2026-10-15', -7)).toBe('2026-10-08');
  expect(acceptsSpots(dates, 'Asia/Bangkok', at('2026-10-07T16:59:00Z'))).toBe(false);
  expect(acceptsSpots(dates, 'Asia/Bangkok', at('2026-10-07T17:00:00Z'))).toBe(true);
  expect(acceptsSpots(dates, 'Asia/Bangkok', at('2026-10-25T16:59:00Z'))).toBe(true);
  expect(acceptsSpots(dates, 'Asia/Bangkok', at('2026-10-25T17:00:00Z'))).toBe(false);
});

test('bad spots say what is wrong', () => {
  const now = at('2026-10-16T03:00:00Z');
  const err = (b: unknown) => {
    const r = parseSpot(b, cfg, now);
    return 'error' in r ? r.error : null;
  };
  expect(err(null)).toBe('Send a JSON object');
  expect(err([good])).toBe('Send a JSON object');
  expect(err({ ...good, event: 'other' })).toBe('Unknown event');
  expect(err({ ...good, event: '__proto__' })).toBe('Unknown event');
  expect(err({ ...good, kind: 'hall' })).toBe('Unknown place');
  expect(err({ ...good, kind: 'roof' })).toBe('Unknown place');
  expect(err({ ...good, kind: 'hall', place: 'hall5' })).toBeNull();
  expect(err({ ...good, lat: '13.7' })).toBe('lat, lng and accuracy must be numbers');
  expect(err({ ...good, lat: Number.NaN })).toBe('lat, lng and accuracy must be numbers');
  expect(err({ ...good, accuracy: 0 })).toBe('This GPS reading is too rough');
  expect(err({ ...good, accuracy: 101 })).toBe('This GPS reading is too rough');
  expect(err({ ...good, lat: LAT0 + 0.03 })).toBe('This spot is too far from the venue');
  expect(parseSpot(good, cfg, at('2026-11-01T00:00:00Z'))).toEqual({ error: 'This event is not taking spots now' });
});

test('a spot is offered only for a fresh, close, accurate reading', () => {
  const door = fakeLatLng(252, 560);
  const r = { ...fakeLatLng(452, 560), accuracy: 20, at: 1_000_000 };
  expect(canOffer(r, 1_060_000, door)).toBe(true);
  expect(canOffer(null, 1_000_000, door)).toBe(false);
  expect(canOffer({ ...r, accuracy: 51 }, 1_000_000, door)).toBe(false);
  expect(canOffer(r, 1_120_001, door)).toBe(false);
  expect(canOffer({ ...r, ...fakeLatLng(1852, 560) }, 1_000_000, door)).toBe(false);
  expect(canOffer({ ...r, ...fakeLatLng(1852, 560) }, 1_000_000, null)).toBe(true);
});
