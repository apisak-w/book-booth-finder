<script lang="ts">
  import { untrack } from 'svelte';
  import { latLngOf, worldPx } from '$lib/core/geo';
  import type { GeoPin, LatLng, Point } from '$lib/core/types';
  import { OSM_CREDIT, OSM_MAX_Z, OSM_MIN_Z, osmTiles, screenToWorld } from './osm';

  let { center, pins, onPick }: { center: LatLng; pins: GeoPin[]; onPick: (ll: LatLng) => void } = $props();
  let w = $state(600);
  let h = $state(420);
  let z = $state(18);
  const o: Point = untrack(() => worldPx(center.lat, center.lng));
  let c = $state<Point>(o);
  let drag: { x: number; y: number; c: Point; moved: boolean } | null = null;

  const s = $derived(2 ** (20 - z));
  const tiles = $derived(osmTiles(c, z, w, h));
  const vb = $derived(`${c[0] - o[0] - (w * s) / 2} ${c[1] - o[1] - (h * s) / 2} ${w * s} ${h * s}`);

  function down(e: PointerEvent) {
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    drag = { x: e.clientX, y: e.clientY, c, moved: false };
  }
  function move(e: PointerEvent) {
    if (!drag) return;
    const dx = e.clientX - drag.x,
      dy = e.clientY - drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
    if (drag.moved) c = [drag.c[0] - dx * s, drag.c[1] - dy * s];
  }
  function up(e: PointerEvent) {
    const d = drag;
    drag = null;
    if (!d || d.moved) return;
    const r = (e.currentTarget as Element).getBoundingClientRect();
    onPick(latLngOf(screenToWorld(c, z, w, h, [e.clientX - r.left, e.clientY - r.top])));
  }
  const zoom = (k: number) => (z = Math.min(OSM_MAX_Z, Math.max(OSM_MIN_Z, z + k)));
</script>

<div class="street-picker" bind:clientWidth={w} bind:clientHeight={h}>
  <svg
    viewBox={vb}
    role="application"
    aria-label="Street map. Click the spot that matches the plan."
    onpointerdown={down}
    onpointermove={move}
    onpointerup={up}
    onwheel={(e) => {
      e.preventDefault();
      zoom(e.deltaY < 0 ? 1 : -1);
    }}
  >
    {#each tiles as t (t.key)}
      <image href={t.href} x={t.x - o[0]} y={t.y - o[1]} width={t.size} height={t.size} />
    {/each}
    {#each pins as p, k (p.id)}
      {@const q = worldPx(p.lat, p.lng).map((v, i) => v - o[i])}
      <g class="pc-pin"><circle cx={q[0]} cy={q[1]} r={11 * s} stroke-width={2.5 * s} /><text x={q[0]} y={q[1] + 4.5 * s} font-size={13 * s}>{k + 1}</text></g>
    {/each}
  </svg>
  <div class="sp-zoom">
    <button type="button" class="btn" aria-label="Zoom in" onclick={() => zoom(1)}>+</button>
    <button type="button" class="btn" aria-label="Zoom out" onclick={() => zoom(-1)}>−</button>
  </div>
  <span class="sp-credit">{OSM_CREDIT}</span>
</div>
