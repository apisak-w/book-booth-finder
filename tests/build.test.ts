import { test, expect } from 'bun:test';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const built = existsSync('_site/index.html');
const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? walk(join(dir, f)) : [join(dir, f)]));

test.skipIf(!built)('pages exist for the list, the event and 404', () => {
  for (const f of ['_site/index.html', '_site/e/bkkibf-2026/index.html', '_site/404.html'])
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
