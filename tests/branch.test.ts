import { test, expect } from 'bun:test';
import { readdirSync } from 'node:fs';
import { isBranchName } from '../tools/branch';
import { adminBranch } from '../src/lib/api/venues';

test('accepts trunk, purpose, ai and repo branches', () => {
  for (const name of [
    'main',
    'master',
    'develop',
    'v2',
    'feature/add-login-page',
    'feat/street-tiles',
    'fix/bkkibf-2026-exhibitors',
    'hotfix/security-patch',
    'release/v1.2.0',
    'chore/upgrade-node-v20.11',
    'claude/code-improvement-ae2e5a',
    'ai/refactor-auth-flow',
    'admin/qsncc-lg-5-8',
  ])
    expect(isBranchName(name), name).toBe(true);
});

test('rejects names outside the convention', () => {
  for (const name of [
    'Feature/Add-Login',
    'feature/new--login',
    'feature/-new-login',
    'feature/new-login-',
    'release/v1.-2.0',
    'fix/header bug',
    'fix/header_bug',
    'unknown/some-task',
    'docs/readme',
    'feat/',
    'feat/a/b',
    'v3',
  ])
    expect(isBranchName(name), name).toBe(false);
});

test('admin branches for every venue follow the convention', () => {
  const ids = readdirSync('venues', { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
  expect(ids.length).toBeGreaterThan(0);
  for (const id of ids) expect(isBranchName(adminBranch(id)), id).toBe(true);
});
