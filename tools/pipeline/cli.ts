import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { loadEvent, loadVenue } from '../../src/lib/server/catalog';
import { EventSchema } from '../../src/lib/server/schema';
import { loadData, prepareData } from '../../src/lib/core/prepare';
import { createGrid, obstaclesOf } from '../../src/lib/core/grid';
import { findRoute } from '../../src/lib/core/routing';
import { isRouteOk } from '../../src/lib/core/types';
import { crop, loadImage, median, type RGB } from './lib/image';
import { autoRegister, type Transform } from './lib/register';
import { defaultDetectParams, detectCells, type Cell } from './lib/detect';
import { EMPTY_CORRECTIONS, parseCorrections, mergeEvent } from './lib/corrections';
import { buildBooths, computeAisles, type Read } from './lib/build';
import { eventPaths } from './lib/paths';

const readJson = <T>(path: string, fallback?: T): T =>
  existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : (fallback as T);
const writeJson = (path: string, v: unknown) => writeFileSync(path, JSON.stringify(v, null, 2) + '\n');
const fail = (lines: string[]) => {
  console.error(lines.map((l) => `- ${l}`).join('\n'));
  process.exit(1);
};

const sampler = (img: RGB) => (r: { x: number; y: number; w: number; h: number }) => {
  const c = crop(img, [Math.round(r.x + 3), Math.round(r.y + 3), Math.round(r.x + r.w - 3), Math.round(r.y + r.h - 3)]);
  const ch = (k: number) => Math.trunc(median(Array.from({ length: c.width * c.height }, (_, i) => c.data[i * 3 + k])));
  return [ch(0), ch(1), ch(2)] as [number, number, number];
};

export async function detect(id: string) {
  const p = eventPaths(id);
  const { event } = loadEvent(id);
  const venue = loadVenue(event.venue);
  const img = await loadImage(p.plan);
  const t: Transform = readJson(p.registration) ?? autoRegister(img, venue);
  writeJson(p.registration, t);
  if (t.score < 0.9)
    console.warn(`Registration score ${t.score.toFixed(2)} is low. Fix it in the review tool (register mode).`);
  const params = readJson(p.detect) ?? defaultDetectParams(img, venue, t);
  writeJson(p.detect, params);
  const cells = detectCells(img, params);
  writeJson(p.cells, cells);
  console.log(`${cells.length} cells`);
  return { img, t, cells };
}

export async function build(id: string) {
  const p = eventPaths(id);
  const bundle = loadEvent(id);
  const img = await loadImage(p.plan);
  const t: Transform = readJson(p.registration);
  const cells: Cell[] = readJson(p.cells);
  const reads: Read[] = readJson(p.reads, []);
  const corrections = parseCorrections(readJson(p.corrections, EMPTY_CORRECTIONS));
  const { booths, problems } = buildBooths({
    cells,
    reads,
    corrections,
    t,
    sample: sampler(img),
    codePattern: bundle.event.codePattern,
  });
  if (problems.length) fail(problems);

  let event = mergeEvent(bundle.event, corrections.event);
  if (!event.aisles)
    event = EventSchema.parse({ ...event, aisles: computeAisles(booths.booths, bundle.venue, event.codePattern) });

  const data = prepareData(bundle.venue, event, booths, bundle.exhibitors);
  const grid = createGrid(data.venue, obstaclesOf(data));
  const origin = data.landmarkById[data.venue.origin];
  const unreachable = data.booths
    .filter((b) => !isRouteOk(findRoute(grid, data.venue, origin, { kind: 'booth', b })))
    .map((b) => b.c);
  if (unreachable.length) fail([`not reachable from ${origin.id}: ${unreachable.join(', ')}`]);
  writeJson(p.booths, booths);
  writeJson(p.event, event);
  console.log(
    `${booths.booths.length} booths, ${booths.pillars.length} pillars written. Run bun test to check the event.`,
  );
}

const [cmd, id] = process.argv.slice(2);
const commands: Record<string, (id: string) => Promise<unknown>> = { detect, build };
if (!cmd || !commands[cmd] || !id)
  fail([`usage: bun tools/pipeline/cli.ts <${Object.keys(commands).join('|')}> <event-id>`]);
await commands[cmd](id);
