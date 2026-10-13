import { test, expect } from 'bun:test';
import {
  addLandmark,
  defaultEntrances,
  deleteBlockers,
  deleteLandmark,
  diffVenue,
  moveLandmark,
  nextLandmarkId,
  nextPinId,
  removePin,
  setEntrance,
  setPin,
  updateLandmark,
} from '../src/lib/core/venueEdit';
import type { EventRef } from '../src/lib/core/venueChecks';
import { loadVenue } from '../src/lib/server/catalog';
import { pinnedVenue } from './helpers/pinned-venue';

const base = loadVenue('qsncc-lg-5-8');
const fair: EventRef = { id: 'fair', name: { th: 'งาน', en: 'Fair' }, refs: ['stage', 'wc2'], ids: ['info1', 'stage'] };
const toilet = {
  group: 'wc' as const,
  icon: 'wc' as const,
  th: 'ห้องน้ำ ฮอลล์ 9',
  en: 'Toilets, Hall 9',
  x: 1200.4,
  y: 700.6,
};

test('new ids use the type prefix and skip ids taken by the venue or its events', () => {
  expect(nextLandmarkId(base, 'wc')).toBe('wc7');
  expect(nextLandmarkId(base, 'info', fair.ids)).toBe('info2');
  expect(nextLandmarkId(base, 'charge')).toBe('ch1');
  expect(nextLandmarkId(base, 'other')).toBe('place1');
});

test('adding a landmark appends it with rounded position and file key order', () => {
  const { venue, id } = addLandmark(base, toilet);
  expect(id).toBe('wc7');
  const lm = venue.landmarks.at(-1)!;
  expect(Object.keys(lm)).toEqual(['id', 'group', 'x', 'y', 'th', 'en', 'icon']);
  expect(lm).toMatchObject({ id: 'wc7', x: 1200, y: 701, en: 'Toilets, Hall 9' });
  expect(base.landmarks.some((l) => l.id === 'wc7')).toBe(false);
});

test('landmarks move and rename, but doors keep their position', () => {
  const moved = moveLandmark(base, 'wc1', 10.2, 20.7);
  expect(moved.landmarks.find((l) => l.id === 'wc1')).toMatchObject({ x: 10, y: 21 });
  expect(() => moveLandmark(base, 'door5', 1, 1)).toThrow('door5 is a door. Its position is part of the floor plan');
  const renamed = updateLandmark(base, 'door5', { en: 'Hall 5 lake door' });
  expect(renamed.landmarks.find((l) => l.id === 'door5')!.en).toBe('Hall 5 lake door');
  expect(Object.keys(renamed.landmarks.find((l) => l.id === 'door5')!)).toEqual(
    Object.keys(base.landmarks.find((l) => l.id === 'door5')!),
  );
  expect(() => moveLandmark(base, 'nope', 1, 1)).toThrow('No landmark nope');
});

test('deleting is blocked for the origin, doors, street entrances and event quick picks', () => {
  expect(deleteBlockers(base, 'mrt', [fair])).toContain('it is the starting point');
  expect(deleteBlockers(base, 'door6', [fair])).toContain('it is a door');
  expect(deleteBlockers(base, 'wc2', [fair])).toEqual(['Fair uses it as a quick pick']);
  expect(deleteBlockers(pinnedVenue().venue, 'door7', [])).toContain('it is a street entrance');
  expect(deleteBlockers(base, 'wc3', [fair])).toEqual([]);
  expect(deleteLandmark(base, 'wc3', [fair]).landmarks.some((l) => l.id === 'wc3')).toBe(false);
  expect(() => deleteLandmark(base, 'wc2', [fair])).toThrow("wc2 can't be deleted: Fair uses it as a quick pick");
});

test('the first pin creates geo with the entry landmarks as street entrances', () => {
  expect(nextPinId(base)).toBe('p1');
  const one = setPin(base, { id: 'p1', x: 446.4, y: 280, lat: 13.723033604, lng: 100.560597129 });
  expect(one.geo).toEqual({
    pins: [{ id: 'p1', x: 446, y: 280, lat: 13.7230336, lng: 100.5605971 }],
    entrances: defaultEntrances(base),
  });
  expect(Object.keys(one).at(-1)).toBe('geo');
  const two = setPin(one, { id: 'p1', x: 450, y: 280, lat: 13.7230336, lng: 100.5605971 });
  expect(two.geo!.pins).toHaveLength(1);
  expect(nextPinId(two)).toBe('p2');
  expect(removePin(two, 'p1').geo).toBeUndefined();
});

test('street entrances follow landmark order and need geo', () => {
  expect(() => setEntrance(base, 'wc1', true)).toThrow('Add map pins first');
  const v = pinnedVenue().venue;
  expect(setEntrance(v, 'door6', false).geo!.entrances).toEqual(['mrt', 'door5', 'door7', 'door8']);
  expect(setEntrance(setEntrance(v, 'door6', false), 'door6', true).geo!.entrances).toEqual([
    'mrt',
    'door5',
    'door6',
    'door7',
    'door8',
  ]);
});

test('diffVenue lists every change in plain words', () => {
  let v = addLandmark(base, toilet).venue;
  v = moveLandmark(v, 'wc1', 10, 20);
  v = updateLandmark(v, 'wc2', { en: 'Toilets near the stage' });
  v = updateLandmark(v, 'lift', { icon: 'info' });
  v = deleteLandmark(v, 'wc3', []);
  v = setPin(v, { id: 'p1', x: 1, y: 2, lat: 13.7, lng: 100.5 });
  expect(diffVenue(base, v)).toEqual([
    'Moved wc1 (Toilets, Hall 5)'.replace('Toilets, Hall 5', base.landmarks.find((l) => l.id === 'wc1')!.en),
    'Renamed wc2 to Toilets near the stage',
    'Changed the type of lift',
    'Added wc7 (Toilets, Hall 9)',
    `Deleted wc3 (${base.landmarks.find((l) => l.id === 'wc3')!.en})`,
    'Added map pin p1',
    ...defaultEntrances(base).map((id) => `Made ${id} a street entrance`),
  ]);
  expect(diffVenue(base, base)).toEqual([]);
});
