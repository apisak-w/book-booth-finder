import { handleAdmin } from '../../../src/lib/api/admin';
import type { Env } from '../../../src/lib/api/db';
import { webauthn } from '../../../src/lib/api/webauthn';

export const onRequest = ({ request, env }: { request: Request; env: Env }) =>
  handleAdmin(request, env, {
    ceremonies: webauthn,
    github: (e) => (e.GITHUB_TOKEN && e.GITHUB_REPO ? { token: e.GITHUB_TOKEN, repo: e.GITHUB_REPO } : null),
    now: () => new Date(),
  });
