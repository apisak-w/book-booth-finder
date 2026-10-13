import { Database } from 'bun:sqlite';
import { readFileSync } from 'node:fs';
import type { Db, Stmt } from '../../src/lib/api/db';

export function fakeDb(): Db & { raw: Database } {
  const raw = new Database(':memory:');
  raw.run(readFileSync('migrations/0001_spots.sql', 'utf8'));
  const stmt = (sql: string, values: unknown[] = []): Stmt => ({
    bind: (...v) => stmt(sql, v),
    first: async <T>() => (raw.query(sql).get(...(values as never[])) ?? null) as T | null,
    all: async <T>() => ({ results: raw.query(sql).all(...(values as never[])) as T[] }),
    run: async () => raw.query(sql).run(...(values as never[])),
  });
  return { raw, prepare: (sql) => stmt(sql), batch: async (all) => Promise.all(all.map((s) => s.run())) };
}
