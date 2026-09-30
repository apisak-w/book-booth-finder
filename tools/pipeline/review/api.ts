import { createReadStream, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Plugin } from 'vite';
import { loadEvent } from '../../../src/lib/server/catalog';
import { parseCorrections, EMPTY_CORRECTIONS } from '../lib/corrections';
import { eventPaths } from '../lib/paths';

const root = resolve(import.meta.dirname, '../../..');
const json = (path: string, fallback: unknown) =>
  existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : fallback;

export function reviewApi(): Plugin {
  return {
    name: 'review-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url ?? '/', 'http://local');
        if (!url.pathname.startsWith('/api/')) return next();
        const id = url.searchParams.get('id') ?? '';
        const send = (code: number, body: unknown, type = 'application/json') => {
          res.statusCode = code;
          res.setHeader('content-type', type);
          res.end(typeof body === 'string' ? body : JSON.stringify(body));
        };
        if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) return send(400, { error: 'Add ?id=<event-id> to the address' });
        const p = eventPaths(id, root);
        try {
          if (req.method === 'GET' && url.pathname === '/api/state') {
            return send(200, {
              bundle: loadEvent(id, root),
              cells: json(p.cells, []),
              reads: json(p.reads, []),
              corrections: json(p.corrections, EMPTY_CORRECTIONS),
              registration: json(p.registration, null),
            });
          }
          if (req.method === 'GET' && (url.pathname === '/api/plan' || url.pathname === '/api/reference')) {
            const file =
              url.pathname === '/api/plan'
                ? p.plan
                : resolve(root, 'venues', loadEvent(id, root).event.venue, 'reference.jpg');
            res.setHeader('content-type', file.endsWith('.png') ? 'image/png' : 'image/jpeg');
            return createReadStream(file).pipe(res);
          }
          if (req.method === 'POST') {
            const chunks: Buffer[] = [];
            for await (const ch of req) chunks.push(ch as Buffer);
            const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
            if (url.pathname === '/api/corrections') {
              writeFileSync(p.corrections, JSON.stringify(parseCorrections(body), null, 2) + '\n');
              return send(200, { ok: true });
            }
            if (url.pathname === '/api/registration') {
              const t = body as Record<string, unknown>;
              if (!['sx', 'sy', 'dx', 'dy'].every((k) => typeof t[k] === 'number'))
                return send(400, { error: 'Registration needs sx, sy, dx and dy' });
              writeFileSync(p.registration, JSON.stringify({ ...t, score: 1, method: 'manual' }, null, 2) + '\n');
              return send(200, { ok: true });
            }
          }
          send(404, { error: 'Unknown endpoint' });
        } catch (e) {
          send(400, { error: (e as Error).message });
        }
      });
    },
  };
}
