<script lang="ts">
  import type { YouMark } from './street';
  let { you, unit, label }: { you: YouMark | null; unit: number; label: string } = $props();
</script>

<g id="layer-you">
  {#if you}
    {@const [x, y] = you.p}
    {#if you.leg}
      <path d="M{x} {y}L{you.leg[0]} {you.leg[1]}" class="you-leg" />
    {/if}
    <circle cx={x} cy={y} r={Math.max(you.accPx, 9 * unit)} class="you-acc" />
    <circle cx={x} cy={y} r={7 * unit} class="dot" role="img" aria-label={label} />
  {/if}
</g>
