import type { Venue } from '../core/types';
import type { KV } from '../storage';

export type History<T> = { past: T[]; present: T; future: T[] };
export type Draft = { venue: Venue; sha: string; ref: string; at: string };

export const HISTORY_LIMIT = 100;

export const start = <T>(present: T): History<T> => ({ past: [], present, future: [] });

export const push = <T>(h: History<T>, next: T): History<T> => ({
  past: [...h.past, h.present].slice(-HISTORY_LIMIT),
  present: next,
  future: [],
});

export const undo = <T>(h: History<T>): History<T> =>
  h.past.length
    ? { past: h.past.slice(0, -1), present: h.past[h.past.length - 1], future: [h.present, ...h.future] }
    : h;

export const redo = <T>(h: History<T>): History<T> =>
  h.future.length ? { past: [...h.past, h.present], present: h.future[0], future: h.future.slice(1) } : h;

export const draftKey = (id: string) => `bf:admin:${id}:draft`;

export function readDraft(kv: KV, id: string): Draft | null {
  const raw = kv.get(draftKey(id));
  if (!raw) return null;
  try {
    const d = JSON.parse(raw) as Draft;
    return d && typeof d.sha === 'string' && typeof d.ref === 'string' && Array.isArray(d.venue?.landmarks) ? d : null;
  } catch {
    return null;
  }
}

export const writeDraft = (kv: KV, id: string, d: Draft) => kv.set(draftKey(id), JSON.stringify(d));
export const clearDraft = (kv: KV, id: string) => kv.set(draftKey(id), '');
export const isStale = (d: Draft, sha: string) => d.sha !== sha;
