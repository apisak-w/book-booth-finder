<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { georef, planToLatLng } from '$lib/core/geo';
  import type { LatLng, Point, Venue } from '$lib/core/types';
  import { draftProblems, unreachableLandmarks } from '$lib/core/venueChecks';
  import {
    addLandmark,
    deleteLandmark,
    diffVenue,
    isDoor,
    moveLandmark,
    nextPinId,
    removePin,
    setPin,
    setEntrance,
    updateLandmark,
  } from '$lib/core/venueEdit';
  import { store } from '$lib/storage';
  import { getVenue, referenceUrl, saveVenue, type VenueDoc } from './api';
  import { clearDraft, isStale, push, readDraft, redo, start, undo, writeDraft, type History } from './history';
  import LandmarkPanel from './LandmarkPanel.svelte';
  import PlanCanvas from './PlanCanvas.svelte';
  import PinPanel from './PinPanel.svelte';
  import StreetPicker from './StreetPicker.svelte';
  import { parseLatLng } from './osm';
  import SaveDialog from './SaveDialog.svelte';

  let {
    id,
    mode,
    onClose,
    onSaved,
  }: { id: string; mode: 'select' | 'pins'; onClose: () => void; onSaved: (message: string, link: string) => void } =
    $props();

  let doc = $state<VenueDoc | null>(null);
  let hist = $state<History<Venue> | null>(null);
  let tool = $state<'select' | 'add' | 'pins'>(untrack(() => mode));
  let selectedPin = $state<string | null>(null);
  let pending = $state<Point | null>(null);
  let found = $state<LatLng | null>(null);
  let findText = $state('');
  let selected = $state<string | null>(null);
  let opacity = $state(0.6);
  let note = $state('');
  let staleDraft = $state(false);
  let error = $state('');
  let saving = $state(false);
  let confirming = $state(false);
  let readonly = $state(false);

  const venue = $derived(hist?.present ?? null);
  const changes = $derived(doc && venue ? diffVenue(doc.venue, venue) : []);
  const unreachable = $derived(venue ? unreachableLandmarks(venue) : []);
  const problems = $derived([
    ...unreachable.map((x) => `${x} can't be reached on foot from the starting point`),
    ...(venue ? draftProblems(venue) : []),
  ]);
  const lm = $derived(venue?.landmarks.find((l) => l.id === selected) ?? null);
  const taken = $derived(doc ? [...doc.events.flatMap((e) => e.ids), ...doc.venue.landmarks.map((l) => l.id)] : []);

  const center = $derived.by((): LatLng | null => {
    const pins = venue?.geo?.pins ?? [];
    if (venue && pins.length >= 3) {
      const v = venue.view;
      return planToLatLng(georef(pins), [v.x + v.w / 2, v.y + v.h / 2]);
    }
    if (pins.length) return { lat: pins[0].lat, lng: pins[0].lng };
    return found;
  });

  function placeOnWorld(ll: LatLng) {
    if (!venue) return;
    if (pending) {
      const pinId = nextPinId(venue);
      apply(setPin(venue, { id: pinId, x: pending[0], y: pending[1], lat: ll.lat, lng: ll.lng }));
      pending = null;
      selectedPin = pinId;
    } else if (selectedPin) {
      const p = venue.geo?.pins.find((q) => q.id === selectedPin);
      if (p) apply(setPin(venue, { ...p, lat: ll.lat, lng: ll.lng }));
    }
  }
  function placeOnPlan(x: number, y: number) {
    if (!venue) return;
    const p = selectedPin ? venue.geo?.pins.find((q) => q.id === selectedPin) : null;
    if (p) apply(setPin(venue, { ...p, x, y }));
    else pending = [x, y];
  }
  function findVenue() {
    found = parseLatLng(findText);
    if (!found) error = 'Paste two numbers, latitude then longitude.';
  }
  function useMyLocation() {
    navigator.geolocation?.getCurrentPosition(
      (p) => (found = { lat: p.coords.latitude, lng: p.coords.longitude }),
      () => (error = "Couldn't get this device's location. Paste the venue's coordinates instead."),
    );
  }
  function apply(next: Venue) {
    if (!hist || !doc) return;
    staleDraft = false;
    hist = push(hist, next);
    writeDraft(store, id, { venue: next, sha: doc.sha, ref: doc.ref, at: new Date().toISOString() });
    error = '';
  }
  function tryApply(fn: () => Venue) {
    try {
      apply(fn());
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
  }
  function step(h: History<Venue>) {
    if (!doc) return;
    staleDraft = false;
    hist = h;
    writeDraft(store, id, { venue: h.present, sha: doc.sha, ref: doc.ref, at: new Date().toISOString() });
  }
  function discard() {
    if (!doc) return;
    clearDraft(store, id);
    hist = start(doc.venue);
    note = '';
    staleDraft = false;
    selected = null;
  }
  async function load() {
    const d = await getVenue(id);
    doc = d;
    hist = start(d.venue);
    const draft = readDraft(store, id);
    if (draft && isStale(draft, d.sha)) staleDraft = true;
    else if (draft) {
      hist = push(hist, draft.venue);
      note = `Restored unsaved changes from ${new Date(draft.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    }
  }
  async function save() {
    if (!doc || !venue) return;
    saving = true;
    try {
      const r = await saveVenue(id, venue, doc.sha);
      clearDraft(store, id);
      confirming = false;
      note = '';
      onSaved('Saved. Check the preview on the pull request, then merge.', r.pr);
      await load();
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
      confirming = false;
    } finally {
      saving = false;
    }
  }
  function onKey(e: KeyboardEvent) {
    if (readonly || confirming || !hist || (e.target as HTMLElement).closest('input, select, textarea')) return;
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      step(e.shiftKey ? redo(hist) : undo(hist));
      return;
    }
    const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    if (d && lm && venue && !isDoor(venue, lm.id)) {
      e.preventDefault();
      const k = e.shiftKey ? 10 : 1;
      apply(moveLandmark(venue, lm.id, lm.x + d[0] * k, lm.y + d[1] * k));
    }
  }

  onMount(() => {
    readonly = matchMedia('(max-width: 699px)').matches;
    load().catch((e) => (error = e instanceof Error ? e.message : String(e)));
  });
</script>

<svelte:window onkeydown={onKey} />

<section class="editor" aria-label="Venue editor">
  <div class="editor-bar">
    <button type="button" class="btn" onclick={onClose}>All venues</button>
    <b>{venue?.name.en ?? id}</b>
    {#if doc}
      <span class="editor-ref">
        {#if doc.pr}Continuing pull request #{doc.pr.match(/\/pull\/(\d+)/)?.[1] ?? ''} · <a href={doc.pr} target="_blank" rel="noopener">View pull request</a>{:else}Editing main{/if}
      </span>
    {/if}
    {#if !readonly && hist}
      <button type="button" class="btn" aria-pressed={tool === 'select'} onclick={() => { tool = 'select'; pending = null; selectedPin = null; }}>Select</button>
      <button type="button" class="btn" aria-pressed={tool === 'add'} onclick={() => { tool = 'add'; pending = null; selectedPin = null; }}>Add landmark</button>
      <button type="button" class="btn" aria-pressed={tool === 'pins'} onclick={() => { tool = 'pins'; selected = null; }}>Map pins</button>
      <button type="button" class="btn" disabled={!hist.past.length} onclick={() => hist && step(undo(hist))}>Undo</button>
      <button type="button" class="btn" disabled={!hist.future.length} onclick={() => hist && step(redo(hist))}>Redo</button>
      <button type="button" class="btn" disabled={!changes.length} onclick={discard}>Discard changes</button>
      <button type="button" class="btn primary" disabled={!changes.length || problems.length > 0 || saving} onclick={() => (confirming = true)}>Save</button>
    {/if}
  </div>
  {#if readonly}<p class="editor-note">Edit on a larger screen. Placing points needs a mouse or trackpad.</p>{/if}
  {#if note}<p class="editor-note">{note}</p>{/if}
  {#if staleDraft}
    <p class="editor-note">
      The venue changed since your unsaved changes were made. <button type="button" class="linkish" onclick={discard}>Discard the old changes</button>
    </p>
  {/if}
  {#if error}<p class="editor-error" role="alert">{error}</p>{/if}
  {#if problems.length && !readonly}
    <ul class="editor-problems">{#each problems as p (p)}<li>{p}</li>{/each}</ul>
  {/if}
  {#if venue && doc}
    <div class="editor-body" class:pins={tool === 'pins'}>
      <div class="editor-plan">
        <PlanCanvas
          {venue}
          refUrl={referenceUrl(id)}
          {opacity}
          mode={tool}
          {selected}
          pins={venue.geo?.pins ?? []}
          {pending}
          {unreachable}
          {readonly}
          onSelect={(x) => (selected = x)}
          onMove={(x, px, py) => tryApply(() => moveLandmark(venue, x, px, py))}
          onAdd={(px, py) => {
            const r = addLandmark(venue, { group: 'wc', icon: 'wc', th: '', en: '', x: px, y: py }, taken);
            apply(r.venue);
            selected = r.id;
            tool = 'select';
          }}
          onPlanPoint={placeOnPlan}
        />
        <label class="editor-opacity">Printed plan <input type="range" min="0" max="1" step="0.05" bind:value={opacity} /></label>
      </div>
      {#if tool === 'pins'}
        <div class="editor-street">
          {#if center}
            <StreetPicker {center} pins={venue.geo?.pins ?? []} onPick={placeOnWorld} />
          {:else}
            <div class="find-venue">
              <b>Find the venue on the street map</b>
              <label>Paste the venue's coordinates <input bind:value={findText} placeholder="13.72361, 100.55972" /></label>
              <button type="button" class="btn primary" onclick={findVenue}>Show on the street map</button>
              <button type="button" class="btn" onclick={useMyLocation}>Use this device's location</button>
              <span class="lm-note">In Google Maps, right-click the venue and copy the numbers.</span>
            </div>
          {/if}
        </div>
      {/if}
      <aside class="editor-side">
        {#if tool === 'pins'}
          <PinPanel
            {venue}
            {selectedPin}
            {pending}
            {readonly}
            onSelectPin={(x) => {
              selectedPin = selectedPin === x ? null : x;
              pending = null;
            }}
            onPaste={placeOnWorld}
            onRemove={(x) => {
              apply(removePin(venue, x));
              if (selectedPin === x) selectedPin = null;
            }}
            onEntrance={(x, on) => tryApply(() => setEntrance(venue, x, on))}
          />
        {:else if lm}
          <LandmarkPanel
            base={doc.venue}
            {venue}
            {lm}
            events={doc.events}
            {readonly}
            onUpdate={(patch) => tryApply(() => updateLandmark(venue, lm.id, patch))}
            onDelete={() => {
              tryApply(() => deleteLandmark(venue, lm.id, doc!.events));
              selected = null;
            }}
            onEntrance={(on) => tryApply(() => setEntrance(venue, lm.id, on))}
          />
        {:else}
          <p class="lm-note">Select a landmark on the plan, or use Add landmark.</p>
        {/if}
      </aside>
    </div>

  {/if}
  {#if confirming && doc}
    <SaveDialog {changes} pr={doc.pr} busy={saving} onCancel={() => (confirming = false)} onSave={save} />
  {/if}
</section>
