import { test, expect, beforeEach } from 'bun:test';
import { readFileSync } from 'node:fs';
import { handleAdmin, type AdminDeps } from '../src/lib/api/admin';
import { b64url, type Ceremonies } from '../src/lib/api/auth';
import type { Env } from '../src/lib/api/db';
import { fromBase64 } from '../src/lib/api/github';
import { formatVenueJson } from '../src/lib/core/jsonFormat';
import { addLandmark } from '../src/lib/core/venueEdit';
import type { Venue } from '../src/lib/core/types';
import { fakeDb } from './helpers/fake-d1';
import { fakeRepo } from './helpers/fake-github';

const ORIGIN = 'https://booth.example';
const venueText = readFileSync('venues/qsncc-lg-5-8/venue.json', 'utf8');
const eventText = readFileSync('events/bkkibf-2026/event.json', 'utf8');
const base = JSON.parse(venueText) as Venue;
const files = {
  'venues/qsncc-lg-5-8/venue.json': venueText,
  'venues/qsncc-lg-5-8/reference.jpg': new Uint8Array([255, 216, 255]),
  'events/bkkibf-2026/event.json': eventText,
};
const ceremonies: Ceremonies = {
  registrationOptions: async () => ({ challenge: 'reg' }),
  verifyRegistration: async () => ({ id: 'pk', publicKey: new Uint8Array([1]), counter: 0, transports: [] }),
  authenticationOptions: async () => ({ challenge: 'sign' }),
  verifyAuthentication: async () => ({ newCounter: 1 }),
};
let db: ReturnType<typeof fakeDb>, env: Env, repo: ReturnType<typeof fakeRepo>, cookie: string;
const deps = (): AdminDeps => ({ ceremonies, github: () => repo.github, now: () => new Date('2026-10-16T03:00:00Z') });
const call = (method: string, path: string, body?: unknown) =>
  handleAdmin(
    new Request(`${ORIGIN}/api/admin/${path}`, {
      method,
      headers: { origin: ORIGIN, 'content-type': 'application/json', cookie },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    env,
    deps(),
  );

const save = (venue: unknown, sha = 'sha-venues/qsncc-lg-5-8/venue.json') =>
  call('POST', 'venue/save', { id: 'qsncc-lg-5-8', venue, sha });

beforeEach(async () => {
  db = fakeDb();
  repo = fakeRepo(files);
  env = {
    DB: db,
    ASSETS: { fetch: async () => Response.json({ events: {}, venues: {} }) },
    ADMIN_SETUP_CODE: 'correct horse battery staple',
  };
  cookie = '';
  await call('POST', 'setup/options', { code: 'correct horse battery staple' });
  const response = {
    id: 'pk',
    response: { clientDataJSON: b64url(new TextEncoder().encode(JSON.stringify({ challenge: 'reg' }))) },
  };
  const r = await call('POST', 'setup/verify', { code: 'correct horse battery staple', name: 'Phone', response });
  cookie = (r.headers.get('set-cookie') ?? '').split(';')[0];
});

test('the venue list comes from main with counts and open PRs', async () => {
  const r = await (await call('GET', 'venues')).json();
  expect(r.venues).toEqual([
    {
      id: 'qsncc-lg-5-8',
      name: base.name,
      landmarks: base.landmarks.length,
      pins: base.geo?.pins.length ?? 0,
      pr: null,
    },
  ]);
});

test('a venue opens with its sha, ref and the events that use it', async () => {
  const r = await (await call('GET', 'venue?id=qsncc-lg-5-8')).json();
  expect(r.venue).toEqual(base);
  expect(r).toMatchObject({ sha: 'sha-venues/qsncc-lg-5-8/venue.json', ref: 'main', pr: null });
  expect(r.events).toEqual([
    {
      id: 'bkkibf-2026',
      name: JSON.parse(eventText).name,
      refs: ['stage', 'wc2', 'info2'],
      ids: JSON.parse(eventText).landmarks.map((l: { id: string }) => l.id),
    },
  ]);
  expect((await call('GET', 'venue?id=nope')).status).toBe(404);
  expect((await call('GET', 'venue?id=../x')).status).toBe(400);
});

test('an open admin PR is where the venue opens from', async () => {
  repo = fakeRepo(files, { openPr: ['admin/qsncc-lg-5-8'] });
  const r = await (await call('GET', 'venue?id=qsncc-lg-5-8')).json();
  expect(r).toMatchObject({ ref: 'admin/qsncc-lg-5-8', pr: 'https://github.com/apisak-w/book-booth-finder/pull/9' });
  expect(repo.calls.some((c) => c.path.includes('ref=admin%2Fqsncc-lg-5-8'))).toBe(true);
});

test('the printed plan is served privately as a JPEG', async () => {
  const r = await call('GET', 'venue/reference?id=qsncc-lg-5-8');
  expect(r.headers.get('content-type')).toBe('image/jpeg');
  expect(r.headers.get('cache-control')).toBe('private, max-age=300');
  expect([...new Uint8Array(await r.arrayBuffer())]).toEqual([255, 216, 255]);
});

test('saving commits the formatted venue to admin/<id> and opens a PR', async () => {
  const next = addLandmark(base, { group: 'wc', icon: 'wc', th: 'ห้องน้ำ', en: 'Toilets, Hall 9', x: 1200, y: 700 }, [
    'info1',
  ]).venue;
  const r = await call('POST', 'venue/save', {
    id: 'qsncc-lg-5-8',
    venue: next,
    sha: 'sha-venues/qsncc-lg-5-8/venue.json',
  });
  expect(await r.json()).toEqual({ pr: 'https://github.com/apisak-w/book-booth-finder/pull/10' });
  const put = repo.calls.find((c) => c.method === 'PUT')!;
  expect(put.body).toMatchObject({ branch: 'admin/qsncc-lg-5-8' });
  expect(fromBase64(put.body!.content as string)).toBe(formatVenueJson(next));
  expect(String(put.body!.message)).toBe(
    'fix(venue): edit qsncc-lg-5-8 from the admin\n\n- Added wc7 (Toilets, Hall 9)',
  );
  expect(repo.calls.find((c) => c.method === 'POST' && c.path === '/git/refs')!.body).toEqual({
    ref: 'refs/heads/admin/qsncc-lg-5-8',
    sha: 'main-sha',
  });
});

test('a stale copy, a refused change, an unknown field or no change writes nothing', async () => {
  const stale = await save(base, 'older');
  expect(stale.status).toBe(409);
  expect((await stale.json()).error).toBe('This venue changed since you opened it. Reload, then save again');
  const del = await save({ ...base, landmarks: base.landmarks.filter((l) => l.id !== 'wc2') });
  expect(del.status).toBe(409);
  expect((await del.json()).error).toContain('wc2 can');
  const walls = await save({ ...base, gridCell: 8 });
  expect((await walls.json()).error).toContain("gridCell can't be changed");
  const extra = await save({ ...base, landmarks: base.landmarks.map((l, i) => (i ? l : { ...l, colour: 'red' })) });
  expect(extra.status).toBe(409);
  expect((await extra.json()).error).toBe("The venue has fields the admin doesn't know. Reload, then try again");
  expect((await save(base)).status).toBe(409);
  expect((await save({ ...base, landmarks: 'nope' })).status).toBe(409);
  expect(repo.calls.filter((c) => c.method !== 'GET')).toEqual([]);
});

test('without GitHub settings the venue routes say what to set', async () => {
  const r = await handleAdmin(new Request(`${ORIGIN}/api/admin/venues`, { headers: { cookie } }), env, {
    ...deps(),
    github: () => null,
  });
  expect(r.status).toBe(503);
});
