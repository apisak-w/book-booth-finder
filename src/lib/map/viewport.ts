import { boxFor, clampVB, ease, frameTarget, lerpVB, zoomAt, LABEL_MIN_PX_PER_UNIT, type VB } from '../core/panzoom';
import type { Dest, RouteOk, Venue } from '../core/types';

export type Viewport = {
  fitAll(animated?: boolean): void;
  zoomCenter(k: number): void;
  frame(dest: Dest | null, route: RouteOk | null): void;
  destroy(): void;
};

export function createViewport(svg: SVGSVGElement, venue: Venue, onTap: (target: Element | null) => void): Viewport {
  const view = venue.view;
  let vb: VB = { ...view },
    anim = 0;
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const aspect = () => {
    const r = svg.getBoundingClientRect();
    return r.width && r.height ? r.height / r.width : view.h / view.w;
  };
  const apply = () => {
    svg.setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.w} ${vb.h}`);
    svg.classList.toggle('labels-off', svg.getBoundingClientRect().width / vb.w < LABEL_MIN_PX_PER_UNIT);
  };
  const set = (next: VB) => {
    vb = clampVB(next, view, aspect());
    apply();
  };
  const toSvg = (cx: number, cy: number) => {
    const p = svg.createSVGPoint();
    p.x = cx;
    p.y = cy;
    return p.matrixTransform(svg.getScreenCTM()!.inverse());
  };
  const animateTo = (target: VB) => {
    cancelAnimationFrame(anim);
    const from = { ...vb },
      t0 = performance.now(),
      dur = reduceMotion ? 0 : 450;
    const step = (now: number) => {
      const k = dur ? Math.min(1, (now - t0) / dur) : 1;
      vb = lerpVB(from, target, ease(k));
      if (k < 1) {
        apply();
        anim = requestAnimationFrame(step);
      } else set(vb);
    };
    anim = requestAnimationFrame(step);
  };
  const overview = () => {
    const o = svg.getBoundingClientRect().width < 600 ? venue.overview.narrow : venue.overview.wide;
    return boxFor(...o.box, o.pad, aspect());
  };
  const zoomAtClient = (cx: number, cy: number, k: number) => {
    const p = toSvg(cx, cy);
    set(zoomAt(vb, p.x, p.y, k));
  };

  const pointers = new Map<number, { x: number; y: number }>();
  let down: { x: number; y: number; target: Element | null; moved: boolean; start: DOMPoint } | null = null;
  let pinch: { d: number; mx: number; my: number } | null = null;

  const onDown = (e: PointerEvent) => {
    svg.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    cancelAnimationFrame(anim);
    if (pointers.size === 1)
      down = {
        x: e.clientX,
        y: e.clientY,
        target: e.target as Element,
        moved: false,
        start: toSvg(e.clientX, e.clientY),
      };
    else if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
      if (down) down.moved = true;
    }
  };
  const onMove = (e: PointerEvent) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2 && pinch) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y),
        mx = (a.x + b.x) / 2,
        my = (a.y + b.y) / 2;
      const p0 = toSvg(pinch.mx, pinch.my);
      zoomAtClient(mx, my, pinch.d / d);
      const p1 = toSvg(mx, my);
      set({ ...vb, x: vb.x + p0.x - p1.x, y: vb.y + p0.y - p1.y });
      pinch = { d, mx, my };
    } else if (pointers.size === 1 && down) {
      if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) {
        down.moved = true;
        svg.classList.add('dragging');
      }
      if (down.moved) {
        const p = toSvg(e.clientX, e.clientY);
        set({ ...vb, x: vb.x + down.start.x - p.x, y: vb.y + down.start.y - p.y });
      }
    }
  };
  const onEnd = (e: PointerEvent) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
    if (pointers.size === 1) {
      const [p] = [...pointers.values()];
      down = { x: p.x, y: p.y, target: null, moved: true, start: toSvg(p.x, p.y) };
    }
    if (pointers.size === 0) {
      svg.classList.remove('dragging');
      if (down && !down.moved && e.type === 'pointerup') onTap(down.target);
      down = null;
    }
  };
  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    zoomAtClient(e.clientX, e.clientY, Math.exp(e.deltaY * 0.0016));
  };

  svg.addEventListener('pointerdown', onDown);
  svg.addEventListener('pointermove', onMove);
  svg.addEventListener('pointerup', onEnd);
  svg.addEventListener('pointercancel', onEnd);
  svg.addEventListener('wheel', onWheel, { passive: false });
  const ro = new ResizeObserver(() => {
    const cx = vb.x + vb.w / 2,
      cy = vb.y + vb.h / 2,
      h = vb.w * aspect();
    set({ x: cx - vb.w / 2, y: cy - h / 2, w: vb.w, h });
  });
  ro.observe(svg);

  return {
    fitAll(animated = false) {
      const b = overview();
      if (animated) animateTo(b);
      else set(b);
    },
    zoomCenter(k) {
      const r = svg.getBoundingClientRect();
      zoomAtClient(r.left + r.width / 2, r.top + r.height / 2, k);
    },
    frame(dest, route) {
      const t = frameTarget(dest, route);
      if (t) requestAnimationFrame(() => animateTo(boxFor(...t.box, t.pad, aspect())));
    },
    destroy() {
      cancelAnimationFrame(anim);
      ro.disconnect();
      svg.removeEventListener('pointerdown', onDown);
      svg.removeEventListener('pointermove', onMove);
      svg.removeEventListener('pointerup', onEnd);
      svg.removeEventListener('pointercancel', onEnd);
      svg.removeEventListener('wheel', onWheel);
    },
  };
}
