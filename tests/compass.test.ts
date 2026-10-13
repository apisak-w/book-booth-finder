import { test, expect } from 'bun:test';
import { headingFrom, norm180, smoothAngle, turnAngle } from '../src/lib/core/compass';

test('norm180 wraps into (-180, 180]', () => {
  expect(norm180(190)).toBe(-170);
  expect(norm180(-190)).toBe(170);
  expect(norm180(180)).toBe(180);
  expect(norm180(-180)).toBe(180);
});

test('turnAngle points the way you face up', () => {
  expect(turnAngle(0, 0)).toBe(0);
  expect(turnAngle(180, 0)).toBe(180);
  expect(turnAngle(180, 90)).toBe(90);
  expect(turnAngle(0, 90)).toBe(-90);
});

test('smoothAngle eases across north without spinning the long way', () => {
  expect(smoothAngle(null, 42)).toBe(42);
  expect(smoothAngle(350, 10, 0.5)).toBe(0);
  expect(smoothAngle(10, 350, 0.5)).toBe(0);
});

test('headingFrom reads iOS, absolute Android, and ignores relative readings', () => {
  expect(headingFrom({ webkitCompassHeading: 30, alpha: 0 })).toBe(30);
  expect(headingFrom({ alpha: 90, absolute: true })).toBe(270);
  expect(headingFrom({ alpha: 90, absolute: false })).toBeNull();
  expect(headingFrom({ alpha: null, absolute: true })).toBeNull();
  expect(headingFrom({ webkitCompassHeading: 350, alpha: 0 }, 90)).toBe(80);
});
