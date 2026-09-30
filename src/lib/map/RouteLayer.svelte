<script lang="ts">
  import type { RouteOk } from '$lib/core/types';
  let { route }: { route: RouteOk | null } = $props();
  const d = $derived(route ? 'M' + route.P.map((p) => p.map((v) => v.toFixed(1)).join(',')).join('L') : '');
  function drawOnce(node: SVGPathElement) {
    const len = node.getTotalLength();
    node.style.setProperty('--len', String(len));
    node.style.strokeDasharray = String(len);
    node.addEventListener('animationend', () => { node.style.strokeDasharray = ''; }, { once: true });
  }
</script>

<g id="layer-route">
  {#if d}
    <path {d} class="case" />
    {#key d}
      <path {d} class="line draw" use:drawOnce />
    {/key}
  {/if}
</g>
