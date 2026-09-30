// SVG floor map: drawing, pan/zoom (drag, pinch, wheel, buttons) and route overlay.

import { VIEW, HALL_OUTLINE, DOORS, AISLE_X, AISLE_SIGN_Y, HALL_LABELS, FOYER_ZONES, INFO_DESKS, STAGE } from './config.js';
import { CATEGORIES, ZONES, LANDMARKS } from './content.js';
import { isAisleBooth } from './directions.js';

const NS = 'http://www.w3.org/2000/svg';
const DARK = '#1D2442';
const LABEL_MIN_PX_PER_UNIT = 0.42; // hide booth codes when they'd be unreadably small

function el(tag, attrs, parent) {
  const e = document.createElementNS(NS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(e);
  return e;
}
function text(parent, x, y, str, attrs = {}) { const t = el('text', { x, y, ...attrs }, parent); t.textContent = str; return t; }

const ICONS = {
  wc(g, x, y) {
    el('circle', { cx: x, cy: y, r: 17, fill: DARK, stroke: 'var(--floor)', 'stroke-width': 2 }, g);
    text(g, x, y + 1, 'WC', { class: 'icon-txt', 'font-size': 12 });
  },
  charge(g, x, y) {
    el('circle', { cx: x, cy: y, r: 14, fill: '#16B3D6', stroke: 'var(--floor)', 'stroke-width': 2 }, g);
    el('path', { d: `M${x + 2} ${y - 9}l-8 11h6l-2 8 8-11h-6z`, fill: '#fff' }, g);
  },
  info(g, x, y) {
    el('circle', { cx: x, cy: y - 22, r: 9, fill: 'var(--blue)' }, g);
    text(g, x, y - 21, 'i', { class: 'icon-txt', 'font-size': 12 });
  },
  door(g, x, y, lm) {
    const vertical = lm.id !== 'west';
    el('rect', { x: x - 14, y: y - 14, width: 28, height: 28, rx: 8, fill: 'var(--sun)' }, g);
    el('path', {
      d: vertical ? `M${x - 5} ${y + 8}v-15l-4 4M${x + 5} ${y - 8}v15l4-4` : `M${x - 8} ${y - 5}h15l-4-4M${x + 8} ${y + 5}h-15l4 4`,
      fill: 'none', stroke: '#13306B', 'stroke-width': 2.6, 'stroke-linecap': 'round', 'stroke-linejoin': 'round',
    }, g);
  },
  mrt(g, x, y) {
    el('rect', { x: x - 30, y: y - 18, width: 60, height: 36, rx: 9, fill: DARK }, g);
    text(g, x, y + 1, 'MRT', { class: 'icon-txt', 'font-size': 16 });
  },
  lift(g, x, y) {
    el('rect', { x: x - 15, y: y - 15, width: 30, height: 30, rx: 6, fill: DARK }, g);
    el('path', { d: `M${x - 6} ${y - 2}l6-7 6 7zM${x - 6} ${y + 2}l6 7 6-7z`, fill: '#fff' }, g);
  },
  stage() {}, // drawn as part of the base layer
};

export function createMap(svg, data, { onSelectBooth, onSelectPlace }) {
  const layers = {};
  for (const id of ['base', 'booths', 'zones', 'marks', 'route', 'pins']) layers[id] = el('g', { id: 'layer-' + id }, svg);

  /* ---------- static drawing ---------- */
  function drawBase() {
    const g = layers.base;
    el('rect', { x: VIEW.x - 400, y: VIEW.y - 400, width: VIEW.w + 800, height: VIEW.h + 800, class: 'outside' }, g);
    el('path', { d: 'M' + HALL_OUTLINE.map((p) => p.join(',')).join('L') + 'Z', class: 'hall' }, g);
    for (const d of DOORS) { // gaps in the wall
      if (d.id === 'west') el('rect', { x: 442, y: 852, width: 8, height: 56, fill: 'var(--floor)' }, g);
      else el('rect', { x: d.x - 28, y: 1436, width: 56, height: 8, fill: 'var(--floor)' }, g);
    }
    const ga = el('g', {}, g);
    for (const k in AISLE_X) {
      const a = el('g', { class: 'aisle', 'data-a': k }, ga);
      el('circle', { cx: AISLE_X[k], cy: AISLE_SIGN_Y, r: 13 }, a);
      text(a, AISLE_X[k], AISLE_SIGN_Y + 1, k);
    }
    for (const [x, y, h] of HALL_LABELS) text(g, x, y, 'HALL ' + h, { class: 'halltxt' });

    const [sx, sy, sw, sh] = STAGE;
    el('rect', { x: sx, y: sy, width: sw, height: sh, rx: 4, fill: 'var(--panel)', stroke: 'var(--blue)', 'stroke-width': 3 }, g);
    for (let r = 0; r < 2; r++) for (let c = 0; c < 6; c++) el('rect', { x: sx + 14 + c * 14, y: sy + 14 + r * 52, width: 5, height: 40, fill: 'var(--muted)', opacity: 0.6 }, g);
    el('rect', { x: sx + 120, y: sy + 22, width: 36, height: 70, fill: DARK }, g);
    text(g, sx + 138, sy + 57, 'STAGE', { class: 'lbl', 'font-size': 16, transform: `rotate(90 ${sx + 138} ${sy + 57})` });
    el('rect', { x: sx + 160, y: sy + 56, width: 62, height: 36, fill: DARK }, g);
    text(g, sx + 192, sy + 40, 'Interview Area', { class: 'small-map-txt', 'font-size': 9 });
  }

  function drawBooths() {
    const g = layers.booths;
    for (const p of data.pillars) {
      el('rect', { x: p.x, y: p.y, width: p.w, height: p.h, fill: CATEGORIES[p.cat].color, stroke: 'var(--gap)', 'stroke-width': 1.6 }, g);
      el('rect', { x: p.px, y: p.py, width: p.pw, height: p.ph, rx: 4, class: 'pillar' }, g);
    }
    for (const b of data.booths) {
      if (b.foyer) continue;
      const bg = el('g', { class: 'booth c-' + b.cat, 'data-b': b.i }, g);
      el('rect', { x: b.x, y: b.y, width: b.w, height: b.h, fill: CATEGORIES[b.cat].color }, bg);
      for (const [ex, ey, ew, eh] of b.extra || []) el('rect', { x: ex, y: ey, width: ew, height: eh, fill: CATEGORIES[b.cat].color }, bg); // L-shaped booths
      const fs = Math.min(13, Math.max(8, Math.min(b.w * 0.36, b.h * 0.5)));
      const z = ZONES[b.c];
      if (z?.short && b.w > 50) {
        text(bg, b.cx, b.cy - 12, b.c, { 'font-size': fs });
        const words = z.short.split(' ');
        const lines = words.length > 2 ? [words.slice(0, 2).join(' '), words.slice(2).join(' ')] : [words.join(' ')];
        lines.forEach((line, k) => text(bg, b.cx, b.cy + 4 + k * 12, line, { 'font-size': 8.5, class: 'small-lbl' }));
      } else {
        const t = text(bg, b.cx, b.cy, b.c, { 'font-size': fs });
        if (z && b.w < 32 && b.h > 60) t.setAttribute('transform', `rotate(-90 ${b.cx} ${b.cy})`);
      }
    }
  }

  function drawZones() {
    const g = layers.zones;
    for (const [c, x, y, w, h, vertical] of FOYER_ZONES) {
      const b = data.byCode[c][0];
      const z = el('g', { class: 'zone booth c-special', 'data-b': b.i }, g);
      el('rect', { x, y, width: w, height: h, rx: 2 }, z);
      const t = text(z, x + w / 2, y + h / 2, c, { 'font-size': 12 });
      if (vertical) t.setAttribute('transform', `rotate(-90 ${x + w / 2} ${y + h / 2})`);
    }
    for (const [x, y, w, h] of INFO_DESKS) {
      el('rect', { x, y, width: w, height: h, rx: 2, fill: DARK }, g);
      text(g, x + w / 2, y + h / 2, 'Information', { class: 'icon-txt', 'font-size': 11 });
    }
  }

  function drawMarks(nameOf) {
    const g = layers.marks; g.replaceChildren();
    for (const lm of LANDMARKS) {
      const lg = el('g', { class: 'lm', 'data-lm': lm.id }, g);
      ICONS[lm.icon](lg, lm.x, lm.y, lm);
      el('title', {}, lg).textContent = nameOf(lm);
    }
  }

  /* ---------- viewport ---------- */
  let vb = { ...VIEW }, anim = 0;
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const aspect = () => { const r = svg.getBoundingClientRect(); return r.width && r.height ? r.height / r.width : VIEW.h / VIEW.w; };
  function apply() {
    svg.setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.w} ${vb.h}`);
    svg.classList.toggle('labels-off', svg.getBoundingClientRect().width / vb.w < LABEL_MIN_PX_PER_UNIT);
  }
  function clamp() {
    vb.w = Math.max(170, Math.min(VIEW.w * 1.25, vb.w)); vb.h = vb.w * aspect();
    const cx = Math.max(VIEW.x, Math.min(VIEW.x + VIEW.w, vb.x + vb.w / 2));
    const cy = Math.max(VIEW.y, Math.min(VIEW.y + VIEW.h, vb.y + vb.h / 2));
    vb.x = cx - vb.w / 2; vb.y = cy - vb.h / 2;
  }
  function boxFor(x0, y0, x1, y1, pad) {
    const a = aspect(); let w = x1 - x0 + pad * 2, h = y1 - y0 + pad * 2;
    if (h / w > a) w = h / a;
    h = w * a;
    return { x: (x0 + x1) / 2 - w / 2, y: (y0 + y1) / 2 - h / 2, w, h };
  }
  function animateTo(target) {
    cancelAnimationFrame(anim);
    const from = { ...vb }, t0 = performance.now(), dur = reduceMotion ? 0 : 450;
    const step = (now) => {
      const k = dur ? Math.min(1, (now - t0) / dur) : 1, e = 1 - (1 - k) ** 3;
      for (const key of ['x', 'y', 'w', 'h']) vb[key] = from[key] + (target[key] - from[key]) * e;
      if (k < 1) { apply(); anim = requestAnimationFrame(step); } else { clamp(); apply(); }
    };
    anim = requestAnimationFrame(step);
  }
  function overview() {
    const narrow = svg.getBoundingClientRect().width < 600;
    return narrow ? boxFor(380, 270, 2400, 1560, 10) : boxFor(190, 250, 2400, 1650, 20);
  }
  function fitAll(animated = false) { const b = overview(); if (animated) animateTo(b); else { vb = b; clamp(); apply(); } }

  const toSvg = (cx, cy) => { const p = svg.createSVGPoint(); p.x = cx; p.y = cy; return p.matrixTransform(svg.getScreenCTM().inverse()); };
  function zoomAt(cx, cy, k) {
    const p = toSvg(cx, cy);
    vb.x = p.x - (p.x - vb.x) * k; vb.y = p.y - (p.y - vb.y) * k; vb.w *= k; vb.h *= k;
    clamp(); apply();
  }
  function zoomCenter(k) { const r = svg.getBoundingClientRect(); zoomAt(r.left + r.width / 2, r.top + r.height / 2, k); }

  /* ---------- gestures ---------- */
  const pointers = new Map(); let down = null, pinch = null;
  svg.addEventListener('pointerdown', (e) => {
    svg.setPointerCapture(e.pointerId); pointers.set(e.pointerId, { x: e.clientX, y: e.clientY }); cancelAnimationFrame(anim);
    if (pointers.size === 1) down = { x: e.clientX, y: e.clientY, target: e.target, moved: false, start: toSvg(e.clientX, e.clientY) };
    else if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
      if (down) down.moved = true;
    }
  });
  svg.addEventListener('pointermove', (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2 && pinch) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      const p0 = toSvg(pinch.mx, pinch.my); zoomAt(mx, my, pinch.d / d); const p1 = toSvg(mx, my);
      vb.x += p0.x - p1.x; vb.y += p0.y - p1.y; clamp(); apply();
      pinch = { d, mx, my };
    } else if (pointers.size === 1 && down) {
      if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) { down.moved = true; svg.classList.add('dragging'); }
      if (down.moved) { const p = toSvg(e.clientX, e.clientY); vb.x += down.start.x - p.x; vb.y += down.start.y - p.y; clamp(); apply(); }
    }
  });
  const end = (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
    if (pointers.size === 1) { const [p] = [...pointers.values()]; down = { x: p.x, y: p.y, target: null, moved: true, start: toSvg(p.x, p.y) }; }
    if (pointers.size === 0) {
      svg.classList.remove('dragging');
      if (down && !down.moved && e.type === 'pointerup') tap(down.target);
      down = null;
    }
  };
  svg.addEventListener('pointerup', end);
  svg.addEventListener('pointercancel', end);
  svg.addEventListener('wheel', (e) => { e.preventDefault(); zoomAt(e.clientX, e.clientY, Math.exp(e.deltaY * 0.0016)); }, { passive: false });
  function tap(target) {
    const bEl = target?.closest?.('[data-b]'), lEl = target?.closest?.('[data-lm]');
    if (bEl) onSelectBooth(data.booths[+bEl.dataset.b]);
    else if (lEl) { const lm = LANDMARKS.find((l) => l.id === lEl.dataset.lm); if (lm) onSelectPlace(lm); }
  }
  new ResizeObserver(() => {
    const cx = vb.x + vb.w / 2, cy = vb.y + vb.h / 2;
    vb.h = vb.w * aspect(); vb.x = cx - vb.w / 2; vb.y = cy - vb.h / 2; clamp(); apply();
  }).observe(svg);

  /* ---------- route overlay ---------- */
  function showRoute(dest, route) {
    const gr = layers.route, gp = layers.pins;
    gr.replaceChildren(); gp.replaceChildren();
    svg.querySelectorAll('.booth.dest').forEach((n) => n.classList.remove('dest'));
    svg.querySelectorAll('.aisle.on').forEach((n) => n.classList.remove('on'));
    svg.classList.toggle('dim', !!dest);
    if (!dest) return;

    let tx, ty;
    if (dest.kind === 'booth') {
      svg.querySelector(`[data-b="${dest.b.i}"]`)?.classList.add('dest');
      if (isAisleBooth(dest.b)) svg.querySelector(`.aisle[data-a="${dest.b.c[0]}"]`)?.classList.add('on');
      tx = dest.b.cx; ty = dest.b.y;
    } else { tx = dest.lm.x; ty = dest.lm.y - 14; }

    if (route?.P) {
      const d = 'M' + route.P.map((p) => p.map((v) => v.toFixed(1)).join(',')).join('L');
      el('path', { d, class: 'case' }, gr);
      const line = el('path', { d, class: 'line draw' }, gr);
      const len = line.getTotalLength();
      line.style.setProperty('--len', len); line.style.strokeDasharray = len;
      line.addEventListener('animationend', () => { line.style.strokeDasharray = ''; }, { once: true });
      const [sx, sy] = route.P[0];
      el('circle', { cx: sx, cy: sy, r: 13, fill: 'var(--panel)', stroke: 'var(--route)', 'stroke-width': 5 }, gp);
      el('circle', { cx: sx, cy: sy, r: 4.5, fill: 'var(--route)' }, gp);
    }
    const pin = el('g', {}, gp);
    el('circle', { cx: tx, cy: ty - 2, r: 22, fill: 'var(--sun)', class: 'pulse' }, pin);
    el('path', { d: `M${tx} ${ty - 2}c-9-13-16-20-16-29a16 16 0 0 1 32 0c0 9-7 16-16 29z`, fill: 'var(--ink)', stroke: 'var(--panel)', 'stroke-width': 2.5 }, pin);
    el('circle', { cx: tx, cy: ty - 31, r: 6.5, fill: 'var(--sun)' }, pin);
  }

  function frame(dest, route) {
    let x0, y0, x1, y1;
    if (route?.P) {
      const xs = route.P.map((p) => p[0]), ys = route.P.map((p) => p[1]);
      [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    } else if (dest) {
      const [px, py] = dest.kind === 'booth' ? [dest.b.cx, dest.b.cy] : [dest.lm.x, dest.lm.y];
      x0 = x1 = px; y0 = y1 = py;
    } else return;
    if (dest?.kind === 'booth') { const b = dest.b; x0 = Math.min(x0, b.x); x1 = Math.max(x1, b.x + b.w); y0 = Math.min(y0, b.y); y1 = Math.max(y1, b.y + b.h); }
    y0 -= 70; // room for the pin
    const pad = route?.P ? 60 : 160;
    requestAnimationFrame(() => animateTo(boxFor(x0, y0, x1, y1, pad)));
  }

  drawBase(); drawBooths(); drawZones();
  return { drawMarks, showRoute, frame, fitAll, zoomCenter };
}
