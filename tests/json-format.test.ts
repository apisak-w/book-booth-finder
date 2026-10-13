import { test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { canonical, formatVenueJson, orderLike } from '../src/lib/core/jsonFormat';
import { pinnedVenue } from './helpers/pinned-venue';

const files = [
  'venues/qsncc-lg-5-8/venue.json',
  'venues/qsncc-lg-5-7/venue.json',
  'events/bkkibf-2026/event.json',
  'events/bookexpo-2026/event.json',
];

test('formatVenueJson reproduces every venue and event file byte for byte', () => {
  for (const f of files) {
    const text = readFileSync(f, 'utf8');
    expect(formatVenueJson(JSON.parse(text))).toBe(text);
  }
});

test('short arrays stay on one line, lists of objects and pairs always break', () => {
  expect(
    formatVenueJson({
      a: [1, 2],
      b: [
        [1, 2],
        [3, 4],
      ],
      c: [{ x: 1 }],
      d: [],
    }),
  ).toBe(
    '{\n  "a": [1, 2],\n  "b": [\n    [1, 2],\n    [3, 4]\n  ],\n  "c": [\n    {\n      "x": 1\n    }\n  ],\n  "d": []\n}\n',
  );
  const long = { k: Array.from({ length: 30 }, (_, i) => `item-${i}`) };
  expect(formatVenueJson(long).split('\n').length).toBeGreaterThan(30);
});

test('a pinned venue writes its pins expanded and its entrances on one line', () => {
  const out = formatVenueJson(pinnedVenue().venue);
  expect(out).toContain('"entrances": ["mrt", "door5", "door6", "door7", "door8"]');
  expect(out).toContain('    "pins": [\n      {\n        "id": "a",');
});

test('canonical ignores key order but not content', () => {
  expect(canonical({ b: 1, a: [{ y: 2, x: 1 }] })).toBe(canonical({ a: [{ x: 1, y: 2 }], b: 1 }));
  expect(canonical({ a: 1 })).not.toBe(canonical({ a: 2 }));
});

test('orderLike puts keys back in the order of the file, new keys last', () => {
  const like = { a: 1, list: [{ id: 'x', n: 1 }], z: 0 };
  const value = {
    z: 0,
    extra: true,
    list: [
      { n: 2, id: 'y' },
      { n: 3, id: 'z' },
    ],
    a: 1,
  };
  expect(JSON.stringify(orderLike(value, like))).toBe(
    '{"a":1,"list":[{"id":"y","n":2},{"id":"z","n":3}],"z":0,"extra":true}',
  );
});

test('formatVenueJson matches oxfmt on packed numbers, wide Thai text and long lists', () => {
  for (const f of ['nums', 'nested', 'thai', 'mixed']) {
    const text = readFileSync(`tests/fixtures/oxfmt/${f}.json`, 'utf8');
    expect(formatVenueJson(JSON.parse(text))).toBe(text);
  }
});
