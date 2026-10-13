import { formatVenueJson } from '../../src/lib/core/jsonFormat';
import type { Venue } from '../../src/lib/core/types';
import { loadVenue } from '../../src/lib/server/catalog';
import { fakePins } from './fake-geo';

export function pinnedVenue(): { venue: Venue; text: string } {
  const venue: Venue = {
    ...loadVenue('qsncc-lg-5-8'),
    geo: { pins: fakePins(), entrances: ['mrt', 'door5', 'door6', 'door7', 'door8'] },
  };
  return { venue, text: formatVenueJson(venue) };
}

export function bareVenue(id = 'qsncc-lg-5-8'): Venue {
  const venue = { ...loadVenue(id) };
  delete venue.geo;
  return venue;
}
