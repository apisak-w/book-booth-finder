import { createReadStream, existsSync, readFileSync, writeFileSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { resolve } from 'node:path';
import type { Plugin } from 'vite';
import { loadEvent } from '../../../src/lib/server/catalog';
import { parseCorrections, EMPTY_CORRECTIONS } from '../lib/corrections';
import { stringifyJson } from '../lib/json';
import { eventPaths } from '../lib/paths';
import { rejectRequest, validTransform } from './guard';

const root = resolve(import.meta.dirname, '../../..');
const json = (path: string, fallback: unknown) =>
  existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : fallback;

function send(res: ServerResponse, code: number, body: unknown) {
  if (res.headersSent) return res.end();
  res.statusCode = code;
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify(body));
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const ch of req) chunks.push(ch as Buffer);
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

async function handle(req: IncomingMessage, res: ServerResponse, url: URL) {
  const denied = rejectRequest({
    method: req.method ?? 'GET',
    host: req.headers.host,
    origin: req.headers.origin,
    contentType: req.headers['content-type'],
  });
  if (denied) return send(res, denied[0], { error: denied[1] });
  const id = url.searchParams.get('id') ?? '';
  if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) return send(res, 400, { error: 'Add ?id=<event-id> to the address' });
  const p = eventPaths(id, root);

  if (req.method === 'GET' && url.pathname === '/api/state') {
    return send(res, 200, {
      bundle: loadEvent(id, root),
      cells: json(p.cells, []),
      reads: json(p.reads, []),
      corrections: json(p.corrections, EMPTY_CORRECTIONS),
      registration: json(p.registration, null),
    });
  }
  if (req.method === 'GET' && (url.pathname === '/api/plan' || url.pathname === '/api/reference')) {
    const file =
      url.pathname === '/api/plan' ? p.plan : resolve(root, 'venues', loadEvent(id, root).event.venue, 'reference.jpg');
    if (!existsSync(file)) return send(res, 404, { error: `${file} is missing` });
    res.setHeader('content-type', file.endsWith('.png') ? 'image/png' : 'image/jpeg');
    const stream = createReadStream(file);
    stream.on('error', (e) => send(res, 500, { error: e.message }));
    return stream.pipe(res);
  }
  if (req.method === 'POST' && url.pathname === '/api/corrections') {
    writeFileSync(p.corrections, stringifyJson(parseCorrections(await readBody(req))));
    return send(res, 200, { ok: true });
  }
  if (req.method === 'POST' && url.pathname === '/api/registration') {
    const t = (await readBody(req)) as Record<string, unknown>;
    if (!validTransform(t))
      return send(res, 400, { error: 'Registration needs positive sx and sy, and numeric dx and dy' });
    writeFileSync(
      p.registration,
      stringifyJson({ sx: t.sx, sy: t.sy, dx: t.dx, dy: t.dy, score: 1, method: 'manual' }),
    );
    return send(res, 200, { ok: true });
  }
  send(res, 404, { error: 'Unknown endpoint' });
}

export function reviewApi(): Plugin {
  return {
    name: 'review-api',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = new URL(req.url ?? '/', 'http://local');
        if (!url.pathname.startsWith('/api/')) return next();
        handle(req, res, url).catch((e: Error) => send(res, 400, { error: e.message }));
      });
    },
  };
}
