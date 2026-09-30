import { z } from 'zod';
import { EventSchema } from '../../../src/lib/server/schema';
import type { EventFile, Point, Rect } from '../../../src/lib/core/types';

const num = z.number().finite();
const rect = z.object({ x: num, y: num, w: num.positive(), h: num.positive() });
const rgb = z.tuple([z.number().int(), z.number().int(), z.number().int()]);

export const CorrectionsSchema = z.object({
  cells: z.array(
    z.object({
      at: z.tuple([num, num]),
      code: z.string().optional(),
      pillar: z.literal(true).optional(),
      drop: z.literal(true).optional(),
      rect: rect.optional(),
      extra: z.array(rect).optional(),
    }),
  ),
  add: z.array(z.object({ code: z.string(), rect, extra: z.array(rect).optional(), cat: z.string().optional() })),
  categoryColours: z.record(z.string(), rgb),
  event: z.record(z.string(), z.unknown()).optional(),
});

export type Corrections = {
  cells: { at: Point; code?: string; pillar?: true; drop?: true; rect?: Rect; extra?: Rect[] }[];
  add: { code: string; rect: Rect; extra?: Rect[]; cat?: string }[];
  categoryColours: Record<string, [number, number, number]>;
  event?: Partial<Pick<EventFile, 'categories' | 'zones' | 'foyerZones' | 'obstacles' | 'landmarks' | 'quickPicks'>>;
};

export const EMPTY_CORRECTIONS: Corrections = { cells: [], add: [], categoryColours: {} };

export const parseCorrections = (json: unknown): Corrections => CorrectionsSchema.parse(json) as Corrections;

export const mergeEvent = (event: EventFile, patch: Corrections['event']): EventFile =>
  EventSchema.parse({ ...event, ...patch });
