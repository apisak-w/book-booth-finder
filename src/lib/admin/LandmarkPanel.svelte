<script lang="ts">
  import { GROUP_ORDER, ICON_NAMES, type Landmark, type Venue } from '$lib/core/types';
  import { DEFAULT_ICON, deleteBlockers, isDoor } from '$lib/core/venueEdit';
  import type { EventRef } from '$lib/core/venueChecks';

  let {
    venue,
    lm,
    events,
    readonly,
    onUpdate,
    onDelete,
    onEntrance,
  }: {
    venue: Venue;
    lm: Landmark;
    events: EventRef[];
    readonly: boolean;
    onUpdate: (patch: Partial<Pick<Landmark, 'th' | 'en' | 'group' | 'icon'>>) => void;
    onDelete: () => void;
    onEntrance: (on: boolean) => void;
  } = $props();
  const TYPE_NAME = { entry: 'Entrance', wc: 'Toilets', info: 'Information', charge: 'Charging', stage: 'Stage', other: 'Other' };
  const blockers = $derived(deleteBlockers(venue, lm.id, events));
  const entrance = $derived(!!venue.geo?.entrances.includes(lm.id));
</script>

<div class="lm-panel">
  <div class="lm-head"><b>{lm.en || 'New landmark'}</b><span>{lm.id}</span></div>
  <label>Name in Thai <input value={lm.th} disabled={readonly} onchange={(e) => onUpdate({ th: e.currentTarget.value })} /></label>
  <label>Name in English <input value={lm.en} disabled={readonly} onchange={(e) => onUpdate({ en: e.currentTarget.value })} /></label>
  <label
    >Type
    <select
      value={lm.group}
      disabled={readonly}
      onchange={(e) => {
        const group = e.currentTarget.value as Landmark['group'];
        onUpdate(lm.icon === DEFAULT_ICON[lm.group] ? { group, icon: DEFAULT_ICON[group] } : { group });
      }}
    >
      {#each GROUP_ORDER as g (g)}<option value={g}>{TYPE_NAME[g]}</option>{/each}
    </select>
  </label>
  <label
    >Icon
    <select value={lm.icon} disabled={readonly} onchange={(e) => onUpdate({ icon: e.currentTarget.value as Landmark['icon'] })}>
      {#each ICON_NAMES as i (i)}<option value={i}>{i}</option>{/each}
    </select>
  </label>
  <label class="lm-check"
    ><input type="checkbox" checked={entrance} disabled={readonly || !venue.geo} onchange={(e) => onEntrance(e.currentTarget.checked)} /> Street
    entrance</label
  >
  {#if !venue.geo}<span class="lm-note">Add map pins first to choose street entrances.</span>{/if}
  <span class="lm-note">Plan {lm.x}, {lm.y}{isDoor(venue, lm.id) ? ' · Position is part of the floor plan' : ' · drag to move'}</span>
  {#if !readonly}
    {#if blockers.length}
      <span class="lm-note">Can't delete: {blockers.join('; ')}.</span>
    {:else}
      <button type="button" class="btn" onclick={onDelete}>Delete landmark</button>
    {/if}
  {/if}
</div>
