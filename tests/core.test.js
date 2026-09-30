// Run with: npm test   (Node 18+, no dependencies)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { prepareData, parseCSV, normCode } from '../src/data.js';
import { createSearch } from '../src/search.js';
import { createGrid, findRoute, hallAt } from '../src/routing.js';
import { buildSteps } from '../src/directions.js';
import { STRINGS, LANDMARKS, ZONES, CATEGORIES } from '../src/content.js';

const raw = JSON.parse(readFileSync(new URL('../data/booths.json', import.meta.url)));
const csv = parseCSV(readFileSync(new URL('../data/exhibitors.csv', import.meta.url), 'utf8'));
const data = prepareData(raw, csv);
const grid = createGrid(data);
const lm = (id) => LANDMARKS.find((l) => l.id === id);
const booth = (c) => data.byCode[c][0];
const nameOf = (o) => o.en;

test('booth data is well-formed', () => {
  assert.ok(data.booths.length >= 370, 'expected ~380 booths incl. foyer zones');
  const codeRe = /^[A-U]\d\d$/;
  for (const b of data.booths) {
    assert.match(b.c, codeRe, `bad code ${b.c}`);
    assert.ok(CATEGORIES[b.cat], `unknown category ${b.cat} on ${b.c}`);
    assert.ok(b.w > 0 && b.h > 0);
  }
});

test('only known duplicate codes exist', () => {
  const dups = Object.entries(data.byCode).filter(([, l]) => l.length > 1).map(([c]) => c);
  assert.deepEqual(dups, ['H31'], 'a new duplicate booth code appeared; see CLAUDE.md "Known data issues"');
});

test('booths do not overlap each other', () => {
  const bs = data.booths.filter((b) => !b.foyer);
  for (let i = 0; i < bs.length; i++) for (let j = i + 1; j < bs.length; j++) {
    const a = bs[i], b = bs[j];
    const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
    const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
    assert.ok(!(ox > 3 && oy > 3), `${a.c} overlaps ${b.c}`);
  }
});

test('every exhibitor in the CSV points at a real booth', () => {
  assert.deepEqual(data.unknownExhibitorBooths, []);
});

test('every zone name and landmark has both languages', () => {
  for (const [c, z] of Object.entries(ZONES)) { assert.ok(z.th && z.en, c); assert.ok(data.byCode[c], `zone ${c} not on map`); }
  for (const l of LANDMARKS) assert.ok(l.th && l.en, l.id);
  const keys = (o) => Object.keys(o).sort();
  assert.deepEqual(keys(STRINGS.th), keys(STRINGS.en));
});

test('parseCSV handles quotes, commas, BOM and comments', () => {
  const rows = parseCSV('\uFEFFbooth,name_th,name_en\r\n# note\r\nk16,"สำนักพิมพ์ ""ก""","Pub, Inc."\n');
  assert.deepEqual(rows, [{ booth: 'k16', name_th: 'สำนักพิมพ์ "ก"', name_en: 'Pub, Inc.' }]);
  assert.equal(normCode(' k 7 '), 'K07');
});

test('search finds codes, prefixes, zones and places', () => {
  const find = createSearch(data);
  assert.equal(find('K16')[0].b.c, 'K16');
  assert.equal(find('k 16')[0].b.c, 'K16');
  assert.ok(find('k1').every((r) => r.b.c.startsWith('K')));
  assert.equal(find('author')[0].b.c, 'A02');
  assert.ok(find('ห้องน้ำ').some((r) => r.type === 'place' && r.lm.group === 'wc'));
});

test('search finds publishers from the CSV', () => {
  const d = prepareData(raw, parseCSV('booth,name_th,name_en\nK16,สำนักพิมพ์ทดสอบ,Test Press\n'));
  const find = createSearch(d);
  const hit = find('test press')[0];
  assert.equal(hit.type, 'exh'); assert.equal(hit.b.c, 'K16');
  assert.equal(find('ทดสอบ')[0].b.c, 'K16');
});

test('hall assignment follows the configured splits', () => {
  assert.equal(booth('A02').hall, 5);
  assert.equal(booth('T02').hall, 8);
  assert.equal(hallAt(2219, 822), 8); // main stage
  assert.equal(hallAt(700, 1550), null); // foyer
});

test('routes exist from every landmark to a sample of booths', () => {
  const sample = ['A42', 'D20', 'G16', 'K16', 'P16', 'T02', 'A31', 'U07', 'C17', 'E20'];
  for (const l of LANDMARKS) for (const c of sample) {
    const r = findRoute(grid, l, { kind: 'booth', b: booth(c) });
    assert.ok(r.P, `no route ${l.id} -> ${c}`);
    assert.ok(r.meters > 0 && r.meters < 400, `${l.id} -> ${c}: ${r.meters} m looks wrong`);
  }
});

test('every booth is reachable from the MRT', () => {
  const unreachable = data.booths.filter((b) => !findRoute(grid, lm('mrt'), { kind: 'booth', b }).P).map((b) => b.c);
  assert.deepEqual(unreachable, []);
});

test('entering from the foyer uses a door', () => {
  const r = findRoute(grid, lm('info2'), { kind: 'booth', b: booth('K16') });
  assert.ok(r.doorsUsed.length >= 1);
});

test('same start and destination is reported, not routed', () => {
  assert.deepEqual(findRoute(grid, lm('wc2'), { kind: 'place', lm: lm('wc2') }), { same: true });
});

test('directions mention the aisle and arrival', () => {
  const dest = { kind: 'booth', b: booth('K16') };
  const r = findRoute(grid, lm('mrt'), dest);
  const steps = buildSteps(r, lm('mrt'), dest, STRINGS.en, nameOf);
  assert.match(steps[0], /^Start at MRT/);
  assert.ok(steps.some((x) => /aisle K/.test(x)));
  assert.match(steps.at(-1), /K16/);
});
