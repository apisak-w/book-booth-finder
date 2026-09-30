import { test, expect } from 'bun:test';
import { loadEvent } from '../src/lib/server/catalog';
import { loadData } from '../src/lib/core/prepare';
import { parseHash, formatHash } from '../src/lib/core/hash';

const data = loadData(loadEvent('bkkibf-2026'));

test('parses a booth and a start point', () => {
  const r = parseHash('#to=K16&from=door6', data);
  expect(r.dest?.kind === 'booth' && r.dest.b.c).toBe('K16');
  expect(r.fromId).toBe('door6');
});

test('lowercase codes resolve and places win over codes', () => {
  expect(parseHash('#to=k16', data).dest?.kind).toBe('booth');
  expect(parseHash('#to=stage', data).dest?.kind).toBe('place');
});

test('unknown values are ignored', () => {
  expect(parseHash('#to=ZZ99&from=nowhere', data)).toEqual({ dest: null, fromId: null });
  expect(parseHash('', data)).toEqual({ dest: null, fromId: null });
});

test('n picks between duplicate codes and falls back to the first', () => {
  const second = parseHash('#to=H31&n=1', data).dest;
  expect(second?.kind === 'booth' && second.b).toBe(data.byCode.H31[1]);
  const bad = parseHash('#to=H31&n=9', data).dest;
  expect(bad?.kind === 'booth' && bad.b).toBe(data.byCode.H31[0]);
  const junk = parseHash('#to=H31&n=abc', data).dest;
  expect(junk?.kind === 'booth' && junk.b).toBe(data.byCode.H31[0]);
});

test('formatHash round-trips and adds n only for duplicates', () => {
  expect(formatHash({ kind: 'booth', b: data.byCode.K16[0] }, 'mrt', data)).toBe('to=K16&from=mrt');
  expect(formatHash({ kind: 'booth', b: data.byCode.H31[1] }, '', data)).toBe('to=H31&n=1');
  expect(formatHash({ kind: 'place', lm: data.landmarkById.wc2 }, '', data)).toBe('to=wc2');
  expect(formatHash(null, 'mrt', data)).toBe('from=mrt');
});
