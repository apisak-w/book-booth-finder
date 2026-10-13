<script lang="ts">
  let {
    changes,
    pr,
    busy,
    onCancel,
    onSave,
  }: { changes: string[]; pr: string | null; busy: boolean; onCancel: () => void; onSave: () => void } = $props();
</script>

<div class="save-scrim">
  <div class="save-dialog" role="dialog" aria-modal="true" aria-labelledby="save-t">
    <h2 id="save-t">{pr ? 'Add to the open pull request' : 'Open a pull request'}</h2>
    <ul>
      {#each changes as c (c)}<li>{c}</li>{/each}
    </ul>
    <div class="save-btns">
      <button type="button" class="btn" disabled={busy} onclick={onCancel}>Cancel</button>
      <button type="button" class="btn primary" disabled={busy} onclick={onSave}>{busy ? 'Saving…' : 'Save to pull request'}</button>
    </div>
  </div>
</div>
