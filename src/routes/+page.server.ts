import { eventSummaries } from '$lib/server/catalog';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => ({ events: await eventSummaries() });
