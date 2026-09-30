import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { loadEvent, loadVenue } from '../../src/lib/server/catalog';
import { EventSchema } from '../../src/lib/server/schema';
import { loadData } from '../../src/lib/core/prepare';
import { crop, loadImage, median, type RGB } from './lib/image';
import { autoRegister, toVenue, type Transform } from './lib/register';
import { defaultDetectParams, detectCells, resolveDetectParams, type Cell } from './lib/detect';
import { EMPTY_CORRECTIONS, parseCorrections, mergeEvent } from './lib/corrections';
import { buildBooths, checkBuild, computeAisles, type Read } from './lib/build';
import { ZodError } from 'zod';
import { eventPaths } from './lib/paths';
import { copyFileSync, mkdirSync } from 'node:fs';
import { extname } from 'node:path';
import { readCells } from './lib/read';
import { clusterColours, assignCategories } from './lib/categorise';
import { spawn } from 'node:child_process';
import { guessColumns, parseMap, readSheet, toCsv, toExhibitorRows } from './lib/exhibitors';
import { stringifyJson } from './lib/json';
import { validateNewEvent } from './lib/new-event';

const need = <T>(path: string, hint: string): T => {
  if (!existsSync(path))
    fail([`${path.split('/events/')[1] ? 'events/' + path.split('/events/')[1] : path} is missing. ${hint}`]);
  return JSON.parse(readFileSync(path, 'utf8'));
};
const readJson = <T>(path: string, fallback?: T): T =>
  existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : (fallback as T);
const writeJson = (path: string, v: unknown) => writeFileSync(path, stringifyJson(v));
const fail = (lines: string[]): never => {
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
  const params = resolveDetectParams(readJson(p.detect, null), t, () => defaultDetectParams(img, venue, t));
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
  const t: Transform = need(p.registration, 'Run bun run event:detect <id> first.');
  const cells: Cell[] = need(p.cells, 'Run bun run event:detect <id> first.');
  const reads: Read[] = readJson(p.reads, []);
  const corrections = parseCorrections(readJson(p.corrections, EMPTY_CORRECTIONS));
  const { booths, problems, notes } = buildBooths({
    cells,
    reads,
    corrections,
    t,
    sample: sampler(img),
    codePattern: bundle.event.codePattern,
  });
  if (problems.length) fail(problems);
  for (const n of notes) console.log(`note: ${n}`);

  let event;
  try {
    event = mergeEvent(bundle.event, corrections.event);
    if (!event.aisles)
      event = EventSchema.parse({ ...event, aisles: computeAisles(booths.booths, bundle.venue, event.codePattern) });
  } catch (e) {
    fail(
      e instanceof ZodError ? e.issues.map((i) => `event ${i.path.join('.')}: ${i.message}`) : [(e as Error).message],
    );
    return;
  }
  const buildProblems = checkBuild(bundle.venue, event, booths, bundle.exhibitors);
  if (buildProblems.length) fail(buildProblems);
  writeJson(p.booths, booths);
  writeJson(p.event, event);
  console.log(
    `${booths.booths.length} booths, ${booths.pillars.length} pillars written. Run bun test to check the event.`,
  );
}

const [cmd, target] = process.argv.slice(2);
const flag = (name: string) => {
  const k = process.argv.indexOf(`--${name}`);
  return k > 0 ? process.argv[k + 1] : undefined;
};

export async function read(id: string) {
  const p = eventPaths(id);
  const { event } = loadEvent(id);
  const img = await loadImage(p.plan);
  const t: Transform = need(p.registration, 'Run bun run event:detect <id> first.');
  const cells: Cell[] = need(p.cells, 'Run bun run event:detect <id> first.');
  console.log(`Reading ${cells.length} cells. This takes a minute or two.`);
  const reads = await readCells(img, cells, t, event.codePattern);
  writeJson(p.reads, reads);
  const flagged = reads.filter((r) => r.flags.length).length;
  console.log(`${reads.length - flagged} read cleanly, ${flagged} need review`);
}

export async function categorise(id: string) {
  const p = eventPaths(id);
  const cells: Cell[] = need(p.cells, 'Run bun run event:detect <id> first.');
  const corrections = parseCorrections(readJson(p.corrections, EMPTY_CORRECTIONS));
  const { categoryColours, created } = assignCategories(
    clusterColours(cells.map((c) => c.rgb)),
    corrections.categoryColours,
  );
  corrections.categoryColours = categoryColours;
  corrections.event = { ...corrections.event, categories: { ...corrections.event?.categories, ...created } };
  writeJson(p.corrections, corrections);
  console.log(`${Object.keys(created).length} new categories to name in review`);
}

export async function create(id: string) {
  const venue = flag('venue') ?? 'qsncc-lg-5-8';
  const plan = flag('plan');
  const { event, problems } = validateNewEvent({
    id,
    plan,
    nameTh: flag('name-th'),
    nameEn: flag('name-en'),
    start: flag('start'),
    end: flag('end'),
    venue,
  });
  if (!event) return fail(problems);
  const p = eventPaths(id);
  mkdirSync(p.source, { recursive: true });
  copyFileSync(plan!, `${p.source}/plan${extname(plan!).toLowerCase()}`);
  writeJson(p.event, event);
  writeJson(p.booths, { booths: [], pillars: [] });
  writeJson(p.corrections, EMPTY_CORRECTIONS);
  await detect(id);
  await read(id);
  await categorise(id);
  console.log(`Next: bun run event:review ${id}, then bun run event:build ${id}`);
}

export async function ocrReport(id: string) {
  const p = eventPaths(id);
  const { booths } = loadEvent(id);
  const reads: Read[] = need(p.reads, 'Run bun run event:read <id> first.');
  const t: Transform = need(p.registration, 'Run bun run event:detect <id> first.');
  let right = 0,
    wrong = 0,
    none = 0;
  for (const b of booths.booths) {
    const r = reads.find((x) => {
      const [vx, vy] = toVenue(t, x.at);
      return vx >= b.x && vx < b.x + b.w && vy >= b.y && vy < b.y + b.h;
    });
    if (!r?.code) none++;
    else if (r.code === b.c) right++;
    else wrong++;
  }
  console.log(`right ${right}, wrong ${wrong}, unread ${none} of ${booths.booths.length}`);
}

export async function review(id: string) {
  loadEvent(id);
  if (!existsSync(eventPaths(id).cells)) fail([`Run bun run event:detect ${id} first`]);
  const child = spawn('bunx', ['vite', '--config', 'tools/pipeline/review/vite.config.ts'], {
    stdio: 'inherit',
    env: { ...process.env, EVENT_ID: id },
  });
  await new Promise((resolve) => child.on('exit', resolve));
}

export async function exhibitors(id: string) {
  const file = process.argv[4];
  if (!file || !existsSync(file))
    fail([`usage: bun run event:exhibitors ${id} <file.csv|file.xlsx> [--map booth=Col,th=Col,en=Col]`]);
  const rows = await readSheet(file);
  if (!rows.length) fail([`${file} has no rows`]);
  const mapArg = flag('map');
  const map = mapArg ? parseMap(mapArg) : guessColumns(Object.keys(rows[0]));
  if (!map)
    fail([
      `Couldn't find the booth and name columns in: ${Object.keys(rows[0]).join(', ')}. Pass --map booth=<col>,th=<col>,en=<col>`,
    ]);
  const data = loadData(loadEvent(id));
  const out = toExhibitorRows(rows, map!, new Set(Object.keys(data.byCode)));
  if (out.unknown.length)
    fail([`booth codes not on the map: ${out.unknown.join(', ')}. Fix the spreadsheet or the map, then run again`]);
  writeFileSync(eventPaths(id).exhibitors, toCsv(out.rows));
  console.log(`${out.rows.length} exhibitor rows written using columns ${JSON.stringify(map)}`);
}

const commands: Record<string, (id: string) => Promise<unknown>> = {
  new: create,
  detect,
  read,
  categorise,
  build,
  'ocr-report': ocrReport,
  review,
  exhibitors,
};
if (!cmd || !commands[cmd] || !target)
  fail([`usage: bun tools/pipeline/cli.ts <${Object.keys(commands).join('|')}> <event-id>`]);
await commands[cmd](target);
