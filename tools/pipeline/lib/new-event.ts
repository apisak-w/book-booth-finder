import { existsSync } from 'node:fs';
import { EventSchema, formatIssues } from '../../../src/lib/server/schema';
import { listVenueIds } from '../../../src/lib/server/catalog';
import type { EventFile } from '../../../src/lib/core/types';

export type NewEventOptions = {
  id: string;
  plan?: string;
  nameTh?: string;
  nameEn?: string;
  start?: string;
  end?: string;
  venue: string;
};

export function validateNewEvent(o: NewEventOptions, root = process.cwd()): { event?: EventFile; problems: string[] } {
  const flags: Record<string, string | undefined> = {
    plan: o.plan,
    'name-th': o.nameTh,
    'name-en': o.nameEn,
    start: o.start,
    end: o.end,
  };
  const problems = Object.entries(flags)
    .filter(([, v]) => !v)
    .map(([k]) => `--${k} is required`);
  if (o.plan && !existsSync(o.plan)) problems.push(`plan file ${o.plan} does not exist`);
  if (!listVenueIds(root).includes(o.venue)) problems.push(`venue "${o.venue}" has no venues/${o.venue}/venue.json`);
  if (existsSync(`${root}/events/${o.id}/event.json`))
    problems.push(`events/${o.id} already exists. Pick a new id or run event:detect ${o.id}`);
  const parsed = EventSchema.safeParse({
    id: o.id,
    name: { th: o.nameTh ?? '-', en: o.nameEn ?? '-' },
    dates: { start: o.start ?? '0000-00-00', end: o.end ?? '9999-99-99' },
    venue: o.venue,
    categories: {},
    zones: {},
    foyerZones: [],
    obstacles: [],
    landmarks: [],
    quickPicks: [],
  });
  if (!parsed.success) problems.push(formatIssues(parsed.error));
  return problems.length ? { problems } : { event: parsed.data, problems };
}
