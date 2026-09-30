import { loadData } from '$lib/core/prepare';
import type { EventData, Landmark, Obstacle, FoyerZone, Point, Rect } from '$lib/core/types';
import type { EventBundle } from '$lib/server/catalog';
import type { Cell } from '../lib/detect';
import type { Read } from '../lib/build';
import type { Corrections } from '../lib/corrections';
import { IDENTITY, fitAxes, rectToVenue, toPlan, toVenue, type Transform } from '../lib/transform';
import { cellStatus, upsertFix, type CellStatus } from './status';

export type Mode = 'select' | 'booth' | 'stage' | 'info' | 'foyer' | 'landmark' | 'register';
export type Selection =
  | { kind: 'cell'; index: number }
  | { kind: 'add'; index: number }
  | { kind: 'landmark'; index: number }
  | null;

export class Review {
  id: string;
  data = $state<EventData | null>(null);
  cells = $state<Cell[]>([]);
  reads = $state<Read[]>([]);
  corrections = $state<Corrections>({ cells: [], add: [], categoryColours: {} });
  t = $state<Transform>(IDENTITY);
  mode = $state<Mode>('select');
  selection = $state<Selection>(null);
  message = $state('');
  dirty = $state(false);
  pairs = $state<{ plan: Point; venue: Point }[]>([]);
  pendingPlan = $state<Point | null>(null);
  showReference = $state(false);
  planSize = $state({ w: 0, h: 0 });

  venueCells = $derived(this.cells.map((c) => rectToVenue(this.t, c)));
  venueReads = $derived(this.reads.map((r) => ({ ...r, at: toVenue(this.t, r.at) })));
  statuses = $derived(this.venueCells.map((r) => cellStatus(r, this.venueReads, this.corrections, this.venueCells)));
  problems = $derived(
    this.statuses
      .map((s, k) => ({ s, k }))
      .filter(({ s }) => s.status === 'missing' || s.status === 'flagged')
      .map(({ k }) => k),
  );

  constructor(id: string) {
    this.id = id;
  }

  async load() {
    const r = await fetch(`/api/state?id=${this.id}`);
    const body = await r.json();
    if (!r.ok) {
      this.message = body.error;
      return;
    }
    const bundle: EventBundle = body.bundle;
    this.data = loadData(bundle);
    this.cells = body.cells;
    this.reads = body.reads;
    this.corrections = body.corrections;
    this.t = body.registration ?? IDENTITY;
    const img = new Image();
    img.src = `/api/plan?id=${this.id}`;
    await img.decode();
    this.planSize = { w: img.naturalWidth, h: img.naturalHeight };
    this.dirty = false;
    this.message = `${this.cells.length} cells, ${this.problems.length} to check`;
  }

  async save() {
    const r = await fetch(`/api/corrections?id=${this.id}`, { method: 'POST', body: JSON.stringify(this.corrections) });
    const body = await r.json();
    this.message = r.ok ? 'Saved. Run event:build when every cell is resolved.' : body.error;
    if (r.ok) this.dirty = false;
  }

  status(k: number): CellStatus {
    return this.statuses[k].status;
  }

  fixCell(k: number, patch: Partial<Corrections['cells'][number]>) {
    this.corrections = upsertFix(this.corrections, this.venueCells[k], patch, this.venueCells);
    this.dirty = true;
  }

  nextProblem() {
    const cur = this.selection?.kind === 'cell' ? this.selection.index : -1;
    const next = this.problems.find((k) => k > cur) ?? this.problems[0];
    if (next !== undefined) this.selection = { kind: 'cell', index: next };
  }

  addRect(r: Rect) {
    const ev = { ...this.corrections.event };
    if (this.mode === 'booth') {
      this.corrections = { ...this.corrections, add: [...this.corrections.add, { code: '', rect: r }] };
      this.selection = { kind: 'add', index: this.corrections.add.length - 1 };
    } else if (this.mode === 'stage' || this.mode === 'info') {
      const o: Obstacle = { ...r, kind: this.mode };
      this.corrections = {
        ...this.corrections,
        event: { ...ev, obstacles: [...(ev.obstacles ?? this.data!.event.obstacles), o] },
      };
    } else if (this.mode === 'foyer') {
      const z: FoyerZone = {
        ...r,
        c: `U${String((ev.foyerZones ?? this.data!.event.foyerZones).length + 1).padStart(2, '0')}`,
      };
      this.corrections = {
        ...this.corrections,
        event: { ...ev, foyerZones: [...(ev.foyerZones ?? this.data!.event.foyerZones), z] },
      };
    }
    this.dirty = true;
  }

  addLandmark([x, y]: Point) {
    const ev = { ...this.corrections.event };
    const list = ev.landmarks ?? this.data!.event.landmarks;
    const lm: Landmark = {
      id: `place${list.length + 1}`,
      group: 'other',
      icon: 'info',
      x: Math.round(x),
      y: Math.round(y),
      th: 'จุดใหม่',
      en: 'New place',
    };
    this.corrections = { ...this.corrections, event: { ...ev, landmarks: [...list, lm] } };
    this.selection = { kind: 'landmark', index: list.length };
    this.dirty = true;
  }

  registerClick(p: Point) {
    if (!this.showReference) {
      this.pendingPlan = toPlan(this.t, p);
      this.showReference = true;
      this.message = 'Now click the same corner on the venue reference.';
    } else if (this.pendingPlan) {
      this.pairs = [...this.pairs, { plan: this.pendingPlan, venue: p }];
      this.pendingPlan = null;
      this.showReference = false;
      this.message = `${this.pairs.length} pair(s). Add at least two, far apart, then apply.`;
    }
  }

  async applyRegistration() {
    const t = fitAxes(this.pairs);
    const r = await fetch(`/api/registration?id=${this.id}`, { method: 'POST', body: JSON.stringify(t) });
    this.message = r.ok ? 'Registration saved. Run event:detect again, then reload.' : (await r.json()).error;
    this.pairs = [];
  }
}
