export type Status = 'live' | 'upcoming' | 'past';
export const LEGACY_EVENT = 'bkkibf-2026';

export function todayIn(timezone: string, now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export function eventStatus(dates: { start: string; end: string }, timezone: string, now = new Date()): Status {
  const today = todayIn(timezone, now);
  return today < dates.start ? 'upcoming' : today > dates.end ? 'past' : 'live';
}

const RANK: Record<Status, number> = { live: 0, upcoming: 1, past: 2 };

export function sortEvents<T extends { dates: { start: string; end: string }; timezone: string }>(
  list: T[],
  now = new Date(),
): T[] {
  return list
    .map((e) => ({ e, st: eventStatus(e.dates, e.timezone, now) }))
    .sort(
      (a, b) =>
        RANK[a.st] - RANK[b.st] ||
        (a.st === 'past' ? b.e.dates.end.localeCompare(a.e.dates.end) : a.e.dates.start.localeCompare(b.e.dates.start)),
    )
    .map(({ e }) => e);
}
