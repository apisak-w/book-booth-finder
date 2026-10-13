import { toBase64, type GitHub } from '../../src/lib/api/github';

type Call = { method: string; path: string; body?: Record<string, unknown> };
const REPO = 'apisak-w/book-booth-finder';

export function fakeGitHub(fileText: string, opts: { openPr?: boolean; branch?: boolean; fail?: string } = {}) {
  const calls: Call[] = [];
  const reply = (status: number, data: unknown) => Response.json(data, { status });
  const fake = async (url: string | URL | Request, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    const path = String(url).replace(`https://api.github.com/repos/${REPO}`, '');
    calls.push({ method, path, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    if (opts.fail && path.startsWith(opts.fail)) return reply(422, { message: 'Validation Failed' });
    if (method === 'GET' && path === '/git/ref/heads/main') return reply(200, { object: { sha: 'main-sha' } });
    if (method === 'GET' && path.startsWith('/pulls'))
      return reply(200, opts.openPr ? [{ html_url: `https://github.com/${REPO}/pull/7` }] : []);
    if (method === 'GET' && path.startsWith('/git/ref/heads/'))
      return opts.branch ? reply(200, { object: { sha: 'old-sha' } }) : reply(404, { message: 'Not Found' });
    if (method === 'GET' && path.startsWith('/contents/'))
      return reply(200, { content: toBase64(fileText).replace(/(.{60})/g, '$1\n'), sha: 'file-sha' });
    if (method === 'POST' && path === '/git/refs') return reply(201, {});
    if (method === 'PATCH' || method === 'PUT') return reply(200, {});
    if (method === 'POST' && path === '/pulls') return reply(201, { html_url: `https://github.com/${REPO}/pull/8` });
    return reply(500, { message: `unexpected ${method} ${path}` });
  };
  const github: GitHub = { token: 't', repo: REPO, fetch: fake as typeof globalThis.fetch };
  return { calls, github };
}
