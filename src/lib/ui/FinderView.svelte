<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { replaceState } from '$app/navigation';
  import { loadData } from '$lib/core/prepare';
  import { createSearch, type SearchItem } from '$lib/core/search';
  import { parseHash, formatHash } from '$lib/core/hash';
  import type { Booth, Dest, Landmark } from '$lib/core/types';
  import { STRINGS, nameIn, textFor } from '$lib/i18n/strings';
  import { lang } from '$lib/i18n/lang.svelte';
  import { store } from '$lib/storage';
  import { Finder } from '$lib/ui/finder.svelte';
  import Header from '$lib/ui/Header.svelte';
  import FloorMap from '$lib/map/FloorMap.svelte';
  import Sheet from '$lib/ui/Sheet.svelte';
  import SearchBox from '$lib/ui/SearchBox.svelte';
  import Results from '$lib/ui/Results.svelte';
  import IdleView from '$lib/ui/IdleView.svelte';
  import ResultCard from '$lib/ui/ResultCard.svelte';
  import Toast from '$lib/ui/Toast.svelte';

  import type { EventBundle } from '$lib/server/catalog';

  let { bundle }: { bundle: EventBundle } = $props();
  const data = untrack(() => loadData(bundle));
  const f = new Finder(data);
  const search = createSearch(data);
  const FROM_KEY = `bf:${data.event.id}:from`;

  let map: FloorMap;
  let toast = $state({ message: '', show: false });
  let toastTimer: ReturnType<typeof setTimeout>;
  let notice = $state('');

  const s = $derived(STRINGS[lang.current]);
  const nameOf = $derived(nameIn(lang.current));
  const results = $derived(f.query.trim() ? search(f.query) : []);

  function writeHash() {
    try {
      replaceState(`#${formatHash(f.dest, f.fromId, data)}`, {});
    } catch {
      return;
    }
  }
  function select(dest: Dest) {
    f.dest = dest;
    f.sheetOpen = true;
    writeHash();
    map.frame(f.dest, f.routeOk);
  }
  const selectBooth = (b: Booth) => select({ kind: 'booth', b });
  const selectPlace = (lm: Landmark) => select({ kind: 'place', lm });
  function pick(it: SearchItem) {
    f.query = '';
    (document.activeElement as HTMLElement | null)?.blur();
    if (it.type === 'place') selectPlace(it.lm);
    else selectBooth(it.b);
  }
  function setFrom(id: string) {
    f.fromId = id;
    store.set(FROM_KEY, id);
    writeHash();
    map.frame(f.dest, f.routeOk);
  }
  function clearRoute() {
    f.dest = null;
    writeHash();
  }
  function showToast(message: string) {
    toast = { message, show: true };
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (toast = { ...toast, show: false }), 1800);
  }
  async function share() {
    try {
      await navigator.clipboard.writeText(location.href);
      showToast(s.copied);
    } catch {
      showToast(location.href);
    }
  }
  function readHash(): boolean {
    const { dest, fromId } = parseHash(location.hash, data);
    if (fromId) { f.fromId = fromId; store.set(FROM_KEY, fromId); }
    if (dest) f.dest = dest;
    return !!dest;
  }

  onMount(() => {
    const stored = store.get(FROM_KEY);
    if (stored && data.landmarkById[stored]) f.fromId = stored;
    requestAnimationFrame(() => {
      map.fitAll();
      if (readHash()) map.frame(f.dest, f.routeOk);
    });
    const onHash = () => { if (readHash()) map.frame(f.dest, f.routeOk); };
    addEventListener('hashchange', onHash);
    return () => removeEventListener('hashchange', onHash);
  });
</script>

<svelte:head>
  <title>{nameOf(data.event.name)} · {s.title}</title>
  <meta name="description" content="{nameOf(data.event.name)}, {nameOf(data.venue.name)}" />
  <meta name="theme-color" content="#13306B" />
</svelte:head>

<div class="app">
  <Header title={s.title} subtitle={data.event.subtitle ? nameOf(data.event.subtitle) : nameOf(data.event.name)} backHref="/" backLabel={s.allEvents} />
  <FloorMap
    bind:this={map}
    {data}
    dest={f.dest}
    route={f.routeOk}
    onSelectBooth={selectBooth}
    onSelectPlace={selectPlace}
    onFit={() => (f.dest ? map.frame(f.dest, f.routeOk) : map.fitAll(true))}
  >
    <Toast message={toast.message} show={toast.show} />
  </FloorMap>
  <Sheet open={f.sheetOpen} toggleLabel={f.sheetOpen ? s.hide : s.show} onToggle={() => (f.sheetOpen = !f.sheetOpen)}>
    {#snippet head()}
      <SearchBox
        bind:value={f.query}
        label={textFor(s, data.event, lang.current, 'searchLabel')}
        placeholder={textFor(s, data.event, lang.current, 'ph')}
        clearLabel={s.clearSearch}
        onInput={() => (f.sheetOpen = true)}
        onEnter={() => { if (results[0]) pick(results[0]); }}
      />
    {/snippet}
    {#if f.query.trim()}
      <Results items={results} query={f.query} {data} lang={lang.current} onPick={pick} />
    {:else if f.dest}
      <ResultCard {data} lang={lang.current} dest={f.dest} fromId={f.fromId} route={f.route} onFrom={setFrom} onClear={clearRoute} onShare={share} />
    {:else}
      <IdleView {data} lang={lang.current} {notice} onPick={(kind, id) => (kind === 'booth' ? selectBooth(data.byCode[id][0]) : selectPlace(data.landmarkById[id]))} />
    {/if}
  </Sheet>
</div>
