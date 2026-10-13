import { test, expect } from 'bun:test';
import { KEEP } from '../src/lib/i18n/keep';
import { SPOT_KEEP_DAYS } from '../src/lib/core/spots';

test('What we keep has the same sections in Thai and English, in plain copy', () => {
  expect(KEEP.th.sections.length).toBe(KEEP.en.sections.length);
  expect(KEEP.en.sections.map((s) => s.h)).toEqual([
    'What we receive',
    "What we don't keep",
    'Why we ask',
    'Who sees it',
    'How long we keep it',
    'Where it is stored',
    'Saying no',
  ]);
  expect(JSON.stringify(KEEP).includes('!')).toBe(false);
});

test('the page promises the same number of days the code uses', () => {
  expect(KEEP.en.sections[4].p).toContain(`${SPOT_KEEP_DAYS} days`);
  expect(KEEP.th.sections[4].p).toContain(`${SPOT_KEEP_DAYS} วัน`);
});
