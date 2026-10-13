import { test, expect } from 'bun:test';
import { georef } from '../src/lib/core/geo';
import { SurroundingsSchema } from '../src/lib/server/schema';
import {
  kindOf,
  osmToSurroundings,
  overpassQuery,
  simplify,
  stitch,
  type OsmElement,
} from '../tools/pipeline/lib/surroundings';
import type { Box, Point } from '../src/lib/core/types';
import { fakeLatLng, fakePins, M } from './helpers/fake-geo';

const g = georef(fakePins());
const at = (x: number, y: number) => {
  const ll = fakeLatLng(x, y);
  return { lat: ll.lat, lon: ll.lng };
};
const bounds: Box = [-3000, -3000, 6000, 5000];

test('kindOf maps OSM tags to drawing kinds', () => {
  expect(kindOf({ natural: 'water' })).toBe('water');
  expect(kindOf({ leisure: 'park' })).toBe('park');
  expect(kindOf({ building: 'yes' })).toBe('building');
  expect(kindOf({ highway: 'primary' })).toBe('road');
  expect(kindOf({ highway: 'footway' })).toBe('path');
  expect(kindOf({ highway: 'motorway_link' })).toBeNull();
  expect(kindOf({ amenity: 'cafe' })).toBeNull();
});

test('simplify drops points on a straight line and keeps corners', () => {
  const line: Point[] = [
    [0, 0],
    [10, 0.2],
    [20, 0],
    [20, 20],
  ];
  expect(simplify(line, 1)).toEqual([
    [0, 0],
    [20, 0],
    [20, 20],
  ]);
});

test('stitch joins member ways that share ends', () => {
  const a = [at(0, 0), at(100, 0), at(100, 100)];
  const b = [at(0, 0), at(0, 100), at(100, 100)];
  const rings = stitch([a, b]);
  expect(rings.length).toBe(1);
  expect(rings[0][0]).toEqual(rings[0][rings[0].length - 1]);
});

test('osmToSurroundings projects, orders, sizes and labels', () => {
  const road = {
    highway: 'primary',
    name: 'Ratchadaphisek',
    'name:th': 'ถนนรัชดาภิเษก',
    'name:en': 'Ratchadaphisek Road',
  };
  const els: OsmElement[] = [
    { type: 'way', tags: road, geometry: [at(-500, 0), at(-500, 1000)] },
    { type: 'way', tags: road, geometry: [at(-500, 1000), at(-500, 3000)] },
    {
      type: 'way',
      tags: { building: 'yes' },
      geometry: [at(9000, 9000), at(9100, 9000), at(9100, 9100), at(9000, 9000)],
    },
    {
      type: 'relation',
      tags: { natural: 'water', name: 'Lake', 'name:en': 'Benjakitti Lake' },
      members: [
        { role: 'outer', geometry: [at(0, 1600), at(800, 1600), at(800, 2200)] },
        { role: 'outer', geometry: [at(0, 1600), at(0, 2200), at(800, 2200)] },
      ],
    },
  ];
  const s = osmToSurroundings(els, g, bounds, M);
  expect(s.credit).toBe('© OpenStreetMap contributors');
  expect(s.shapes.map((x) => x.kind)).toEqual(['water', 'road', 'road']);
  expect(s.shapes[1].w).toBe(Math.round(18 / M));
  expect(s.shapes[0].d.endsWith('Z')).toBe(true);
  expect(s.shapes[0].d.match(/M/g)?.length).toBe(1);
  expect(s.labels.map((l) => l.text.en).sort()).toEqual(['Benjakitti Lake', 'Ratchadaphisek Road']);
  expect(SurroundingsSchema.safeParse(s).success).toBe(true);
});

test('overpassQuery asks for the bounding box with geometry', () => {
  const q = overpassQuery({ s: 13.7, w: 100.5, n: 13.8, e: 100.6 });
  expect(q).toContain('(13.700000,100.500000,13.800000,100.600000)');
  expect(q.endsWith('out geom;')).toBe(true);
});
