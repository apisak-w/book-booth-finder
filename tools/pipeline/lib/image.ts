import sharp from 'sharp';
import type { Box } from '../../../src/lib/core/types';

export type RGB = { width: number; height: number; data: Uint8Array };
export type Mask = { width: number; height: number; data: Uint8Array };

export async function loadImage(path: string): Promise<RGB> {
  const { data, info } = await sharp(path)
    .removeAlpha()
    .toColourspace('srgb')
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { width: info.width, height: info.height, data: new Uint8Array(data.buffer, data.byteOffset, data.length) };
}

export function crop(img: RGB, [x0, y0, x1, y1]: Box): RGB {
  const w = x1 - x0,
    h = y1 - y0,
    out = new Uint8Array(w * h * 3);
  for (let y = 0; y < h; y++)
    out.set(img.data.subarray(((y0 + y) * img.width + x0) * 3, ((y0 + y) * img.width + x1) * 3), y * w * 3);
  return { width: w, height: h, data: out };
}

export const pixel = (img: RGB, x: number, y: number): [number, number, number] => {
  const i = (y * img.width + x) * 3;
  return [img.data[i], img.data[i + 1], img.data[i + 2]];
};

export function farFromColour(img: RGB, [r, g, b]: [number, number, number], threshold: number): Mask {
  const n = img.width * img.height,
    out = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const d = Math.max(
      Math.abs(img.data[i * 3] - r),
      Math.abs(img.data[i * 3 + 1] - g),
      Math.abs(img.data[i * 3 + 2] - b),
    );
    out[i] = d > threshold ? 1 : 0;
  }
  return { width: img.width, height: img.height, data: out };
}

export function gray(img: RGB): Float32Array {
  const n = img.width * img.height,
    out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = (img.data[i * 3] + img.data[i * 3 + 1] + img.data[i * 3 + 2]) / 3;
  return out;
}

export function components(mask: Mask) {
  const { width: w, height: h, data } = mask;
  const labels = new Int32Array(w * h);
  const stats = [{ x: 0, y: 0, w: 0, h: 0, area: 0 }];
  const stack: number[] = [];
  for (let s = 0; s < w * h; s++) {
    if (!data[s] || labels[s]) continue;
    const id = stats.length;
    let x0 = w,
      y0 = h,
      x1 = -1,
      y1 = -1,
      area = 0;
    labels[s] = id;
    stack.push(s);
    while (stack.length) {
      const i = stack.pop()!,
        x = i % w,
        y = (i / w) | 0;
      area++;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
      for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1])
        if (j >= 0 && data[j] && !labels[j]) {
          labels[j] = id;
          stack.push(j);
        }
    }
    stats.push({ x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1, area });
  }
  return { labels, stats };
}

export function openLine(mask: Mask, length: number, axis: 'h' | 'v'): Mask {
  const { width: w, height: h, data } = mask,
    out = new Uint8Array(w * h);
  const anchor = Math.floor(length / 2);
  const lines = axis === 'h' ? h : w,
    span = axis === 'h' ? w : h;
  const at = (line: number, k: number) => (axis === 'h' ? line * w + k : k * w + line);
  for (let line = 0; line < lines; line++) {
    let k = 0;
    while (k < span) {
      if (!data[at(line, k)]) {
        k++;
        continue;
      }
      const start = k;
      while (k < span && data[at(line, k)]) k++;
      const run = k - start,
        atStart = start === 0,
        atEnd = k === span;
      const keep =
        run >= length || (atStart && atEnd) || (atStart && run >= length - anchor) || (atEnd && run >= anchor + 1);
      if (keep) for (let j = start; j < k; j++) out[at(line, j)] = 1;
    }
  }
  return { width: w, height: h, data: out };
}

export function erode2(mask: Mask): Mask {
  const { width: w, height: h, data } = mask,
    out = new Uint8Array(w * h);
  const v = (x: number, y: number) => (x < 0 || y < 0 ? 1 : data[y * w + x]);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) out[y * w + x] = v(x, y) & v(x - 1, y) & v(x, y - 1) & v(x - 1, y - 1);
  return { width: w, height: h, data: out };
}

export function median(values: ArrayLike<number>): number {
  const a = Float64Array.from(values).sort(),
    n = a.length;
  if (!n) return NaN;
  return n % 2 ? a[(n - 1) / 2] : (a[n / 2 - 1] + a[n / 2]) / 2;
}

export function modeColour(img: RGB, quant = 8): [number, number, number] {
  const counts = new Map<number, { n: number; r: number; g: number; b: number }>();
  for (let i = 0; i < img.width * img.height; i++) {
    const r = img.data[i * 3],
      g = img.data[i * 3 + 1],
      b = img.data[i * 3 + 2];
    const k = ((r / quant) | 0) * 65536 + ((g / quant) | 0) * 256 + ((b / quant) | 0);
    const c = counts.get(k) ?? { n: 0, r: 0, g: 0, b: 0 };
    c.n++;
    c.r += r;
    c.g += g;
    c.b += b;
    counts.set(k, c);
  }
  const best = [...counts.values()].sort((a, b) => b.n - a.n)[0];
  return [Math.round(best.r / best.n), Math.round(best.g / best.n), Math.round(best.b / best.n)];
}
