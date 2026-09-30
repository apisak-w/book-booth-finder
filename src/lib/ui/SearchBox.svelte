<script lang="ts">
  let {
    value = $bindable(),
    label,
    placeholder,
    clearLabel,
    onInput,
    onEnter,
  }: { value: string; label: string; placeholder: string; clearLabel: string; onInput: () => void; onEnter: () => void } = $props();
  let input: HTMLInputElement;
</script>

<div class="search">
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
  <label class="sr" for="q">{label}</label>
  <input
    bind:this={input}
    bind:value
    id="q"
    type="search"
    autocomplete="off"
    autocapitalize="characters"
    spellcheck="false"
    enterkeyhint="search"
    {placeholder}
    oninput={onInput}
    onkeydown={(e) => { if (e.key === 'Enter') onEnter(); }}
  />
  {#if value.trim()}
    <button type="button" class="iconbtn" aria-label={clearLabel} title={clearLabel} onclick={() => { value = ''; input.focus(); }}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
    </button>
  {/if}
</div>
