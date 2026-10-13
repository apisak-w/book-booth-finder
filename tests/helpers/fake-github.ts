import { toBase64, type GitHub } from '../../src/lib/api/github';

type Call = { method: string; path: string; body?: Record<string, unknown> };
const REPO = 'apisak-w/book-booth-finder';
const reply = (status: number, data: unknown) => Response.json(data, { status });

export function fakeGitHub(
  fileText: string,
  opts: { openPr?: boolean; branch?: boolean; fail?: string; mergedHead?: string; prRace?: boolean } = {},
) {
  const calls: Call[] = [];
  let raced = false;
  const fake = async (url: string | URL | Request, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    const path = String(url).replace(`https://api.github.com/repos/${REPO}`, '');
    calls.push({ method, path, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    if (opts.fail && path.startsWith(opts.fail)) return reply(422, { message: 'Validation Failed' });
    if (method === 'GET' && path === '/git/ref/heads/main') return reply(200, { object: { sha: 'main-sha' } });
    if (method === 'GET' && path.startsWith('/pulls') && path.includes('state=closed'))
      return reply(200, opts.mergedHead ? [{ head: { sha: opts.mergedHead } }] : []);
    if (method === 'GET' && path.startsWith('/pulls'))
      return reply(200, opts.openPr || raced ? [{ html_url: `https://github.com/${REPO}/pull/7` }] : []);
    if (method === 'GET' && path.startsWith('/git/ref/heads/'))
      return opts.branch ? reply(200, { object: { sha: 'old-sha' } }) : reply(404, { message: 'Not Found' });
    if (method === 'GET' && path.startsWith('/contents/'))
      return reply(200, { content: toBase64(fileText).replace(/(.{60})/g, '$1\n'), sha: 'file-sha' });
    if (method === 'POST' && path === '/git/refs') return reply(201, {});
    if (method === 'PATCH' || method === 'PUT') return reply(200, {});
    if (method === 'POST' && path === '/pulls') {
      if (opts.prRace) {
        raced = true;
        return reply(422, { message: 'A pull request already exists for apisak-w:spots/v.' });
      }
      return reply(201, { html_url: `https://github.com/${REPO}/pull/8` });
    }
    return reply(500, { message: `unexpected ${method} ${path}` });
  };
  const github: GitHub = { token: 't', repo: REPO, fetch: fake as typeof globalThis.fetch };
  return { calls, github };
}

export function fakeRepo(
  files: Record<string, string | Uint8Array>,
  opts: { openPr?: string[]; branches?: string[] } = {},
) {
  const calls: Call[] = [];
  const fake = async (url: string | URL | Request, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    const path = String(url).replace(`https://api.github.com/repos/${REPO}`, '');
    calls.push({ method, path, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    const accept = new Headers(init?.headers).get('accept') ?? '';
    if (method === 'GET' && path === '/git/ref/heads/main') return reply(200, { object: { sha: 'main-sha' } });
    if (method === 'GET' && path.startsWith('/pulls')) {
      const head = decodeURIComponent(new URL(`https://x${path}`).searchParams.get('head') ?? '').split(':')[1];
      return reply(200, (opts.openPr ?? []).includes(head) ? [{ html_url: `https://github.com/${REPO}/pull/9` }] : []);
    }
    if (method === 'GET' && path.startsWith('/git/ref/heads/')) {
      const b = path.slice('/git/ref/heads/'.length);
      return (opts.branches ?? []).includes(b)
        ? reply(200, { object: { sha: 'old-sha' } })
        : reply(404, { message: 'Not Found' });
    }
    if (method === 'GET' && path.startsWith('/contents/')) {
      const p = decodeURIComponent(path.slice('/contents/'.length).split('?')[0]);
      const f = files[p];
      if (f !== undefined) {
        const bytes = typeof f === 'string' ? new TextEncoder().encode(f) : f;
        if (accept.includes('raw')) return new Response(new Uint8Array(bytes), { status: 200 });
        return reply(200, {
          content: toBase64(typeof f === 'string' ? f : new TextDecoder().decode(f)),
          sha: `sha-${p}`,
        });
      }
      const kids = [
        ...new Set(
          Object.keys(files)
            .filter((k) => k.startsWith(`${p}/`))
            .map((k) => k.slice(p.length + 1).split('/')[0]),
        ),
      ];
      if (!kids.length) return reply(404, { message: 'Not Found' });
      return reply(
        200,
        kids.map((name) => ({ name, type: files[`${p}/${name}`] !== undefined ? 'file' : 'dir' })),
      );
    }
    if (method === 'POST' && path === '/git/refs') return reply(201, {});
    if (method === 'PATCH' || method === 'PUT') return reply(200, {});
    if (method === 'POST' && path === '/pulls') return reply(201, { html_url: `https://github.com/${REPO}/pull/10` });
    return reply(500, { message: `unexpected ${method} ${path}` });
  };
  const github: GitHub = { token: 't', repo: REPO, fetch: fake as typeof globalThis.fetch };
  return { calls, github };
}
