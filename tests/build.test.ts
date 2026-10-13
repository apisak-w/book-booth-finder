import { test, expect } from 'bun:test';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { listVenueIds, surroundingsPath } from '../src/lib/server/catalog';

const built = existsSync('_site/index.html');
const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? walk(join(dir, f)) : [join(dir, f)]));

test.skipIf(!built)('pages exist for the list, the event and 404', () => {
  for (const f of [
    '_site/index.html',
    '_site/e/bkkibf-2026/index.html',
    '_site/404.html',
    '_site/what-we-keep/index.html',
  ])
    expect(existsSync(f)).toBe(true);
});

test.skipIf(!built)('no source material or tooling is published', () => {
  const files = walk('_site');
  const leaked = files.filter((f) =>
    /reference\.jpg|plan\.(jpe?g|png)|corrections\.json|cells\.json|reads\.json|detect\.json|registration\.json|\/tools\//.test(
      f,
    ),
  );
  expect(leaked).toEqual([]);
});

test.skipIf(!built)('Zod is not in the client bundle', () => {
  const js = walk('_site/_app').filter((f) => f.endsWith('.js'));
  expect(js.filter((f) => readFileSync(f, 'utf8').includes('ZodError'))).toEqual([]);
});

test.skipIf(!built)('each venue street drawing is published', () => {
  for (const id of listVenueIds().filter((v) => existsSync(surroundingsPath(v))))
    expect(existsSync(`_site/v/${id}/surroundings.json`)).toBe(true);
});

test.skipIf(!built)('the spots config is published', () => {
  const cfg = JSON.parse(readFileSync('_site/spots-config.json', 'utf8'));
  expect(Object.keys(cfg).sort()).toEqual(['events', 'venues']);
});

test.skipIf(!built)('the admin page is not indexed and passkey code stays out of the guest pages', () => {
  expect(readFileSync('_site/admin/index.html', 'utf8')).toContain('noindex');
  const dir = '_site/e/bkkibf-2026';
  const html = readFileSync(join(dir, 'index.html'), 'utf8');
  const chunks = [...html.matchAll(/href="([^"]*_app\/[^"]+\.js)"/g)].map((m) =>
    m[1].startsWith('/') ? join('_site', m[1]) : join(dir, m[1]),
  );
  expect(chunks.length).toBeGreaterThan(0);
  expect(chunks.filter((f) => readFileSync(f, 'utf8').includes('WebAuthn is not supported'))).toEqual([]);
});
