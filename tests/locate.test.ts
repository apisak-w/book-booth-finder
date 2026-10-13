import { test, expect } from 'bun:test';
import { loadEvent } from '../src/lib/server/catalog';
import { loadData } from '../src/lib/core/prepare';
import { georef } from '../src/lib/core/geo';
import { classify, hallChoices, hallStart, pickEntrance, streetEntrances } from '../src/lib/core/locate';
import { fakeLatLng, fakePins } from './helpers/fake-geo';

const bundle = loadEvent('bkkibf-2026');
const geo = { pins: fakePins(), entrances: ['mrt', 'door5', 'door6', 'door7', 'door8'] };
const data = loadData({ ...bundle, venue: { ...bundle.venue, geo } });
const g = georef(geo.pins);
const fix = (x: number, y: number, accuracy = 15) => ({ ...fakeLatLng(x, y), accuracy });

test('accuracy worse than 100 m is weak, wherever the fix lands', () => {
  expect(classify(fix(-200, 560, 150), data, g).kind).toBe('weak');
  expect(classify(fix(1000, 900, 150), data, g).kind).toBe('weak');
});

test('a fix inside the walls asks for the hall it falls in', () => {
  const w = classify(fix(1000, 900), data, g);
  expect(w.kind).toBe('inside');
  if (w.kind === 'inside') expect(w.hall).toBe('hall6');
});

test('near a street entrance counts as arrived', () => {
  const w = classify(fix(260, 560), data, g);
  expect(w).toEqual({ kind: 'arrived', entrance: data.landmarkById.mrt });
});

test('outside within reach walks to the nearest street entrance', () => {
  const w = classify(fix(-200, 560), data, g);
  expect(w.kind).toBe('outside');
  if (w.kind === 'outside') {
    expect(w.entrance.id).toBe('mrt');
    expect(w.meters).toBe(46);
    expect(w.accuracyPx).toBeCloseTo(15 / data.venue.metersPerPx, 3);
  }
});

test('the MRT-corridor door is never offered as a street entrance', () => {
  expect(streetEntrances(data).map((l) => l.id)).not.toContain('west');
});

test('more than 1.5 km away is far', () => {
  const w = classify(fix(-20000, 560), data, g);
  expect(w.kind).toBe('far');
  if (w.kind === 'far') expect(w.meters).toBeGreaterThan(1500);
});

test('pickEntrance weighs the walk inside', () => {
  const p: [number, number] = [687, 2200];
  const doors = streetEntrances(data);
  expect(pickEntrance(p, doors, null, data.venue.metersPerPx)?.entrance.id).toBe('door5');
  const indoor = { mrt: 500, door5: 100, door6: 0, door7: 300, door8: 300 };
  expect(pickEntrance(p, doors, indoor, data.venue.metersPerPx)?.entrance.id).toBe('door6');
});

test('pickEntrance ignores entrances with no indoor route, then falls back to distance', () => {
  const p: [number, number] = [687, 2200];
  const doors = streetEntrances(data);
  expect(pickEntrance(p, doors, { door7: 10 }, data.venue.metersPerPx)?.entrance.id).toBe('door7');
  expect(pickEntrance(p, doors, {}, data.venue.metersPerPx)?.entrance.id).toBe('door5');
});

test('streetEntrances falls back to every entry landmark when the venue has no pins', () => {
  const plain = loadData(bundle);
  const bare = { ...plain, venue: { ...plain.venue, geo: undefined } };
  expect(streetEntrances(bare).map((l) => l.id)).toEqual(
    bare.landmarks.filter((l) => l.group === 'entry').map((l) => l.id),
  );
});

test('hallChoices offers the guess and its neighbours, or every hall', () => {
  expect(hallChoices(data.venue, 'hall6')).toEqual(['hall5', 'hall6', 'hall7']);
  expect(hallChoices(data.venue, 'hall5')).toEqual(['hall5', 'hall6']);
  expect(hallChoices(data.venue, null)).toEqual(['hall5', 'hall6', 'hall7', 'hall8']);
});

test('hallStart uses the hall door landmark', () => {
  expect(hallStart(data, 'hall6')).toBe('door6');
  expect(hallStart(data, 'nowhere')).toBeNull();
});
