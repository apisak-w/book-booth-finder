import { test, expect } from 'bun:test';
import { parseCSV } from '../src/lib/core/csv';
import { expandCodes, guessColumns, parseMap, toCsv, toExhibitorRows } from '../tools/pipeline/lib/exhibitors';

const known = new Set(['K16', 'K17', 'K18', 'K20', 'A01']);

test('guesses Thai and English headers', () => {
  expect(guessColumns(['บูธ', 'ชื่อ', 'Name (EN)'])).toEqual({ booth: 'บูธ', th: 'ชื่อ', en: 'Name (EN)' });
  expect(guessColumns(['Booth No.', 'Publisher (TH)', 'Publisher (EN)'])).toEqual({
    booth: 'Booth No.',
    th: 'Publisher (TH)',
    en: 'Publisher (EN)',
  });
  expect(guessColumns(['foo', 'bar'])).toBeNull();
});

test('expands lists and en dash ranges, keeping only codes on the map for ranges', () => {
  expect(expandCodes('K16–K20', known)).toEqual({ codes: ['K16', 'K17', 'K18', 'K20'], unknown: [] });
  expect(expandCodes('k16, k18', known)).toEqual({ codes: ['K16', 'K18'], unknown: [] });
  expect(expandCodes('K16 - 18', known)).toEqual({ codes: ['K16', 'K17', 'K18'], unknown: [] });
  expect(expandCodes('Z99', known)).toEqual({ codes: [], unknown: ['Z99'] });
});

test('builds rows from a BOM CSV with Thai headers', () => {
  const rows = parseCSV('﻿บูธ,ชื่อ,ชื่ออังกฤษ\nK16–K18,สำนักพิมพ์ก,Pub A\nA1,สำนักพิมพ์ข,\n');
  const map = guessColumns(Object.keys(rows[0]))!;
  const out = toExhibitorRows(rows, map, known);
  expect(out.unknown).toEqual([]);
  expect(out.rows.map((r) => r.booth)).toEqual(['K16', 'K17', 'K18', 'A01']);
  expect(toCsv(out.rows).split('\n')[0]).toBe('booth,name_th,name_en');
});

test('parseMap reads the override flag', () => {
  expect(parseMap('booth=Stand,th=ชื่อ,en=Name')).toEqual({ booth: 'Stand', th: 'ชื่อ', en: 'Name' });
});

test('names with commas and quotes survive the CSV round trip', () => {
  const csv = toCsv([{ booth: 'A01', name_th: 'ก "ข"', name_en: 'Pub, Inc.' }]);
  expect(parseCSV(csv)).toEqual([{ booth: 'A01', name_th: 'ก "ข"', name_en: 'Pub, Inc.' }]);
});

test('reads an XLSX sheet with the header row as keys', async () => {
  const { default: writeXlsx } = await import('write-excel-file/node');
  const { readSheet } = await import('../tools/pipeline/lib/exhibitors');
  const { mkdtempSync } = await import('node:fs');
  const { join } = await import('node:path');
  const { tmpdir } = await import('node:os');
  const file = join(mkdtempSync(join(tmpdir(), 'bf-')), 'list.xlsx');
  await writeXlsx([
    [{ value: 'Booth No.' }, { value: 'Publisher (TH)' }, { value: 'Publisher (EN)' }],
    [{ value: 'K16' }, { value: 'สำนักพิมพ์ก' }, { value: 'Pub A' }],
    [{ value: 'K16, K18' }, { value: 'ข' }, null],
  ]).toFile(file);
  const rows = await readSheet(file);
  expect(rows).toEqual([
    { 'Booth No.': 'K16', 'Publisher (TH)': 'สำนักพิมพ์ก', 'Publisher (EN)': 'Pub A' },
    { 'Booth No.': 'K16, K18', 'Publisher (TH)': 'ข', 'Publisher (EN)': '' },
  ]);
  const map = guessColumns(Object.keys(rows[0]))!;
  expect(toExhibitorRows(rows, map, known).rows.map((r) => r.booth)).toEqual(['K16', 'K16', 'K18']);
});
