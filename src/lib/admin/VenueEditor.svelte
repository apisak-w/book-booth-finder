<script lang="ts">
  import { onMount } from 'svelte';
  import type { Venue } from '$lib/core/types';
  import { unreachableLandmarks } from '$lib/core/venueChecks';
  import {
    addLandmark,
    deleteLandmark,
    diffVenue,
    isDoor,
    moveLandmark,
    setEntrance,
    updateLandmark,
  } from '$lib/core/venueEdit';
  import { store } from '$lib/storage';
  import { getVenue, referenceUrl, saveVenue, type VenueDoc } from './api';
  import { clearDraft, isStale, push, readDraft, redo, start, undo, writeDraft, type History } from './history';
  import LandmarkPanel from './LandmarkPanel.svelte';
  import PlanCanvas from './PlanCanvas.svelte';
  import SaveDialog from './SaveDialog.svelte';

  let {
    id,
    onClose,
    onSaved,
  }: { id: string; mode: 'select' | 'pins'; onClose: () => void; onSaved: (message: string, link: string) => void } =
    $props();

  let doc = $state<VenueDoc | null>(null);
  let hist = $state<History<Venue> | null>(null);
  let tool = $state<'select' | 'add'>('select');
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
  const unnamed = $derived(venue ? venue.landmarks.filter((l) => !l.th.trim() || !l.en.trim()).map((l) => l.id) : []);
  const problems = $derived([
    ...unreachable.map((x) => `${x} can't be reached on foot from the starting point`),
    ...unnamed.map((x) => `${x} needs a name in Thai and English`),
  ]);
  const lm = $derived(venue?.landmarks.find((l) => l.id === selected) ?? null);
  const taken = $derived(doc ? doc.events.flatMap((e) => e.ids) : []);

  function apply(next: Venue) {
    if (!hist || !doc) return;
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
    if (readonly || !hist || (e.target as HTMLElement).closest('input, select, textarea')) return;
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
        {#if doc.pr}Continuing <a href={doc.pr} target="_blank" rel="noopener">the open pull request</a>{:else}Editing main{/if}
      </span>
    {/if}
    {#if !readonly && hist}
      <button type="button" class="btn" aria-pressed={tool === 'select'} onclick={() => (tool = 'select')}>Select</button>
      <button type="button" class="btn" aria-pressed={tool === 'add'} onclick={() => (tool = 'add')}>Add landmark</button>
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
    <div class="editor-body">
      <div class="editor-plan">
        <PlanCanvas
          {venue}
          refUrl={referenceUrl(id)}
          {opacity}
          mode={tool}
          {selected}
          pins={venue.geo?.pins ?? []}
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
        />
        <label class="editor-opacity">Printed plan <input type="range" min="0" max="1" step="0.05" bind:value={opacity} /></label>
      </div>
      <aside class="editor-side">
        {#if lm}
          <LandmarkPanel
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
