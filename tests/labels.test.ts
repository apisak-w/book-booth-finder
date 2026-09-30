import { test, expect } from 'bun:test';
import { boothLabel } from '../src/lib/map/labels';

const b = (w: number, h: number) => ({
  c: 'A02',
  x: 0,
  y: 0,
  w,
  h,
  cat: 'special',
  i: 0,
  cx: w / 2,
  cy: h / 2,
  area: 'hall5',
});

test('font size is clamped between 8 and 13', () => {
  expect(boothLabel(b(10, 10)).fs).toBe(8);
  expect(boothLabel(b(200, 200)).fs).toBe(13);
});

test('wide booths with a short name get two text lines', () => {
  const l = boothLabel(b(120, 80), "AUTHOR'S SALON");
  expect(l.code.y).toBe(40 - 12);
  expect(l.lines.map((x) => x.text)).toEqual(["AUTHOR'S SALON"]);
  expect(boothLabel(b(120, 80), 'MEET THE LEGENDS').lines.map((x) => x.text)).toEqual(['MEET THE', 'LEGENDS']);
});

test('narrow tall named booths rotate their code', () => {
  expect(boothLabel(b(28, 80), 'X').code.rotate).toBe(true);
  expect(boothLabel(b(28, 80)).code.rotate).toBe(false);
});
