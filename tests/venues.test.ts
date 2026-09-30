import { test, expect, describe } from 'bun:test';
import { listVenueIds, loadVenue } from '../src/lib/server/catalog';
import { pointInPolygon } from '../src/lib/core/geometry';
import { createGrid } from '../src/lib/core/grid';
import { findRoute } from '../src/lib/core/routing';
import { isRouteOk, type Box, type Point } from '../src/lib/core/types';

const segHitsBox = ([ax, ay]: Point, [bx, by]: Point, [x0, y0, x1, y1]: Box) => {
  for (let k = 0; k <= 50; k++) {
    const x = ax + ((bx - ax) * k) / 50,
      y = ay + ((by - ay) * k) / 50;
    if (x >= x0 && x <= x1 && y >= y0 && y <= y1) return true;
  }
  return false;
};

for (const id of listVenueIds()) {
  describe(`venue ${id}`, () => {
    const venue = loadVenue(id);

    test('origin is a venue landmark', () => {
      expect(venue.landmarks.some((l) => l.id === venue.origin)).toBe(true);
    });

    test('every door crosses a wall and names a known area', () => {
      const edges = venue.walls.flatMap((w) => w.map((p, k) => [p, w[(k + 1) % w.length]] as [Point, Point]));
      for (const d of venue.doors) {
        expect(edges.some(([a, b]) => segHitsBox(a, b, d.gap))).toBe(true);
        expect(venue.areas.some((a) => a.id === d.area)).toBe(true);
      }
    });

    test('area labels sit inside their area and areas do not overlap', () => {
      for (const a of venue.areas) expect(pointInPolygon(a.label.x, a.label.y, a.bounds)).toBe(true);
      const v = venue.view;
      for (let y = v.y + 5; y < v.y + v.h; y += 20)
        for (let x = v.x + 5; x < v.x + v.w; x += 20)
          expect(venue.areas.filter((a) => pointInPolygon(x, y, a.bounds)).length).toBeLessThanOrEqual(1);
    });

    test('every venue landmark is reachable from the origin on an empty floor', () => {
      const grid = createGrid(venue, []);
      const origin = venue.landmarks.find((l) => l.id === venue.origin)!;
      const bad = venue.landmarks.filter(
        (l) => l.id !== origin.id && !isRouteOk(findRoute(grid, venue, origin, { kind: 'place', lm: l })),
      );
      expect(bad.map((l) => l.id)).toEqual([]);
    });
  });
}
