<script lang="ts">
  import type { EventData } from '$lib/core/types';
  let { data, activeAisle = '' }: { data: EventData; activeAisle?: string } = $props();
  const v = $derived(data.venue);
  const aisles = $derived(data.event.aisles);
  const DARK = '#1D2442';
</script>

<g id="layer-base">
  <rect x={v.view.x - 400} y={v.view.y - 400} width={v.view.w + 800} height={v.view.h + 800} class="outside" />
  {#each v.walls as wall, k (k)}
    <path d={'M' + wall.map((p) => p.join(',')).join('L') + 'Z'} class="hall" />
  {/each}
  {#each v.doors as d (d.id)}
    <rect x={d.gap[0]} y={d.gap[1]} width={d.gap[2] - d.gap[0]} height={d.gap[3] - d.gap[1]} fill="var(--floor)" />
  {/each}
  {#if aisles}
    <g>
      {#each Object.entries(aisles.x) as [letter, x] (letter)}
        <g class="aisle" class:on={activeAisle === letter} data-a={letter}>
          <circle cx={x} cy={aisles.signY} r="13" />
          <text {x} y={aisles.signY + 1}>{letter}</text>
        </g>
      {/each}
    </g>
  {/if}
  {#each v.areas as a (a.id)}
    <text x={a.label.x} y={a.label.y} class="halltxt">{a.label.text}</text>
  {/each}
  {#each data.event.obstacles.filter((o) => o.kind === 'stage') as s, k (k)}
    <rect x={s.x} y={s.y} width={s.w} height={s.h} rx="4" fill="var(--panel)" stroke="var(--blue)" stroke-width="3" />
    {#each [0, 1] as r (r)}
      {#each [0, 1, 2, 3, 4, 5] as c (c)}
        <rect x={s.x + 14 + c * 14} y={s.y + 14 + r * 52} width="5" height="40" fill="var(--muted)" opacity="0.6" />
      {/each}
    {/each}
    <rect x={s.x + 120} y={s.y + 22} width="36" height="70" fill={DARK} />
    <text x={s.x + 138} y={s.y + 57} class="lbl" font-size="16" transform="rotate(90 {s.x + 138} {s.y + 57})">STAGE</text>
    {#if s.note}
      <rect x={s.x + 160} y={s.y + 56} width="62" height="36" fill={DARK} />
      <text x={s.x + 192} y={s.y + 40} class="small-map-txt" font-size="9">{s.note}</text>
    {/if}
  {/each}
</g>
