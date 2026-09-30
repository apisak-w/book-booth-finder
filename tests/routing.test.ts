import { test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { loadEvent } from '../src/lib/server/catalog';
import { loadData } from '../src/lib/core/prepare';
import { createGrid, obstaclesOf } from '../src/lib/core/grid';
import { findRoute } from '../src/lib/core/routing';
import type { Dest } from '../src/lib/core/types';

const data = loadData(loadEvent('bkkibf-2026'));
const grid = createGrid(data.venue, obstaclesOf(data));
const golden = JSON.parse(readFileSync('tests/golden/v1.json', 'utf8'));
const round = (v: number) => Math.round(v * 10) / 10;

const destOf = (to: string): Dest => {
  const [kind, rest] = to.split(':');
  if (kind === 'place') return { kind: 'place', lm: data.landmarkById[rest] };
  const [code, n] = rest.split('#');
  return { kind: 'booth', b: data.byCode[code][Number(n)] };
};

test('every golden route matches v1', () => {
  const bad: string[] = [];
  for (const g of golden.routes) {
    const r = findRoute(grid, data.venue, data.landmarkById[g.from], destOf(g.to));
    const got =
      'P' in r
        ? {
            P: r.P.map(([x, y]) => [round(x), round(y)]),
            len: round(r.len),
            meters: r.meters,
            minutes: r.minutes,
            doors: r.doorsUsed.map((k) => data.venue.doors[k].id),
            halls: r.areas.map((a) => Number(a.slice(4))),
          }
        : r;
    if (JSON.stringify(got) !== JSON.stringify(g.r) && bad.length < 5) bad.push(`${g.from} -> ${g.to}`);
  }
  expect(bad).toEqual([]);
}, 60_000);

test('same start and destination is reported, not routed', () => {
  const wc2 = data.landmarkById.wc2;
  expect(findRoute(grid, data.venue, wc2, { kind: 'place', lm: wc2 })).toEqual({ same: true });
});

test('grid builds in under 200 ms', () => {
  const t = performance.now();
  createGrid(data.venue, obstaclesOf(data));
  expect(performance.now() - t).toBeLessThan(200);
});
