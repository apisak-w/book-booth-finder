import { parseSpot, SPOTS_PER_EVENT } from '../core/spots';
import { jsonResponse, loadConfig, notSetUp, purge, type Env } from './db';

const MAX_BODY = 2048;

export async function handleSpot(request: Request, env: Env, now = new Date()): Promise<Response> {
  if (request.method !== 'POST') return jsonResponse(405, { error: 'Use POST' });
  const missing = notSetUp(env);
  if (missing) return missing;
  if (!(request.headers.get('content-type') ?? '').toLowerCase().startsWith('application/json'))
    return jsonResponse(415, { error: 'Send JSON' });
  const text = await request.text();
  if (text.length > MAX_BODY) return jsonResponse(413, { error: 'Send one spot at a time' });
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return jsonResponse(400, { error: 'Send JSON' });
  }
  await purge(env.DB, now);
  const parsed = parseSpot(body, await loadConfig(env, request.url), now);
  if ('error' in parsed) return jsonResponse(400, { error: parsed.error });
  const r = parsed.row;
  const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM spots WHERE event = ?')
    .bind(r.event)
    .first<{ n: number }>();
  if ((count?.n ?? 0) >= SPOTS_PER_EVENT) return jsonResponse(503, { error: 'Spots are full for this event' });
  await env.DB.prepare(
    'INSERT INTO spots (event, kind, place, lat, lng, accuracy, hour, purge_after) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
  )
    .bind(r.event, r.kind, r.place, r.lat, r.lng, r.accuracy, r.hour, r.purgeAfter)
    .run();
  return new Response(null, { status: 204 });
}
