<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { replaceState } from '$app/navigation';
  import { loadData } from '$lib/core/prepare';
  import { createSearch, type SearchItem } from '$lib/core/search';
  import { parseHash, formatHash } from '$lib/core/hash';
  import { boxAround } from '$lib/core/panzoom';
  import { georef } from '$lib/core/geo';
  import { classify, hallChoices, hallStart } from '$lib/core/locate';
  import { headingFrom, smoothAngle, turnAngle } from '$lib/core/compass';
  import { WALK_M_PER_MIN } from '$lib/core/types';
  import type { Booth, Dest, Landmark, Point, Surroundings } from '$lib/core/types';
  import { STRINGS, fmtRange, nameIn, textFor } from '$lib/i18n/strings';
  import { eventStatus } from '$lib/core/status';
  import { lang } from '$lib/i18n/lang.svelte';
  import { store } from '$lib/storage';
  import { Finder } from '$lib/ui/finder.svelte';
  import { Locator } from '$lib/ui/locator.svelte';
  import type { LocView } from '$lib/ui/locate';
  import { TILE_CREDIT, TILE_URL } from '$lib/map/tileConfig';
  import type { CompassView, StreetView, Turn, YouMark } from '$lib/map/street';
  import Header from '$lib/ui/Header.svelte';
  import FloorMap from '$lib/map/FloorMap.svelte';
  import Sheet from '$lib/ui/Sheet.svelte';
  import SearchBox from '$lib/ui/SearchBox.svelte';
  import Results from '$lib/ui/Results.svelte';
  import IdleView from '$lib/ui/IdleView.svelte';
  import ResultCard from '$lib/ui/ResultCard.svelte';
  import Toast from '$lib/ui/Toast.svelte';
  import MapBanner from '$lib/ui/MapBanner.svelte';

  import type { EventBundle } from '$lib/core/types';

  let { bundle }: { bundle: EventBundle } = $props();
  const data = untrack(() => loadData(bundle));
  const f = new Finder(data);
  const search = createSearch(data);
  const FROM_KEY = `bf:${data.event.id}:from`;
  const geo = data.venue.geo ? georef(data.venue.geo.pins) : null;
  const loc = new Locator();

  let map: FloorMap;
  let toast = $state({ message: '', show: false });
  let toastTimer: ReturnType<typeof setTimeout>;
  let isPast = $state(false);
  let surroundings = $state<Surroundings | null>(null);
  let hall = $state<{ guess: string | null } | null>(null);
  let farKm = $state<number | null>(null);
  let banner = $state('');
  let bannerTimer: ReturnType<typeof setTimeout>;
  let framed = '';
  let turning = $state(false);
  let heading = $state<number | null>(null);

  const s = $derived(STRINGS[lang.current]);
  const nameOf = $derived(nameIn(lang.current));
  const notice = $derived(isPast ? s.ended(fmtRange(data.event.dates.end, data.event.dates.end, lang.current)) : '');
  const results = $derived(f.query.trim() ? search(f.query) : []);

  const where = $derived(geo && loc.fix ? classify(loc.fix, data, geo, f.dest ? f.entranceMeters(f.dest) : null) : null);
  const outside = $derived(where?.kind === 'outside' ? where : null);
  const street: StreetView | null = $derived(geo && outside ? { geo, surroundings, tileUrl: TILE_URL, credit: TILE_CREDIT } : null);
  const you: YouMark | null = $derived(
    outside ? { p: outside.p, accPx: outside.accuracyPx, leg: [outside.entrance.x, outside.entrance.y] } : null,
  );
  const turn: Turn | null = $derived(
    geo && turning && heading !== null && outside ? { deg: turnAngle(geo.northDeg, heading), cx: outside.p[0], cy: outside.p[1] } : null,
  );
  const compass: CompassView | null = $derived(
    geo && outside ? { on: turning, northDeg: geo.northDeg, toggle: () => (turning ? stopTurning() : startTurning()) } : null,
  );
  const locView: LocView | null = $derived(
    geo
      ? {
          state: loc.state,
          weak: where?.kind === 'weak',
          farKm,
          outside: outside
            ? {
                entrance: outside.entrance,
                meters: outside.meters,
                minutes: Math.max(1, Math.round(outside.meters / WALK_M_PER_MIN)),
                inside: f.routeOk?.meters ?? null,
              }
            : null,
          hall: hall ? { choices: hallChoices(data.venue, hall.guess), guess: hall.guess } : null,
          onStart: startLocating,
          onStop: () => stopLocating(true),
          onInside: () => outside && handOff(outside.entrance),
          onHall: pickHall,
          onList: () => {
            hall = null;
            document.getElementById('from')?.focus();
          },
        }
      : null,
  );

  $effect(() => {
    const w = where;
    if (!w) return;
    untrack(() => {
      if (w.kind === 'arrived') handOff(w.entrance);
      else if (w.kind === 'inside') {
        stopLocating(true);
        hall = { guess: w.hall };
      } else if (w.kind === 'far') {
        stopLocating(true);
        farKm = Math.round(w.meters / 100) / 10;
      } else if (w.kind === 'outside') {
        if (f.fromId !== w.entrance.id) f.fromId = w.entrance.id;
        const key = `${w.entrance.id}:${f.dest?.kind === 'booth' ? f.dest.b.i : (f.dest?.lm.id ?? '')}`;
        if (framed !== key) {
          framed = key;
          const pts: Point[] = [w.p, [w.entrance.x, w.entrance.y], ...(f.routeOk?.P ?? [])];
          const b = boxAround(pts);
          map.setBounds({ x: b[0] - 300, y: b[1] - 300, w: b[2] - b[0] + 600, h: b[3] - b[1] + 600 });
          map.frameBox(b, 80);
        }
      }
    });
  });

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
    if (loc.state === 'on' || loc.state === 'asking') stopLocating(false);
    hall = null;
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
  function showBanner(message: string) {
    banner = message;
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => (banner = ''), 5000);
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

  function startLocating() {
    farKm = null;
    hall = null;
    loc.start();
    if (!surroundings)
      fetch(`/v/${data.venue.id}/surroundings.json`)
        .then((r) => (r.ok ? r.json() : null))
        .then((v: Surroundings | null) => (surroundings = v))
        .catch(() => (surroundings = null));
  }
  function stopLocating(restore: boolean) {
    loc.stop();
    stopTurning();
    framed = '';
    map.setBounds(null);
    if (restore) {
      const saved = store.get(FROM_KEY);
      f.fromId = saved && data.landmarkById[saved] ? saved : '';
      map.frame(f.dest, f.routeOk);
    }
  }
  function handOff(lm: Landmark) {
    setFrom(lm.id);
    showBanner(s.arrived(nameOf(lm)));
  }
  function pickHall(id: string) {
    const start = hallStart(data, id);
    hall = null;
    if (start) setFrom(start);
  }

  const onOrient = (e: DeviceOrientationEvent) => {
    const ios = (e as DeviceOrientationEvent & { webkitCompassHeading?: number }).webkitCompassHeading;
    const h = headingFrom(
      { webkitCompassHeading: ios, alpha: e.alpha, absolute: e.absolute || e.type === 'deviceorientationabsolute' },
      screen.orientation?.angle ?? 0,
    );
    if (h !== null) heading = smoothAngle(heading, h);
  };
  async function startTurning() {
    const DOE = globalThis.DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> } | undefined;
    if (!DOE) return showToast(s.compassOff);
    try {
      if (DOE.requestPermission && (await DOE.requestPermission()) !== 'granted') return showToast(s.compassOff);
    } catch {
      return showToast(s.compassOff);
    }
    heading = null;
    turning = true;
    addEventListener('deviceorientationabsolute', onOrient as EventListener);
    addEventListener('deviceorientation', onOrient);
  }
  function stopTurning() {
    turning = false;
    heading = null;
    removeEventListener('deviceorientationabsolute', onOrient as EventListener);
    removeEventListener('deviceorientation', onOrient);
  }

  onMount(() => {
    isPast = eventStatus(data.event.dates, data.venue.timezone) === 'past';
    const stored = store.get(FROM_KEY);
    if (stored && data.landmarkById[stored]) f.fromId = stored;
    requestAnimationFrame(() => {
      map.fitAll();
      if (readHash()) map.frame(f.dest, f.routeOk);
    });
    const onHash = () => { if (readHash()) map.frame(f.dest, f.routeOk); };
    addEventListener('hashchange', onHash);
    return () => {
      removeEventListener('hashchange', onHash);
      loc.stop();
      stopTurning();
    };
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
    {street}
    {you}
    {turn}
    {compass}
    onUserPan={() => turning && stopTurning()}
    onSelectBooth={selectBooth}
    onSelectPlace={selectPlace}
    onFit={() => (f.dest ? map.frame(f.dest, f.routeOk) : map.fitAll(true))}
  >
    <MapBanner message={banner} />
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
      <ResultCard {data} lang={lang.current} dest={f.dest} fromId={f.fromId} route={f.route} loc={locView} onFrom={setFrom} onClear={clearRoute} onShare={share} />
    {:else}
      <IdleView {data} lang={lang.current} {notice} onPick={(kind, id) => (kind === 'booth' ? selectBooth(data.byCode[id][0]) : selectPlace(data.landmarkById[id]))} />
    {/if}
  </Sheet>
</div>
