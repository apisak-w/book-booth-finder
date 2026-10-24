import { z } from 'zod';
import { GROUP_ORDER, ICON_NAMES, SHAPE_KINDS } from '../core/types';
import type { Venue, EventFile, BoothsFile, Surroundings } from '../core/types';

const num = z.number().finite();
const slug = z.string().regex(/^[a-z0-9][a-z0-9-]*$/);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const hex = z.string().regex(/^#[0-9A-Fa-f]{6}$/);
const i18n = z.object({ th: z.string().min(1), en: z.string().min(1) });
const rect = z.object({ x: num, y: num, w: num.positive(), h: num.positive() });
const box = z.tuple([num, num, num, num]);
const point = z.tuple([num, num]);
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

const landmark = i18n.extend({
  id: z.string().regex(/^[a-z][a-z0-9-]*$/),
  group: z.enum(GROUP_ORDER),
  x: num,
  y: num,
  icon: z.enum(ICON_NAMES),
});

export const VenueSchema: z.ZodType<Venue, unknown> = z.object({
  id: slug,
  name: i18n,
  timezone: z.string().min(1),
  reference: z.object({ width: num.positive(), height: num.positive() }),
  view: rect,
  overview: z.object({
    narrow: z.object({ box, pad: num }),
    wide: z.object({ box, pad: num }),
  }),
  metersPerPx: num.positive(),
  gridCell: z.number().int().positive().default(6),
  walls: z.array(z.array(point).min(3)).min(1),
  floor: z.array(z.object({ op: z.enum(['add', 'remove']), box })).min(1),
  areas: z.array(
    z.object({
      id: slug,
      name: i18n,
      label: z.object({ x: num, y: num, text: z.string().min(1) }),
      bounds: z.array(point).min(3),
    }),
  ),
  outside: i18n,
  doors: z.array(z.object({ id: z.string().min(1), area: slug, punch: box, gap: box })),
  depth: z
    .object({
      back: num,
      front: num,
      text: z.object({ back: i18n, mid: i18n, front: i18n }),
      aisleHint: i18n,
    })
    .optional(),
  landmarks: z.array(landmark),
  geo: z
    .object({
      pins: z
        .array(
          z.object({
            id: z.string().min(1),
            x: num,
            y: num,
            lat: num.min(-85).max(85),
            lng: num.min(-180).max(180),
          }),
        )
        .min(3),
      entrances: z.array(z.string().min(1)).min(1),
    })
    .optional(),
  origin: z.string().min(1),
});

export const EventSchema: z.ZodType<EventFile, unknown> = z
  .object({
    id: slug,
    name: i18n,
    subtitle: i18n.optional(),
    dates: z.object({ start: isoDate, end: isoDate }),
    poster: z
      .string()
      .regex(/^poster\.(jpg|webp)$/)
      .optional(),
    hours: z
      .object({ open: hhmm, close: hhmm })
      .refine((h) => h.open < h.close, { message: 'hours.open must be before hours.close' })
      .optional(),
    venue: slug,
    codePattern: z
      .string()
      .refine((p) => {
        try {
          return new RegExp(p) instanceof RegExp;
        } catch {
          return false;
        }
      }, 'not a valid regular expression')
      .default('^[A-Z]\\d{2}$'),
    categories: z.record(z.string(), i18n.extend({ color: hex, darkText: z.boolean().optional() })),
    zones: z.record(z.string(), i18n.extend({ short: z.string().optional() })),
    foyerZones: z.array(rect.extend({ c: z.string(), vertical: z.boolean().optional() })),
    obstacles: z.array(rect.extend({ kind: z.enum(['stage', 'info', 'other']), note: z.string().optional() })),
    aisles: z.object({ signY: num, boothMinY: num, x: z.record(z.string().regex(/^[A-Z]$/), num) }).optional(),
    landmarks: z.array(landmark),
    quickPicks: z.array(
      z.union([z.tuple([z.literal('booth'), z.string()]), z.tuple([z.literal('place'), z.string()])]),
    ),
    allowedDuplicateCodes: z.array(z.string()).default([]),
    notes: z.array(z.string()).default([]),
    text: z.object({ ph: i18n.optional(), searchLabel: i18n.optional(), exhibitors: i18n.optional() }).optional(),
  })
  .refine((e) => e.dates.start <= e.dates.end, { message: 'dates.end is before dates.start', path: ['dates'] });

export const BoothsFileSchema: z.ZodType<BoothsFile, unknown> = z.object({
  booths: z.array(rect.extend({ c: z.string().min(1), cat: z.string().min(1), extra: z.array(rect).optional() })),
  pillars: z.array(rect.extend({ cat: z.string().min(1), inner: rect })),
});

export const SurroundingsSchema: z.ZodType<Surroundings, unknown> = z.object({
  credit: z.string().min(1),
  bounds: box,
  shapes: z.array(
    z.object({
      kind: z.enum(SHAPE_KINDS),
      d: z.string().regex(/^(M-?\d+ -?\d+(L-?\d+ -?\d+)*Z?)+$/),
      w: num.positive().optional(),
    }),
  ),
  labels: z.array(z.object({ x: num, y: num, text: i18n, size: num.positive() })),
});

export const formatIssues = (err: z.ZodError) =>
  err.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ');
