import { canonical, formatVenueJson } from '../core/jsonFormat';
import type { EventFile, I18n, Venue } from '../core/types';
import { venueEditProblems, type EventRef } from '../core/venueChecks';
import { diffVenue } from '../core/venueEdit';
import { formatIssues, VenueSchema } from '../server/schema';
import { Refused } from './errors';
import { listDir, openPr, proposeChange, readFile, readRaw, type GitHub } from './github';

export type VenueSummary = { id: string; name: I18n; landmarks: number; pins: number; pr: string | null };

export const VENUE_ID = /^[a-z0-9][a-z0-9-]*$/;
export const adminBranch = (id: string) => `admin/${id}`;

async function refFor(g: GitHub, id: string) {
  const pr = await openPr(g, adminBranch(id));
  return { ref: pr ? adminBranch(id) : 'main', pr: pr?.url ?? null };
}

export async function listVenues(g: GitHub): Promise<VenueSummary[]> {
  const out: VenueSummary[] = [];
  for (const d of await listDir(g, 'venues', 'main')) {
    if (d.type !== 'dir' || !VENUE_ID.test(d.name)) continue;
    const f = await readFile(g, `venues/${d.name}/venue.json`, 'main');
    if (!f) continue;
    const v = JSON.parse(f.text) as Venue;
    out.push({
      id: d.name,
      name: v.name,
      landmarks: v.landmarks.length,
      pins: v.geo?.pins.length ?? 0,
      pr: (await openPr(g, adminBranch(d.name)))?.url ?? null,
    });
  }
  return out;
}

export async function eventRefs(g: GitHub, venueId: string, ref: string): Promise<EventRef[]> {
  const out: EventRef[] = [];
  for (const d of await listDir(g, 'events', ref)) {
    if (d.type !== 'dir') continue;
    const f = await readFile(g, `events/${d.name}/event.json`, ref);
    if (!f) continue;
    const e = JSON.parse(f.text) as EventFile;
    if (e.venue !== venueId) continue;
    out.push({
      id: e.id,
      name: e.name,
      refs: e.quickPicks.filter((q) => q[0] === 'place').map((q) => q[1]),
      ids: e.landmarks.map((l) => l.id),
    });
  }
  return out;
}

export async function readVenue(g: GitHub, id: string) {
  const { ref, pr } = await refFor(g, id);
  const f = await readFile(g, `venues/${id}/venue.json`, ref);
  if (!f) return null;
  return { venue: JSON.parse(f.text) as Venue, sha: f.sha, ref, pr, events: await eventRefs(g, id, ref) };
}

export async function venueReference(g: GitHub, id: string) {
  const { ref } = await refFor(g, id);
  return readRaw(g, `venues/${id}/reference.jpg`, ref);
}

export async function saveVenue(g: GitHub, id: string, body: Record<string, unknown>): Promise<string> {
  const parsed = VenueSchema.safeParse(body.venue);
  if (!parsed.success) throw new Refused(formatIssues(parsed.error));
  if (canonical(parsed.data) !== canonical(body.venue))
    throw new Refused("The venue has fields the admin doesn't know. Reload, then try again");
  if (typeof body.sha !== 'string') throw new Refused('Reload the venue, then save again');
  const next = body.venue as Venue;
  const { ref } = await refFor(g, id);
  const events = await eventRefs(g, id, ref);
  return proposeChange(g, {
    path: `venues/${id}/venue.json`,
    branch: adminBranch(id),
    expectSha: body.sha,
    title: `fix(venue): update ${id} from the admin`,
    body: 'Changes from the admin. Check the Cloudflare preview before merging.',
    edit: (text) => {
      const base = JSON.parse(text) as Venue;
      const problems = venueEditProblems(base, next, events);
      if (problems.length) throw new Refused(problems.join('; '));
      const changes = diffVenue(base, next);
      if (!changes.length) throw new Refused('Nothing changed');
      return {
        text: formatVenueJson(next),
        message: `fix(venue): edit ${id} from the admin\n\n${changes.map((c) => `- ${c}`).join('\n')}`,
      };
    },
  });
}
