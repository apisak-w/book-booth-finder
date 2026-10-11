import { test, expect } from 'bun:test';
import { pickLang } from '../src/lib/i18n/pick';

test('a saved choice beats the device language', () => {
  expect(pickLang('th', ['en-US'])).toBe('th');
  expect(pickLang('en', ['th-TH'])).toBe('en');
});

test('follows the device when nothing is saved', () => {
  expect(pickLang(null, ['th-TH'])).toBe('th');
  expect(pickLang(null, ['en-GB'])).toBe('en');
  expect(pickLang(null, ['TH'])).toBe('th');
});

test('takes the first supported language in preference order', () => {
  expect(pickLang(null, ['ja-JP', 'th-TH', 'en-US'])).toBe('th');
  expect(pickLang(null, ['ja', 'en', 'th'])).toBe('en');
});

test('falls back to English', () => {
  expect(pickLang(null, ['ja-JP'])).toBe('en');
  expect(pickLang(null, [])).toBe('en');
  expect(pickLang(null, undefined)).toBe('en');
});

test('ignores saved values and tags it does not understand', () => {
  expect(pickLang('fr', ['th-TH'])).toBe('th');
  expect(pickLang('', ['th-TH'])).toBe('th');
  expect(pickLang(null, ['', 'thai', 'th-TH'])).toBe('th');
});
