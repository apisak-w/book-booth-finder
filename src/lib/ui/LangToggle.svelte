<script lang="ts">
  import { lang, setLang } from '$lib/i18n/lang.svelte';
  import { STRINGS, type Lang } from '$lib/i18n/strings';
  const options: [Lang, string][] = [['th', 'ไทย'], ['en', 'EN']];
</script>

<div class="lang" role="group" aria-label={STRINGS[lang.current].language}>
  {#each options as [l, label] (l)}
    <button type="button" aria-pressed={lang.current === l} onclick={() => setLang(l)}>{label}</button>
  {/each}
</div>
