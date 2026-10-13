import { test, expect } from 'bun:test';
import {
  fromBase64,
  GitHubConflict,
  listDir,
  openPr,
  proposeChange,
  readFile,
  readRaw,
  toBase64,
  type Change,
} from '../src/lib/api/github';
import { fakeGitHub, fakeRepo } from './helpers/fake-github';

const text = '{\n  "name": { "th": "ฮอลล์ 5", "en": "Hall 5" }\n}\n';
const change = (
  edit: Change['edit'] = (t) => ({ text: t.replace('Hall 5', 'Hall 5 east'), message: 'fix(venue): test' }),
): Change => ({
  path: 'venues/v/venue.json',
  branch: 'spots/v',
  title: 'fix(venue): line up v map pins from guest spots',
  body: 'Check the preview.',
  edit,
});
const writes = (calls: { method: string; path: string }[]) =>
  calls.filter((c) => c.method !== 'GET').map((c) => `${c.method} ${c.path}`);

test('base64 keeps Thai text intact', () => {
  expect(fromBase64(toBase64('ฮอลล์ 5 · ประตู'))).toBe('ฮอลล์ 5 · ประตู');
  expect(fromBase64(toBase64(text).replace(/(.{10})/g, '$1\n'))).toBe(text);
});

test('first move: reads main, makes the branch, commits and opens a pull request', async () => {
  const gh = fakeGitHub(text);
  expect(await proposeChange(gh.github, change())).toBe('https://github.com/apisak-w/book-booth-finder/pull/8');
  expect(writes(gh.calls)).toEqual(['POST /git/refs', 'PUT /contents/venues/v/venue.json', 'POST /pulls']);
  expect(gh.calls.find((c) => c.method === 'GET' && c.path.startsWith('/contents/'))!.path).toBe(
    '/contents/venues/v/venue.json?ref=main-sha',
  );
  const [ref, put, pr] = gh.calls.filter((c) => c.method !== 'GET');
  expect(ref.body).toEqual({ ref: 'refs/heads/spots/v', sha: 'main-sha' });
  expect(fromBase64(put.body!.content as string)).toBe(text.replace('Hall 5', 'Hall 5 east'));
  expect(put.body).toMatchObject({ message: 'fix(venue): test', sha: 'file-sha', branch: 'spots/v' });
  expect(pr.body).toEqual({
    title: 'fix(venue): line up v map pins from guest spots',
    head: 'spots/v',
    base: 'main',
    body: 'Check the preview.',
  });
});

test('a pull request already open: adds one commit to it', async () => {
  const gh = fakeGitHub(text, { openPr: true, branch: true });
  expect(await proposeChange(gh.github, change())).toBe('https://github.com/apisak-w/book-booth-finder/pull/7');
  expect(writes(gh.calls)).toEqual(['PUT /contents/venues/v/venue.json']);
  expect(gh.calls.find((c) => c.method === 'GET' && c.path.startsWith('/contents/'))!.path).toBe(
    '/contents/venues/v/venue.json?ref=spots%2Fv',
  );
});

test('a branch left from a merged pull request is reset to main first', async () => {
  const gh = fakeGitHub(text, { branch: true, mergedHead: 'old-sha' });
  await proposeChange(gh.github, change());
  expect(writes(gh.calls)).toEqual([
    'PATCH /git/refs/heads/spots/v',
    'PUT /contents/venues/v/venue.json',
    'POST /pulls',
  ]);
  expect(gh.calls.find((c) => c.method === 'PATCH')!.body).toEqual({ sha: 'main-sha', force: true });
});

test('a refused edit writes nothing, and GitHub errors are named', async () => {
  const gh = fakeGitHub(text);
  await expect(
    proposeChange(
      gh.github,
      change(() => {
        throw new Error('fit error is 9.0 m');
      }),
    ),
  ).rejects.toThrow('fit error is 9.0 m');
  expect(writes(gh.calls)).toEqual([]);
  const bad = fakeGitHub(text, { fail: '/contents' });
  await expect(proposeChange(bad.github, change())).rejects.toThrow(
    'GitHub refused GET /contents/venues/v/venue.json: 422 Validation Failed',
  );
});

test('readFile, readRaw, listDir and openPr read the repo', async () => {
  const repo = fakeRepo(
    {
      'venues/v/venue.json': '{"id":"v"}\n',
      'venues/v/reference.jpg': new Uint8Array([1, 2, 3]),
      'venues/w/venue.json': '{}',
    },
    { openPr: ['admin/v'] },
  );
  expect(await readFile(repo.github, 'venues/v/venue.json', 'main')).toEqual({
    text: '{"id":"v"}\n',
    sha: 'sha-venues/v/venue.json',
  });
  expect(await readFile(repo.github, 'venues/x/venue.json', 'main')).toBeNull();
  expect([...new Uint8Array((await readRaw(repo.github, 'venues/v/reference.jpg', 'main'))!)]).toEqual([1, 2, 3]);
  expect(await listDir(repo.github, 'venues', 'main')).toEqual([
    { name: 'v', type: 'dir' },
    { name: 'w', type: 'dir' },
  ]);
  expect(await listDir(repo.github, 'nothing', 'main')).toEqual([]);
  expect(await openPr(repo.github, 'admin/v')).toEqual({ url: 'https://github.com/apisak-w/book-booth-finder/pull/9' });
  expect(await openPr(repo.github, 'admin/w')).toBeNull();
});

test('a stale expected sha is refused before anything is written', async () => {
  const gh = fakeGitHub(text);
  await expect(proposeChange(gh.github, { ...change(), expectSha: 'older' })).rejects.toBeInstanceOf(GitHubConflict);
  expect(writes(gh.calls)).toEqual([]);
  const ok = fakeGitHub(text);
  await proposeChange(ok.github, { ...change(), expectSha: 'file-sha' });
  expect(writes(ok.calls)).toContain('PUT /contents/venues/v/venue.json');
});

test('with no PR open, the file is read at the main commit the branch is cut from', async () => {
  const gh = fakeGitHub(text);
  await proposeChange(gh.github, change());
  expect(gh.calls.find((c) => c.method === 'GET' && c.path.startsWith('/contents/'))!.path).toBe(
    '/contents/venues/v/venue.json?ref=main-sha',
  );
});

test('a branch with unmerged work and no PR is built on, not reset', async () => {
  const gh = fakeGitHub(text, { branch: true });
  expect(await proposeChange(gh.github, change())).toBe('https://github.com/apisak-w/book-booth-finder/pull/8');
  expect(writes(gh.calls)).toEqual(['PUT /contents/venues/v/venue.json', 'POST /pulls']);
  expect(gh.calls.find((c) => c.method === 'GET' && c.path.startsWith('/contents/'))!.path).toBe(
    '/contents/venues/v/venue.json?ref=spots%2Fv',
  );
});

test('when another save opened the PR first, its link is returned', async () => {
  const gh = fakeGitHub(text, { prRace: true });
  expect(await proposeChange(gh.github, change())).toBe('https://github.com/apisak-w/book-booth-finder/pull/7');
});
