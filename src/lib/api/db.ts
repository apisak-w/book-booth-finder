import type { SpotsConfig } from '../core/spots';

export type Row = Record<string, unknown>;
export interface Stmt {
  bind(...values: unknown[]): Stmt;
  first<T = Row>(): Promise<T | null>;
  all<T = Row>(): Promise<{ results: T[] }>;
  run(): Promise<unknown>;
}
export interface Db {
  prepare(sql: string): Stmt;
  batch(stmts: Stmt[]): Promise<unknown[]>;
}
export type Env = {
  DB: Db;
  ASSETS: { fetch(request: Request): Promise<Response> };
  ADMIN_SETUP_CODE?: string;
  GITHUB_TOKEN?: string;
  GITHUB_REPO?: string;
};

export const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });

export async function purge(db: Db, now: Date) {
  await db.prepare('DELETE FROM spots WHERE purge_after < ?').bind(now.toISOString().slice(0, 10)).run();
}

export async function loadConfig(env: Env, url: string): Promise<SpotsConfig> {
  const r = await env.ASSETS.fetch(new Request(new URL('/spots-config.json', url)));
  if (!r.ok) throw new Error('spots-config.json is missing from the build');
  return r.json();
}
