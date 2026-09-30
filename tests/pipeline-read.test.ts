import { test, expect } from 'bun:test';
import { cleanRead, flagReads, readBox } from '../tools/pipeline/lib/read';
import type { Read } from '../tools/pipeline/lib/build';

const P = '^[A-Z]\\d{2}$';

test('cleanRead fixes common confusions by position', () => {
  expect(cleanRead(' k16 ', P)).toBe('K16');
  expect(cleanRead('KI6', P)).toBe('K16');
  expect(cleanRead('0O4', P)).toBe('O04');
  expect(cleanRead('B2S', P)).toBe('B25');
  expect(cleanRead('K1', P)).toBeNull();
  expect(cleanRead('', P)).toBeNull();
});

test('readBox stays inside the cell so divider gaps are not read', () => {
  expect(readBox({ x: 100, y: 100, w: 30, h: 60 })).toEqual([102, 114, 128, 146]);
});

const rd = (x: number, y: number, code: string | null, conf = 90): Read => ({
  at: [x, y],
  text: code ?? '',
  conf,
  code,
  flags: [],
});

test('flagReads marks unread, low confidence and duplicates', () => {
  const rects = [
    { x: 0, y: 0, w: 10, h: 10 },
    { x: 100, y: 0, w: 10, h: 10 },
    { x: 200, y: 0, w: 10, h: 10 },
  ];
  const out = flagReads([rd(5, 5, null), rd(105, 5, 'A01', 40), rd(205, 5, 'A01')], rects);
  expect(out[0].flags).toContain('unread');
  expect(out[1].flags).toEqual(expect.arrayContaining(['low-confidence', 'duplicate']));
  expect(out[2].flags).toContain('duplicate');
});

test('flagReads checks letters and order within a column', () => {
  const rects = [0, 1, 2, 3].map((k) => ({ x: 0, y: k * 30, w: 29, h: 29 }));
  const out = flagReads([rd(5, 5, 'K20'), rd(5, 35, 'K18'), rd(5, 65, 'L16'), rd(5, 95, 'K19')], rects);
  expect(out[2].flags).toContain('column-letter');
  expect(out[3].flags).toContain('column-order');
  expect(out[0].flags).toEqual([]);
});
