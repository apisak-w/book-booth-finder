import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { z } from 'zod';
import { BoothsFileSchema, EventSchema, VenueSchema, formatIssues } from './schema';
import { parseCSV } from '../core/csv';
import { loadData } from '../core/prepare';
import { checkEvent } from './checks';
import type { BoothsFile, EventFile, ExhibitorRow, I18n, Venue } from '../core/types';

export type EventBundle = { venue: Venue; event: EventFile; booths: BoothsFile; exhibitors: ExhibitorRow[] };
export type EventSummary = {
  id: string;
  name: I18n;
  subtitle?: I18n;
  dates: { start: string; end: string };
  venueName: I18n;
  timezone: string;
};

export class CatalogError extends Error {}

const cwd = () => process.cwd();

function parseFile<T>(schema: z.ZodType<T, unknown>, path: string, root: string): T {
  const rel = relative(root, path);
  if (!existsSync(path)) throw new CatalogError(`${rel}: file is missing`);
  let json: unknown;
  try {
    json = JSON.parse(readFileSync(path, 'utf8'));
  } catch (e) {
    throw new CatalogError(`${rel}: not valid JSON (${(e as Error).message})`);
  }
  const r = schema.safeParse(json);
  if (!r.success) throw new CatalogError(`${rel}: ${formatIssues(r.error)}`);
  return r.data;
}

const dirsWith = (dir: string, file: string) =>
  existsSync(dir)
    ? readdirSync(dir, { withFileTypes: true })
        .filter((d) => d.isDirectory() && existsSync(join(dir, d.name, file)))
        .map((d) => d.name)
        .sort()
    : [];

export const listVenueIds = (root = cwd()) => dirsWith(join(root, 'venues'), 'venue.json');
export const listEventIds = (root = cwd()) => dirsWith(join(root, 'events'), 'event.json');

export function loadVenue(id: string, root = cwd()): Venue {
  const venue = parseFile(VenueSchema, join(root, 'venues', id, 'venue.json'), root);
  if (venue.id !== id) throw new CatalogError(`venues/${id}/venue.json: id "${venue.id}" must equal the folder name`);
  return venue;
}

export function loadEvent(id: string, root = cwd()): EventBundle {
  const dir = join(root, 'events', id);
  const event = parseFile(EventSchema, join(dir, 'event.json'), root);
  if (event.id !== id) throw new CatalogError(`events/${id}/event.json: id "${event.id}" must equal the folder name`);
  if (!listVenueIds(root).includes(event.venue))
    throw new CatalogError(`events/${id}/event.json: venue "${event.venue}" has no venues/${event.venue}/venue.json`);
  const venue = loadVenue(event.venue, root);
  const booths = parseFile(BoothsFileSchema, join(dir, 'booths.json'), root);
  const csvPath = join(dir, 'exhibitors.csv');
  const exhibitors = existsSync(csvPath) ? parseCSV(readFileSync(csvPath, 'utf8')) : [];
  return { venue, event, booths, exhibitors };
}

export function loadCheckedEvent(id: string, root = cwd()): EventBundle {
  const bundle = loadEvent(id, root);
  const problems = checkEvent(loadData(bundle));
  if (problems.length) throw new CatalogError(`events/${id}: ${problems.join('; ')}`);
  return bundle;
}

export function eventSummaries(root = cwd()): EventSummary[] {
  return listEventIds(root).map((id) => {
    const { event, venue } = loadEvent(id, root);
    return {
      id,
      name: event.name,
      subtitle: event.subtitle,
      dates: event.dates,
      venueName: venue.name,
      timezone: venue.timezone,
    };
  });
}
