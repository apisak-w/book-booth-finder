<script lang="ts">
  import { GROUP_ORDER, type EventData } from '$lib/core/types';
  import { STRINGS, nameIn, type Lang } from '$lib/i18n/strings';
  import type { LocView } from './locate';
  let {
    data,
    lang,
    value,
    onChange,
    loc = null,
  }: { data: EventData; lang: Lang; value: string; onChange: (id: string) => void; loc?: LocView | null } = $props();
  const s = $derived(STRINGS[lang]);
  const nameOf = $derived(nameIn(lang));
  const groups = $derived(GROUP_ORDER.map((g) => [g, data.landmarks.filter((l) => l.group === g)] as const).filter(([, l]) => l.length));
  const active = $derived(loc?.state === 'on' || loc?.state === 'asking');
</script>

<div class="from">
  <label for="from">{s.from}</label>
  {#if loc}
    <button type="button" class="locbtn" aria-pressed={active} onclick={active ? loc.onStop : loc.onStart}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" /></svg>
      <span class="lt">
        <b>{loc.state === 'asking' ? s.locating : active ? s.stopLocating : s.useLocation}</b>
        {#if !active}<span>{s.useLocationHint}</span>{/if}
      </span>
    </button>
    {#if loc.state === 'denied'}<p class="hint" role="status">{s.locOff}</p>{/if}
    {#if loc.state === 'unavailable'}<p class="hint" role="status">{s.locUnavailable}</p>{/if}
    {#if loc.weak}<p class="hint" role="status">{s.locWeak}</p>{/if}
    {#if loc.farKm !== null}<p class="hint" role="status">{s.locFar(loc.farKm)}</p>{/if}
  {/if}
  <div class="selwrap">
    <select id="from" value={value} onchange={(e) => onChange(e.currentTarget.value)}>
      <option value="" disabled selected={!value}>{s.pickFrom}</option>
      {#each groups as [g, items] (g)}
        <optgroup label={s.groups[g]}>
          {#each items as l (l.id)}
            <option value={l.id} selected={l.id === value}>{nameOf(l)}</option>
          {/each}
        </optgroup>
      {/each}
    </select>
  </div>
</div>
