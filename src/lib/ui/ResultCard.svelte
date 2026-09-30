<script lang="ts">
  import type { Dest, EventData, RouteResult } from '$lib/core/types';
  import { isRouteOk } from '$lib/core/types';
  import { boothSub, cardTitle, exhibitorsAt, PLACE_GLYPH } from '$lib/core/describe';
  import { buildSteps } from '$lib/core/directions';
  import { STRINGS, nameIn, textFor, type Lang } from '$lib/i18n/strings';
  import StartPicker from './StartPicker.svelte';
  let {
    data, lang, dest, fromId, route, onFrom, onClear, onShare,
  }: {
    data: EventData; lang: Lang; dest: Dest; fromId: string; route: RouteResult | null;
    onFrom: (id: string) => void; onClear: () => void; onShare: () => void;
  } = $props();
  const s = $derived(STRINGS[lang]);
  const nameOf = $derived(nameIn(lang));
  const ex = $derived(dest.kind === 'booth' ? exhibitorsAt(data, dest.b.c) : []);
  const steps = $derived(isRouteOk(route) && fromId ? buildSteps(route, data.landmarkById[fromId], dest, data, lang) : []);
</script>

<div class="card">
  {#if dest.kind === 'booth'}
    {@const b = dest.b}
    <div class="ticket">
      <div class="bigcode c-{b.cat}" style:background={data.event.categories[b.cat].color}>{b.c}</div>
      <div class="tinfo"><div class="t1">{cardTitle(b, data, lang)}</div><div class="t2">{boothSub(b, data, lang)}</div></div>
    </div>
    {#if ex.length > 1}
      <h2 class="sec gap">{textFor(s, data.event, lang, 'exhibitors')}</h2>
      <ul class="exh">{#each ex as e, k (k)}<li>{nameOf(e)}</li>{/each}</ul>
    {/if}
  {:else}
    <div class="ticket">
      <div class="bigcode place">{PLACE_GLYPH[dest.lm.group]}</div>
      <div class="tinfo"><div class="t1">{nameOf(dest.lm)}</div><div class="t2">{s.groups[dest.lm.group]}</div></div>
    </div>
  {/if}

  <StartPicker {data} {lang} value={fromId} onChange={onFrom} />

  {#if !fromId}
    <p class="hint">{s.pickHint}</p>
  {:else if route && 'same' in route}
    <p class="hint">{s.same}</p>
  {:else if !isRouteOk(route)}
    <p class="hint">{s.noRoute}</p>
  {:else}
    <div class="summary"><span class="m">{route.meters} {s.meters}</span><span class="t">{s.min(route.minutes)}</span></div>
    <ol class="steps">{#each steps as step, k (k)}<li><span>{step}</span></li>{/each}</ol>
  {/if}

  <div class="actions">
    <button type="button" class="btn" onclick={onClear}>{s.clear}</button>
    <button type="button" class="btn" onclick={onShare}>{s.share}</button>
  </div>
</div>
