import { test, expect } from 'bun:test';
import { EventSchema, VenueSchema, BoothsFileSchema, formatIssues } from '../src/lib/server/schema';

const i18n = { th: 'ก', en: 'a' };
const minimalEvent = {
  id: 'demo-2027',
  name: i18n,
  dates: { start: '2027-01-01', end: '2027-01-03' },
  venue: 'qsncc-lg-5-8',
  categories: { general: { ...i18n, color: '#1F84C6' } },
  zones: {},
  foyerZones: [],
  obstacles: [],
  landmarks: [],
  quickPicks: [],
};

test('event defaults fill optional fields', () => {
  const e = EventSchema.parse(minimalEvent);
  expect(e.codePattern).toBe('^[A-Z]\\d{2}$');
  expect(e.allowedDuplicateCodes).toEqual([]);
  expect(e.notes).toEqual([]);
});

test('event rejects end before start and a bad colour', () => {
  expect(EventSchema.safeParse({ ...minimalEvent, dates: { start: '2027-01-03', end: '2027-01-01' } }).success).toBe(
    false,
  );
  expect(EventSchema.safeParse({ ...minimalEvent, categories: { general: { ...i18n, color: 'blue' } } }).success).toBe(
    false,
  );
});

test('landmark needs both languages and a known icon', () => {
  const lm = { id: 'x', group: 'wc', x: 1, y: 1, icon: 'wc', th: 'ก', en: 'a' };
  expect(EventSchema.safeParse({ ...minimalEvent, landmarks: [lm] }).success).toBe(true);
  expect(EventSchema.safeParse({ ...minimalEvent, landmarks: [{ ...lm, en: '' }] }).success).toBe(false);
  expect(EventSchema.safeParse({ ...minimalEvent, landmarks: [{ ...lm, icon: 'rocket' }] }).success).toBe(false);
});

test('booths file parses pillars with inner rect', () => {
  const f = BoothsFileSchema.parse({
    booths: [{ c: 'A01', x: 0, y: 0, w: 10, h: 10, cat: 'general' }],
    pillars: [{ x: 0, y: 0, w: 10, h: 10, cat: 'general', inner: { x: 2, y: 2, w: 5, h: 5 } }],
  });
  expect(f.pillars[0].inner.w).toBe(5);
});

test('formatIssues names the path', () => {
  const r = VenueSchema.safeParse({ id: 'v' });
  expect(r.success).toBe(false);
  if (!r.success) expect(formatIssues(r.error)).toContain('name');
});
