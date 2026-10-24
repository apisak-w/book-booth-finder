import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import sharp from 'sharp';
import type { z } from 'zod';
import { BoothsFileSchema, EventSchema, SurroundingsSchema, VenueSchema, formatIssues } from './schema';
import { parseCSV } from '../core/csv';
import { loadData } from '../core/prepare';
import { checkEvent } from './checks';
import type { EventBundle, EventSummary, PosterInfo, Surroundings, Venue } from '../core/types';

export type { EventBundle, EventSummary } from '../core/types';

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

export const surroundingsPath = (id: string, root = cwd()) => join(root, 'venues', id, 'surroundings.json');

export function loadSurroundings(id: string, root = cwd()): Surroundings | null {
  const path = surroundingsPath(id, root);
  return existsSync(path) ? parseFile(SurroundingsSchema, path, root) : null;
}

const MAX_POSTER_BYTES = 102_400;
const MAX_POSTER_WIDTH = 1100;

export function loadEvent(id: string, root = cwd()): EventBundle {
  const dir = join(root, 'events', id);
  const event = parseFile(EventSchema, join(dir, 'event.json'), root);
  if (event.id !== id) throw new CatalogError(`events/${id}/event.json: id "${event.id}" must equal the folder name`);
  if (!listVenueIds(root).includes(event.venue))
    throw new CatalogError(`events/${id}/event.json: venue "${event.venue}" has no venues/${event.venue}/venue.json`);
  if (event.poster) {
    const rel = `events/${id}/${event.poster}`;
    if (!existsSync(join(dir, event.poster))) throw new CatalogError(`${rel}: file is missing`);
    if (statSync(join(dir, event.poster)).size > MAX_POSTER_BYTES) throw new CatalogError(`${rel}: larger than 100 KB`);
  }
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

export function eventSummaries(root = cwd()): Promise<EventSummary[]> {
  return Promise.all(
    listEventIds(root).map(async (id) => {
      const { event, venue } = loadEvent(id, root);
      return {
        id,
        name: event.name,
        subtitle: event.subtitle,
        dates: event.dates,
        venueName: venue.name,
        timezone: venue.timezone,
        poster: event.poster ? await posterInfo(id, event.poster, root) : undefined,
        hours: event.hours,
      };
    }),
  );
}

async function posterInfo(id: string, file: string, root: string): Promise<PosterInfo> {
  const { width = 0, height = 0 } = await sharp(join(root, 'events', id, file)).metadata();
  if (width > MAX_POSTER_WIDTH) throw new CatalogError(`events/${id}/${file}: wider than 1100 px (${width} px)`);
  return { file, width, height };
}
