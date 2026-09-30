import { test, expect } from 'bun:test';
import { makeStore } from '../src/lib/storage';

test('reads and writes through localStorage', () => {
  const m = new Map<string, string>();
  const ls = {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
  } as unknown as Storage;
  const s = makeStore(() => ls);
  s.set('bf:lang', 'en');
  expect(s.get('bf:lang')).toBe('en');
});

test('survives storage that throws or is missing', () => {
  const boom = {
    getItem: () => {
      throw new Error('blocked');
    },
    setItem: () => {
      throw new Error('blocked');
    },
  } as unknown as Storage;
  const s = makeStore(() => boom);
  expect(() => s.set('k', 'v')).not.toThrow();
  expect(s.get('k')).toBeNull();
  const none = makeStore(() => {
    throw new Error('SecurityError');
  });
  expect(none.get('k')).toBeNull();
  expect(() => none.set('k', 'v')).not.toThrow();
});
