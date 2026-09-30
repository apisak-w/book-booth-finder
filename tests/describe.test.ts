import { test, expect } from 'bun:test';
import { loadEvent } from '../src/lib/server/catalog';
import { loadData } from '../src/lib/core/prepare';
import { boothSub, boothTitle, cardTitle } from '../src/lib/core/describe';

const data = loadData({ ...loadEvent('bkkibf-2026'), exhibitors: [] });

test('plain aisle booth shows area and aisle', () => {
  expect(boothSub(data.byCode.K16[0], data, 'en')).toBe('Hall 7 · Aisle K');
  expect(boothSub(data.byCode.K16[0], data, 'th')).toBe('ฮอลล์ 7 · ทางเดิน K');
  expect(boothTitle(data.byCode.K16[0], data, 'en')).toBe(data.event.categories[data.byCode.K16[0].cat].en);
});

test('zoned foyer booth shows outside and its category', () => {
  expect(boothSub(data.byCode.U07[0], data, 'en')).toBe('Outside the halls · Exhibitions & stages');
  expect(cardTitle(data.byCode.U07[0], data, 'en')).toBe(data.event.zones.U07.en);
});
