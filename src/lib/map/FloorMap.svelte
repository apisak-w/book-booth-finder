<script lang="ts">
  import { onMount, type Snippet } from 'svelte';
  import type { Booth, Box, Dest, EventData, Landmark, Rect, RouteOk } from '$lib/core/types';
  import type { VB } from '$lib/core/panzoom';
  import { isAisleBooth } from '$lib/core/directions';
  import { STRINGS, nameIn } from '$lib/i18n/strings';
  import { lang } from '$lib/i18n/lang.svelte';
  import { createViewport, type Viewport } from './viewport';
  import type { CompassView, StreetView, Turn, YouMark } from './street';
  import StreetLayer from './StreetLayer.svelte';
  import BaseLayer from './BaseLayer.svelte';
  import BoothLayer from './BoothLayer.svelte';
  import ZoneLayer from './ZoneLayer.svelte';
  import MarkLayer from './MarkLayer.svelte';
  import RouteLayer from './RouteLayer.svelte';
  import PinLayer from './PinLayer.svelte';
  import YouLayer from './YouLayer.svelte';

  let {
    data,
    dest,
    route,
    onSelectBooth,
    onSelectPlace,
    onFit,
    street = null,
    you = null,
    turn = null,
    compass = null,
    onUserPan,
    children,
  }: {
    data: EventData;
    dest: Dest | null;
    route: RouteOk | null;
    onSelectBooth: (b: Booth) => void;
    onSelectPlace: (lm: Landmark) => void;
    onFit: () => void;
    street?: StreetView | null;
    you?: YouMark | null;
    turn?: Turn | null;
    compass?: CompassView | null;
    onUserPan?: () => void;
    children?: Snippet;
  } = $props();

  let svg: SVGSVGElement;
  let vp: Viewport | null = null;
  let view = $state<{ vb: VB; ppu: number }>({ vb: { x: 0, y: 0, w: 1, h: 1 }, ppu: 0.2 });
  let tilesOk = $state(false);
  const s = $derived(STRINGS[lang.current]);
  const destIndex = $derived(dest?.kind === 'booth' ? dest.b.i : -1);
  const activeAisle = $derived(dest?.kind === 'booth' && isAisleBooth(dest.b, data) ? dest.b.c[0] : '');
  const turnAttr = $derived(turn ? `rotate(${turn.deg.toFixed(1)} ${turn.cx.toFixed(1)} ${turn.cy.toFixed(1)})` : undefined);
  const needle = $derived(compass ? compass.northDeg + (turn?.deg ?? 0) : 0);

  export const fitAll = (animated = false) => vp?.fitAll(animated);
  export const zoomCenter = (k: number) => vp?.zoomCenter(k);
  export const frame = (d: Dest | null, r: RouteOk | null) => vp?.frame(d, r);
  export const frameBox = (b: Box, pad: number) => vp?.frameBox(b, pad);
  export const setBounds = (r: Rect | null) => vp?.setBounds(r);

  onMount(() => {
    vp = createViewport(
      svg,
      data.venue,
      (target) => {
        const bEl = target?.closest('[data-b]'),
          lEl = target?.closest('[data-lm]');
        if (bEl) onSelectBooth(data.booths[Number(bEl.getAttribute('data-b'))]);
        else if (lEl) {
          const lm = data.landmarkById[lEl.getAttribute('data-lm') ?? ''];
          if (lm) onSelectPlace(lm);
        }
      },
      { onView: (vb, ppu) => (view = { vb: { ...vb }, ppu }), onPan: () => onUserPan?.() },
    );
    return () => vp?.destroy();
  });
</script>

<div class="mapwrap">
  <svg
    bind:this={svg}
    id="map"
    class:dim={!!dest}
    class:street={!!street}
    xmlns="http://www.w3.org/2000/svg"
    preserveAspectRatio="xMidYMid meet"
    role="img"
    aria-label={s.floorPlan}
    viewBox="{data.venue.view.x} {data.venue.view.y} {data.venue.view.w} {data.venue.view.h}"
  >
    <g id="map-turn" transform={turnAttr}>
      {#if street}
        <StreetLayer
          geo={street.geo}
          surroundings={street.surroundings}
          tileUrl={street.tileUrl}
          vb={view.vb}
          pxPerUnit={view.ppu}
          onTiles={(ok) => (tilesOk = ok)}
        />
      {/if}
      <BaseLayer {data} {activeAisle} />
      <BoothLayer {data} {destIndex} />
      <ZoneLayer {data} {destIndex} />
      <MarkLayer landmarks={data.landmarks} nameOf={nameIn(lang.current)} />
      <RouteLayer {route} />
      <PinLayer {dest} {route} />
      <YouLayer {you} unit={1 / view.ppu} label={s.you} />
    </g>
  </svg>
  <div class="zoombar">
    <button type="button" aria-label={s.zoomIn} title={s.zoomIn} onclick={() => zoomCenter(0.7)}>+</button>
    <button type="button" aria-label={s.zoomOut} title={s.zoomOut} onclick={() => zoomCenter(1 / 0.7)}>−</button>
    <button type="button" aria-label={s.fit} title={s.fit} onclick={onFit}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" /></svg>
    </button>
    {#if compass}
      <button
        type="button"
        class="compass"
        aria-pressed={compass.on}
        aria-label={compass.on ? s.stopTurning : s.turnWithMe}
        title={compass.on ? s.stopTurning : s.turnWithMe}
        onclick={compass.toggle}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true"><g transform="rotate({needle.toFixed(0)} 12 12)"><path d="M12 3l4 9H8z" class="needle-n" /><path d="M12 21l-4-9h8z" class="needle-s" /></g></svg>
      </button>
    {/if}
  </div>
  {#if street}
    <div class="streetinfo">
      {#if !tilesOk}<span class="chip offline">{s.offlineMap}</span>{/if}
      <span class="credit">{tilesOk && street.credit ? `${street.credit} · ` : ''}© OpenStreetMap contributors</span>
    </div>
  {/if}
  {@render children?.()}
</div>
