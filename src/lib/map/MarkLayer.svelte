<script lang="ts">
  import type { Landmark } from '$lib/core/types';
  import Icon from './Icon.svelte';
  let { landmarks, nameOf }: { landmarks: Landmark[]; nameOf: (o: Landmark) => string } = $props();
</script>

<g id="layer-marks">
  {#each landmarks as lm (lm.id)}
    {#if lm.icon !== 'stage'}
      <g class="lm" data-lm={lm.id}>
        <Icon icon={lm.icon} x={lm.x} y={lm.y} />
        <title>{nameOf(lm)}</title>
      </g>
    {/if}
  {/each}
</g>
