import { test, expect } from 'bun:test';
import { parseCSV } from '../src/lib/core/csv';
import { normCode } from '../src/lib/core/codes';

test('parseCSV handles quotes, commas, BOM and comments', () => {
  const rows = parseCSV('﻿booth,name_th,name_en\r\n# note\r\nk16,"สำนักพิมพ์ ""ก""","Pub, Inc."\n');
  expect(rows).toEqual([{ booth: 'k16', name_th: 'สำนักพิมพ์ "ก"', name_en: 'Pub, Inc.' }]);
});

test('parseCSV returns [] for header-only or empty input', () => {
  expect(parseCSV('booth,name_th,name_en\n')).toEqual([]);
  expect(parseCSV('')).toEqual([]);
});

test('normCode pads and uppercases', () => {
  expect(normCode(' k 7 ')).toBe('K07');
  expect(normCode('K16')).toBe('K16');
  expect(normCode('1A-01')).toBe('1A-01');
});
