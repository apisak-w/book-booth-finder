import { test, expect } from 'bun:test';
import { clampVB, boxFor, zoomAt, frameTarget, lerpVB, ease, MIN_W } from '../src/lib/core/panzoom';

const view = { x: 180, y: 240, w: 2230, h: 1420 };

test('clampVB keeps the aspect ratio and a minimum width', () => {
  const v = clampVB({ x: 0, y: 0, w: 10, h: 999 }, view, 0.5);
  expect(v.w).toBe(MIN_W);
  expect(v.h).toBe(MIN_W * 0.5);
});

test('clampVB keeps the centre inside the view', () => {
  const v = clampVB({ x: -5000, y: -5000, w: 400, h: 200 }, view, 0.5);
  expect(v.x + v.w / 2).toBe(view.x);
  expect(v.y + v.h / 2).toBe(view.y);
});

test('clampVB caps width at 1.25 × view', () => {
  expect(clampVB({ x: 0, y: 0, w: 99999, h: 1 }, view, 1).w).toBe(view.w * 1.25);
});

test('boxFor fits the box with padding at the given aspect', () => {
  const b = boxFor(0, 0, 100, 100, 10, 0.5);
  expect(b.h / b.w).toBeCloseTo(0.5);
  expect(b.w).toBeGreaterThanOrEqual(240);
});

test('zoomAt keeps the anchor point fixed', () => {
  const a = { x: 0, y: 0, w: 100, h: 50 };
  const b = zoomAt(a, 25, 25, 0.5);
  expect((25 - b.x) / b.w).toBeCloseTo((25 - a.x) / a.w);
  expect(b.w).toBe(50);
});

test('frameTarget pads routes less than single points and leaves room for the pin', () => {
  const b = { c: 'K16', x: 100, y: 100, w: 30, h: 60, cat: 'general', i: 0, cx: 115, cy: 130, area: 'hall7' };
  const t1 = frameTarget({ kind: 'booth', b }, null)!;
  expect(t1.pad).toBe(160);
  expect(t1.box[1]).toBe(100 - 70);
  const t2 = frameTarget(
    { kind: 'booth', b },
    {
      P: [
        [0, 0],
        [200, 300],
      ],
      len: 1,
      meters: 5,
      minutes: 1,
      doorsUsed: [],
      areas: [],
    },
  )!;
  expect(t2.pad).toBe(60);
  expect(t2.box).toEqual([0, -70, 200, 300]);
  expect(frameTarget(null, null)).toBeNull();
});

test('ease and lerp', () => {
  expect(ease(0)).toBe(0);
  expect(ease(1)).toBe(1);
  expect(lerpVB({ x: 0, y: 0, w: 0, h: 0 }, { x: 10, y: 10, w: 10, h: 10 }, 0.5)).toEqual({ x: 5, y: 5, w: 5, h: 5 });
});
