import { FOYER_ZONES } from './config.js';

/**
 * Minimal RFC-4180 CSV parser (quoted fields, doubled quotes, CRLF).
 * Lines starting with # are ignored so the file can carry notes.
 * @returns {Record<string,string>[]} rows keyed by the header row
 */
export function parseCSV(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  const src = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"' && field === '') quoted = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += ch;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  const lines = rows.filter((r) => r.some((c) => c.trim() !== '') && !r[0].trim().startsWith('#'));
  if (!lines.length) return [];
  const head = lines[0].map((h) => h.trim().toLowerCase());
  return lines.slice(1).map((r) => Object.fromEntries(head.map((h, k) => [h, (r[k] ?? '').trim()])));
}

/** Normalise a booth code: " k 16 " -> "K16", "k7" -> "K07". */
export function normCode(s) {
  const m = /^([A-Za-z])\s*0*(\d{1,2})$/.exec(String(s).trim());
  return m ? m[1].toUpperCase() + m[2].padStart(2, '0') : String(s).trim().toUpperCase();
}

/**
 * Turn raw JSON + CSV rows into the app's data model. Pure, so tests can call it.
 * Booth: { c, x, y, w, h, cat, hall, i, cx, cy, foyer? }
 * Exhibitor: { booth, th, en }
 */
export function prepareData(raw, exhibitorRows = []) {
  const booths = raw.booths.map((b) => ({ ...b }));
  const byCode = {};
  const add = (b) => { b.i = booths.indexOf(b); b.cx = b.x + b.w / 2; b.cy = b.y + b.h / 2; (byCode[b.c] ||= []).push(b); };
  booths.forEach(add);
  for (const [c, x, y, w, h] of FOYER_ZONES) {
    if (byCode[c]) continue;
    const b = { c, x, y, w, h, cat: 'special', hall: null, foyer: true };
    booths.push(b); add(b);
  }
  const exhibitors = exhibitorRows
    .map((r) => ({ booth: normCode(r.booth || ''), th: r.name_th || '', en: r.name_en || '' }))
    .filter((e) => e.booth && (e.th || e.en));
  const unknown = exhibitors.filter((e) => !byCode[e.booth]).map((e) => e.booth);
  return { booths, pillars: raw.pillars, byCode, exhibitors, unknownExhibitorBooths: [...new Set(unknown)] };
}

/** Browser loader. Paths are relative to index.html. */
export async function loadData() {
  const [raw, csv] = await Promise.all([
    fetch('data/booths.json').then((r) => { if (!r.ok) throw new Error('data/booths.json ' + r.status); return r.json(); }),
    fetch('data/exhibitors.csv').then((r) => (r.ok ? r.text() : '')).catch(() => ''),
  ]);
  const data = prepareData(raw, parseCSV(csv));
  if (data.unknownExhibitorBooths.length) {
    console.warn('exhibitors.csv lists booth codes not on the map:', data.unknownExhibitorBooths.join(', '));
  }
  return data;
}
