import { test, expect } from 'bun:test';
import { assignCategories, clusterColours, nearestCategory } from '../tools/pipeline/lib/categorise';

test('clusters near colours and counts members', () => {
  const c = clusterColours([
    [250, 136, 179],
    [248, 140, 180],
    [27, 132, 198],
    [30, 130, 200],
    [29, 131, 199],
  ]);
  expect(c.map((x) => x.count).sort()).toEqual([2, 3]);
});

test('matches clusters to existing categories or creates placeholders', () => {
  const r = assignCategories([{ rgb: [250, 136, 179] }, { rgb: [10, 200, 10] }], { kids: [250, 136, 179] });
  expect(Object.keys(r.categoryColours).sort()).toEqual(['cat1', 'kids']);
  expect(r.created.cat1.en).toBe('Category 1');
  expect(r.created.cat1.color).toBe('#0AC80A');
  expect(nearestCategory([12, 198, 12], r.categoryColours)).toBe('cat1');
});

test('rerunning never reuses an existing category key', () => {
  const r = assignCategories([{ rgb: [0, 0, 255] }], { cat1: [255, 0, 0], kids: [250, 136, 179] });
  expect(Object.keys(r.created)).toEqual(['cat2']);
  expect(r.categoryColours.cat1).toEqual([255, 0, 0]);
});
