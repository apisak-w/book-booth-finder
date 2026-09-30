import { readFileSync } from 'node:fs';
import { parseCSV } from '../../../src/lib/core/csv';
import { normCode } from '../../../src/lib/core/codes';

export type ColumnMap = { booth: string; th?: string; en?: string };

const BOOTH = /^(booth|booths|booth ?no\.?|booth number|stand|code|บูธ|เลขบูธ|หมายเลขบูธ)$/i;
const EN = /(english|name.?\(?en\)?|\(en\)|ชื่อ.*อังกฤษ|^en$|^name$)/i;
const TH = /(thai|name.?\(?th\)?|\(th\)|ชื่อ.*ไทย|^th$|^ชื่อ$|ชื่อสำนักพิมพ์)/i;

export function guessColumns(headers: string[]): ColumnMap | null {
  const clean = headers.map((h) => h.replace(/^﻿/, '').trim());
  const booth = clean.find((h) => BOOTH.test(h));
  if (!booth) return null;
  const en = clean.find((h) => h !== booth && EN.test(h));
  const th = clean.find((h) => h !== booth && h !== en && TH.test(h));
  if (!th && !en) return null;
  return { booth, ...(th ? { th } : {}), ...(en ? { en } : {}) };
}

export function parseMap(arg: string): ColumnMap {
  const m = Object.fromEntries(arg.split(',').map((kv) => kv.split('=').map((s) => s.trim())));
  if (!m.booth) throw new Error('--map needs booth=<column>');
  return { booth: m.booth, ...(m.th ? { th: m.th } : {}), ...(m.en ? { en: m.en } : {}) };
}

export function expandCodes(cell: string, known: Set<string>): { codes: string[]; unknown: string[] } {
  const text = cell
    .toUpperCase()
    .replace(/[–—]/g, '-')
    .replace(/\s*-\s*/g, '-');
  const codes: string[] = [],
    unknown: string[] = [];
  for (const token of text.split(/[\s,;/]+/).filter(Boolean)) {
    const range = /^([A-Z])(\d{1,2})-([A-Z])?(\d{1,2})$/.exec(token);
    if (range && (!range[3] || range[3] === range[1])) {
      const [a, b] = [Number(range[2]), Number(range[4])].sort((x, y) => x - y);
      for (let n = a; n <= b; n++) {
        const c = normCode(`${range[1]}${n}`);
        if (known.has(c)) codes.push(c);
      }
      continue;
    }
    const c = normCode(token);
    (known.has(c) ? codes : unknown).push(c);
  }
  return { codes, unknown };
}

export function toExhibitorRows(rows: Record<string, string>[], map: ColumnMap, known: Set<string>) {
  const out: { booth: string; name_th: string; name_en: string }[] = [],
    unknown = new Set<string>();
  const get = (r: Record<string, string>, col?: string) => {
    if (!col) return '';
    const key = Object.keys(r).find((k) => k.toLowerCase() === col.toLowerCase());
    return key ? String(r[key] ?? '').trim() : '';
  };
  for (const r of rows) {
    const th = get(r, map.th),
      en = get(r, map.en);
    if (!th && !en) continue;
    const { codes, unknown: bad } = expandCodes(get(r, map.booth), known);
    bad.forEach((b) => unknown.add(b));
    for (const booth of codes) out.push({ booth, name_th: th, name_en: en });
  }
  return { rows: out, unknown: [...unknown] };
}

export async function readSheet(path: string): Promise<Record<string, string>[]> {
  if (/\.csv$/i.test(path)) return parseCSV(readFileSync(path, 'utf8'));
  const { readSheet: readXlsx } = await import('read-excel-file/node');
  const [head, ...body] = await readXlsx(path);
  const keys = head.map((h) => String(h ?? '').trim());
  return body.map((row) => Object.fromEntries(keys.map((k, i) => [k, row[i] == null ? '' : String(row[i])])));
}

const q = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

export const toCsv = (rows: { booth: string; name_th: string; name_en: string }[]) =>
  ['booth,name_th,name_en', ...rows.map((r) => [r.booth, r.name_th, r.name_en].map(q).join(','))].join('\n') + '\n';
