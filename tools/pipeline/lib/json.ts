export function stringifyJson(value: unknown): string {
  const text = JSON.stringify(value, null, 2);
  return (
    text.replace(
      /\[\s+(-?[\d.e+-]+(?:,\s+-?[\d.e+-]+)*)\s+\]/g,
      (_m, inner: string) => `[${inner.split(/,\s+/).join(', ')}]`,
    ) + '\n'
  );
}
