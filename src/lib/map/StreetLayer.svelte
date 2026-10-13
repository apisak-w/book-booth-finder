<script lang="ts">
  import type { Georef } from '$lib/core/geo';
  import type { VB } from '$lib/core/panzoom';
  import type { Surroundings } from '$lib/core/types';
  import { nameIn } from '$lib/i18n/strings';
  import { lang } from '$lib/i18n/lang.svelte';
  import { tileHref, tileMatrix, tileZoom, visibleTiles } from './tiles';

  let {
    geo,
    surroundings,
    tileUrl,
    vb,
    pxPerUnit,
    onTiles,
  }: {
    geo: Georef;
    surroundings: Surroundings | null;
    tileUrl: string;
    vb: VB;
    pxPerUnit: number;
    onTiles: (ok: boolean) => void;
  } = $props();

  let failed = $state(false);
  const z = $derived(tileZoom(geo, pxPerUnit));
  const vis = $derived(tileUrl && !failed ? visibleTiles(vb, geo, z) : null);
  const matrix = $derived(vis ? tileMatrix(geo, z, vis.origin).map((v) => +v.toFixed(6)).join(' ') : '');
  const nameOf = $derived(nameIn(lang.current));
  $effect(() => onTiles(!!tileUrl && !failed));
</script>

<g id="layer-street" aria-hidden="true">
  {#if surroundings}
    {@const [x0, y0, x1, y1] = surroundings.bounds}
    <rect x={x0} y={y0} width={x1 - x0} height={y1 - y0} class="s-ground" />
    {#each surroundings.shapes as sh, i (i)}
      {#if sh.kind === 'road' || sh.kind === 'path'}
        <path d={sh.d} class="s-{sh.kind}" stroke-width={sh.w} />
      {:else}
        <path d={sh.d} class="s-{sh.kind}" />
      {/if}
    {/each}
    {#if !vis?.tiles.length}
      <rect x={x0} y={y0} width={x1 - x0} height={y1 - y0} class="s-edge" />
    {/if}
  {/if}
  {#if vis?.tiles.length}
    <g transform="matrix({matrix})">
      {#each vis.tiles as t (`${z}/${t.x}/${t.y}`)}
        <image
          href={tileHref(tileUrl, z, t.x, t.y)}
          x={(t.x - vis.origin[0]) * 256}
          y={(t.y - vis.origin[1]) * 256}
          width="256.5"
          height="256.5"
          onerror={() => (failed = true)}
        />
      {/each}
    </g>
  {/if}
  {#if surroundings}
    {#each surroundings.labels as l, i (i)}
      <text x={l.x} y={l.y} class="s-label" font-size={l.size}>{nameOf(l.text)}</text>
    {/each}
  {/if}
</g>
