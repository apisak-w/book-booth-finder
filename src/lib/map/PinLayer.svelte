<script lang="ts">
  import type { Dest, RouteOk } from '$lib/core/types';
  let { dest, route }: { dest: Dest | null; route: RouteOk | null } = $props();
  const t = $derived(dest ? (dest.kind === 'booth' ? { x: dest.b.cx, y: dest.b.y } : { x: dest.lm.x, y: dest.lm.y - 14 }) : null);
</script>

<g id="layer-pins">
  {#if route}
    {@const [sx, sy] = route.P[0]}
    <circle cx={sx} cy={sy} r="13" fill="var(--panel)" stroke="var(--route)" stroke-width="5" />
    <circle cx={sx} cy={sy} r="4.5" fill="var(--route)" />
  {/if}
  {#if t}
    <g>
      <circle cx={t.x} cy={t.y - 2} r="22" fill="var(--sun)" class="pulse" />
      <path d="M{t.x} {t.y - 2}c-9-13-16-20-16-29a16 16 0 0 1 32 0c0 9-7 16-16 29z" fill="var(--ink)" stroke="var(--panel)" stroke-width="2.5" />
      <circle cx={t.x} cy={t.y - 31} r="6.5" fill="var(--sun)" />
    </g>
  {/if}
</g>
