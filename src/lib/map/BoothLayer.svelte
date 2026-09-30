<script lang="ts">
  import type { EventData } from '$lib/core/types';
  import { boothLabel } from './labels';
  let { data, destIndex = -1 }: { data: EventData; destIndex?: number } = $props();
  const cats = $derived(data.event.categories);
  const zones = $derived(data.event.zones);
</script>

<g id="layer-booths">
  {#each data.pillars as p, k (k)}
    <rect x={p.x} y={p.y} width={p.w} height={p.h} fill={cats[p.cat].color} stroke="var(--gap)" stroke-width="1.6" />
    <rect x={p.inner.x} y={p.inner.y} width={p.inner.w} height={p.inner.h} rx="4" class="pillar" />
  {/each}
  {#each data.booths.filter((b) => !b.foyer) as b (b.i)}
    {@const z = zones[b.c]}
    {@const l = boothLabel(b, z ? (z.short ?? '') : undefined)}
    <g class="booth c-{b.cat}" class:dest={destIndex === b.i} data-b={b.i}>
      <rect x={b.x} y={b.y} width={b.w} height={b.h} fill={cats[b.cat].color} />
      {#each b.extra ?? [] as e, k (k)}
        <rect x={e.x} y={e.y} width={e.w} height={e.h} fill={cats[b.cat].color} />
      {/each}
      <text x={l.code.x} y={l.code.y} font-size={l.fs} transform={l.code.rotate ? `rotate(-90 ${l.code.x} ${l.code.y})` : undefined}>{b.c}</text>
      {#each l.lines as line, k (k)}
        <text x={line.x} y={line.y} font-size="8.5" class="small-lbl">{line.text}</text>
      {/each}
    </g>
  {/each}
</g>
