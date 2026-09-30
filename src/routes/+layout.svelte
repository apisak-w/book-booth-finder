<script lang="ts">
  import '$lib/styles/app.css';
  import { onMount } from 'svelte';
  import { initLang } from '$lib/i18n/lang.svelte';
  let { children } = $props();
  onMount(initLang);
</script>

{@render children()}
