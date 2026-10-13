const WIDTH = 120;

const WIDE = /[\u1100-\u115f\u2e80-\ua4cf\uac00-\ud7a3\uf900-\ufaff\ufe30-\ufe4f\uff00-\uff60\uffe0-\uffe6]/u;
const MARK = /\p{M}/u;

export function textWidth(s: string): number {
  let w = 0;
  for (const ch of s) if (!MARK.test(ch)) w += WIDE.test(ch) ? 2 : 1;
  return w;
}

const isFull = (x: unknown) =>
  Array.isArray(x) ? x.length > 1 : !!x && typeof x === 'object' && Object.keys(x).length > 0;

function fmt(v: unknown, indent: string, used: number): string {
  if (Array.isArray(v)) {
    if (!v.length) return '[]';
    const pad = indent + '  ';
    const inline = `[${v.map((x) => fmt(x, pad, 0)).join(', ')}]`;
    const nested = v.length > 1 && v.every(isFull);
    if (!nested && !inline.includes('\n') && used + textWidth(inline) + 1 <= WIDTH) return inline;
    if (v.length > 1 && v.every((x) => typeof x === 'number')) {
      const lines: string[] = [];
      let line = '';
      for (const p of v.map((x) => JSON.stringify(x))) {
        const next = line ? `${line}, ${p}` : p;
        if (line && pad.length + next.length + 1 > WIDTH) {
          lines.push(`${line},`);
          line = p;
        } else line = next;
      }
      lines.push(line);
      return `[\n${lines.map((l) => pad + l).join('\n')}\n${indent}]`;
    }
    return `[\n${v.map((x) => pad + fmt(x, pad, pad.length)).join(',\n')}\n${indent}]`;
  }
  if (v && typeof v === 'object') {
    const pad = indent + '  ';
    const entries = Object.entries(v as Record<string, unknown>).filter(([, x]) => x !== undefined);
    if (!entries.length) return '{}';
    return `{\n${entries
      .map(([k, x]) => {
        const key = `${pad}${JSON.stringify(k)}: `;
        return key + fmt(x, pad, key.length);
      })
      .join(',\n')}\n${indent}}`;
  }
  return JSON.stringify(v);
}

export const formatVenueJson = (value: unknown) => `${fmt(value, '', 0)}\n`;

function sorted(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sorted);
  if (v && typeof v === 'object')
    return Object.fromEntries(
      Object.keys(v)
        .sort()
        .map((k) => [k, sorted((v as Record<string, unknown>)[k])]),
    );
  return v;
}

export const canonical = (value: unknown) => JSON.stringify(sorted(value));

export function orderLike(value: unknown, like: unknown): unknown {
  if (Array.isArray(value)) {
    const tpl = Array.isArray(like) ? like : [];
    return value.map((v, i) => orderLike(v, tpl[i] ?? tpl[0]));
  }
  if (value && typeof value === 'object') {
    const v = value as Record<string, unknown>;
    const t = like && typeof like === 'object' && !Array.isArray(like) ? (like as Record<string, unknown>) : {};
    const keys = [...Object.keys(t).filter((k) => k in v), ...Object.keys(v).filter((k) => !(k in t))];
    return Object.fromEntries(keys.map((k) => [k, orderLike(v[k], t[k])]));
  }
  return value;
}

export function hasUnknownKeys(input: unknown, known: unknown): boolean {
  if (Array.isArray(input)) return !Array.isArray(known) || input.some((v, i) => hasUnknownKeys(v, known[i]));
  if (input && typeof input === 'object') {
    if (!known || typeof known !== 'object' || Array.isArray(known)) return true;
    const k = known as Record<string, unknown>;
    return Object.entries(input).some(([key, v]) => !(key in k) || hasUnknownKeys(v, k[key]));
  }
  return false;
}
