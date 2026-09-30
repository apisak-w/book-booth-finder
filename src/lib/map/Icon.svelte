<script lang="ts">
  import type { IconName } from '$lib/core/types';
  let { icon, x, y }: { icon: IconName; x: number; y: number } = $props();
  const DARK = '#1D2442';
</script>

{#if icon === 'wc'}
  <circle cx={x} cy={y} r="17" fill={DARK} stroke="var(--floor)" stroke-width="2" />
  <text {x} y={y + 1} class="icon-txt" font-size="12">WC</text>
{:else if icon === 'charge'}
  <circle cx={x} cy={y} r="14" fill="#16B3D6" stroke="var(--floor)" stroke-width="2" />
  <path d="M{x + 2} {y - 9}l-8 11h6l-2 8 8-11h-6z" fill="#fff" />
{:else if icon === 'info'}
  <circle cx={x} cy={y - 22} r="9" fill="var(--blue)" />
  <text {x} y={y - 21} class="icon-txt" font-size="12">i</text>
{:else if icon === 'door' || icon === 'doorSide'}
  <rect x={x - 14} y={y - 14} width="28" height="28" rx="8" fill="var(--sun)" />
  <path
    d={icon === 'door' ? `M${x - 5} ${y + 8}v-15l-4 4M${x + 5} ${y - 8}v15l4-4` : `M${x - 8} ${y - 5}h15l-4-4M${x + 8} ${y + 5}h-15l4 4`}
    fill="none" stroke="#13306B" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"
  />
{:else if icon === 'mrt'}
  <rect x={x - 30} y={y - 18} width="60" height="36" rx="9" fill={DARK} />
  <text {x} y={y + 1} class="icon-txt" font-size="16">MRT</text>
{:else if icon === 'lift'}
  <rect x={x - 15} y={y - 15} width="30" height="30" rx="6" fill={DARK} />
  <path d="M{x - 6} {y - 2}l6-7 6 7zM{x - 6} {y + 2}l6 7 6-7z" fill="#fff" />
{/if}
