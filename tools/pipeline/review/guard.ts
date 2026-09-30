const LOCAL = new Set(['localhost', '127.0.0.1', '[::1]']);
const hostOf = (h: string) => (h.startsWith('[') ? h.slice(0, h.indexOf(']') + 1) : h.split(':')[0]);

export function rejectRequest(r: {
  method: string;
  host?: string;
  origin?: string;
  contentType?: string;
}): [number, string] | null {
  if (!LOCAL.has(hostOf(r.host ?? ''))) return [403, 'The review tool only answers requests from this computer'];
  if (r.method !== 'POST') return null;
  if (r.origin) {
    let origin = '';
    try {
      origin = new URL(r.origin).host;
    } catch {
      return [403, 'Bad origin'];
    }
    if (!LOCAL.has(hostOf(origin))) return [403, 'Saving is only allowed from the review page'];
  }
  if (!(r.contentType ?? '').toLowerCase().startsWith('application/json')) return [415, 'Send JSON'];
  return null;
}

export function validTransform(t: Record<string, unknown>): boolean {
  const n = (k: string) => typeof t[k] === 'number' && Number.isFinite(t[k]);
  return ['sx', 'sy', 'dx', 'dy'].every(n) && (t.sx as number) > 0 && (t.sy as number) > 0;
}
