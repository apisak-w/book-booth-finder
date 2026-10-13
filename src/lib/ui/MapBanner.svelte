<script lang="ts">
  let { message }: { message: string } = $props();
</script>

{#if message}
  <div class="mapbanner" role="status">{message}</div>
{/if}
