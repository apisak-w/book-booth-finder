import { test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { loadEvent } from '../src/lib/server/catalog';
import { loadData, prepareData } from '../src/lib/core/prepare';
import { parseCSV } from '../src/lib/core/csv';

const bundle = loadEvent('bkkibf-2026');
const data = loadData(bundle);
const golden = JSON.parse(readFileSync('tests/golden/v1.json', 'utf8'));
const V1_LANDMARK_ORDER = [
  'mrt',
  'west',
  'door5',
  'door6',
  'door7',
  'door8',
  'wc1',
  'wc2',
  'wc3',
  'wc4',
  'wc5',
  'wc6',
  'info1',
  'info2',
  'info3',
  'info4',
  'info5',
  'ch1',
  'ch2',
  'ch3',
  'ch4',
  'stage',
  'lift',
];

test('booths include foyer zones with no area', () => {
  expect(data.booths.length).toBe(369 + 11);
  const u07 = data.byCode.U07[0];
  expect(u07.foyer).toBe(true);
  expect(u07.area).toBeNull();
  expect(u07.cat).toBe('special');
});

test('booth areas match v1 halls', () => {
  const bad = data.booths
    .map((b) => {
      const key = `${b.c}#${data.byCode[b.c].indexOf(b)}`;
      const want = golden.boothHalls[key];
      const got = b.area ? Number(b.area.slice(4)) : null;
      return got === want ? null : `${key}: ${got} != ${want}`;
    })
    .filter(Boolean);
  expect(bad).toEqual([]);
});

test('landmarks merge venue and event in v1 order', () => {
  expect(data.landmarks.map((l) => l.id)).toEqual(V1_LANDMARK_ORDER);
  expect(data.landmarkById.stage.group).toBe('stage');
});

test('exhibitors normalise codes and report unknown booths', () => {
  const d = prepareData(
    bundle.venue,
    bundle.event,
    bundle.booths,
    parseCSV('booth,name_th,name_en\nk16,ก,Test\nZ99,ข,Nope\n'),
  );
  expect(d.exhibitors[0]).toEqual({ booth: 'K16', th: 'ก', en: 'Test' });
  expect(d.unknownExhibitorBooths).toEqual(['Z99']);
});
