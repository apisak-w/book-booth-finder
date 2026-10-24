import { test, expect, beforeAll, afterAll } from 'bun:test';
import { mkdtempSync, mkdirSync, writeFileSync, cpSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
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

const jpeg = (path: string, width: number, height: number) =>
  sharp({ create: { width, height, channels: 3, background: '#3d9de3' } })
    .jpeg()
    .toFile(path);

const isolated = (id: string, patch: Record<string, unknown>) => {
  const r = mkdtempSync(join(tmpdir(), 'bf-poster-'));
  cpSync('venues', join(r, 'venues'), { recursive: true });
  const base = JSON.parse(readFileSync('events/bkkibf-2026/event.json', 'utf8'));
  mkdirSync(join(r, 'events', id), { recursive: true });
  writeFileSync(join(r, 'events', id, 'event.json'), JSON.stringify({ ...base, id, ...patch }));
  writeFileSync(join(r, 'events', id, 'booths.json'), '{"booths":[],"pillars":[]}');
  return r;
};

test('lists repo venues and events', () => {
  expect(listVenueIds()).toEqual(['qsncc-lg-5-7', 'qsncc-lg-5-8']);
  expect(listEventIds()).toContain('bkkibf-2026');
  expect(listEventIds()).toContain('bookexpo-2026');
});

test('loads the 2026 event with its venue', () => {
  const b = loadEvent('bkkibf-2026');
  expect(b.venue.id).toBe('qsncc-lg-5-8');
  expect(b.booths.booths.length).toBe(369);
  expect(b.exhibitors.length).toBe(361);
});

test('loads Book Expo 2026 with the Halls 5–7 venue', () => {
  const b = loadEvent('bookexpo-2026');
  expect(b.venue.id).toBe('qsncc-lg-5-7');
  expect(b.booths.booths.length).toBe(329);
  expect(b.exhibitors.length).toBe(320);
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

test('summaries carry venue name and timezone', async () => {
  const s = (await eventSummaries()).find((e) => e.id === 'bkkibf-2026');
  expect(s?.venueName.en).toBe('QSNCC Level LG, Halls 5–8');
  expect(s?.timezone).toBe('Asia/Bangkok');
});

test('summaries carry poster size and hours', async () => {
  const r = isolated('with-poster', { poster: 'poster.jpg', hours: { open: '10:00', close: '21:00' } });
  await jpeg(join(r, 'events/with-poster/poster.jpg'), 1030, 367);
  const s = (await eventSummaries(r)).find((e) => e.id === 'with-poster');
  expect(s?.poster).toEqual({ file: 'poster.jpg', width: 1030, height: 367 });
  expect(s?.hours).toEqual({ open: '10:00', close: '21:00' });
});

test('a missing poster file fails with the file named', () => {
  writeEvent('no-poster-file', { id: 'no-poster-file', poster: 'poster.jpg' });
  expect(() => loadEvent('no-poster-file', root)).toThrow(/events\/no-poster-file\/poster.jpg: file is missing/);
});

test('a poster over 100 KB fails', () => {
  writeEvent('heavy-poster', { id: 'heavy-poster', poster: 'poster.jpg' });
  writeFileSync(join(root, 'events/heavy-poster/poster.jpg'), Buffer.alloc(102_401));
  expect(() => loadEvent('heavy-poster', root)).toThrow(/heavy-poster\/poster.jpg: .*100 KB/);
});

test('a poster wider than 1100 px fails', async () => {
  const r = isolated('wide-poster', { poster: 'poster.jpg' });
  await jpeg(join(r, 'events/wide-poster/poster.jpg'), 1101, 300);
  await expect(eventSummaries(r)).rejects.toThrow(/wide-poster\/poster.jpg: .*1100 px/);
});
