import { adminVenues } from '$lib/server/spotsCatalog';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = () => ({ venues: adminVenues() });
