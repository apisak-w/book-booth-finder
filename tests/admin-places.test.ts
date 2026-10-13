import { test, expect } from 'bun:test';
import { placeNote, placesFor, type Decision } from '../src/lib/admin/places';
import { georef, planToLatLng } from '../src/lib/core/geo';
import { ALL_FILTERS, type StoredSpot } from '../src/lib/core/spotReview';
import { loadEvent } from '../src/lib/server/catalog';
import { adminVenuesFrom } from '../src/lib/server/spotsCatalog';
import { pinnedVenue } from './helpers/pinned-venue';

const [v] = adminVenuesFrom([{ id: 'bkkibf-2026', event: loadEvent('bkkibf-2026').event, venue: pinnedVenue().venue }]);
const mrt = v.entrances.find((l) => l.id === 'mrt')!;
const g = georef(v.pins);
const ev = v.events[0];
const at = (x: number, y: number, kind: 'door' | 'hall', place: string): StoredSpot => ({
  event: ev.id,
  kind,
  place,
  ...planToLatLng(g, [x, y]),
  accuracy: 8,
  hour: `${ev.start}T03`,
});
const ring = Array.from({ length: 6 }, (_, k) =>
  at(mrt.x + 59 + 5 * Math.cos(k), mrt.y + 5 * Math.sin(k), 'door', 'mrt'),
);

test('each entrance and hall becomes a place with a status', () => {
  const places = placesFor(v, ring, [], ALL_FILTERS);
  expect(places.map((p) => p.id)).toEqual([...v.entrances.map((l) => l.id), ...v.areas.map((a) => a.id)]);
  const p = places.find((x) => x.id === 'mrt')!;
  expect(p.kind === 'door' && p.status).toBe('move');
  expect(p.kind === 'door' && p.problems).toEqual([]);
  expect(placeNote(p, v)).toBe('6 spots · suggests a move');
  expect(
    placeNote(
      places.find((x) => x.id === 'door5')!,
      v,
    ),
  ).toBe('0 spots · too few to judge');
});

test('a keep after the latest spot shows kept', () => {
  const keep: Decision = {
    venue: v.id,
    place: 'mrt',
    action: 'keep',
    lat: null,
    lng: null,
    spots: 0,
    pr: null,
    at: `${ev.start}T05:00:00.000Z`,
  };
  const p = placesFor(v, ring, [keep], ALL_FILTERS).find((x) => x.id === 'mrt')!;
  expect(placeNote(p, v)).toBe('6 spots · kept');
});

test('hall confirms that mostly land in another hall are flagged', () => {
  const h6 = v.areas.find((a) => a.id === 'hall6')!,
    h7 = v.areas.find((a) => a.id === 'hall7')!;
  const spots = [h7, h7, h7, h7, h6, h6].map((a) => at(a.label.x, a.label.y, 'hall', 'hall6'));
  const p = placesFor(v, spots, [], ALL_FILTERS).find((x) => x.id === 'hall6')!;
  expect(placeNote(p, v)).toBe(`6 spots · 4 of 6 land in ${h7.name.en}`);
  expect(
    placeNote(
      placesFor(v, [], [], ALL_FILTERS).find((x) => x.id === 'hall5')!,
      v,
    ),
  ).toBe('0 spots · used to check only');
});
