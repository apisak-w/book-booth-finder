<script lang="ts">
  import { onMount, type Snippet } from 'svelte';
  import type { Booth, Dest, EventData, Landmark, RouteOk } from '$lib/core/types';
  import { isAisleBooth } from '$lib/core/directions';
  import { STRINGS, nameIn } from '$lib/i18n/strings';
  import { lang } from '$lib/i18n/lang.svelte';
  import { createViewport, type Viewport } from './viewport';
  import BaseLayer from './BaseLayer.svelte';
  import BoothLayer from './BoothLayer.svelte';
  import ZoneLayer from './ZoneLayer.svelte';
  import MarkLayer from './MarkLayer.svelte';
  import RouteLayer from './RouteLayer.svelte';
  import PinLayer from './PinLayer.svelte';

  let {
    data,
    dest,
    route,
    onSelectBooth,
    onSelectPlace,
    onFit,
    children,
  }: {
    data: EventData;
    dest: Dest | null;
    route: RouteOk | null;
    onSelectBooth: (b: Booth) => void;
    onSelectPlace: (lm: Landmark) => void;
    onFit: () => void;
    children?: Snippet;
  } = $props();

  let svg: SVGSVGElement;
  let vp: Viewport | null = null;
  const s = $derived(STRINGS[lang.current]);
  const destIndex = $derived(dest?.kind === 'booth' ? dest.b.i : -1);
  const activeAisle = $derived(dest?.kind === 'booth' && isAisleBooth(dest.b, data) ? dest.b.c[0] : '');

  export const fitAll = (animated = false) => vp?.fitAll(animated);
  export const zoomCenter = (k: number) => vp?.zoomCenter(k);
  export const frame = (d: Dest | null, r: RouteOk | null) => vp?.frame(d, r);

  onMount(() => {
    vp = createViewport(svg, data.venue, (target) => {
      const bEl = target?.closest('[data-b]'), lEl = target?.closest('[data-lm]');
      if (bEl) onSelectBooth(data.booths[Number(bEl.getAttribute('data-b'))]);
      else if (lEl) {
        const lm = data.landmarkById[lEl.getAttribute('data-lm') ?? ''];
        if (lm) onSelectPlace(lm);
      }
    });
    return () => vp?.destroy();
  });
</script>

<div class="mapwrap">
  <svg
    bind:this={svg}
    id="map"
    class:dim={!!dest}
    xmlns="http://www.w3.org/2000/svg"
    preserveAspectRatio="xMidYMid meet"
    role="img"
    aria-label={s.floorPlan}
    viewBox="{data.venue.view.x} {data.venue.view.y} {data.venue.view.w} {data.venue.view.h}"
  >
    <BaseLayer {data} {activeAisle} />
    <BoothLayer {data} {destIndex} />
    <ZoneLayer {data} {destIndex} />
    <MarkLayer landmarks={data.landmarks} nameOf={nameIn(lang.current)} />
    <RouteLayer {route} />
    <PinLayer {dest} {route} />
  </svg>
  <div class="zoombar">
    <button type="button" aria-label={s.zoomIn} title={s.zoomIn} onclick={() => zoomCenter(0.7)}>+</button>
    <button type="button" aria-label={s.zoomOut} title={s.zoomOut} onclick={() => zoomCenter(1 / 0.7)}>−</button>
    <button type="button" aria-label={s.fit} title={s.fit} onclick={onFit}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" /></svg>
    </button>
  </div>
  {@render children?.()}
</div>
