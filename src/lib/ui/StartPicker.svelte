<script lang="ts">
  import { GROUP_ORDER, type EventData } from '$lib/core/types';
  import { STRINGS, nameIn, type Lang } from '$lib/i18n/strings';
  let { data, lang, value, onChange }: { data: EventData; lang: Lang; value: string; onChange: (id: string) => void } = $props();
  const s = $derived(STRINGS[lang]);
  const nameOf = $derived(nameIn(lang));
  const groups = $derived(GROUP_ORDER.map((g) => [g, data.landmarks.filter((l) => l.group === g)] as const).filter(([, l]) => l.length));
</script>

<div class="from">
  <label for="from">{s.from}</label>
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
