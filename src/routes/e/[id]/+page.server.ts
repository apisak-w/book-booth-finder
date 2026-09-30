import { error } from '@sveltejs/kit';
import { listEventIds, loadEvent } from '$lib/server/catalog';
import type { EntryGenerator, PageServerLoad } from './$types';

export const entries: EntryGenerator = () => listEventIds().map((id) => ({ id }));

export const load: PageServerLoad = ({ params }) => {
  if (!listEventIds().includes(params.id)) error(404, 'Event not found');
  return { bundle: loadEvent(params.id) };
};
