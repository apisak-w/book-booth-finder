import sharp from 'sharp';
import { createWorker, PSM } from 'tesseract.js';
import type { Box, Rect } from '../../../src/lib/core/types';
import { crop, type RGB } from './image';
import type { Cell } from './detect';
import type { Read } from './build';
import { rectToVenue, type Transform } from './register';

const TO_DIGIT: Record<string, string> = {
  O: '0',
  D: '0',
  Q: '0',
  I: '1',
  L: '1',
  T: '1',
  Z: '2',
  S: '5',
  B: '8',
  G: '6',
};
const TO_LETTER: Record<string, string> = { '0': 'O', '1': 'I', '2': 'Z', '5': 'S', '8': 'B', '6': 'G' };

export function readBox(c: Rect): Box {
  const cx = Math.floor(c.x + c.w / 2),
    cy = Math.floor(c.y + c.h / 2);
  const hw = Math.max(Math.min(Math.floor(c.w / 2), 40), 16),
    hh = Math.max(Math.min(Math.floor(c.h / 2), 16), 12);
  const x0 = Math.max(cx - hw, c.x + 2),
    x1 = Math.min(cx + hw, c.x + c.w - 2);
  const y0 = Math.max(cy - hh, c.y + 2),
    y1 = Math.min(cy + hh, c.y + c.h - 2);
  return [x0, y0, x1, y1];
}

export function cleanRead(text: string, codePattern: string): string | null {
  const re = new RegExp(codePattern);
  const raw = text.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!raw) return null;
  if (re.test(raw)) return raw;
  const fixed = [...raw].map((ch, k) => (k === 0 ? (TO_LETTER[ch] ?? ch) : (TO_DIGIT[ch] ?? ch))).join('');
  return re.test(fixed) ? fixed : null;
}

const numOf = (code: string) => Number(code.slice(1));

export function flagReads(reads: Read[], rects: Rect[]): Read[] {
  const out = reads.map((r) => ({ ...r, flags: [] as string[] }));
  const counts = new Map<string, number>();
  for (const r of out) if (r.code) counts.set(r.code, (counts.get(r.code) ?? 0) + 1);
  out.forEach((r) => {
    if (!r.code) r.flags.push('unread');
    else {
      if (r.conf < 60) r.flags.push('low-confidence');
      if ((counts.get(r.code) ?? 0) > 1) r.flags.push('duplicate');
    }
  });
  const columns = new Map<number, number[]>();
  rects.forEach((rect, k) => {
    const key = [...columns.keys()].find((x) => Math.abs(x - rect.x) <= 3) ?? rect.x;
    columns.set(key, [...(columns.get(key) ?? []), k]);
  });
  for (const idx of columns.values()) {
    const col = idx.filter((k) => out[k].code).sort((a, b) => rects[a].y - rects[b].y);
    if (col.length < 3) continue;
    const letters = new Map<string, number>();
    for (const k of col) letters.set(out[k].code![0], (letters.get(out[k].code![0]) ?? 0) + 1);
    const major = [...letters.entries()].sort((a, b) => b[1] - a[1])[0][0];
    for (const k of col) if (out[k].code![0] !== major) out[k].flags.push('column-letter');
    const same = col.filter((k) => out[k].code![0] === major);
    if (same.length < 3) continue;
    const nums = same.map((k) => numOf(out[k].code!));
    const dir = Math.sign(nums[nums.length - 1] - nums[0]) || 1;
    for (let j = 1; j < same.length; j++)
      if (Math.sign(nums[j] - nums[j - 1]) !== dir) out[same[j]].flags.push('column-order');
  }
  return out;
}

async function prep(img: RGB, box: Box, rotate: boolean): Promise<Buffer> {
  const c = crop(img, box);
  let s = sharp(Buffer.from(c.data), { raw: { width: c.width, height: c.height, channels: 3 } }).greyscale();
  const { data } = await s.clone().raw().toBuffer({ resolveWithObject: true });
  const v = Float64Array.from(data).sort();
  const med = v[v.length >> 1],
    lo = v[Math.floor(v.length * 0.02)],
    hi = v[Math.floor(v.length * 0.98)];
  if (hi - med > med - lo) s = s.negate({ alpha: false });
  if (rotate) s = s.rotate(90);
  const width = (rotate ? c.height : c.width) * 4;
  const text = await s.resize({ width, kernel: 'cubic' }).normalise().png().toBuffer();
  return sharp(text)
    .extend({ top: 20, bottom: 20, left: 20, right: 20, background: '#ffffff' })
    .withMetadata({ density: 300 })
    .png()
    .toBuffer();
}

export async function readCells(img: RGB, cells: Cell[], t: Transform, codePattern: string): Promise<Read[]> {
  const worker = await createWorker('eng');
  await worker.setParameters({
    tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
    tessedit_pageseg_mode: PSM.SINGLE_LINE,
  });
  const reads: Read[] = [];
  try {
    for (const cell of cells) {
      const v = rectToVenue(t, cell);
      const at: [number, number] = [v.x + v.w / 2, v.y + v.h / 2];
      let best = { text: '', conf: 0, code: null as string | null };
      for (const rotate of cell.h > cell.w * 2 ? [false, true] : [false]) {
        const { data } = await worker.recognize(await prep(img, readBox(cell), rotate));
        const code = cleanRead(data.text, codePattern);
        if ((code && !best.code) || (!!code === !!best.code && data.confidence > best.conf))
          best = { text: data.text.trim(), conf: data.confidence, code };
      }
      reads.push({ at, ...best, flags: [] });
    }
  } finally {
    await worker.terminate();
  }
  return flagReads(
    reads,
    cells.map((c) => rectToVenue(t, c)),
  );
}
