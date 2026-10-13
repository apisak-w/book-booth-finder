import { test, expect } from 'bun:test';
import {
  clearDraft,
  draftKey,
  isStale,
  push,
  readDraft,
  redo,
  start,
  undo,
  writeDraft,
  HISTORY_LIMIT,
} from '../src/lib/admin/history';
import { makeStore } from '../src/lib/storage';
import { loadVenue } from '../src/lib/server/catalog';

const memory = () => {
  const m = new Map<string, string>();
  return makeStore(
    () =>
      ({
        getItem: (k: string) => m.get(k) ?? null,
        setItem: (k: string, v: string) => void m.set(k, v),
      }) as unknown as Storage,
  );
};

test('undo and redo walk the history, a new change clears redo', () => {
  let h = push(push(start(1), 2), 3);
  h = undo(h);
  expect(h.present).toBe(2);
  h = undo(undo(h));
  expect(h.present).toBe(1);
  h = redo(h);
  expect(h.present).toBe(2);
  h = push(h, 9);
  expect(h).toEqual({ past: [1, 2], present: 9, future: [] });
  expect(redo(h)).toBe(h);
});

test('history keeps at most the last 100 steps', () => {
  let h = start(0);
  for (let i = 1; i <= HISTORY_LIMIT + 20; i++) h = push(h, i);
  expect(h.past).toHaveLength(HISTORY_LIMIT);
  expect(h.past[0]).toBe(20);
});

test('drafts are saved per venue, read back, cleared and judged stale', () => {
  const kv = memory();
  const venue = loadVenue('qsncc-lg-5-8');
  expect(draftKey('qsncc-lg-5-8')).toBe('bf:admin:qsncc-lg-5-8:draft');
  expect(readDraft(kv, 'qsncc-lg-5-8')).toBeNull();
  const d = { venue, sha: 'abc', ref: 'main', at: '2026-10-13T07:05:00.000Z' };
  writeDraft(kv, 'qsncc-lg-5-8', d);
  expect(readDraft(kv, 'qsncc-lg-5-8')).toEqual(d);
  expect(isStale(d, 'abc')).toBe(false);
  expect(isStale(d, 'def')).toBe(true);
  clearDraft(kv, 'qsncc-lg-5-8');
  expect(readDraft(kv, 'qsncc-lg-5-8')).toBeNull();
  kv.set(draftKey('x'), '{not json');
  expect(readDraft(kv, 'x')).toBeNull();
  kv.set(draftKey('y'), JSON.stringify({ sha: 1 }));
  expect(readDraft(kv, 'y')).toBeNull();
});
