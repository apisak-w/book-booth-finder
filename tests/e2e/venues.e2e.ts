import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

const venue = JSON.parse(readFileSync('venues/qsncc-lg-5-8/venue.json', 'utf8'));
const event = JSON.parse(readFileSync('events/bkkibf-2026/event.json', 'utf8'));
const doc = {
  venue,
  sha: 'sha-1',
  ref: 'main',
  pr: null,
  events: [
    {
      id: event.id,
      name: event.name,
      refs: ['stage', 'wc2', 'info2'],
      ids: event.landmarks.map((l: { id: string }) => l.id),
    },
  ],
};

async function mock(page: Page) {
  const saved: Record<string, unknown>[] = [];
  await page.route(/\/api\/admin\/me$/, (r) =>
    r.fulfill({ json: { signedIn: true, hasPasskeys: true, passkeys: [] } }),
  );
  await page.route(/\/api\/admin\/venues$/, (r) =>
    r.fulfill({
      json: { venues: [{ id: venue.id, name: venue.name, landmarks: venue.landmarks.length, pins: 0, pr: null }] },
    }),
  );
  await page.route(/\/api\/admin\/venue\?id=/, (r) => r.fulfill({ json: doc }));
  await page.route(/\/api\/admin\/venue\/reference/, (r) => r.fulfill({ status: 404, json: { error: 'none' } }));
  await page.route(/\/api\/admin\/venue\/save$/, async (r) => {
    saved.push(r.request().postDataJSON());
    await r.fulfill({ json: { pr: 'https://github.com/apisak-w/book-booth-finder/pull/10' } });
  });
  await page.route(/\/api\/admin\/spots/, (r) => r.fulfill({ json: { spots: [], decisions: [] } }));
  return saved;
}

async function addToilet(page: Page) {
  await page.getByRole('button', { name: /Halls 5–8/ }).click();
  await page.getByRole('button', { name: 'Add landmark' }).click();
  await page.locator('.plan-canvas').click();
  await expect(page.getByText('wc7', { exact: true })).toBeVisible();
  await page.getByLabel('Name in Thai').fill('ห้องน้ำ ฮอลล์ 9');
  await page.getByLabel('Name in Thai').blur();
  await page.getByLabel('Name in English').fill('Toilets, Hall 9');
  await page.getByLabel('Name in English').blur();
}

test.use({ viewport: { width: 1280, height: 800 } });

test('add a toilet, name it and save it to the venue pull request', async ({ page }) => {
  const saved = await mock(page);
  await page.goto('/admin/');
  await addToilet(page);
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('dialog')).toContainText('Added wc7 (Toilets, Hall 9)');
  await page.getByRole('button', { name: 'Save to pull request' }).click();
  await expect(page.getByRole('link', { name: 'Open the pull request' })).toHaveAttribute(
    'href',
    'https://github.com/apisak-w/book-booth-finder/pull/10',
  );
  expect(saved).toHaveLength(1);
  const body = saved[0] as { id: string; sha: string; venue: { landmarks: { id: string; en: string }[] } };
  expect(body).toMatchObject({ id: venue.id, sha: 'sha-1' });
  expect(body.venue.landmarks.at(-1)).toMatchObject({ id: 'wc7', en: 'Toilets, Hall 9' });
});

test('a door keeps its place, undo removes a new landmark', async ({ page }) => {
  await mock(page);
  await page.goto('/admin/');
  await page.getByRole('button', { name: /Halls 5–8/ }).click();
  await page.locator('[data-lm="door5"]').click();
  await expect(page.getByText('Position is part of the floor plan')).toBeVisible();
  await page.getByRole('button', { name: 'Add landmark' }).click();
  await page.locator('.plan-canvas').click();
  await expect(page.locator('[data-lm="wc7"]')).toHaveCount(1);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.locator('[data-lm="wc7"]')).toHaveCount(0);
});

test('unsaved changes come back after a reload', async ({ page }) => {
  await mock(page);
  await page.goto('/admin/');
  await addToilet(page);
  await page.reload();
  await page.getByRole('button', { name: /Halls 5–8/ }).click();
  await expect(page.getByText('Restored unsaved changes')).toBeVisible();
  await expect(page.locator('[data-lm="wc7"]')).toHaveCount(1);
  await page.getByRole('button', { name: 'Discard changes' }).click();
  await expect(page.locator('[data-lm="wc7"]')).toHaveCount(0);
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test('the venue is view-only', async ({ page }) => {
    await mock(page);
    await page.goto('/admin/');
    await page.getByRole('button', { name: /Halls 5–8/ }).click();
    await expect(page.getByText('Edit on a larger screen. Placing points needs a mouse or trackpad.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add landmark' })).toHaveCount(0);
  });
});
