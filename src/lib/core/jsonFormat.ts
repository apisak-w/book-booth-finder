const WIDTH = 120;

const isFull = (x: unknown) =>
  Array.isArray(x) ? x.length > 1 : !!x && typeof x === 'object' && Object.keys(x).length > 0;

function fmt(v: unknown, indent: string, used: number): string {
  if (Array.isArray(v)) {
    if (!v.length) return '[]';
    const pad = indent + '  ';
    const inline = `[${v.map((x) => fmt(x, pad, 0)).join(', ')}]`;
    const nested = v.length > 1 && v.every(isFull);
    if (!nested && !inline.includes('\n') && used + inline.length + 1 <= WIDTH) return inline;
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
