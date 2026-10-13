<script lang="ts">
  import Admin from '$lib/admin/Admin.svelte';
  let { data } = $props();
</script>

<svelte:head>
  <title>Booth finder admin</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<Admin venues={data.venues} />
