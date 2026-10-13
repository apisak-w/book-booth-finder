import { startAuthentication, startRegistration } from '@simplewebauthn/browser';
import type { Filters, StoredSpot } from '$lib/core/spotReview';
import type { I18n, Venue } from '$lib/core/types';
import type { EventRef } from '$lib/core/venueChecks';
import type { Decision } from './places';

export type Me = {
  signedIn: boolean;
  hasPasskeys: boolean;
  passkeys: { name: string; created: string; lastUsed: string | null }[];
};
type CreateOptions = Parameters<typeof startRegistration>[0]['optionsJSON'];
type GetOptions = Parameters<typeof startAuthentication>[0]['optionsJSON'];

async function call<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  const init: RequestInit =
    body === undefined
      ? { method }
      : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) };
  const r = await fetch(`/api/admin/${path}`, init);
  const data = (await r.json().catch(() => ({}))) as { error?: string };
  if (!r.ok) throw new Error(data.error ?? `The server said ${r.status}. Try again`);
  return data as T;
}

export const getMe = () => call<Me>('GET', 'me');

export async function setUp(code: string, name: string) {
  const optionsJSON = await call<CreateOptions>('POST', 'setup/options', { code });
  const response = await startRegistration({ optionsJSON });
  await call('POST', 'setup/verify', { code, name, response });
}

export async function signIn() {
  const optionsJSON = await call<GetOptions>('POST', 'signin/options', {});
  await call('POST', 'signin/verify', { response: await startAuthentication({ optionsJSON }) });
}

export const signOut = () => call('POST', 'signout', {});
export const getSpots = (venue: string) =>
  call<{ spots: StoredSpot[]; decisions: Decision[] }>('GET', `spots?venue=${encodeURIComponent(venue)}`);
export const decide = (venue: string, place: string, action: 'keep' | 'move', filters: Filters) =>
  call<{ ok?: true; pr?: string }>('POST', 'decisions', { venue, place, action, filters });

export type VenueSummary = { id: string; name: I18n; landmarks: number; pins: number; pr: string | null };
export type VenueDoc = { venue: Venue; sha: string; ref: string; pr: string | null; events: EventRef[] };

export const getVenues = () => call<{ venues: VenueSummary[] }>('GET', 'venues');
export const getVenue = (id: string) => call<VenueDoc>('GET', `venue?id=${encodeURIComponent(id)}`);
export const referenceUrl = (id: string) => `/api/admin/venue/reference?id=${encodeURIComponent(id)}`;
export const saveVenue = (id: string, venue: Venue, sha: string) =>
  call<{ pr: string }>('POST', 'venue/save', { id, venue, sha });
