import { test, expect } from 'bun:test';
import { STRINGS, fmtRange, fmtTime } from '../src/lib/i18n/strings';

test('th and en have the same keys', () => {
  expect(Object.keys(STRINGS.th).sort()).toEqual(Object.keys(STRINGS.en).sort());
  expect(Object.keys(STRINGS.th.groups).sort()).toEqual(Object.keys(STRINGS.en.groups).sort());
});

test('no exclamation marks in copy', () => {
  const all =
    JSON.stringify(STRINGS) +
    Object.values(STRINGS)
      .map(
        (s) =>
          s.noRes('x') +
          s.ended('x') +
          s.locFar(1.2) +
          s.walkTo('x') +
          s.thenInside(9) +
          s.arrived('x') +
          s.spotFine(true) +
          s.spotFine(false) +
          s.dayOf(1, 2) +
          s.until('x') +
          s.hours('a', 'b') +
          s.opensIn(2),
      )
      .join('');
  expect(all.includes('!')).toBe(false);
});

test('fmtRange formats both languages', () => {
  expect(fmtRange('2026-03-26', '2026-04-06', 'en')).toContain('2026');
  expect(fmtRange('2026-03-26', '2026-04-06', 'th')).toContain('2569');
});

test('card copy fills in numbers and times', () => {
  expect(STRINGS.en.dayOf(2, 10)).toBe('Day 2 of 10');
  expect(STRINGS.th.dayOf(2, 10)).toBe('วันที่ 2 จาก 10');
  expect(STRINGS.en.hours(fmtTime('10:00', 'en'), fmtTime('21:00', 'en'))).toBe('Open 10:00–21:00');
  expect(STRINGS.th.hours(fmtTime('10:00', 'th'), fmtTime('21:00', 'th'))).toBe('เปิด 10.00–21.00 น.');
  expect(STRINGS.en.opensIn(3)).toBe('Opens in 3 days');
  expect(STRINGS.en.until(fmtRange('2026-11-01', '2026-11-01', 'en'))).toBe('Until 1 Nov 2026');
});
