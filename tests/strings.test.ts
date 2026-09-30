import { test, expect } from 'bun:test';
import { STRINGS, fmtRange } from '../src/lib/i18n/strings';

test('th and en have the same keys', () => {
  expect(Object.keys(STRINGS.th).sort()).toEqual(Object.keys(STRINGS.en).sort());
  expect(Object.keys(STRINGS.th.groups).sort()).toEqual(Object.keys(STRINGS.en.groups).sort());
});

test('no exclamation marks in copy', () => {
  const all =
    JSON.stringify(STRINGS) +
    Object.values(STRINGS)
      .map((s) => s.noRes('x') + s.ended('x'))
      .join('');
  expect(all.includes('!')).toBe(false);
});

test('fmtRange formats both languages', () => {
  expect(fmtRange('2026-03-26', '2026-04-06', 'en')).toContain('2026');
  expect(fmtRange('2026-03-26', '2026-04-06', 'th')).toContain('2569');
});
