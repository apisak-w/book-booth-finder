<script lang="ts">
  import { onMount } from 'svelte';
  import { createViewport, type Viewport } from '$lib/map/viewport';
  import { GROUP_ORDER, ICON_NAMES, type Point, type Rect } from '$lib/core/types';
  import { Review, type Mode } from './review.svelte';

  const r = new Review(new URLSearchParams(location.search).get('id') ?? '');
  let svg: SVGSVGElement;
  let vp: Viewport | null = null;
  let drag = $state<{ a: Point; b: Point } | null>(null);
  const COLOURS = { code: '#2E9E5B', read: '#7FC98F', flagged: '#F2A900', missing: '#D64545', pillar: '#2F7FD1', drop: '#888' };
  const MODES: [Mode, string][] = [['select', 'Select'], ['booth', 'Add booth'], ['stage', 'Stage'], ['info', 'Info desk'], ['other', 'Other obstacle'], ['foyer', 'Foyer zone'], ['landmark', 'Landmark'], ['register', 'Register']];

  const toMap = (e: PointerEvent): Point => {
    const p = svg.createSVGPoint();
    p.x = e.clientX; p.y = e.clientY;
    const q = p.matrixTransform(svg.getScreenCTM()!.inverse());
    return [q.x, q.y];
  };
  const rectOf = (d: { a: Point; b: Point }): Rect => ({
    x: Math.round(Math.min(d.a[0], d.b[0])), y: Math.round(Math.min(d.a[1], d.b[1])),
    w: Math.round(Math.abs(d.a[0] - d.b[0])), h: Math.round(Math.abs(d.a[1] - d.b[1])),
  });
  function down(e: PointerEvent) {
    e.stopPropagation();
    const p = toMap(e);
    if (r.mode === 'landmark') r.addLandmark(p);
    else if (r.mode === 'register') r.registerClick(p);
    else drag = { a: p, b: p };
  }
  function move(e: PointerEvent) { if (drag) { e.stopPropagation(); drag = { ...drag, b: toMap(e) }; } }
  function up(e: PointerEvent) {
    if (!drag) return;
    e.stopPropagation();
    const rect = rectOf(drag);
    drag = null;
    if (rect.w > 4 && rect.h > 4) r.addRect(rect);
  }

  onMount(() => {
    r.load().then(() => {
      if (!r.data) return;
      vp = createViewport(svg, r.data.venue, (target) => {
        const k = target?.closest('[data-cell]')?.getAttribute('data-cell');
        const a = target?.closest('[data-add]')?.getAttribute('data-add');
        if (k) r.selection = { kind: 'cell', index: Number(k) };
        else if (a) r.selection = { kind: 'add', index: Number(a) };
      });
      vp.fitAll();
    });
    const key = (e: KeyboardEvent) => { if (e.key === 'n' && !(e.target instanceof HTMLInputElement)) r.nextProblem(); };
    addEventListener('keydown', key);
    return () => { removeEventListener('keydown', key); vp?.destroy(); };
  });

  const sel = $derived(r.selection);
  const landmarks = $derived(r.corrections.event?.landmarks ?? r.data?.event.landmarks ?? []);
  const categories = $derived({ ...r.data?.event.categories, ...r.corrections.event?.categories });
</script>

<div class="review">
  <header>
    <b>{r.data?.event.name.en ?? r.id}</b>
    {#each MODES as [m, label] (m)}
      <button type="button" aria-pressed={r.mode === m} onclick={() => (r.mode = m)}>{label}</button>
    {/each}
    <span>{r.problems.length} to check · press n for next</span>
    <button type="button" onclick={() => r.save()} disabled={!r.dirty}>Save</button>
    <span class="msg" role="status">{r.message}</span>
  </header>

  <svg bind:this={svg} class="rmap" xmlns="http://www.w3.org/2000/svg">
    {#if r.data}
      <image href="/api/reference?id={r.id}" x="0" y="0" width={r.data.venue.reference.width} height={r.data.venue.reference.height}
        preserveAspectRatio="none" opacity={r.showReference ? 1 : 0} />
      <image href="/api/plan?id={r.id}" x={r.t.dx} y={r.t.dy} width={r.planSize.w * r.t.sx} height={r.planSize.h * r.t.sy}
        preserveAspectRatio="none" opacity={r.showReference ? 0 : 0.9} />
      {#each r.data.venue.walls as w, k (k)}
        <path d={'M' + w.map((p) => p.join(',')).join('L') + 'Z'} fill="none" stroke="#13306B" stroke-width="3" />
      {/each}
      {#each r.venueCells as c, k (k)}
        <rect data-cell={k} x={c.x} y={c.y} width={c.w} height={c.h} fill={COLOURS[r.status(k)]} fill-opacity="0.35"
          stroke={sel?.kind === 'cell' && sel.index === k ? '#000' : COLOURS[r.status(k)]} stroke-width={sel?.kind === 'cell' && sel.index === k ? 3 : 1} />
      {/each}
      {#each r.corrections.add as a, k (k)}
        <rect data-add={k} x={a.rect.x} y={a.rect.y} width={a.rect.w} height={a.rect.h} fill="#8E44AD" fill-opacity="0.4" stroke="#8E44AD" />
      {/each}
      {#each landmarks as l (l.id)}
        <circle cx={l.x} cy={l.y} r="8" fill="#13306B" />
      {/each}
      {#if drag}
        {@const d = rectOf(drag)}
        <rect x={d.x} y={d.y} width={d.w} height={d.h} fill="none" stroke="#000" stroke-dasharray="4 3" />
      {/if}
      {#if r.mode !== 'select'}
        <rect x={r.data.venue.view.x} y={r.data.venue.view.y} width={r.data.venue.view.w} height={r.data.venue.view.h} fill="transparent"
          onpointerdown={down} onpointermove={move} onpointerup={up} role="presentation" />
      {/if}
    {/if}
  </svg>

  <aside>
    {#if sel?.kind === 'cell'}
      {@const st = r.statuses[sel.index]}
      <h2>Cell {sel.index}</h2>
      <p>Status: {st.status}{st.read ? ` · OCR "${st.read.text}" (${Math.round(st.read.conf)}%) ${st.read.flags.join(', ')}` : ''}</p>
      <label>Code <input value={st.code ?? ''} onchange={(e) => r.fixCell(sel.index, { code: e.currentTarget.value.trim().toUpperCase() || undefined, pillar: undefined, drop: undefined })} /></label>
      <label><input type="checkbox" checked={st.status === 'pillar'} onchange={(e) => r.fixCell(sel.index, { pillar: e.currentTarget.checked || undefined, code: undefined, drop: undefined })} /> Pillar</label>
      <label><input type="checkbox" checked={st.status === 'drop'} onchange={(e) => r.fixCell(sel.index, { drop: e.currentTarget.checked || undefined })} /> Not a booth</label>
      {#if st.code}
        {@const z = r.corrections.event?.zones?.[st.code] ?? r.data?.event.zones[st.code]}
        <h3>Zone name (optional)</h3>
        {#each ['th', 'en', 'short'] as f (f)}
          <label>{f} <input value={(z as Record<string, string> | undefined)?.[f] ?? ''} onchange={(e) => {
            const ev = r.corrections.event ?? {};
            const zones = { ...r.data?.event.zones, ...ev.zones };
            zones[st.code!] = { th: '', en: '', ...zones[st.code!], [f]: e.currentTarget.value };
            r.corrections = { ...r.corrections, event: { ...ev, zones } };
            r.dirty = true;
          }} /></label>
        {/each}
      {/if}
    {:else if sel?.kind === 'add'}
      {@const a = r.corrections.add[sel.index]}
      <h2>Added booth</h2>
      <label>Code <input value={a.code} onchange={(e) => { r.corrections.add[sel.index] = { ...a, code: e.currentTarget.value.trim().toUpperCase() }; r.dirty = true; }} /></label>
      <button type="button" onclick={() => { r.corrections = { ...r.corrections, add: r.corrections.add.filter((_, k) => k !== sel.index) }; r.selection = null; r.dirty = true; }}>Delete</button>
    {:else if sel?.kind === 'landmark'}
      {@const l = landmarks[sel.index]}
      <h2>Landmark</h2>
      <button type="button" onclick={() => r.removeLandmark(sel.index)}>Delete landmark</button>
      {#each ['id', 'th', 'en'] as f (f)}
        <label>{f} <input value={l[f as 'id']} onchange={(e) => {
          const list = landmarks.map((x, k) => (k === sel.index ? { ...x, [f]: e.currentTarget.value } : x));
          r.corrections = { ...r.corrections, event: { ...r.corrections.event, landmarks: list } };
          r.dirty = true;
        }} /></label>
      {/each}
      <label>Group <select value={l.group} onchange={(e) => {
        const list = landmarks.map((x, k) => (k === sel.index ? { ...x, group: e.currentTarget.value as typeof l.group } : x));
        r.corrections = { ...r.corrections, event: { ...r.corrections.event, landmarks: list } };
        r.dirty = true;
      }}>{#each GROUP_ORDER as g (g)}<option value={g}>{g}</option>{/each}</select></label>
      <label>Icon <select value={l.icon} onchange={(e) => {
        const list = landmarks.map((x, k) => (k === sel.index ? { ...x, icon: e.currentTarget.value as typeof l.icon } : x));
        r.corrections = { ...r.corrections, event: { ...r.corrections.event, landmarks: list } };
        r.dirty = true;
      }}>{#each ICON_NAMES as i (i)}<option value={i}>{i}</option>{/each}</select></label>
    {:else if r.mode === 'register'}
      <h2>Register</h2>
      <p>Click a wall corner on the plan, then the same corner on the venue reference. Repeat for a far corner.</p>
      <p>{r.pairs.length} pair(s)</p>
      <button type="button" disabled={r.pairs.length < 2} onclick={() => r.applyRegistration()}>Apply</button>
    {:else}
      <h2>Categories</h2>
      {#each Object.entries(categories) as [key, c] (key)}
        <div class="cat"><span class="sw" style:background={c.color}></span>{key}
          <input aria-label="{key} Thai name" value={c.th} onchange={(e) => {
            const ev = r.corrections.event ?? {};
            r.corrections = { ...r.corrections, event: { ...ev, categories: { ...categories, [key]: { ...c, th: e.currentTarget.value } } } };
            r.dirty = true;
          }} />
          <input aria-label="{key} English name" value={c.en} onchange={(e) => {
            const ev = r.corrections.event ?? {};
            r.corrections = { ...r.corrections, event: { ...ev, categories: { ...categories, [key]: { ...c, en: e.currentTarget.value } } } };
            r.dirty = true;
          }} />
        </div>
      {/each}
    {/if}
  </aside>
</div>

<style>
  .review { display: grid; grid-template: auto 1fr / 1fr 340px; height: 100vh; }
  header { grid-column: 1 / -1; display: flex; gap: 8px; align-items: center; padding: 8px; background: #13306B; color: #fff; flex-wrap: wrap; }
  header button[aria-pressed='true'] { background: #FFD23F; }
  .rmap { width: 100%; height: 100%; background: #eee; touch-action: none; }
  aside { overflow: auto; padding: 12px; border-left: 1px solid #ccc; display: flex; flex-direction: column; gap: 8px; }
  label { display: flex; gap: 6px; align-items: center; }
  .msg { margin-left: auto; }
  .cat { display: grid; grid-template-columns: 14px 60px 1fr 1fr; gap: 6px; align-items: center; }
</style>
