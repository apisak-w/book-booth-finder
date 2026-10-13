export type GitHub = { token: string; repo: string; fetch?: typeof fetch };
export type Change = {
  path: string;
  branch: string;
  title: string;
  body: string;
  edit: (text: string) => { text: string; message: string };
  expectSha?: string;
};

export class GitHubError extends Error {}
export class GitHubConflict extends Error {}

export function toBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let s = '';
  for (let k = 0; k < bytes.length; k += 0x8000) s += String.fromCharCode(...bytes.subarray(k, k + 0x8000));
  return btoa(s);
}

export function fromBase64(b64: string): string {
  const bin = atob(b64.replace(/\s/g, ''));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

async function call<T>(g: GitHub, method: string, path: string, body?: unknown, allow404 = false): Promise<T | null> {
  const r = await (g.fetch ?? fetch)(`https://api.github.com/repos/${g.repo}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${g.token}`,
      accept: 'application/vnd.github+json',
      'x-github-api-version': '2022-11-28',
      'user-agent': 'booth-finder-admin',
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (allow404 && r.status === 404) return null;
  const data = (await r.json().catch(() => ({}))) as { message?: string };
  if (!r.ok)
    throw new GitHubError(`GitHub refused ${method} ${path.split('?')[0]}: ${r.status} ${data.message ?? ''}`.trim());
  return data as T;
}

const enc = (path: string) => path.split('/').map(encodeURIComponent).join('/');

export async function openPr(g: GitHub, branch: string): Promise<{ url: string } | null> {
  const owner = g.repo.split('/')[0];
  const open = (await call<{ html_url: string }[]>(
    g,
    'GET',
    `/pulls?state=open&head=${encodeURIComponent(`${owner}:${branch}`)}`,
  ))!;
  return open.length ? { url: open[0].html_url } : null;
}

export async function readFile(g: GitHub, path: string, ref: string): Promise<{ text: string; sha: string } | null> {
  const f = await call<{ content: string; sha: string }>(
    g,
    'GET',
    `/contents/${enc(path)}?ref=${encodeURIComponent(ref)}`,
    undefined,
    true,
  );
  return f ? { text: fromBase64(f.content), sha: f.sha } : null;
}

export async function readRaw(g: GitHub, path: string, ref: string): Promise<ArrayBuffer | null> {
  const r = await (g.fetch ?? fetch)(
    `https://api.github.com/repos/${g.repo}/contents/${enc(path)}?ref=${encodeURIComponent(ref)}`,
    {
      headers: {
        authorization: `Bearer ${g.token}`,
        accept: 'application/vnd.github.raw',
        'x-github-api-version': '2022-11-28',
        'user-agent': 'booth-finder-admin',
      },
    },
  );
  if (r.status === 404) return null;
  if (!r.ok) throw new GitHubError(`GitHub refused GET /contents/${path}: ${r.status}`);
  return r.arrayBuffer();
}

export async function listDir(g: GitHub, path: string, ref: string): Promise<{ name: string; type: string }[]> {
  const items = await call<{ name: string; type: string }[]>(
    g,
    'GET',
    `/contents/${enc(path)}?ref=${encodeURIComponent(ref)}`,
    undefined,
    true,
  );
  return (items ?? []).map((i) => ({ name: i.name, type: i.type }));
}

export async function proposeChange(g: GitHub, c: Change): Promise<string> {
  const main = (await call<{ object: { sha: string } }>(g, 'GET', '/git/ref/heads/main'))!;
  const pr = await openPr(g, c.branch);
  const ref = pr ? c.branch : 'main';
  const file = (await call<{ content: string; sha: string }>(
    g,
    'GET',
    `/contents/${c.path}?ref=${encodeURIComponent(ref)}`,
  ))!;
  if (c.expectSha && file.sha !== c.expectSha)
    throw new GitHubConflict('This venue changed since you opened it. Reload, then save again');
  const next = c.edit(fromBase64(file.content));
  if (!pr) {
    const branch = await call(g, 'GET', `/git/ref/heads/${c.branch}`, undefined, true);
    if (branch) await call(g, 'PATCH', `/git/refs/heads/${c.branch}`, { sha: main.object.sha, force: true });
    else await call(g, 'POST', '/git/refs', { ref: `refs/heads/${c.branch}`, sha: main.object.sha });
  }
  await call(g, 'PUT', `/contents/${c.path}`, {
    message: next.message,
    content: toBase64(next.text),
    sha: file.sha,
    branch: c.branch,
  });
  if (pr) return pr.url;
  return (await call<{ html_url: string }>(g, 'POST', '/pulls', {
    title: c.title,
    head: c.branch,
    base: 'main',
    body: c.body,
  }))!.html_url;
}
