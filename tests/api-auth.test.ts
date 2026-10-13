import { test, expect } from 'bun:test';
import {
  b64url,
  challengeOf,
  checkSetupCode,
  endSession,
  fromB64url,
  markSetupUsed,
  saveChallenge,
  signedIn,
  startSession,
  takeChallenge,
} from '../src/lib/api/auth';
import type { Env } from '../src/lib/api/db';
import { fakeDb } from './helpers/fake-d1';

const now = new Date('2026-10-16T03:00:00Z');
const later = (ms: number) => new Date(now.getTime() + ms);
const withCookie = (setCookie: string) =>
  new Request('https://booth.example/api/admin/me', { headers: { cookie: setCookie.split(';')[0] } });

test('a session cookie is locked down and lasts 12 hours', async () => {
  const db = fakeDb();
  const cookie = await startSession(db, now);
  expect(cookie).toMatch(
    /^__Host-bf_admin=[A-Za-z0-9_-]{43}; Path=\/; HttpOnly; Secure; SameSite=Strict; Max-Age=43200$/,
  );
  expect(await signedIn(db, withCookie(cookie), later(11 * 3_600_000))).toBe(true);
  expect(await signedIn(db, withCookie(cookie), later(13 * 3_600_000))).toBe(false);
  expect(db.raw.query('SELECT COUNT(*) AS n FROM sessions').get()).toEqual({ n: 0 });
});

test('only the hash is stored, and signing out ends the session', async () => {
  const db = fakeDb();
  const cookie = await startSession(db, now);
  const token = cookie.split(';')[0].split('=')[1];
  expect(JSON.stringify(db.raw.query('SELECT * FROM sessions').all())).not.toContain(token);
  await endSession(db, withCookie(cookie));
  expect(await signedIn(db, withCookie(cookie), now)).toBe(false);
  expect(await signedIn(db, new Request('https://booth.example/'), now)).toBe(false);
});

test('a challenge works once, for its own kind, before it expires', async () => {
  const db = fakeDb();
  await saveChallenge(db, 'c1', 'signin', now);
  expect(await takeChallenge(db, 'c1', 'register', now)).toBe(false);
  expect(await takeChallenge(db, 'c1', 'signin', now)).toBe(true);
  expect(await takeChallenge(db, 'c1', 'signin', now)).toBe(false);
  await saveChallenge(db, 'c2', 'signin', now);
  expect(await takeChallenge(db, 'c2', 'signin', later(6 * 60_000))).toBe(false);
});

test('the setup code must be set, long enough, right and unused', async () => {
  const db = fakeDb();
  const env = (code?: string): Env => ({
    DB: db,
    ASSETS: { fetch: async () => new Response() },
    ADMIN_SETUP_CODE: code,
  });
  const code = 'correct horse battery';
  expect(await checkSetupCode(db, env(), code)).toBe('none');
  expect(await checkSetupCode(db, env('short'), 'short')).toBe('none');
  expect(await checkSetupCode(db, env(code), 'nope')).toBe('wrong');
  expect(await checkSetupCode(db, env(code), 42)).toBe('wrong');
  expect(await checkSetupCode(db, env(code), code)).toBe('ok');
  await markSetupUsed(db, env(code));
  expect(await checkSetupCode(db, env(code), code)).toBe('used');
  expect(await checkSetupCode(db, env(`${code} again`), `${code} again`)).toBe('ok');
});

test('challengeOf reads the challenge the browser signed', () => {
  const clientDataJSON = b64url(new TextEncoder().encode(JSON.stringify({ type: 'webauthn.get', challenge: 'abc' })));
  expect(challengeOf({ response: { clientDataJSON } })).toBe('abc');
  expect(challengeOf({})).toBeNull();
  expect(challengeOf({ response: { clientDataJSON: '%%%' } })).toBeNull();
  expect([...fromB64url(b64url(new Uint8Array([0, 250, 255, 7])))]).toEqual([0, 250, 255, 7]);
});
