import { json } from '@sveltejs/kit';
import { buildSpotsConfig } from '$lib/server/spotsCatalog';
import type { RequestHandler } from './$types';

export const prerender = true;

export const GET: RequestHandler = () => json(buildSpotsConfig());
