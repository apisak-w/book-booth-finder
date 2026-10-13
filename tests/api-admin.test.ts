import { test, expect, beforeEach } from 'bun:test';
import { handleAdmin, type AdminDeps } from '../src/lib/api/admin';
import { b64url, type Ceremonies } from '../src/lib/api/auth';
import type { Env } from '../src/lib/api/db';
import { fromBase64 } from '../src/lib/api/github';
import { georef, planToLatLng } from '../src/lib/core/geo';
import type { SpotsConfig } from '../src/lib/core/spots';
import type { Venue } from '../src/lib/core/types';
import { fakeDb } from './helpers/fake-d1';
import { fakeGitHub } from './helpers/fake-github';
import { pinnedVenue } from './helpers/pinned-venue';

const ORIGIN = 'https://booth.example';
const CODE = 'correct horse battery staple';
const PR8 = 'https://github.com/apisak-w/book-booth-finder/pull/8';
const { venue, text: venueText } = pinnedVenue();
const mrt = venue.landmarks.find((l) => l.id === 'mrt')!;
const g = georef(venue.geo!.pins);
const cfg: SpotsConfig = {
  events: {
    fair: {
      venue: 'qsncc-lg-5-8',
      start: '2026-10-15',
      end: '2026-10-25',
      tz: 'Asia/Bangkok',
      doors: ['mrt', 'door5'],
      halls: ['hall5'],
    },
    expo: {
      venue: 'qsncc-lg-5-7',
      start: '2026-10-15',
      end: '2026-10-25',
      tz: 'Asia/Bangkok',
      doors: ['mrt'],
      halls: ['hall5'],
    },
  },
  venues: { 'qsncc-lg-5-8': { lat: 13.7236, lng: 100.5597 }, 'qsncc-lg-5-7': { lat: 13.7236, lng: 100.5597 } },
};

let now: Date;
let n = 0;
let db: ReturnType<typeof fakeDb>;
let env: Env;
let gh: ReturnType<typeof fakeGitHub>;

const ceremonies: Ceremonies = {
  registrationOptions: async () => ({ challenge: `reg-${++n}` }),
  verifyRegistration: async ({ response }) => ({
    id: (response as { id: string }).id,
    publicKey: new Uint8Array([1, 2, 3]),
    counter: 0,
    transports: ['internal'],
  }),
  authenticationOptions: async () => ({ challenge: `sign-${++n}` }),
  verifyAuthentication: async ({ response, credential }) =>
    (response as { bad?: boolean }).bad ? null : { newCounter: credential.counter + 1 },
};
const deps = (over: Partial<AdminDeps> = {}): AdminDeps => ({
  ceremonies,
  github: () => gh.github,
  now: () => now,
  ...over,
});

beforeEach(() => {
  now = new Date('2026-10-16T03:00:00Z');
  db = fakeDb();
  gh = fakeGitHub(venueText);
  env = { DB: db, ASSETS: { fetch: async () => Response.json(cfg) }, ADMIN_SETUP_CODE: CODE };
});

const call = (method: string, path: string, body?: unknown, cookie = '', d = deps(), origin = ORIGIN) =>
  handleAdmin(
    new Request(`${ORIGIN}/api/admin/${path}`, {
      method,
      headers: { origin, 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    env,
    d,
  );
const cookieOf = (r: Response) => (r.headers.get('set-cookie') ?? '').split(';')[0];
const clientData = (type: string, challenge: string) =>
  b64url(new TextEncoder().encode(JSON.stringify({ type, challenge })));

async function setUp(id = 'pk1', code: string | null = CODE, cookie = '') {
  const { challenge } = await (await call('POST', 'setup/options', { code }, cookie)).json();
  const response = { id, response: { clientDataJSON: clientData('webauthn.create', String(challenge)) } };
  return call('POST', 'setup/verify', { code, name: 'Phone', response }, cookie);
}
async function signInBody(id = 'pk1', extra: Record<string, unknown> = {}) {
  const { challenge } = await (await call('POST', 'signin/options', {})).json();
  return { response: { id, response: { clientDataJSON: clientData('webauthn.get', String(challenge)) }, ...extra } };
}
function addSpot(event: string, x: number, y: number) {
  const ll = planToLatLng(g, [x, y]);
  db.raw
    .query(
      'INSERT INTO spots (event, kind, place, lat, lng, accuracy, hour, purge_after) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    )
    .run(event, 'door', 'mrt', ll.lat, ll.lng, 8, '2026-10-16T02', '2026-11-24');
}
const sixShifted = () => {
  for (let k = 0; k < 6; k++) addSpot('fair', mrt.x + 59 + 5 * Math.cos(k), mrt.y + 5 * Math.sin(k));
};

test('first set-up with the code signs the owner in and uses up the code', async () => {
  const r = await setUp();
  expect(r.status).toBe(200);
  expect(r.headers.get('set-cookie')).toContain('HttpOnly; Secure; SameSite=Strict');
  const me = await (await call('GET', 'me', undefined, cookieOf(r))).json();
  expect(me).toEqual({
    signedIn: true,
    hasPasskeys: true,
    passkeys: [{ name: 'Phone', created: now.toISOString(), lastUsed: null }],
  });
  const again = await setUp('pk2');
  expect(again.status).toBe(403);
  expect((await again.json()).error).toContain('already used');
});

test('set-up refuses a wrong or missing code, and a code that is not set', async () => {
  expect((await setUp('pk1', 'wrong code entirely')).status).toBe(403);
  expect((await setUp('pk1', null)).status).toBe(403);
  env.ADMIN_SETUP_CODE = undefined;
  const r = await setUp();
  expect(r.status).toBe(403);
  expect((await r.json()).error).toContain('Set ADMIN_SETUP_CODE');
  expect(db.raw.query('SELECT COUNT(*) AS n FROM passkeys').get()).toEqual({ n: 0 });
});

test('a signed-in owner adds a spare passkey without the code', async () => {
  const cookie = cookieOf(await setUp());
  expect((await setUp('pk2', null, cookie)).status).toBe(200);
  expect(db.raw.query('SELECT COUNT(*) AS n FROM passkeys').get()).toEqual({ n: 2 });
});

test('sign-in works with a known passkey and refuses unknown ones and replays', async () => {
  await setUp();
  const body = await signInBody();
  const r = await call('POST', 'signin/verify', body);
  expect(r.status).toBe(200);
  expect(cookieOf(r)).toMatch(/^__Host-bf_admin=/);
  expect(db.raw.query('SELECT counter FROM passkeys').get()).toEqual({ counter: 1 });
  expect((await call('POST', 'signin/verify', body)).status).toBe(400);
  expect((await call('POST', 'signin/verify', await signInBody('nope'))).status).toBe(400);
  expect((await call('POST', 'signin/verify', await signInBody('pk1', { bad: true }))).status).toBe(400);
});

test('sign-in before any passkey says to set one up', async () => {
  const r = await call('POST', 'signin/options', {});
  expect(r.status).toBe(404);
  expect((await r.json()).error).toBe('No passkeys yet. Set one up first');
});

test('admin writes must come from this site as JSON', async () => {
  expect((await call('POST', 'signin/options', {}, '', deps(), 'https://evil.example')).status).toBe(403);
  const r = await handleAdmin(
    new Request(`${ORIGIN}/api/admin/signin/options`, {
      method: 'POST',
      headers: { origin: ORIGIN, 'content-type': 'text/plain' },
      body: '{}',
    }),
    env,
    deps(),
  );
  expect(r.status).toBe(415);
  expect((await call('GET', 'nothing-here')).status).toBe(404);
});

test('spots and decisions need a live session', async () => {
  expect((await call('GET', 'spots?venue=qsncc-lg-5-8')).status).toBe(401);
  expect((await call('POST', 'decisions', { venue: 'qsncc-lg-5-8', place: 'mrt', action: 'keep' })).status).toBe(401);
  const cookie = cookieOf(await setUp());
  expect((await call('GET', 'spots?venue=qsncc-lg-5-8', undefined, cookie)).status).toBe(200);
  now = new Date(now.getTime() + 13 * 3_600_000);
  expect((await call('GET', 'spots?venue=qsncc-lg-5-8', undefined, cookie)).status).toBe(401);
});

test('signing out ends the session', async () => {
  const cookie = cookieOf(await setUp());
  const out = await call('POST', 'signout', {}, cookie);
  expect(out.headers.get('set-cookie')).toContain('Max-Age=0');
  expect((await call('GET', 'spots?venue=qsncc-lg-5-8', undefined, cookie)).status).toBe(401);
});

test('spots lists only the events at that venue', async () => {
  const cookie = cookieOf(await setUp());
  addSpot('fair', mrt.x, mrt.y);
  addSpot('expo', mrt.x, mrt.y);
  const r = await (await call('GET', 'spots?venue=qsncc-lg-5-8', undefined, cookie)).json();
  expect(r.spots.map((s: { event: string }) => s.event)).toEqual(['fair']);
  expect(r.decisions).toEqual([]);
  expect((await call('GET', 'spots?venue=nowhere', undefined, cookie)).status).toBe(404);
});

test('keep records a decision, and only doors can be decided', async () => {
  const cookie = cookieOf(await setUp());
  expect(
    (await call('POST', 'decisions', { venue: 'qsncc-lg-5-8', place: 'mrt', action: 'keep' }, cookie)).status,
  ).toBe(200);
  expect(db.raw.query('SELECT venue, place, action, pr FROM decisions').all()).toEqual([
    { venue: 'qsncc-lg-5-8', place: 'mrt', action: 'keep', pr: null },
  ]);
  expect(
    (await call('POST', 'decisions', { venue: 'qsncc-lg-5-8', place: 'hall5', action: 'keep' }, cookie)).status,
  ).toBe(400);
});

test('move commits the new pin to a pull request and records it', async () => {
  const cookie = cookieOf(await setUp());
  sixShifted();
  const r = await call('POST', 'decisions', { venue: 'qsncc-lg-5-8', place: 'mrt', action: 'move' }, cookie);
  expect(await r.json()).toEqual({ pr: PR8 });
  const put = gh.calls.find((c) => c.method === 'PUT')!;
  const next = JSON.parse(fromBase64(put.body!.content as string)) as Venue;
  expect(next.geo!.pins.find((p) => p.id === 'mrt')).toMatchObject({ x: mrt.x, y: mrt.y });
  expect(String(put.body!.message)).toStartWith('fix(venue): move the mrt map pin from guest spots');
  expect(db.raw.query('SELECT action, spots, pr FROM decisions').all()).toEqual([
    { action: 'move', spots: 6, pr: PR8 },
  ]);
});

test('move is refused with too few spots and writes nothing', async () => {
  const cookie = cookieOf(await setUp());
  addSpot('fair', mrt.x + 59, mrt.y);
  const r = await call('POST', 'decisions', { venue: 'qsncc-lg-5-8', place: 'mrt', action: 'move' }, cookie);
  expect(r.status).toBe(409);
  expect((await r.json()).error).toBe('Only 1 good spot. Moving a pin needs 5.');
  expect(gh.calls.filter((c) => c.method !== 'GET')).toEqual([]);
  expect(db.raw.query('SELECT COUNT(*) AS n FROM decisions').get()).toEqual({ n: 0 });
});

test('move without GitHub settings says what to set, and GitHub errors come back as 502', async () => {
  const cookie = cookieOf(await setUp());
  sixShifted();
  const body = { venue: 'qsncc-lg-5-8', place: 'mrt', action: 'move' };
  const none = await call('POST', 'decisions', body, cookie, deps({ github: () => null }));
  expect(none.status).toBe(503);
  expect((await none.json()).error).toBe('Set GITHUB_TOKEN and GITHUB_REPO in Cloudflare first');
  gh = fakeGitHub(venueText, { fail: '/git/refs' });
  const bad = await call('POST', 'decisions', body, cookie);
  expect(bad.status).toBe(502);
  expect(db.raw.query('SELECT COUNT(*) AS n FROM decisions').get()).toEqual({ n: 0 });
});
