<script lang="ts">
  import { KEEP } from '$lib/i18n/keep';
  import { STRINGS } from '$lib/i18n/strings';
  import { lang } from '$lib/i18n/lang.svelte';
  import Header from '$lib/ui/Header.svelte';
  const k = $derived(KEEP[lang.current]);
  const s = $derived(STRINGS[lang.current]);
</script>

<svelte:head>
  <title>{k.title} · {s.title}</title>
  <meta name="theme-color" content="#13306B" />
</svelte:head>

<div class="page">
  <Header title={s.title} subtitle={k.title} backHref="/" backLabel={s.allEvents} />
  <main class="keep">
    <h1>{k.title}</h1>
    <p>{k.intro}</p>
    {#each k.sections as sec (sec.h)}
      <h2>{sec.h}</h2>
      <p>{sec.p}</p>
    {/each}
  </main>
</div>
