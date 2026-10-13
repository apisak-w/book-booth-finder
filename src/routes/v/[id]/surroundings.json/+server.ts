import { error, json } from '@sveltejs/kit';
import { existsSync } from 'node:fs';
import { listVenueIds, loadSurroundings, surroundingsPath } from '$lib/server/catalog';
import type { EntryGenerator, RequestHandler } from './$types';

export const prerender = true;

export const entries: EntryGenerator = () =>
  listVenueIds()
    .filter((id) => existsSync(surroundingsPath(id)))
    .map((id) => ({ id }));

export const GET: RequestHandler = ({ params }) => {
  const s = listVenueIds().includes(params.id) ? loadSurroundings(params.id) : null;
  if (!s) error(404, 'No street drawing for this venue');
  return json(s);
};
