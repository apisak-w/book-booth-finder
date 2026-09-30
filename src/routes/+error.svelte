<script lang="ts">
  import { page } from '$app/state';
  import { STRINGS } from '$lib/i18n/strings';
  import { lang } from '$lib/i18n/lang.svelte';
  import Header from '$lib/ui/Header.svelte';
  const s = $derived(STRINGS[lang.current]);
</script>

<div class="page">
  <Header title={s.title} backHref="/" backLabel={s.allEvents} />
  <main class="events">
    <p class="notice">{page.status === 404 ? s.notFound : page.error?.message}</p>
    <a class="event-card" href="/"><b>{s.allEvents}</b></a>
  </main>
</div>
