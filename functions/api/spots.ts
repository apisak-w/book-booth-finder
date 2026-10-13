import type { Env } from '../../src/lib/api/db';
import { handleSpot } from '../../src/lib/api/spots';

export const onRequest = ({ request, env }: { request: Request; env: Env }) => handleSpot(request, env);
