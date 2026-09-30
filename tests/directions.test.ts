import { test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { loadEvent } from '../src/lib/server/catalog';
import { loadData } from '../src/lib/core/prepare';
import { createGrid, obstaclesOf } from '../src/lib/core/grid';
import { findRoute } from '../src/lib/core/routing';
import { buildSteps, isAisleBooth } from '../src/lib/core/directions';
import { isRouteOk, type Dest } from '../src/lib/core/types';

const data = loadData(loadEvent('bkkibf-2026'));
const grid = createGrid(data.venue, obstaclesOf(data));
const golden = JSON.parse(readFileSync('tests/golden/v1.json', 'utf8'));
const destOf = (to: string): Dest => {
  const [kind, rest] = to.split(':');
  if (kind === 'place') return { kind: 'place', lm: data.landmarkById[rest] };
  const [code, n] = rest.split('#');
  return { kind: 'booth', b: data.byCode[code][Number(n)] };
};

test('steps match v1 in both languages for every golden route', () => {
  const bad: string[] = [];
  for (const g of golden.routes) {
    if (!g.en) continue;
    const start = data.landmarkById[g.from],
      dest = destOf(g.to);
    const r = findRoute(grid, data.venue, start, dest);
    if (!isRouteOk(r)) {
      bad.push(`${g.from} -> ${g.to}: no route`);
      continue;
    }
    for (const lang of ['en', 'th'] as const) {
      const got = buildSteps(r, start, dest, data, lang);
      if (JSON.stringify(got) !== JSON.stringify(g[lang]) && bad.length < 5)
        bad.push(`${lang} ${g.from} -> ${g.to}: ${got.join(' | ')}`);
    }
  }
  expect(bad).toEqual([]);
}, 60_000);

test('foyer zones and top-row booths are not aisle booths', () => {
  expect(isAisleBooth(data.byCode.U07[0], data)).toBe(false);
  expect(isAisleBooth(data.byCode.K16[0], data)).toBe(true);
});
