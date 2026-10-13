import { test, expect } from 'bun:test';
import { afterAnswer, askKey, mayAsk } from '../src/lib/ui/spotAsk';

test('the card is asked at most once a day until sent or turned off', () => {
  expect(askKey('fair')).toBe('bf:fair:asked');
  expect(mayAsk(null, '2026-10-16')).toBe(true);
  expect(mayAsk('2026-10-16', '2026-10-16')).toBe(false);
  expect(mayAsk('2026-10-15', '2026-10-16')).toBe(true);
  expect(mayAsk('sent', '2026-10-16')).toBe(false);
  expect(mayAsk('never', '2026-10-16')).toBe(false);
  expect(mayAsk('garbage', '2026-10-16')).toBe(false);
});

test('the answer decides what is saved', () => {
  expect(afterAnswer(true, false, '2026-10-16')).toBe('sent');
  expect(afterAnswer(true, true, '2026-10-16')).toBe('sent');
  expect(afterAnswer(false, true, '2026-10-16')).toBe('never');
  expect(afterAnswer(false, false, '2026-10-16')).toBe('2026-10-16');
});
