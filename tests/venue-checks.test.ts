import { test, expect } from 'bun:test';
import { addLandmark, deleteLandmark, moveLandmark, setPin, updateLandmark } from '../src/lib/core/venueEdit';
import { draftProblems, unreachableLandmarks, venueEditProblems, type EventRef } from '../src/lib/core/venueChecks';
import { createGrid } from '../src/lib/core/grid';
import { findRoute } from '../src/lib/core/routing';
import { isRouteOk } from '../src/lib/core/types';
import { loadVenue } from '../src/lib/server/catalog';
import { fakeLatLng } from './helpers/fake-geo';
import { bareVenue, pinnedVenue } from './helpers/pinned-venue';

const base = bareVenue();
const fair: EventRef = { id: 'fair', name: { th: 'งาน', en: 'Fair' }, refs: ['wc2'], ids: ['info1'] };

test('a normal edit passes', () => {
  let v = addLandmark(base, { group: 'wc', icon: 'wc', th: 'ห้องน้ำ', en: 'Toilets', x: 1200, y: 700 }).venue;
  v = moveLandmark(v, 'wc1', 900, 900);
  v = updateLandmark(v, 'door5', { en: 'Lake door' });
  expect(venueEditProblems(base, v, [fair])).toEqual([]);
});

test('floor plan fields are locked', () => {
  const v = {
    ...base,
    walls: [
      [
        [0, 0],
        [1, 0],
        [1, 1],
      ],
    ] as typeof base.walls,
    gridCell: 8,
  };
  expect(venueEditProblems(base, v, [])).toEqual([
    "gridCell can't be changed in the admin yet",
    "walls can't be changed in the admin yet",
  ]);
});

test('door positions, deletions, duplicate ids and event id clashes are refused', () => {
  const doorMoved = { ...base, landmarks: base.landmarks.map((l) => (l.id === 'door5' ? { ...l, x: l.x + 5 } : l)) };
  expect(venueEditProblems(base, doorMoved, [])).toEqual(["door5 is a door and can't move"]);
  expect(venueEditProblems(base, { ...base, landmarks: base.landmarks.filter((l) => l.id !== 'wc2') }, [fair])).toEqual(
    ["wc2 can't be deleted: Fair uses it as a quick pick"],
  );
  expect(venueEditProblems(base, deleteLandmark(base, 'wc3', [fair]), [fair])).toEqual([]);
  const dup = { ...base, landmarks: [...base.landmarks, { ...base.landmarks[7] }] };
  expect(venueEditProblems(base, dup, [])).toContain(`Landmark ids must be unique: ${base.landmarks[7].id}`);
  const clash = { ...base, landmarks: [...base.landmarks, { ...base.landmarks[7], id: 'info1' }] };
  expect(venueEditProblems(base, clash, [fair])).toEqual(['info1 is already used by Fair']);
});

test('map pins must fit and entrances must exist', () => {
  const two = setPin(setPin(base, { id: 'p1', ...fakeLatLng(446, 280), x: 446, y: 280 }), {
    id: 'p2',
    ...fakeLatLng(2391, 280),
    x: 2391,
    y: 280,
  });
  expect(venueEditProblems(base, two, [])).toEqual(['Map pins: needs at least 3 map pins']);
  const v = pinnedVenue().venue;
  expect(venueEditProblems(v, v, [])).toEqual([]);
  const ghost = { ...v, geo: { ...v.geo!, entrances: [...v.geo!.entrances, 'ghost'] } };
  expect(venueEditProblems(v, ghost, [])).toEqual(['Street entrance ghost is not a landmark']);
});

test('unreachable landmarks are named, the real venues have none', () => {
  expect(unreachableLandmarks(base)).toEqual([]);
  expect(unreachableLandmarks(loadVenue('qsncc-lg-5-7'))).toEqual([]);
  expect(unreachableLandmarks({ ...base, floor: [] })).toEqual(
    base.landmarks.filter((l) => l.id !== base.origin).map((l) => l.id),
  );
});

const slowUnreachable = (v: typeof base) => {
  const origin = v.landmarks.find((l) => l.id === v.origin)!;
  const grid = createGrid(v, []);
  return v.landmarks
    .filter((l) => l.id !== origin.id && !isRouteOk(findRoute(grid, v, origin, { kind: 'place', lm: l })))
    .map((l) => l.id);
};

test('the fast walking check agrees with routing on real and broken floors', () => {
  const pinned = loadVenue('qsncc-lg-5-7');
  const cases = [
    base,
    pinned,
    { ...base, floor: [] },
    { ...base, floor: base.floor.slice(0, 1) },
    { ...base, floor: base.floor.filter((f) => f.op === 'add').slice(1) },
  ];
  for (const v of cases) expect(unreachableLandmarks(v)).toEqual(slowUnreachable(v));
});

test('the walking check is fast enough to run on every edit', () => {
  for (let i = 0; i < 3; i++) unreachableLandmarks(base);
  const t = performance.now();
  for (let i = 0; i < 5; i++) unreachableLandmarks(base);
  expect((performance.now() - t) / 5).toBeLessThan(25);
});

test('draftProblems catches what the server would refuse', () => {
  expect(draftProblems(base)).toEqual([]);
  const blank = updateLandmark(base, 'wc1', { en: '  ' });
  expect(draftProblems(blank)).toEqual(['wc1 needs a name in Thai and English']);
  const v = pinnedVenue().venue;
  const none = { ...v, geo: { ...v.geo!, entrances: [] } };
  expect(draftProblems(none)).toEqual(['Pick at least one street entrance']);
  const noEntries = setPin(
    { ...base, landmarks: base.landmarks.map((l) => ({ ...l, group: l.group === 'entry' ? 'other' : l.group })) },
    {
      id: 'p1',
      ...fakeLatLng(446, 280),
      x: 446,
      y: 280,
    },
  );
  expect(draftProblems(noEntries)).toContain('Pick at least one street entrance');
  expect(draftProblems(noEntries)).toContain('Map pins: needs at least 3 map pins');
});
