import { georef, planToLatLng } from '../core/geo';
import type { SpotsConfig } from '../core/spots';
import type { AdminVenue } from '../admin/types';
import type { EventFile, Landmark, Venue } from '../core/types';
import { listEventIds, loadEvent } from './catalog';

export type CatalogItem = { id: string; event: EventFile; venue: Venue };

const round6 = (v: number) => Math.round(v * 1e6) / 1e6;

export const catalogItems = (root = process.cwd()): CatalogItem[] =>
  listEventIds(root).map((id) => ({ id, ...loadEvent(id, root) }));

export function spotsConfigFrom(items: CatalogItem[]): SpotsConfig {
  const cfg: SpotsConfig = { events: {}, venues: {} };
  for (const { id, event, venue } of items) {
    if (!venue.geo) continue;
    if (!cfg.venues[venue.id]) {
      const pts = venue.walls.flat(),
        xs = pts.map((p) => p[0]),
        ys = pts.map((p) => p[1]);
      const c = planToLatLng(georef(venue.geo.pins), [
        (Math.min(...xs) + Math.max(...xs)) / 2,
        (Math.min(...ys) + Math.max(...ys)) / 2,
      ]);
      cfg.venues[venue.id] = { lat: round6(c.lat), lng: round6(c.lng) };
    }
    cfg.events[id] = {
      venue: venue.id,
      start: event.dates.start,
      end: event.dates.end,
      tz: venue.timezone,
      doors: venue.geo.entrances,
      halls: venue.areas.map((a) => a.id),
    };
  }
  return cfg;
}

export const buildSpotsConfig = (root = process.cwd()) => spotsConfigFrom(catalogItems(root));

export function adminVenuesFrom(items: CatalogItem[]): AdminVenue[] {
  const byVenue = new Map<string, AdminVenue>();
  for (const { id, event, venue } of items) {
    if (!venue.geo) continue;
    let v = byVenue.get(venue.id);
    if (!v) {
      const entrances = venue.geo.entrances
        .map((e) => venue.landmarks.find((l) => l.id === e))
        .filter((l): l is Landmark => !!l);
      v = {
        id: venue.id,
        name: venue.name,
        timezone: venue.timezone,
        metersPerPx: venue.metersPerPx,
        walls: venue.walls,
        areas: venue.areas,
        pins: venue.geo.pins,
        entrances,
        events: [],
      };
      byVenue.set(venue.id, v);
    }
    v.events.push({ id, name: event.name, start: event.dates.start, end: event.dates.end });
  }
  return [...byVenue.values()];
}

export const adminVenues = (root = process.cwd()) => adminVenuesFrom(catalogItems(root));
