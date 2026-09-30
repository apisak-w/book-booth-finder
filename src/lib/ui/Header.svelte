<script lang="ts">
  import LangToggle from './LangToggle.svelte';
  let { title, subtitle = '', backHref = '', backLabel = '' }: { title: string; subtitle?: string; backHref?: string; backLabel?: string } = $props();
</script>

<header>
  {#if backHref}
    <a class="back" href={backHref} aria-label={backLabel} title={backLabel}>‹</a>
  {/if}
  <div class="brand">
    <b>{title}</b>
    {#if subtitle}<span>{subtitle}</span>{/if}
  </div>
  <LangToggle />
</header>
