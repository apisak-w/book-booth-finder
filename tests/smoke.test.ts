import { test, expect } from 'bun:test';
import { existsSync } from 'node:fs';

test('golden snapshot is present', () => {
  expect(existsSync('tests/golden/v1.json')).toBe(true);
});
