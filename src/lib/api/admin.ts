import {
  entrancePin,
  movePin,
  moveProblems,
  reviewDoor,
  withPins,
  type EventDays,
  type Filters,
  type StoredSpot,
} from '../core/spotReview';
import type { SpotsConfig } from '../core/spots';
import type { Venue } from '../core/types';
import {
  CLEAR_COOKIE,
  CODE_ERRORS,
  challengeOf,
  checkSetupCode,
  endSession,
  findPasskey,
  listPasskeys,
  markSetupUsed,
  passkeyIds,
  saveChallenge,
  savePasskey,
  signedIn,
  startSession,
  takeChallenge,
  touchPasskey,
  type Ceremonies,
} from './auth';
import { jsonResponse, loadConfig, notSetUp, purge, type Env } from './db';
import { GitHubError, proposeChange, type GitHub } from './github';

export type AdminDeps = { ceremonies: Ceremonies; github: (env: Env) => GitHub | null; now: () => Date };
export type Decision = {
  venue: string;
  place: string;
  action: 'keep' | 'move';
  lat: number | null;
  lng: number | null;
  spots: number;
  pr: string | null;
  at: string;
};
type Ctx = { req: Request; env: Env; deps: AdminDeps; now: Date; url: URL; body: Record<string, unknown> };
type Handler = (c: Ctx) => Promise<Response>;

class Refused extends Error {}

const withCookie = (res: Response, cookie: string) => {
  res.headers.append('set-cookie', cookie);
  return res;
};
const EXPIRED = { error: 'This request expired. Try again' };
const BAD_PASSKEY = { error: "That passkey didn't check out. Try again" };

export async function handleAdmin(req: Request, env: Env, deps: AdminDeps): Promise<Response> {
  const missing = notSetUp(env);
  if (missing) return missing;
  const url = new URL(req.url),
    now = deps.now();
  const path = url.pathname.replace(/^\/api\/admin\/?/, '').replace(/\/$/, '');
  let body: Record<string, unknown> = {};
  if (req.method === 'POST') {
    if (req.headers.get('origin') !== url.origin)
      return jsonResponse(403, { error: 'Admin changes only come from this site' });
    if (!(req.headers.get('content-type') ?? '').toLowerCase().startsWith('application/json'))
      return jsonResponse(415, { error: 'Send JSON' });
    try {
      const b = await req.json();
      if (b && typeof b === 'object' && !Array.isArray(b)) body = b as Record<string, unknown>;
    } catch {
      return jsonResponse(400, { error: 'Send JSON' });
    }
  } else if (req.method !== 'GET') return jsonResponse(405, { error: 'Use GET or POST' });
  await purge(env.DB, now);
  const ctx: Ctx = { req, env, deps, now, url, body };
  const key = `${req.method} ${path}`;
  const open: Record<string, Handler> = {
    'GET me': me,
    'POST setup/options': setupOptions,
    'POST setup/verify': setupVerify,
    'POST signin/options': signinOptions,
    'POST signin/verify': signinVerify,
    'POST signout': signout,
  };
  const closed: Record<string, Handler> = { 'GET spots': spots, 'POST decisions': decide };
  if (Object.hasOwn(open, key)) return open[key](ctx);
  if (!Object.hasOwn(closed, key)) return jsonResponse(404, { error: 'Unknown admin endpoint' });
  if (!(await signedIn(env.DB, req, now))) return jsonResponse(401, { error: 'Sign in first' });
  return closed[key](ctx);
}

async function me(c: Ctx) {
  const ok = await signedIn(c.env.DB, c.req, c.now);
  return jsonResponse(200, {
    signedIn: ok,
    hasPasskeys: (await passkeyIds(c.env.DB)).length > 0,
    passkeys: ok ? await listPasskeys(c.env.DB) : [],
  });
}

async function mayRegister(c: Ctx): Promise<{ viaCode: boolean } | Response> {
  if (await signedIn(c.env.DB, c.req, c.now)) return { viaCode: false };
  const check = await checkSetupCode(c.env.DB, c.env, c.body.code);
  return check === 'ok' ? { viaCode: true } : jsonResponse(403, { error: CODE_ERRORS[check] });
}

async function setupOptions(c: Ctx) {
  const may = await mayRegister(c);
  if (may instanceof Response) return may;
  const options = await c.deps.ceremonies.registrationOptions({
    rpID: c.url.hostname,
    excludeIds: await passkeyIds(c.env.DB),
  });
  await saveChallenge(c.env.DB, options.challenge, 'register', c.now);
  return jsonResponse(200, options);
}

async function setupVerify(c: Ctx) {
  const may = await mayRegister(c);
  if (may instanceof Response) return may;
  const challenge = challengeOf(c.body.response);
  if (!challenge || !(await takeChallenge(c.env.DB, challenge, 'register', c.now))) return jsonResponse(400, EXPIRED);
  const cred = await c.deps.ceremonies.verifyRegistration({
    response: c.body.response,
    challenge,
    origin: c.url.origin,
    rpID: c.url.hostname,
  });
  if (!cred) return jsonResponse(400, BAD_PASSKEY);
  const name = typeof c.body.name === 'string' && c.body.name.trim() ? c.body.name.trim().slice(0, 40) : 'Passkey';
  await savePasskey(c.env.DB, cred, name, c.now);
  if (may.viaCode) await markSetupUsed(c.env.DB, c.env);
  return withCookie(jsonResponse(200, { ok: true }), await startSession(c.env.DB, c.now));
}

async function signinOptions(c: Ctx) {
  if (!(await passkeyIds(c.env.DB)).length) return jsonResponse(404, { error: 'No passkeys yet. Set one up first' });
  const options = await c.deps.ceremonies.authenticationOptions({ rpID: c.url.hostname });
  await saveChallenge(c.env.DB, options.challenge, 'signin', c.now);
  return jsonResponse(200, options);
}

async function signinVerify(c: Ctx) {
  const challenge = challengeOf(c.body.response);
  if (!challenge || !(await takeChallenge(c.env.DB, challenge, 'signin', c.now))) return jsonResponse(400, EXPIRED);
  const id = (c.body.response as { id?: unknown } | undefined)?.id;
  const credential = typeof id === 'string' ? await findPasskey(c.env.DB, id) : null;
  if (!credential) return jsonResponse(400, { error: "This passkey isn't set up here" });
  const ok = await c.deps.ceremonies.verifyAuthentication({
    response: c.body.response,
    challenge,
    origin: c.url.origin,
    rpID: c.url.hostname,
    credential,
  });
  if (!ok) return jsonResponse(400, BAD_PASSKEY);
  await touchPasskey(c.env.DB, credential.id, ok.newCounter, c.now);
  return withCookie(jsonResponse(200, { ok: true }), await startSession(c.env.DB, c.now));
}

async function signout(c: Ctx) {
  await endSession(c.env.DB, c.req);
  return withCookie(jsonResponse(200, { ok: true }), CLEAR_COOKIE);
}

const eventsAt = (cfg: SpotsConfig, venue: string) => Object.entries(cfg.events).filter(([, e]) => e.venue === venue);

async function venueSpots(c: Ctx, cfg: SpotsConfig, venue: string, place?: string): Promise<StoredSpot[]> {
  const ids = eventsAt(cfg, venue).map(([id]) => id);
  if (!ids.length) return [];
  const where = place ? " AND kind = 'door' AND place = ?" : '';
  const sql = `SELECT event, kind, place, lat, lng, accuracy, hour FROM spots WHERE event IN (${ids.map(() => '?').join(', ')})${where} ORDER BY id`;
  return (
    await c.env.DB.prepare(sql)
      .bind(...ids, ...(place ? [place] : []))
      .all<StoredSpot>()
  ).results;
}

async function spots(c: Ctx) {
  const cfg = await loadConfig(c.env, c.req.url);
  const venue = c.url.searchParams.get('venue') ?? '';
  if (!Object.hasOwn(cfg.venues, venue)) return jsonResponse(404, { error: 'Unknown venue' });
  const decisions = (
    await c.env.DB.prepare(
      'SELECT venue, place, action, lat, lng, spots, pr, at FROM decisions WHERE venue = ? ORDER BY at',
    )
      .bind(venue)
      .all<Decision>()
  ).results;
  return jsonResponse(200, { spots: await venueSpots(c, cfg, venue), decisions });
}

function readFilters(v: unknown): Filters {
  const f = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  return { accuracy: f.accuracy !== false, near: f.near !== false, eventDays: f.eventDays !== false };
}

async function decide(c: Ctx) {
  const cfg = await loadConfig(c.env, c.req.url);
  const { venue, place, action } = c.body;
  if (typeof venue !== 'string' || !Object.hasOwn(cfg.venues, venue))
    return jsonResponse(400, { error: 'Unknown venue' });
  const events = eventsAt(cfg, venue);
  if (typeof place !== 'string' || !events.some(([, e]) => e.doors.includes(place)))
    return jsonResponse(400, { error: 'Only doors can be kept or moved' });
  if (action !== 'keep' && action !== 'move') return jsonResponse(400, { error: 'Choose keep or move' });
  const record = (lat: number | null, lng: number | null, n: number, pr: string | null) =>
    c.env.DB.prepare(
      'INSERT INTO decisions (venue, place, action, lat, lng, spots, pr, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    )
      .bind(venue, place, action, lat, lng, n, pr, c.now.toISOString())
      .run();
  if (action === 'keep') {
    await record(null, null, 0, null);
    return jsonResponse(200, { ok: true });
  }
  const gh = c.deps.github(c.env);
  if (!gh) return jsonResponse(503, { error: 'Set GITHUB_TOKEN and GITHUB_REPO in Cloudflare first' });
  const filters = readFilters(c.body.filters);
  const days: EventDays = Object.fromEntries(events.map(([id, e]) => [id, { start: e.start, end: e.end, tz: e.tz }]));
  const doorSpots = await venueSpots(c, cfg, venue, place);
  const moved = { lat: 0, lng: 0, n: 0 };
  try {
    const pr = await proposeChange(gh, {
      path: `venues/${venue}/venue.json`,
      branch: `spots/${venue}`,
      title: `fix(venue): line up ${venue} map pins from guest spots`,
      body: 'Map pin moves from the guest spots review. Check the street map on the Cloudflare preview before merging.',
      edit: (text) => {
        const v = JSON.parse(text) as Venue;
        const lm = v.landmarks.find((l) => l.id === place);
        if (!lm || !v.geo) throw new Refused(`${place} is not a map entrance in venue.json`);
        const r = reviewDoor(doorSpots, entrancePin(v.geo.pins, lm), filters, days);
        const problems = moveProblems(r, v.geo.pins, lm, v.metersPerPx);
        if (problems.length || !r.middle) throw new Refused(problems.join('; '));
        Object.assign(moved, { lat: r.middle.lat, lng: r.middle.lng, n: r.good.length });
        return {
          text: withPins(text, movePin(v.geo.pins, lm, r.middle)),
          message: `fix(venue): move the ${place} map pin from guest spots\n\n${r.good.length} spots, spread ${r.spreadM.toFixed(1)} m, moved ${r.offsetM.toFixed(1)} m.`,
        };
      },
    });
    await record(moved.lat, moved.lng, moved.n, pr);
    return jsonResponse(200, { pr });
  } catch (e) {
    if (e instanceof Refused) return jsonResponse(409, { error: e.message });
    if (e instanceof GitHubError) return jsonResponse(502, { error: e.message });
    throw e;
  }
}
