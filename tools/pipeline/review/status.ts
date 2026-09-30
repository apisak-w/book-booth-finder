import type { Point, Rect } from '../../../src/lib/core/types';
import type { Corrections } from '../lib/corrections';
import { ownerIndex, type Read } from '../lib/build';

export type CellStatus = 'code' | 'read' | 'flagged' | 'missing' | 'pillar' | 'drop';

const owns = (pt: Point, rect: Rect, all: Rect[]) => {
  const k = ownerIndex(pt, all);
  return k >= 0 && all[k] === rect;
};

export function cellStatus(
  rect: Rect,
  reads: Read[],
  c: Corrections,
  all: Rect[] = [rect],
): { status: CellStatus; code?: string; fix: number; read?: Read } {
  const fix = c.cells.findIndex((f) => owns(f.at, rect, all));
  const f = fix >= 0 ? c.cells[fix] : undefined;
  const read = reads.find((r) => owns(r.at, rect, all));
  if (f?.drop) return { status: 'drop', fix, read };
  if (f?.pillar) return { status: 'pillar', fix, read };
  if (f?.code) return { status: 'code', code: f.code, fix, read };
  if (read?.code && !read.flags.length) return { status: 'read', code: read.code, fix, read };
  if (read?.code) return { status: 'flagged', code: read.code, fix, read };
  return { status: 'missing', fix, read };
}

export function upsertFix(
  c: Corrections,
  rect: Rect,
  patch: Partial<Corrections['cells'][number]>,
  all: Rect[] = [rect],
): Corrections {
  const k = c.cells.findIndex((f) => owns(f.at, rect, all));
  const at: Point = [rect.x + rect.w / 2, rect.y + rect.h / 2];
  const next = { ...(k >= 0 ? c.cells[k] : { at }), ...patch };
  for (const key of Object.keys(next) as (keyof typeof next)[]) if (next[key] === undefined) delete next[key];
  const cells = k >= 0 ? c.cells.map((f, j) => (j === k ? next : f)) : [...c.cells, next];
  return { ...c, cells };
}
