import { writeFileSync, mkdirSync, copyFileSync, readFileSync } from 'node:fs';
import * as C from '../../legacy/src/config.js';
import { LANDMARKS, STRINGS, CATEGORIES, ZONES, QUICK_PICKS } from '../../legacy/src/content.js';

const VENUE_IDS = ['mrt', 'west', 'door5', 'door6', 'door7', 'door8', 'wc1', 'wc2', 'wc3', 'wc4', 'wc5', 'wc6', 'lift'];
const W = C.WALKABLE;
const floor: { op: 'add' | 'remove'; box: number[] }[] = [{ op: 'add', box: W.hall }];
for (const [a, b] of C.RECESSES) {
  floor.push({ op: 'remove', box: [a, 1436, b, 1470] });
  floor.push({ op: 'add', box: [a, 1446, b, 1470] });
}
for (const r of W.sideBays) floor.push({ op: 'add', box: r });
for (const r of W.mrtCorridor) floor.push({ op: 'add', box: r });
floor.push({ op: 'add', box: W.foyer });

const x1 = C.VIEW.x + C.VIEW.w;
const hall = (n: number, x0: number, xe: number) => ({
  id: `hall${n}`,
  name: { th: `ฮอลล์ ${n}`, en: `Hall ${n}` },
  label: { x: C.HALL_LABELS.find((l: number[]) => l[2] === n)[0], y: 1424, text: `HALL ${n}` },
  bounds: [
    [x0, C.VIEW.y],
    [xe, C.VIEW.y],
    [xe, 1466],
    [x0, 1466],
  ],
});
const hall5 = {
  ...hall(5, 446, 749),
  bounds: [
    [446, C.VIEW.y],
    [749, C.VIEW.y],
    [749, 1466],
    [446, 1466],
    [446, 1205],
    [C.VIEW.x, 1205],
    [C.VIEW.x, 976],
    [446, 976],
    [446, 772],
    [C.VIEW.x, 772],
    [C.VIEW.x, 556],
    [446, 556],
  ],
};

const doors = C.DOORS.map((d: { id: string; x: number; hall: number }) =>
  d.id === 'west'
    ? { id: d.id, area: `hall${d.hall}`, punch: [436, 848, 456, 912], gap: [442, 852, 450, 908] }
    : {
        id: d.id,
        area: `hall${d.hall}`,
        punch: [d.x - 30, 1430, d.x + 30, 1474],
        gap: [d.x - 28, 1436, d.x + 28, 1444],
      },
);

const landmarks = LANDMARKS.filter((l: { id: string }) => VENUE_IDS.includes(l.id)).map(
  (l: { id: string; icon: string }) => ({ ...l, icon: l.id === 'west' ? 'doorSide' : l.icon }),
);

const venue = {
  id: 'qsncc-lg-5-8',
  name: { th: 'ศูนย์ฯ สิริกิติ์ ชั้น LG ฮอลล์ 5–8', en: 'QSNCC Level LG, Halls 5–8' },
  timezone: 'Asia/Bangkok',
  reference: { width: 2560, height: 1932 },
  view: C.VIEW,
  overview: { narrow: { box: [380, 270, 2400, 1560], pad: 10 }, wide: { box: [190, 250, 2400, 1650], pad: 20 } },
  metersPerPx: C.M_PER_PX,
  gridCell: C.GRID_CELL,
  walls: [C.HALL_OUTLINE],
  floor,
  areas: [hall5, hall(6, 749, 1300), hall(7, 1300, 1852), hall(8, 1852, x1)],
  outside: { th: 'หน้าฮอลล์', en: 'Outside the halls' },
  doors,
  depth: {
    back: 284,
    front: 1460,
    text: {
      back: { th: 'บูธอยู่ช่วงท้ายทางเดิน ใกล้ผนังด้านใน', en: 'The booth is near the back-wall end of the aisle.' },
      mid: { th: 'บูธอยู่ประมาณกลางทางเดิน', en: 'The booth is about halfway along the aisle.' },
      front: { th: 'บูธอยู่ช่วงต้นทางเดิน ใกล้ประตูฝั่งทะเลสาบ', en: 'The booth is near the lakeside end of the aisle.' },
    },
    aisleHint: { th: '(ตัวอักษรตามแนวผนังด้านใน)', en: 'Aisle letters run along the back wall.' },
  },
  landmarks,
  origin: 'mrt',
};

mkdirSync('venues/qsncc-lg-5-8', { recursive: true });
writeFileSync('venues/qsncc-lg-5-8/venue.json', JSON.stringify(venue, null, 2) + '\n');
copyFileSync('tools/digitize/source/floorplan-2026.jpg', 'venues/qsncc-lg-5-8/reference.jpg');
console.log('venue written');

const raw = JSON.parse(readFileSync('legacy/data/booths.json', 'utf8'));
const rectOf = ([x, y, w, h]: number[]) => ({ x, y, w, h });
const booths = {
  booths: raw.booths.map(({ hall: _hall, extra, ...b }: { hall: number; extra?: number[][] }) =>
    extra ? { ...b, extra: extra.map(rectOf) } : b,
  ),
  pillars: raw.pillars.map(({ px, py, pw, ph, ...p }: Record<string, number | string>) => ({
    ...p,
    inner: { x: px, y: py, w: pw, h: ph },
  })),
};

const [sx, sy, sw, sh] = C.STAGE;
const event = {
  id: 'bkkibf-2026',
  name: {
    th: 'สัปดาห์หนังสือแห่งชาติ ครั้งที่ 54 และสัปดาห์หนังสือนานาชาติ ครั้งที่ 24',
    en: '54th National Book Fair & 24th Bangkok International Book Fair',
  },
  subtitle: { th: STRINGS.th.subtitle, en: STRINGS.en.subtitle },
  dates: { start: '2026-03-26', end: '2026-04-06' },
  venue: 'qsncc-lg-5-8',
  codePattern: '^[A-U]\\d{2}$',
  categories: CATEGORIES,
  zones: ZONES,
  foyerZones: C.FOYER_ZONES.map(([c, x, y, w, h, vertical]: [string, number, number, number, number, boolean?]) =>
    vertical ? { c, x, y, w, h, vertical: true } : { c, x, y, w, h },
  ),
  obstacles: [
    ...C.INFO_DESKS.map(([x, y, w, h]: number[]) => ({ kind: 'info', x, y, w, h })),
    { kind: 'stage', x: sx, y: sy, w: sw, h: sh, note: 'Interview Area' },
  ],
  aisles: { signY: C.AISLE_SIGN_Y, boothMinY: 340, x: C.AISLE_X },
  landmarks: LANDMARKS.filter((l: { id: string }) => !VENUE_IDS.includes(l.id)),
  quickPicks: QUICK_PICKS,
  allowedDuplicateCodes: ['H31'],
  notes: [
    'Hall boundaries are inferred from wall recesses and door positions (x = 749 / 1300 / 1852). Confirm with PUBAT.',
    'H31 appears twice on the printed plan. The second B44 was renamed D44 and the second D15 became E15 by column position.',
    'M11 sits where the column pattern predicts N11. Kept as printed.',
    'U04 and U06 have placeholder names. A10 and A15 are best-effort readings of small print.',
    'The exhibitor list is empty. Get it from the organiser as a spreadsheet.',
    'Toilet door positions on the back wall are approximate.',
  ],
  text: {
    ph: { th: STRINGS.th.ph, en: STRINGS.en.ph },
    searchLabel: { th: STRINGS.th.searchLabel, en: STRINGS.en.searchLabel },
    exhibitors: { th: STRINGS.th.publishers, en: STRINGS.en.publishers },
  },
};

mkdirSync('events/bkkibf-2026/source', { recursive: true });
writeFileSync('events/bkkibf-2026/event.json', JSON.stringify(event, null, 2) + '\n');
const line = (o: unknown) => '    ' + JSON.stringify(o);
writeFileSync(
  'events/bkkibf-2026/booths.json',
  '{\n  "booths": [\n' +
    booths.booths.map(line).join(',\n') +
    '\n  ],\n  "pillars": [\n' +
    booths.pillars.map(line).join(',\n') +
    '\n  ]\n}\n',
);
copyFileSync('legacy/data/exhibitors.csv', 'events/bkkibf-2026/exhibitors.csv');
copyFileSync('tools/digitize/source/floorplan-2026.jpg', 'events/bkkibf-2026/source/plan.jpg');
console.log('event written');
