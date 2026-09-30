import { test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { loadEvent } from '../src/lib/server/catalog';
import { loadData, prepareData } from '../src/lib/core/prepare';
import { parseCSV } from '../src/lib/core/csv';
import { createSearch, type SearchItem } from '../src/lib/core/search';

const bundle = loadEvent('bkkibf-2026');
const data = loadData({ ...bundle, exhibitors: [] });
const golden = JSON.parse(readFileSync('tests/golden/v1.json', 'utf8'));
const key = (it: SearchItem) => {
  if (it.type === 'place') return `place:${it.lm.id}`;
  const k = `${it.b.c}#${data.byCode[it.b.c].indexOf(it.b)}`;
  return it.type === 'exh' ? `exh:${k}:${it.ex.en || it.ex.th}` : `booth:${k}`;
};

test('search results match v1 for every golden query', () => {
  const find = createSearch(data);
  for (const g of golden.search) expect({ q: g.q, hits: find(g.q).map(key) }).toEqual(g);
});

test('search finds publishers from the CSV', () => {
  const d = prepareData(
    bundle.venue,
    bundle.event,
    bundle.booths,
    parseCSV('booth,name_th,name_en\nK16,สำนักพิมพ์ทดสอบ,Test Press\n'),
  );
  const find = createSearch(d);
  const hit = find('test press')[0];
  expect(hit.type).toBe('exh');
  expect(hit.type !== 'place' && hit.b.c).toBe('K16');
});
