import type { Box, Dest, Point, Rect, RouteOk } from './types';

export type VB = { x: number; y: number; w: number; h: number };
export const MIN_W = 170;
export const LABEL_MIN_PX_PER_UNIT = 0.42;

export function clampVB(vb: VB, view: Rect, aspect: number): VB {
  const w = Math.max(MIN_W, Math.min(view.w * 1.25, vb.w)),
    h = w * aspect;
  const cx = Math.max(view.x, Math.min(view.x + view.w, vb.x + vb.w / 2));
  const cy = Math.max(view.y, Math.min(view.y + view.h, vb.y + vb.h / 2));
  return { x: cx - w / 2, y: cy - h / 2, w, h };
}

export function boxFor(x0: number, y0: number, x1: number, y1: number, pad: number, aspect: number): VB {
  let w = x1 - x0 + pad * 2;
  const h0 = y1 - y0 + pad * 2;
  if (h0 / w > aspect) w = h0 / aspect;
  const h = w * aspect;
  return { x: (x0 + x1) / 2 - w / 2, y: (y0 + y1) / 2 - h / 2, w, h };
}

export const zoomAt = (vb: VB, px: number, py: number, k: number): VB => ({
  x: px - (px - vb.x) * k,
  y: py - (py - vb.y) * k,
  w: vb.w * k,
  h: vb.h * k,
});

export const ease = (k: number) => 1 - (1 - k) ** 3;

export const lerpVB = (a: VB, b: VB, e: number): VB => ({
  x: a.x + (b.x - a.x) * e,
  y: a.y + (b.y - a.y) * e,
  w: a.w + (b.w - a.w) * e,
  h: a.h + (b.h - a.h) * e,
});

export function frameTarget(dest: Dest | null, route: RouteOk | null): { box: Box; pad: number } | null {
  let x0: number, y0: number, x1: number, y1: number;
  if (route) {
    const xs = route.P.map((p) => p[0]),
      ys = route.P.map((p) => p[1]);
    [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  } else if (dest) {
    const [px, py] = dest.kind === 'booth' ? [dest.b.cx, dest.b.cy] : [dest.lm.x, dest.lm.y];
    x0 = x1 = px;
    y0 = y1 = py;
  } else return null;
  if (dest?.kind === 'booth') {
    const b = dest.b;
    x0 = Math.min(x0, b.x);
    x1 = Math.max(x1, b.x + b.w);
    y0 = Math.min(y0, b.y);
    y1 = Math.max(y1, b.y + b.h);
  }
  return { box: [x0, y0 - 70, x1, y1], pad: route ? 60 : 160 };
}

export function unionRect(a: Rect, b: Rect | null): Rect {
  if (!b) return a;
  const x = Math.min(a.x, b.x),
    y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
}

export const boxAround = (ps: Point[]): Box => [
  Math.min(...ps.map((p) => p[0])),
  Math.min(...ps.map((p) => p[1])),
  Math.max(...ps.map((p) => p[0])),
  Math.max(...ps.map((p) => p[1])),
];
