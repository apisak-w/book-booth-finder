export function nearestCategory(
  rgb: [number, number, number],
  colours: Record<string, [number, number, number]>,
): string {
  let best = '',
    bd = Infinity;
  for (const [k, c] of Object.entries(colours)) {
    const d = (c[0] - rgb[0]) ** 2 + (c[1] - rgb[1]) ** 2 + (c[2] - rgb[2]) ** 2;
    if (d < bd) {
      bd = d;
      best = k;
    }
  }
  return best;
}
