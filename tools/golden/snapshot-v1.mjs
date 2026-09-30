import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { prepareData, parseCSV } from '../../legacy/src/data.js';
import { createGrid, findRoute, hallAt } from '../../legacy/src/routing.js';
import { buildSteps } from '../../legacy/src/directions.js';
import { createSearch } from '../../legacy/src/search.js';
import { STRINGS, LANDMARKS } from '../../legacy/src/content.js';
import { VIEW, GRID_CELL, DOORS } from '../../legacy/src/config.js';

const root = new URL('../../legacy/', import.meta.url);
const raw = JSON.parse(readFileSync(new URL('data/booths.json', root)));
const data = prepareData(raw, parseCSV(readFileSync(new URL('data/exhibitors.csv', root), 'utf8')));
const grid = createGrid(data);
const key = (b) => `${b.c}#${data.byCode[b.c].indexOf(b)}`;
const round = (v) => Math.round(v * 10) / 10;

const cols = Math.ceil(VIEW.w / GRID_CELL),
  rows = Math.ceil(VIEW.h / GRID_CELL);
let halls = '';
for (let r = 0; r < rows; r++)
  for (let c = 0; c < cols; c++) {
    const h = hallAt(VIEW.x + (c + 0.5) * GRID_CELL, VIEW.y + (r + 0.5) * GRID_CELL);
    halls += h ? String(h) : '0';
  }

const routes = [];
const record = (from, dest) => {
  const r = findRoute(grid, from, dest);
  const to = dest.kind === 'booth' ? `booth:${key(dest.b)}` : `place:${dest.lm.id}`;
  if (!r.P) {
    routes.push({ from: from.id, to, r });
    return;
  }
  routes.push({
    from: from.id,
    to,
    r: {
      P: r.P.map(([x, y]) => [round(x), round(y)]),
      len: round(r.len),
      meters: r.meters,
      minutes: r.minutes,
      doors: r.doorsUsed.map((k) => DOORS[k].id),
      halls: r.halls,
    },
    en: buildSteps(r, from, dest, STRINGS.en, (o) => o.en),
    th: buildSteps(r, from, dest, STRINGS.th, (o) => o.th),
  });
};
const lm = (id) => LANDMARKS.find((l) => l.id === id);
for (const id of ['mrt', 'door6', 'info4']) for (const b of data.booths) record(lm(id), { kind: 'booth', b });
const sample = ['A42', 'D20', 'G16', 'K16', 'P16', 'T02', 'A31', 'U07', 'C17', 'E20', 'D30', 'H31'];
for (const from of LANDMARKS)
  for (const c of sample) for (const b of data.byCode[c]) record(from, { kind: 'booth', b });
for (const from of LANDMARKS) for (const to of LANDMARKS) record(from, { kind: 'place', lm: to });

const search = createSearch(data);
const queries = [
  'K16',
  'k 16',
  'k1',
  'k',
  'a0',
  'author',
  'ห้องน้ำ',
  'stage',
  'เวที',
  'info',
  'u07',
  'h31',
  't',
  'legend',
  'mrt',
  'door',
  'ประตู',
  'charge',
  'ชาร์จ',
  'xyz',
  'hall',
  'read the',
];
const hitKey = (it) =>
  it.type === 'place'
    ? `place:${it.lm.id}`
    : it.type === 'exh'
      ? `exh:${key(it.b)}:${it.ex.en || it.ex.th}`
      : `booth:${key(it.b)}`;

const boothHalls = Object.fromEntries(data.booths.map((b) => [key(b), b.hall]));
mkdirSync(new URL('../../tests/golden/', import.meta.url), { recursive: true });
writeFileSync(
  new URL('../../tests/golden/v1.json', import.meta.url),
  JSON.stringify({
    lattice: { x0: VIEW.x, y0: VIEW.y, step: GRID_CELL, cols, rows, halls },
    routes,
    search: queries.map((q) => ({ q, hits: search(q).map(hitKey) })),
    boothHalls,
  }),
);
console.log(`${routes.length} routes, ${queries.length} queries`);
