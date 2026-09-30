import { existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

export function eventPaths(id: string, root = process.cwd()) {
  const dir = resolve(root, 'events', id),
    source = join(dir, 'source');
  const planFile = existsSync(source)
    ? readdirSync(source).find((f) => /^plan\.(jpe?g|png|webp)$/i.test(f))
    : undefined;
  return {
    dir,
    source,
    plan: planFile ? join(source, planFile) : join(source, 'plan.jpg'),
    detect: join(source, 'detect.json'),
    registration: join(source, 'registration.json'),
    cells: join(source, 'cells.json'),
    reads: join(source, 'reads.json'),
    corrections: join(source, 'corrections.json'),
    event: join(dir, 'event.json'),
    booths: join(dir, 'booths.json'),
    exhibitors: join(dir, 'exhibitors.csv'),
  };
}
