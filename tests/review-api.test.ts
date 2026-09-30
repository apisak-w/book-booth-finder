import { test, expect } from 'bun:test';
import { rejectRequest, validTransform } from '../tools/pipeline/review/guard';
import { stringifyJson } from '../tools/pipeline/lib/json';

test('only same-machine requests reach the API, and writes must be JSON', () => {
  expect(rejectRequest({ method: 'GET', host: 'localhost:5190' })).toBeNull();
  expect(rejectRequest({ method: 'GET', host: 'evil.example:5190' })?.[0]).toBe(403);
  expect(rejectRequest({ method: 'POST', host: 'localhost:5190', contentType: 'text/plain' })?.[0]).toBe(415);
  expect(
    rejectRequest({
      method: 'POST',
      host: '127.0.0.1:5190',
      origin: 'https://evil.example',
      contentType: 'application/json',
    })?.[0],
  ).toBe(403);
  expect(
    rejectRequest({
      method: 'POST',
      host: 'localhost:5190',
      origin: 'http://localhost:5190',
      contentType: 'application/json; charset=utf-8',
    }),
  ).toBeNull();
});

test('registration needs positive finite scales', () => {
  expect(validTransform({ sx: 1, sy: 1, dx: 0, dy: 0 })).toBe(true);
  expect(validTransform({ sx: 0, sy: 1, dx: 0, dy: 0 })).toBe(false);
  expect(validTransform({ sx: -1, sy: 1, dx: 0, dy: 0 })).toBe(false);
  expect(validTransform({ sx: 1, sy: 1, dx: 'x', dy: 0 })).toBe(false);
});

test('JSON keeps short number arrays on one line', () => {
  expect(stringifyJson({ at: [1, 2.5], rect: { x: 1 }, list: [{ a: 1 }] })).toBe(
    '{\n  "at": [1, 2.5],\n  "rect": {\n    "x": 1\n  },\n  "list": [\n    {\n      "a": 1\n    }\n  ]\n}\n',
  );
});
