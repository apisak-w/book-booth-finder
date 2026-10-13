import { test, expect } from 'bun:test';
import { metersBetween } from '../src/lib/core/geo';
import { listEventIds, loadEvent } from '../src/lib/server/catalog';
import { buildSpotsConfig, spotsConfigFrom } from '../src/lib/server/spotsCatalog';
import { LAT0, LNG0 } from './helpers/fake-geo';
import { pinnedVenue } from './helpers/pinned-venue';

const fair = { id: 'bkkibf-2026', event: loadEvent('bkkibf-2026').event, venue: pinnedVenue().venue };

test('an event at a venue with map pins is listed with its doors, halls and the venue centre', () => {
  const cfg = spotsConfigFrom([fair]);
  expect(cfg.events['bkkibf-2026']).toEqual({
    venue: 'qsncc-lg-5-8',
    start: fair.event.dates.start,
    end: fair.event.dates.end,
    tz: fair.venue.timezone,
    doors: ['mrt', 'door5', 'door6', 'door7', 'door8'],
    halls: fair.venue.areas.map((a) => a.id),
  });
  expect(metersBetween(cfg.venues['qsncc-lg-5-8'], { lat: LAT0, lng: LNG0 })).toBeLessThan(300);
});

test('venues without map pins are left out', () => {
  expect(spotsConfigFrom([{ ...fair, venue: { ...fair.venue, geo: undefined } }])).toEqual({ events: {}, venues: {} });
  const cfg = buildSpotsConfig();
  for (const id of listEventIds()) expect(!!cfg.events[id]).toBe(!!loadEvent(id).venue.geo);
});
