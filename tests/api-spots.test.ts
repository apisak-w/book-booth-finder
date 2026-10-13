import { test, expect, beforeEach } from 'bun:test';
import type { Env } from '../src/lib/api/db';
import { handleSpot } from '../src/lib/api/spots';
import { SPOTS_PER_EVENT, type SpotsConfig } from '../src/lib/core/spots';
import { fakeDb } from './helpers/fake-d1';
import { LAT0, LNG0 } from './helpers/fake-geo';

const cfg: SpotsConfig = {
  events: {
    fair: { venue: 'v', start: '2026-10-15', end: '2026-10-25', tz: 'Asia/Bangkok', doors: ['mrt'], halls: ['hall5'] },
  },
  venues: { v: { lat: LAT0, lng: LNG0 } },
};
const now = new Date('2026-10-16T03:20:00Z');
const good = { event: 'fair', kind: 'door', place: 'mrt', lat: LAT0, lng: LNG0, accuracy: 9 };
const INSERT =
  'INSERT INTO spots (event, kind, place, lat, lng, accuracy, hour, purge_after) VALUES (?, ?, ?, ?, ?, ?, ?, ?)';
let db: ReturnType<typeof fakeDb>;
let env: Env;

beforeEach(() => {
  db = fakeDb();
  env = { DB: db, ASSETS: { fetch: async () => Response.json(cfg) } };
});

const send = (body: unknown, type = 'application/json') =>
  handleSpot(
    new Request('https://booth.example/api/spots', {
      method: 'POST',
      headers: { 'content-type': type },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
    env,
    now,
  );

test('a good spot is stored and answered with 204', async () => {
  expect((await send(good)).status).toBe(204);
  expect(db.raw.query('SELECT event, kind, place, lat, lng, accuracy, hour, purge_after FROM spots').all()).toEqual([
    {
      event: 'fair',
      kind: 'door',
      place: 'mrt',
      lat: LAT0,
      lng: LNG0,
      accuracy: 9,
      hour: '2026-10-16T03',
      purge_after: '2026-11-24',
    },
  ]);
});

test('the spots table holds nothing about the sender', () => {
  const cols = db.raw
    .query('PRAGMA table_info(spots)')
    .all()
    .map((c) => (c as { name: string }).name);
  expect(cols).toEqual(['id', 'event', 'kind', 'place', 'lat', 'lng', 'accuracy', 'hour', 'purge_after']);
});

test('bad requests are refused with a reason and store nothing', async () => {
  expect((await send(good, 'text/plain')).status).toBe(415);
  expect((await send('{not json')).status).toBe(400);
  expect((await send({ ...good, pad: 'x'.repeat(3000) })).status).toBe(413);
  const r = await send({ ...good, place: 'roof' });
  expect(r.status).toBe(400);
  expect(await r.json()).toEqual({ error: 'Unknown place' });
  expect((await handleSpot(new Request('https://booth.example/api/spots'), env, now)).status).toBe(405);
  expect(db.raw.query('SELECT COUNT(*) AS n FROM spots').get()).toEqual({ n: 0 });
});

test('spots past their delete date go on the next call', async () => {
  db.raw.query(INSERT).run('old', 'door', 'mrt', 0, 0, 5, '2026-09-01T10', '2026-10-15');
  db.raw.query(INSERT).run('old', 'door', 'mrt', 0, 0, 5, '2026-09-01T10', '2026-10-16');
  await send({ ...good, place: 'roof' });
  expect(db.raw.query('SELECT purge_after FROM spots').all()).toEqual([{ purge_after: '2026-10-16' }]);
});

test('an event with a full mailbox refuses more spots', async () => {
  const ins = db.raw.prepare(INSERT);
  db.raw.transaction(() => {
    for (let k = 0; k < SPOTS_PER_EVENT; k++) ins.run('fair', 'door', 'mrt', 0, 0, 5, '2026-10-16T01', '2026-11-24');
  })();
  const r = await send(good);
  expect(r.status).toBe(503);
  expect(await r.json()).toEqual({ error: 'Spots are full for this event' });
});

test('without a D1 binding the API says what to set up', async () => {
  env = { ...env, DB: undefined as unknown as Env['DB'] };
  const r = await send(good);
  expect(r.status).toBe(503);
  expect(await r.json()).toEqual({ error: 'Spots are not set up here yet. Add the D1 binding DB in Cloudflare' });
});
