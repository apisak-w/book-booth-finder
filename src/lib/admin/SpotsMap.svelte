<script lang="ts">
  import { georef, latLngToPlan } from '$lib/core/geo';
  import type { LatLng, Point, Surroundings } from '$lib/core/types';
  import StreetLayer from '$lib/map/StreetLayer.svelte';
  import type { Place } from './places';
  import type { AdminVenue } from './types';

  let { venue, place, surroundings }: { venue: AdminVenue; place: Place; surroundings: Surroundings | null } =
    $props();
  const W = 700,
    H = 744;
  const g = $derived(georef(venue.pins));
  const half = $derived(150 / venue.metersPerPx);
  const centre = $derived.by((): Point => {
    if (place.kind === 'door') return [place.lm.x, place.lm.y];
    const a = venue.areas.find((x) => x.id === place.id)!;
    return [a.label.x, a.label.y];
  });
  const vb = $derived({ x: centre[0] - (half * W) / H, y: centre[1] - half, w: (2 * half * W) / H, h: 2 * half });
  const r = $derived(vb.h / 120);
  const at = (s: LatLng) => latLngToPlan(g, s);
  const good = $derived(new Set(place.kind === 'door' ? place.review.good : place.check.inside));
  const mid = $derived(place.kind === 'door' && place.review.middle ? at(place.review.middle) : null);
</script>

<section class="admin-map" aria-label="Spots on the map">
  <svg viewBox="{vb.x} {vb.y} {vb.w} {vb.h}" role="img" aria-label="{place.spots.length} spots near {place.name.en}">
    <StreetLayer geo={g} {surroundings} tileUrl="" {vb} pxPerUnit={W / vb.w} onTiles={() => {}} />
    {#each venue.walls as w, k (k)}
      <path d={'M' + w.map((p) => p.join(',')).join('L') + 'Z'} class="am-wall" />
    {/each}
    {#each place.spots as s, k (k)}
      {@const p = at(s)}
      <circle cx={p[0]} cy={p[1]} {r} class={good.has(s) ? 'am-good' : 'am-left'} />
    {/each}
    {#if place.kind === 'door'}
      {#if mid}
        <line x1={place.lm.x} y1={place.lm.y} x2={mid[0]} y2={mid[1]} class="am-move" stroke-width={r / 2} />
        <circle cx={mid[0]} cy={mid[1]} r={r * 3} class="am-mid" stroke-width={r / 1.5} />
      {/if}
      <circle cx={place.lm.x} cy={place.lm.y} r={r * 2.5} class="am-pin" stroke-width={r / 2} />
    {/if}
  </svg>
  <ul class="am-key">
    <li><span class="k-pin"></span>Pin now</li>
    <li><span class="k-mid"></span>Middle of good spots</li>
    <li><span class="k-good"></span>Good</li>
    <li><span class="k-left"></span>Left out</li>
  </ul>
</section>
