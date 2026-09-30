<script lang="ts">
  import type { EventData } from '$lib/core/types';
  let { data, destIndex = -1 }: { data: EventData; destIndex?: number } = $props();
  const DARK = '#1D2442';
</script>

<g id="layer-zones">
  {#each data.event.foyerZones as z (z.c)}
    {@const b = data.byCode[z.c][0]}
    <g class="zone booth c-special" class:dest={destIndex === b.i} data-b={b.i}>
      <rect x={z.x} y={z.y} width={z.w} height={z.h} rx="2" />
      <text x={z.x + z.w / 2} y={z.y + z.h / 2} font-size="12" transform={z.vertical ? `rotate(-90 ${z.x + z.w / 2} ${z.y + z.h / 2})` : undefined}>{z.c}</text>
    </g>
  {/each}
  {#each data.event.obstacles.filter((o) => o.kind === 'info') as o, k (k)}
    <rect x={o.x} y={o.y} width={o.w} height={o.h} rx="2" fill={DARK} />
    <text x={o.x + o.w / 2} y={o.y + o.h / 2} class="icon-txt" font-size="11">Information</text>
  {/each}
</g>
