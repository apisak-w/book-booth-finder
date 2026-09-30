import type { Booth } from '../core/types';

export function boothLabel(b: Booth, short?: string) {
  const fs = Math.min(13, Math.max(8, Math.min(b.w * 0.36, b.h * 0.5)));
  if (short && b.w > 50) {
    const words = short.split(' ');
    const lines = words.length > 2 ? [words.slice(0, 2).join(' '), words.slice(2).join(' ')] : [words.join(' ')];
    return {
      fs,
      code: { x: b.cx, y: b.cy - 12, rotate: false },
      lines: lines.map((text, k) => ({ x: b.cx, y: b.cy + 4 + k * 12, text })),
    };
  }
  return { fs, code: { x: b.cx, y: b.cy, rotate: short !== undefined && b.w < 32 && b.h > 60 }, lines: [] };
}
