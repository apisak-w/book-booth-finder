import { test, expect, describe } from 'bun:test';
import { listEventIds, loadEvent } from '../src/lib/server/catalog';
import { loadData } from '../src/lib/core/prepare';
import { createGrid, obstaclesOf } from '../src/lib/core/grid';
import { findRoute } from '../src/lib/core/routing';
import { ICON_NAMES, isRouteOk } from '../src/lib/core/types';

for (const id of listEventIds()) {
  describe(`event ${id}`, () => {
    const bundle = loadEvent(id);
    const data = loadData(bundle);
    const { event, venue } = data;

    test('booth codes match the event code pattern', () => {
      const re = new RegExp(event.codePattern);
      expect(data.booths.filter((b) => !re.test(b.c)).map((b) => b.c)).toEqual([]);
    });

    test('only allowed duplicate codes exist', () => {
      const dups = Object.entries(data.byCode)
        .filter(([, l]) => l.length > 1)
        .map(([c]) => c)
        .sort();
      expect(dups).toEqual([...event.allowedDuplicateCodes].sort());
    });

    test('booths do not overlap', () => {
      const bs = data.booths.filter((b) => !b.foyer),
        hits: string[] = [];
      for (let i = 0; i < bs.length; i++)
        for (let j = i + 1; j < bs.length; j++) {
          const a = bs[i],
            b = bs[j];
          const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
          const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
          if (ox > 3 && oy > 3) hits.push(`${a.c}/${b.c}`);
        }
      expect(hits).toEqual([]);
    });

    test('every category used is defined, special exists with foyer zones', () => {
      const used = new Set([...data.booths.map((b) => b.cat), ...data.pillars.map((p) => p.cat)]);
      expect([...used].filter((c) => !event.categories[c])).toEqual([]);
      if (event.foyerZones.length) expect(event.categories.special).toBeDefined();
    });

    test('exhibitors point at real booths', () => {
      expect(data.unknownExhibitorBooths).toEqual([]);
    });

    test('zones refer to booths on the map', () => {
      expect(Object.keys(event.zones).filter((c) => !data.byCode[c])).toEqual([]);
    });

    test('landmark ids are unique across venue and event, icons known', () => {
      const ids = [...venue.landmarks, ...event.landmarks].map((l) => l.id);
      expect(ids.length).toBe(new Set(ids).size);
      expect(data.landmarks.filter((l) => !ICON_NAMES.includes(l.icon))).toEqual([]);
    });

    test('quick picks resolve', () => {
      const bad = event.quickPicks.filter(([k, v]) => (k === 'booth' ? !data.byCode[v] : !data.landmarkById[v]));
      expect(bad).toEqual([]);
    });

    test('every booth and landmark is reachable from the venue origin', () => {
      const grid = createGrid(venue, obstaclesOf(data));
      const origin = data.landmarkById[venue.origin];
      const unreachable = [
        ...data.booths.filter((b) => !isRouteOk(findRoute(grid, venue, origin, { kind: 'booth', b }))).map((b) => b.c),
        ...data.landmarks
          .filter((l) => l.id !== origin.id && !isRouteOk(findRoute(grid, venue, origin, { kind: 'place', lm: l })))
          .map((l) => l.id),
      ];
      expect(unreachable).toEqual([]);
    });
  });
}

test('aisles in the 2026 event stay at least 4 cells wide', () => {
  const data = loadData(loadEvent('bkkibf-2026'));
  const grid = createGrid(data.venue, obstaclesOf(data));
  const narrow: string[] = [];
  for (const y of [500, 1000, 1200]) {
    const row = Math.round((y - grid.y0) / grid.g - 0.5);
    for (const [letter, x] of Object.entries(data.event.aisles!.x)) {
      const c = Math.round((x - grid.x0) / grid.g - 0.5);
      let l = c,
        r = c;
      while (l > 0 && grid.walk[row * grid.gw + l - 1]) l--;
      while (r < grid.gw - 1 && grid.walk[row * grid.gw + r + 1]) r++;
      if (!grid.walk[row * grid.gw + c] || r - l + 1 < 4) narrow.push(`${letter}@${y}`);
    }
  }
  expect(narrow).toEqual([]);
});
