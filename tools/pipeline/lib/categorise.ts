import type { Category } from '../../../src/lib/core/types';

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

type RGB3 = [number, number, number];
const dist = (a: RGB3, b: RGB3) => Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2);
const hex = ([r, g, b]: RGB3) => '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0').toUpperCase()).join('');

export function clusterColours(colours: RGB3[], maxDist = 40): { rgb: RGB3; count: number }[] {
  const clusters: { sum: RGB3; count: number; rgb: RGB3 }[] = [];
  for (const c of colours) {
    const hit = clusters.find((k) => dist(k.rgb, c) <= maxDist);
    if (hit) {
      hit.sum = [hit.sum[0] + c[0], hit.sum[1] + c[1], hit.sum[2] + c[2]];
      hit.count++;
      hit.rgb = [
        Math.round(hit.sum[0] / hit.count),
        Math.round(hit.sum[1] / hit.count),
        Math.round(hit.sum[2] / hit.count),
      ];
    } else clusters.push({ sum: [...c], count: 1, rgb: [...c] });
  }
  return clusters.map(({ rgb, count }) => ({ rgb, count })).sort((a, b) => b.count - a.count);
}

export function assignCategories(clusters: { rgb: RGB3 }[], existing: Record<string, RGB3>, maxDist = 60) {
  const categoryColours: Record<string, RGB3> = { ...existing };
  const created: Record<string, Category> = {};
  let n = Math.max(0, ...Object.keys(existing).map((k) => Number(/^cat(\d+)$/.exec(k)?.[1] ?? 0)));
  for (const { rgb } of clusters) {
    const near = Object.values(existing).some((c) => dist(c, rgb) <= maxDist);
    if (near) continue;
    const key = `cat${++n}`;
    categoryColours[key] = rgb;
    created[key] = { th: `หมวด ${n}`, en: `Category ${n}`, color: hex(rgb) };
  }
  return { categoryColours, created };
}
