import { test, expect } from 'bun:test';
import { eventStatus, sortEvents, todayIn } from '../src/lib/core/status';

const dates = { start: '2026-03-26', end: '2026-04-06' };
const tz = 'Asia/Bangkok';

test('today is computed in the venue timezone', () => {
  expect(todayIn(tz, new Date('2026-04-06T17:30:00Z'))).toBe('2026-04-07');
  expect(todayIn(tz, new Date('2026-04-06T16:30:00Z'))).toBe('2026-04-06');
});

test('last day stays live until midnight Bangkok time', () => {
  expect(eventStatus(dates, tz, new Date('2026-04-06T16:30:00Z'))).toBe('live');
  expect(eventStatus(dates, tz, new Date('2026-04-06T17:10:00Z'))).toBe('past');
  expect(eventStatus(dates, tz, new Date('2026-03-25T16:59:00Z'))).toBe('upcoming');
  expect(eventStatus(dates, tz, new Date('2026-03-25T17:00:00Z'))).toBe('live');
});

test('sort puts live first, then upcoming soonest, then past latest', () => {
  const now = new Date('2026-06-01T00:00:00Z');
  const list = [
    { id: 'old', dates: { start: '2025-01-01', end: '2025-01-05' }, timezone: tz },
    { id: 'later', dates: { start: '2027-01-01', end: '2027-01-05' }, timezone: tz },
    { id: 'live', dates: { start: '2026-05-30', end: '2026-06-03' }, timezone: tz },
    { id: 'soon', dates: { start: '2026-07-01', end: '2026-07-05' }, timezone: tz },
    { id: 'recent', dates: { start: '2026-03-26', end: '2026-04-06' }, timezone: tz },
  ];
  expect(sortEvents(list, now).map((e) => e.id)).toEqual(['live', 'soon', 'later', 'recent', 'old']);
});

test('todayIn does not depend on a locale date format', () => {
  const orig = Intl.DateTimeFormat;
  // @ts-expect-error force a locale that formats dates differently
  Intl.DateTimeFormat = function (_l: string, o: Intl.DateTimeFormatOptions) {
    return new orig('en-US', o);
  };
  try {
    expect(todayIn('Asia/Bangkok', new Date('2026-04-06T16:30:00Z'))).toBe('2026-04-06');
  } finally {
    Intl.DateTimeFormat = orig;
  }
});
