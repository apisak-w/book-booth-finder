import { test, expect } from 'bun:test';
import { cellStatus, upsertFix } from '../tools/pipeline/review/status';
import { EMPTY_CORRECTIONS } from '../tools/pipeline/lib/corrections';

const rect = { x: 0, y: 0, w: 30, h: 30 };
const read = (code: string | null, flags: string[] = []) => ({
  at: [15, 15] as [number, number],
  text: code ?? '',
  conf: 90,
  code,
  flags,
});

test('status follows corrections first, then reads', () => {
  expect(cellStatus(rect, [], EMPTY_CORRECTIONS).status).toBe('missing');
  expect(cellStatus(rect, [read('A01')], EMPTY_CORRECTIONS).status).toBe('read');
  expect(cellStatus(rect, [read('A01', ['duplicate'])], EMPTY_CORRECTIONS).status).toBe('flagged');
  const c = upsertFix(EMPTY_CORRECTIONS, rect, { code: 'A02' });
  expect(cellStatus(rect, [read('A01', ['duplicate'])], c)).toMatchObject({ status: 'code', code: 'A02' });
  expect(cellStatus(rect, [], upsertFix(c, rect, { pillar: true, code: undefined })).status).toBe('pillar');
  expect(cellStatus(rect, [], upsertFix(c, rect, { drop: true })).status).toBe('drop');
});

test('upsertFix edits the existing fix for the cell instead of adding another', () => {
  const a = upsertFix(EMPTY_CORRECTIONS, rect, { code: 'A02' });
  const b = upsertFix(a, rect, { code: 'A03' });
  expect(b.cells.length).toBe(1);
  expect(b.cells[0].code).toBe('A03');
  expect(EMPTY_CORRECTIONS.cells.length).toBe(0);
});

test('a fix inside an L-shaped bounding box belongs to the smaller cell', () => {
  const big = { x: 0, y: 0, w: 60, h: 50 };
  const small = { x: 0, y: 20, w: 28, h: 28 };
  const all = [big, small];
  const c = upsertFix(upsertFix(EMPTY_CORRECTIONS, small, { code: 'D28' }, all), big, { code: 'D30' }, all);
  expect(c.cells.length).toBe(2);
  expect(cellStatus(big, [], c, all).code).toBe('D30');
  expect(cellStatus(small, [], c, all).code).toBe('D28');
});
