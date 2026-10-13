import { createGrid, obstaclesOf, type Grid } from '$lib/core/grid';
import { findRoute } from '$lib/core/routing';
import { isRouteOk, type Dest, type EventData, type Landmark, type RouteOk, type RouteResult } from '$lib/core/types';

export class Finder {
  data: EventData;
  #grid: Grid | null = null;
  dest = $state<Dest | null>(null);
  fromId = $state('');
  query = $state('');
  sheetOpen = $state(true);
  start: Landmark | null;
  route: RouteResult | null;
  routeOk: RouteOk | null;

  constructor(data: EventData) {
    this.data = data;
    this.start = $derived(this.fromId ? (this.data.landmarkById[this.fromId] ?? null) : null);
    this.route = $derived(
      this.start && this.dest ? findRoute(this.grid, this.data.venue, this.start, this.dest) : null,
    );
    this.routeOk = $derived(isRouteOk(this.route) ? this.route : null);
  }

  get grid(): Grid {
    return (this.#grid ??= createGrid(this.data.venue, obstaclesOf(this.data)));
  }

  #em: { dest: Dest; m: Record<string, number> } | null = null;

  entranceMeters(dest: Dest): Record<string, number> {
    if (this.#em?.dest === dest) return this.#em.m;
    const m: Record<string, number> = {};
    for (const l of this.data.landmarks) {
      if (l.group !== 'entry') continue;
      const r = findRoute(this.grid, this.data.venue, l, dest);
      if (isRouteOk(r)) m[l.id] = r.meters;
      else if ('same' in r) m[l.id] = 0;
    }
    this.#em = { dest, m };
    return m;
  }
}
