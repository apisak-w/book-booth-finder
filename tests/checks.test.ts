import { test, expect, beforeAll, afterAll } from 'bun:test';
import { cpSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadEvent, loadCheckedEvent, CatalogError } from '../src/lib/server/catalog';
import { checkEvent } from '../src/lib/server/checks';
import { prepareData } from '../src/lib/core/prepare';
import { parseCSV } from '../src/lib/core/csv';

const bundle = loadEvent('bkkibf-2026');
let root = '';
beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'bf-'));
  cpSync('venues', join(root, 'venues'), { recursive: true });
  cpSync('events/bkkibf-2026', join(root, 'events/bkkibf-2026'), { recursive: true });
});
afterAll(() => rmSync(root, { recursive: true, force: true }));

test('the 2026 event passes every check', () => {
  expect(checkEvent(prepareData(bundle.venue, bundle.event, bundle.booths, bundle.exhibitors))).toEqual([]);
});

test('duplicate codes, unknown categories and unknown exhibitor booths are reported', () => {
  const booths = {
    ...bundle.booths,
    booths: [...bundle.booths.booths, { ...bundle.booths.booths[0], x: 5000, cat: 'nope' }],
  };
  const problems = checkEvent(
    prepareData(bundle.venue, bundle.event, booths, parseCSV('booth,name_th,name_en\nZ99,ก,A\n')),
  );
  expect(problems.join('\n')).toContain('duplicate booth code A42');
  expect(problems.join('\n')).toContain('category "nope"');
  expect(problems.join('\n')).toContain('Z99');
});

test('the site build refuses an event that fails the checks', () => {
  writeFileSync(join(root, 'events/bkkibf-2026/exhibitors.csv'), 'booth,name_th,name_en\nZ99,ก,A\n');
  expect(() => loadCheckedEvent('bkkibf-2026', root)).toThrow(CatalogError);
  expect(() => loadCheckedEvent('bkkibf-2026', root)).toThrow(/events\/bkkibf-2026: .*Z99/);
});
