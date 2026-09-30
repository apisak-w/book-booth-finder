import { test, expect, beforeAll, afterAll } from 'bun:test';
import { mkdtempSync, mkdirSync, writeFileSync, cpSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { listEventIds, listVenueIds, loadEvent, eventSummaries, CatalogError } from '../src/lib/server/catalog';

let root = '';
beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'bf-'));
  cpSync('venues', join(root, 'venues'), { recursive: true });
  cpSync('events/bkkibf-2026', join(root, 'events/bkkibf-2026'), { recursive: true });
});
afterAll(() => rmSync(root, { recursive: true, force: true }));

const writeEvent = (folder: string, patch: Record<string, unknown>) => {
  const base = JSON.parse(readFileSync('events/bkkibf-2026/event.json', 'utf8'));
  mkdirSync(join(root, 'events', folder), { recursive: true });
  writeFileSync(join(root, 'events', folder, 'event.json'), JSON.stringify({ ...base, ...patch }));
  writeFileSync(join(root, 'events', folder, 'booths.json'), '{"booths":[],"pillars":[]}');
};

test('lists repo venues and events', () => {
  expect(listVenueIds()).toEqual(['qsncc-lg-5-8']);
  expect(listEventIds()).toContain('bkkibf-2026');
});

test('loads the 2026 event with its venue', () => {
  const b = loadEvent('bkkibf-2026');
  expect(b.venue.id).toBe('qsncc-lg-5-8');
  expect(b.booths.booths.length).toBe(369);
  expect(b.exhibitors).toEqual([]);
});

test('rejects an event whose id differs from its folder', () => {
  writeEvent('wrong-folder', { id: 'something-else' });
  expect(() => loadEvent('wrong-folder', root)).toThrow(CatalogError);
  expect(() => loadEvent('wrong-folder', root)).toThrow(/events\/wrong-folder\/event.json: id/);
});

test('rejects an event whose venue does not exist', () => {
  writeEvent('no-venue', { id: 'no-venue', venue: 'nowhere' });
  expect(() => loadEvent('no-venue', root)).toThrow(/venue "nowhere"/);
});

test('summaries carry venue name and timezone', () => {
  const s = eventSummaries().find((e) => e.id === 'bkkibf-2026');
  expect(s?.venueName.en).toBe('QSNCC Level LG, Halls 5–8');
  expect(s?.timezone).toBe('Asia/Bangkok');
});
