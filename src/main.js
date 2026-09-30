// Entry point: state, bottom sheet / side panel UI, language, share links.

import { loadData } from './data.js';
import { STRINGS, CATEGORIES, ZONES, LANDMARKS, GROUP_ORDER, QUICK_PICKS } from './content.js';
import { createGrid, findRoute } from './routing.js';
import { buildSteps, isAisleBooth } from './directions.js';
import { createSearch } from './search.js';
import { createMap } from './map.js';

/* ---------- storage (per viewer; may be unavailable) ---------- */
const store = {
  get(k) { try { return localStorage.getItem('bf26:' + k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem('bf26:' + k, v); } catch { /* private mode etc. */ } },
};

/* ---------- state ---------- */
const state = {
  lang: store.get('lang') === 'en' ? 'en' : 'th',
  dest: null, // {kind:'booth', b} | {kind:'place', lm}
  fromId: store.get('from') || '',
  route: null,
};
const s = () => STRINGS[state.lang];
const nameOf = (o) => o[state.lang] || o.th || o.en;
const esc = (v) => String(v).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const $ = (sel) => document.querySelector(sel);

const data = await loadData();
const grid = createGrid(data);
const search = createSearch(data);
const exhibitorsAt = (code) => data.exhibitors.filter((e) => e.booth === code);
const map = createMap($('#map'), data, { onSelectBooth: selectBooth, onSelectPlace: selectPlace });

/* ---------- labels ---------- */
function boothTitle(b) {
  if (ZONES[b.c]) return nameOf(ZONES[b.c]);
  const ex = exhibitorsAt(b.c);
  return ex.length ? ex.map(nameOf).join(', ') : nameOf(CATEGORIES[b.cat]);
}
function boothSub(b) {
  const parts = [b.hall ? s().hall(b.hall) : s().outside];
  if (isAisleBooth(b) && !ZONES[b.c]) parts.push(s().aisle(b.c[0]));
  if (ZONES[b.c] || exhibitorsAt(b.c).length) parts.push(nameOf(CATEGORIES[b.cat]));
  return parts.join(' · ');
}
const chip = (b) => `<span class="code c-${b.cat}" style="background:${CATEGORIES[b.cat].color}">${esc(b.c)}</span>`;
const PLACE_GLYPH = { entry: '⇅', wc: 'WC', info: 'i', charge: '⚡', stage: '★', other: '↥' };
const placeChip = (lm) => `<span class="code" style="background:var(--ink)">${PLACE_GLYPH[lm.group]}</span>`;

/* ---------- sheet views ---------- */
const body = $('#body'), q = $('#q'), sheet = $('#sheet'), toggle = $('#sheetToggle');

function renderIdle() {
  const picks = QUICK_PICKS.map(([kind, id]) => {
    const label = kind === 'booth' ? `${id} ${nameOf(ZONES[id])}` : nameOf(LANDMARKS.find((l) => l.id === id));
    return `<button type="button" data-kind="${kind}" data-id="${id}">${esc(label)}</button>`;
  }).join('');
  body.innerHTML = `
    <p class="hint first">${esc(s().tapHint)}</p>
    <h2 class="sec">${esc(s().quick)}</h2>
    <div class="quick">${picks}</div>
    <h2 class="sec">${esc(s().legend)}</h2>
    <ul class="legend">${Object.values(CATEGORIES).map((c) => `<li><span class="sw" style="background:${c.color}"></span>${esc(c[state.lang])}</li>`).join('')}</ul>`;
  body.querySelectorAll('.quick button').forEach((bt) => {
    bt.onclick = () => (bt.dataset.kind === 'booth' ? selectBooth(data.byCode[bt.dataset.id][0]) : selectPlace(LANDMARKS.find((l) => l.id === bt.dataset.id)));
  });
}

function renderResults() {
  const v = q.value.trim();
  $('#qclear').hidden = !v;
  if (!v) { state.dest ? renderCard() : renderIdle(); return; }
  const res = search(v);
  if (!res.length) { body.innerHTML = `<p class="empty">${esc(s().noRes(v))}</p>`; return; }
  body.innerHTML = `<ul class="results">${res.map((it, k) => {
    if (it.type === 'place') return `<li><button type="button" data-r="${k}">${placeChip(it.lm)}<span class="rmain"><b>${esc(nameOf(it.lm))}</b><span>${esc(s().groups[it.lm.group])}</span></span></button></li>`;
    const title = it.ex ? nameOf(it.ex) : boothTitle(it.b);
    return `<li><button type="button" data-r="${k}">${chip(it.b)}<span class="rmain"><b>${esc(title)}</b><span>${esc(boothSub(it.b))}</span></span></button></li>`;
  }).join('')}</ul>`;
  body.querySelectorAll('[data-r]').forEach((bt) => {
    bt.onclick = () => {
      const it = res[+bt.dataset.r];
      q.value = ''; $('#qclear').hidden = true; q.blur();
      it.type === 'place' ? selectPlace(it.lm) : selectBooth(it.b);
    };
  });
}

function fromOptions() {
  let html = `<option value="" ${state.fromId ? '' : 'selected'} disabled>${esc(s().pickFrom)}</option>`;
  for (const g of GROUP_ORDER) {
    const items = LANDMARKS.filter((l) => l.group === g);
    if (!items.length) continue;
    html += `<optgroup label="${esc(s().groups[g])}">${items.map((l) => `<option value="${l.id}" ${l.id === state.fromId ? 'selected' : ''}>${esc(nameOf(l))}</option>`).join('')}</optgroup>`;
  }
  return html;
}

function computeRoute() {
  const start = LANDMARKS.find((l) => l.id === state.fromId);
  state.route = start && state.dest ? { start, ...findRoute(grid, start, state.dest) } : null;
  return state.route;
}

function renderCard() {
  const { dest } = state;
  if (!dest) { renderIdle(); return; }
  let head;
  if (dest.kind === 'booth') {
    const b = dest.b, ex = exhibitorsAt(b.c);
    const title = ZONES[b.c] ? nameOf(ZONES[b.c]) : ex.length === 1 ? nameOf(ex[0]) : nameOf(CATEGORIES[b.cat]);
    head = `<div class="ticket"><div class="bigcode c-${b.cat}" style="background:${CATEGORIES[b.cat].color}">${esc(b.c)}</div>
      <div class="tinfo"><div class="t1">${esc(title)}</div><div class="t2">${esc(boothSub(b))}</div></div></div>
      ${ex.length > 1 ? `<h2 class="sec gap">${esc(s().publishers)}</h2><ul class="exh">${ex.map((e) => `<li>${esc(nameOf(e))}</li>`).join('')}</ul>` : ''}`;
  } else {
    const lm = dest.lm;
    head = `<div class="ticket"><div class="bigcode place">${PLACE_GLYPH[lm.group]}</div>
      <div class="tinfo"><div class="t1">${esc(nameOf(lm))}</div><div class="t2">${esc(s().groups[lm.group])}</div></div></div>`;
  }

  const r = computeRoute();
  let routeHtml;
  if (!state.fromId) routeHtml = `<p class="hint">${esc(s().pickHint)}</p>`;
  else if (r?.same) routeHtml = `<p class="hint">${esc(s().same)}</p>`;
  else if (!r || r.fail) routeHtml = `<p class="hint">${esc(s().noRoute)}</p>`;
  else {
    routeHtml = `<div class="summary"><span class="m">${r.meters} ${s().meters}</span><span class="t">${esc(s().min(r.minutes))}</span></div>
      <ol class="steps">${buildSteps(r, r.start, dest, s(), nameOf).map((x) => `<li><span>${esc(x)}</span></li>`).join('')}</ol>`;
  }

  body.innerHTML = `<div class="card">${head}
    <div class="from"><label for="from">${esc(s().from)}</label><div class="selwrap"><select id="from">${fromOptions()}</select></div></div>
    ${routeHtml}
    <div class="actions"><button type="button" class="btn" id="clearRoute">${esc(s().clear)}</button><button type="button" class="btn" id="shareBtn">${esc(s().share)}</button></div></div>`;

  $('#from').onchange = (e) => {
    state.fromId = e.target.value; store.set('from', state.fromId);
    renderCard(); writeHash(); map.frame(state.dest, state.route?.P ? state.route : null);
  };
  $('#clearRoute').onclick = () => { state.dest = null; state.route = null; writeHash(); map.showRoute(null); renderIdle(); };
  $('#shareBtn').onclick = async () => {
    try { await navigator.clipboard.writeText(location.href); toast(s().copied); } catch { toast(location.href); }
  };
  map.showRoute(dest, r?.P ? r : null);
}

function selectBooth(b) { state.dest = { kind: 'booth', b }; afterSelect(); }
function selectPlace(lm) { state.dest = { kind: 'place', lm }; afterSelect(); }
function afterSelect() { setSheet(true); renderCard(); writeHash(); map.frame(state.dest, state.route?.P ? state.route : null); }

/* ---------- share links: #to=K16&from=door6 (n= picks between duplicate codes) ---------- */
function writeHash() {
  const p = new URLSearchParams();
  const { dest } = state;
  if (dest) {
    p.set('to', dest.kind === 'booth' ? dest.b.c : dest.lm.id);
    if (dest.kind === 'booth' && data.byCode[dest.b.c].length > 1) p.set('n', data.byCode[dest.b.c].indexOf(dest.b));
  }
  if (state.fromId) p.set('from', state.fromId);
  try { history.replaceState(null, '', '#' + p.toString()); } catch { /* sandboxed */ }
}
function readHash() {
  const p = new URLSearchParams(location.hash.slice(1));
  const f = p.get('from');
  if (f && LANDMARKS.some((l) => l.id === f)) { state.fromId = f; store.set('from', f); }
  const to = (p.get('to') || '').trim();
  if (!to) return false;
  const lm = LANDMARKS.find((l) => l.id === to);
  if (lm) { state.dest = { kind: 'place', lm }; return true; }
  const list = data.byCode[to.toUpperCase()];
  if (list) { state.dest = { kind: 'booth', b: list[+(p.get('n') || 0)] || list[0] }; return true; }
  return false;
}

/* ---------- chrome ---------- */
let toastTimer;
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 1800);
}
function setSheet(open) {
  sheet.classList.toggle('min', !open);
  toggle.setAttribute('aria-expanded', open);
  toggle.textContent = open ? s().hide : s().show;
}
toggle.onclick = () => setSheet(sheet.classList.contains('min'));
q.addEventListener('input', () => { setSheet(true); renderResults(); });
q.addEventListener('keydown', (e) => { if (e.key === 'Enter') body.querySelector('[data-r]')?.click(); });
$('#qclear').onclick = () => { q.value = ''; renderResults(); q.focus(); };
$('#zin').onclick = () => map.zoomCenter(0.7);
$('#zout').onclick = () => map.zoomCenter(1 / 0.7);
$('#zfit').onclick = () => (state.dest ? map.frame(state.dest, state.route?.P ? state.route : null) : map.fitAll(true));

function applyLang() {
  document.documentElement.lang = state.lang;
  document.querySelectorAll('[data-t]').forEach((n) => { n.textContent = s()[n.dataset.t]; });
  document.querySelectorAll('[data-aria]').forEach((n) => { n.setAttribute('aria-label', s()[n.dataset.aria]); n.title = s()[n.dataset.aria]; });
  document.querySelectorAll('.lang button').forEach((bt) => bt.setAttribute('aria-pressed', bt.dataset.lang === state.lang));
  q.placeholder = s().ph;
  toggle.textContent = sheet.classList.contains('min') ? s().show : s().hide;
  map.drawMarks(nameOf);
  if (q.value.trim()) renderResults(); else if (state.dest) renderCard(); else renderIdle();
}
document.querySelectorAll('.lang button').forEach((bt) => {
  bt.onclick = () => { state.lang = bt.dataset.lang; store.set('lang', state.lang); applyLang(); };
});

/* ---------- boot ---------- */
requestAnimationFrame(() => {
  map.fitAll();
  const linked = readHash();
  applyLang();
  if (linked) map.frame(state.dest, state.route?.P ? state.route : null);
});
window.addEventListener('hashchange', () => {
  if (readHash()) { renderCard(); map.frame(state.dest, state.route?.P ? state.route : null); }
});
