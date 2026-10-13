import type { Db, Env } from './db';

export type Options = { challenge: string } & Record<string, unknown>;
export type StoredCredential = { id: string; publicKey: Uint8Array; counter: number; transports?: string[] };
export type Ceremonies = {
  registrationOptions(o: { rpID: string; excludeIds: string[] }): Promise<Options>;
  verifyRegistration(o: {
    response: unknown;
    challenge: string;
    origin: string;
    rpID: string;
  }): Promise<StoredCredential | null>;
  authenticationOptions(o: { rpID: string }): Promise<Options>;
  verifyAuthentication(o: {
    response: unknown;
    challenge: string;
    origin: string;
    rpID: string;
    credential: StoredCredential;
  }): Promise<{ newCounter: number } | null>;
};
export type CodeCheck = 'ok' | 'none' | 'wrong' | 'used';
type Kind = 'register' | 'signin';

export const SESSION_COOKIE = '__Host-bf_admin';
export const SESSION_HOURS = 12;
export const CHALLENGE_MINUTES = 5;
export const MIN_SETUP_CODE = 16;
export const CLEAR_COOKIE = `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
export const CODE_ERRORS: Record<Exclude<CodeCheck, 'ok'>, string> = {
  none: 'Set ADMIN_SETUP_CODE in Cloudflare (16 characters or more), then try again',
  wrong: 'That setup code is wrong',
  used: 'That setup code was already used. Set a new setup code in Cloudflare, then try again',
};

const later = (now: Date, ms: number) => new Date(now.getTime() + ms).toISOString();

export function b64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromB64url(s: string): Uint8Array {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

export async function sha256(s: string): Promise<string> {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
  return [...d].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function challengeOf(response: unknown): string | null {
  try {
    const data = (response as { response: { clientDataJSON: string } }).response.clientDataJSON;
    const c = JSON.parse(new TextDecoder().decode(fromB64url(data))).challenge;
    return typeof c === 'string' ? c : null;
  } catch {
    return null;
  }
}

export async function saveChallenge(db: Db, challenge: string, kind: Kind, now: Date) {
  await db
    .prepare('INSERT INTO challenges (challenge, kind, expires) VALUES (?, ?, ?)')
    .bind(challenge, kind, later(now, CHALLENGE_MINUTES * 60_000))
    .run();
}

export async function takeChallenge(db: Db, challenge: string, kind: Kind, now: Date): Promise<boolean> {
  await db.prepare('DELETE FROM challenges WHERE expires < ?').bind(now.toISOString()).run();
  const row = await db
    .prepare('DELETE FROM challenges WHERE challenge = ? AND kind = ? RETURNING expires')
    .bind(challenge, kind)
    .first();
  return !!row;
}

function cookieToken(req: Request): string | null {
  const m = (req.headers.get('cookie') ?? '').match(/(?:^|;\s*)__Host-bf_admin=([A-Za-z0-9_-]{43})(?:;|$)/);
  return m ? m[1] : null;
}

export async function startSession(db: Db, now: Date): Promise<string> {
  const token = b64url(crypto.getRandomValues(new Uint8Array(32)));
  await db
    .prepare('INSERT INTO sessions (token_hash, expires) VALUES (?, ?)')
    .bind(await sha256(token), later(now, SESSION_HOURS * 3_600_000))
    .run();
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_HOURS * 3600}`;
}

export async function signedIn(db: Db, req: Request, now: Date): Promise<boolean> {
  const t = cookieToken(req);
  if (!t) return false;
  await db.prepare('DELETE FROM sessions WHERE expires < ?').bind(now.toISOString()).run();
  return !!(await db
    .prepare('SELECT 1 AS ok FROM sessions WHERE token_hash = ?')
    .bind(await sha256(t))
    .first());
}

export async function endSession(db: Db, req: Request) {
  const t = cookieToken(req);
  if (t)
    await db
      .prepare('DELETE FROM sessions WHERE token_hash = ?')
      .bind(await sha256(t))
      .run();
}

export async function checkSetupCode(db: Db, env: Env, code: unknown): Promise<CodeCheck> {
  const want = env.ADMIN_SETUP_CODE ?? '';
  if (want.length < MIN_SETUP_CODE) return 'none';
  const wantHash = await sha256(want);
  if (typeof code !== 'string' || (await sha256(code)) !== wantHash) return 'wrong';
  const used = await db.prepare("SELECT value FROM meta WHERE key = 'setup_used'").first<{ value: string }>();
  return used?.value === wantHash ? 'used' : 'ok';
}

export async function markSetupUsed(db: Db, env: Env) {
  await db
    .prepare(
      "INSERT INTO meta (key, value) VALUES ('setup_used', ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value",
    )
    .bind(await sha256(env.ADMIN_SETUP_CODE ?? ''))
    .run();
}

export async function passkeyIds(db: Db): Promise<string[]> {
  return (await db.prepare('SELECT id FROM passkeys').all<{ id: string }>()).results.map((r) => r.id);
}

export async function savePasskey(db: Db, c: StoredCredential, name: string, now: Date) {
  await db
    .prepare('INSERT INTO passkeys (id, public_key, counter, transports, name, created) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(c.id, c.publicKey, c.counter, JSON.stringify(c.transports ?? []), name, now.toISOString())
    .run();
}

export async function findPasskey(db: Db, id: string): Promise<StoredCredential | null> {
  const r = await db
    .prepare('SELECT id, public_key, counter, transports FROM passkeys WHERE id = ?')
    .bind(id)
    .first<{ id: string; public_key: ArrayBuffer | Uint8Array | number[]; counter: number; transports: string }>();
  return r
    ? { id: r.id, publicKey: new Uint8Array(r.public_key), counter: r.counter, transports: JSON.parse(r.transports) }
    : null;
}

export async function touchPasskey(db: Db, id: string, counter: number, now: Date) {
  await db
    .prepare('UPDATE passkeys SET counter = ?, last_used = ? WHERE id = ?')
    .bind(counter, now.toISOString(), id)
    .run();
}

export async function listPasskeys(db: Db) {
  return (
    await db
      .prepare('SELECT name, created, last_used AS lastUsed FROM passkeys ORDER BY created')
      .all<{ name: string; created: string; lastUsed: string | null }>()
  ).results;
}
