<script lang="ts">
  import { onMount } from 'svelte';
  import { PLACE_GLYPH } from '$lib/core/describe';
  import { isDoor } from '$lib/core/venueEdit';
  import type { GeoPin, Landmark, Point, Venue } from '$lib/core/types';
  import { createViewport, type Viewport } from '$lib/map/viewport';

  let {
    venue,
    refUrl = null,
    opacity = 0.6,
    mode = 'select',
    selected = null,
    pins = [],
    pending = null,
    unreachable = [],
    readonly = false,
    onSelect = () => {},
    onMove = () => {},
    onAdd = () => {},
    onPlanPoint = () => {},
  }: {
    venue: Venue;
    refUrl?: string | null;
    opacity?: number;
    mode?: 'select' | 'add' | 'pins';
    selected?: string | null;
    pins?: GeoPin[];
    pending?: Point | null;
    unreachable?: string[];
    readonly?: boolean;
    onSelect?: (id: string) => void;
    onMove?: (id: string, x: number, y: number) => void;
    onAdd?: (x: number, y: number) => void;
    onPlanPoint?: (x: number, y: number) => void;
  } = $props();

  let svg: SVGSVGElement;
  let vp: Viewport | null = null;
  let drag = $state<{ id: string; p: Point } | null>(null);
  let grab: { id: string; sx: number; sy: number; dx: number; dy: number; moved: boolean } | null = null;

  const toPlan = (e: PointerEvent): Point => {
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(svg.getScreenCTM()!.inverse());
    return [p.x, p.y];
  };
  const at = (l: Landmark): Point => (drag?.id === l.id ? drag.p : [l.x, l.y]);
  const canDrag = (id: string) => !readonly && mode === 'select' && !isDoor(venue, id);

  onMount(() => {
    vp = createViewport(
      svg,
      venue,
      (t, [x, y]) => {
        if (readonly) {
          const id = t?.closest('[data-lm]')?.getAttribute('data-lm');
          if (id) onSelect(id);
        } else if (mode === 'add') onAdd(Math.round(x), Math.round(y));
        else if (mode === 'pins') onPlanPoint(Math.round(x), Math.round(y));
        else {
          const id = t?.closest('[data-lm]')?.getAttribute('data-lm');
          if (id) onSelect(id);
        }
      },
      { grab: (t) => !!t?.closest('[data-grab]') },
    );
    vp.fitAll();
    return () => vp?.destroy();
  });

  function downLandmark(e: PointerEvent, id: string) {
    if (!canDrag(id)) return;
    const l = venue.landmarks.find((x) => x.id === id)!;
    const [px, py] = toPlan(e);
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    grab = { id, sx: e.clientX, sy: e.clientY, dx: l.x - px, dy: l.y - py, moved: false };
  }
  function moveLandmark(e: PointerEvent) {
    if (!grab) return;
    if (!grab.moved && Math.hypot(e.clientX - grab.sx, e.clientY - grab.sy) > 4) grab.moved = true;
    if (!grab.moved) return;
    const [px, py] = toPlan(e);
    drag = { id: grab.id, p: [Math.round(px + grab.dx), Math.round(py + grab.dy)] };
  }
  function upLandmark() {
    const g = grab,
      d = drag;
    grab = null;
    drag = null;
    if (!g) return;
    if (!g.moved || !d) return onSelect(g.id);
    onSelect(g.id);
    const l = venue.landmarks.find((x) => x.id === g.id);
    if (l && (l.x !== d.p[0] || l.y !== d.p[1])) onMove(g.id, d.p[0], d.p[1]);
  }
</script>

<svg bind:this={svg} class="plan-canvas" class:picking={mode !== 'select' && !readonly} xmlns="http://www.w3.org/2000/svg" role="application" aria-label="Venue plan">
  <rect x="0" y="0" width={venue.reference.width} height={venue.reference.height} class="pc-ground" />
  {#if refUrl}
    <image href={refUrl} x="0" y="0" width={venue.reference.width} height={venue.reference.height} {opacity} preserveAspectRatio="none" />
  {/if}
  {#each venue.walls as w, k (k)}
    <path d={'M' + w.map((p) => p.join(',')).join('L') + 'Z'} class="pc-wall" />
  {/each}
  {#each venue.areas as a (a.id)}
    <text x={a.label.x} y={a.label.y} class="pc-area">{a.label.text}</text>
  {/each}
  {#each venue.doors as d (d.id)}
    <rect x={d.gap[0]} y={d.gap[1]} width={d.gap[2] - d.gap[0]} height={d.gap[3] - d.gap[1]} class="pc-door" />
  {/each}
  {#each venue.landmarks as l (l.id)}
    {@const p = at(l)}
    <g
      data-lm={l.id}
      data-grab={canDrag(l.id) ? '' : undefined}
      class="pc-lm"
      class:sel={l.id === selected}
      class:bad={unreachable.includes(l.id)}
      class:door={isDoor(venue, l.id)}
      onpointerdown={(e) => downLandmark(e, l.id)}
      onpointermove={moveLandmark}
      onpointerup={upLandmark}
      role="button"
      tabindex="-1"
      aria-label={l.en || l.id}
      onkeydown={(e) => e.key === 'Enter' && onSelect(l.id)}
    >
      <circle cx={p[0]} cy={p[1]} r="20" />
      <text x={p[0]} y={p[1] + 7}>{PLACE_GLYPH[l.group]}</text>
    </g>
  {/each}
  {#each pins as pin, k (pin.id)}
    <g class="pc-pin"><circle cx={pin.x} cy={pin.y} r="18" /><text x={pin.x} y={pin.y + 7}>{k + 1}</text></g>
  {/each}
  {#if pending}
    <circle cx={pending[0]} cy={pending[1]} r="18" class="pc-pending" />
  {/if}
</svg>
