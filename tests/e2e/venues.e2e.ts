import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

const venue = JSON.parse(readFileSync('venues/qsncc-lg-5-8/venue.json', 'utf8'));
const event = JSON.parse(readFileSync('events/bkkibf-2026/event.json', 'utf8'));
const bare = { ...venue, geo: undefined };
const docFor = (v: typeof venue) => ({
  venue: v,
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
});

async function mock(page: Page, v: typeof venue = venue) {
  const saved: Record<string, unknown>[] = [];
  await page.route(/\/api\/admin\/me$/, (r) =>
    r.fulfill({ json: { signedIn: true, hasPasskeys: true, passkeys: [] } }),
  );
  await page.route(/\/api\/admin\/venues$/, (r) =>
    r.fulfill({
      json: { venues: [{ id: venue.id, name: venue.name, landmarks: venue.landmarks.length, pins: 0, pr: null }] },
    }),
  );
  await page.route(/\/api\/admin\/venue\?id=/, (r) => r.fulfill({ json: docFor(v) }));
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

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
);

test('map pins: find the venue, click the plan, then the street map', async ({ page }) => {
  await mock(page, bare);
  await page.route(/tile\.openstreetmap\.org/, (r) => r.fulfill({ contentType: 'image/png', body: PNG }));
  await page.goto('/admin/');
  await page.getByRole('button', { name: /Halls 5–8/ }).click();
  await page.getByRole('button', { name: 'Map pins' }).click();
  await page.getByLabel("Paste the venue's coordinates").fill('13.7236, 100.5597');
  await page.getByRole('button', { name: 'Show on the street map' }).click();
  await expect(page.getByText('© OpenStreetMap contributors')).toBeVisible();
  const onScreen = await page.locator('.street-picker svg').evaluate((svg) => {
    const r = svg.getBoundingClientRect();
    return [...svg.querySelectorAll('image')].filter((i) => {
      const b = i.getBoundingClientRect();
      return b.right > r.left && b.left < r.right && b.bottom > r.top && b.top < r.bottom;
    }).length;
  });
  expect(onScreen).toBeGreaterThan(0);
  await page.locator('.plan-canvas').click();
  await expect(page.getByText('Now click the same spot on the street map')).toBeVisible();
  await page.locator('.street-picker svg').click();
  await expect(page.locator('.pin-row')).toHaveCount(1);
  await expect(page.locator('.pin-row')).toContainText('13.72360, 100.55970');
  await expect(page.getByText('Add at least 3 pins')).toBeVisible();
});

test('map pins: with no street tiles, pasting coordinates still works', async ({ page }) => {
  await mock(page, bare);
  await page.route(/tile\.openstreetmap\.org/, (r) => r.fulfill({ status: 503, body: '' }));
  await page.goto('/admin/');
  await page.getByRole('button', { name: /Halls 5–8/ }).click();
  await page.getByRole('button', { name: 'Map pins' }).click();
  await page.getByLabel("Paste the venue's coordinates").fill('13.7236, 100.5597');
  await page.getByRole('button', { name: 'Show on the street map' }).click();
  await page.locator('.plan-canvas').click();
  await page.getByLabel('Paste coordinates for this pin').fill('13.72401, 100.55912');
  await page.getByRole('button', { name: 'Set pin' }).click();
  await expect(page.locator('.pin-row')).toContainText('13.72401, 100.55912');
  await expect(page.getByText('© OpenStreetMap contributors')).toBeVisible();
});

test('Add map pins from Guest spots opens the editor in map pins mode', async ({ page }) => {
  test.skip(!!venue.geo, 'every venue already has map pins, so Guest spots shows its review screen');
  await mock(page);
  await page.goto('/admin/');
  await page.getByRole('navigation', { name: 'Admin sections' }).getByRole('button', { name: 'Guest spots' }).click();
  await page.getByRole('button', { name: 'Add map pins' }).click();
  await expect(page.getByRole('button', { name: 'Map pins' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByLabel("Paste the venue's coordinates")).toBeVisible();
});

test('map pins: a pinned venue shows its pins, the fit and its street entrances', async ({ page }) => {
  test.skip(!venue.geo, 'qsncc-lg-5-8 has no map pins yet');
  await mock(page);
  await page.route(/tile\.openstreetmap\.org/, (r) => r.fulfill({ contentType: 'image/png', body: PNG }));
  await page.goto('/admin/');
  await page.getByRole('button', { name: /Halls 5–8/ }).click();
  await page.getByRole('button', { name: 'Map pins' }).click();
  await expect(page.locator('.pin-row')).toHaveCount(venue.geo.pins.length);
  await expect(page.getByText('Map pin checks pass.')).toBeVisible();
  await expect(page.getByRole('checkbox', { name: 'MRT QSNCC station (exit 3)' })).toBeChecked();
  await expect(page.getByRole('button', { name: 'Save' })).toBeDisabled();
});

test('an off-centre click only selects a landmark, a drag moves it', async ({ page }) => {
  await mock(page);
  await page.goto('/admin/');
  await page.getByRole('button', { name: /Halls 5–8/ }).click();
  const wc2 = venue.landmarks.find((l: { id: string }) => l.id === 'wc2');
  const box = (await page.locator('[data-lm="wc2"]').boundingBox())!;
  await page.mouse.click(box.x + box.width * 0.8, box.y + box.height * 0.8);
  await expect(page.getByText(`Plan ${wc2.x}, ${wc2.y}`)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save' })).toBeDisabled();
  const cx = box.x + box.width / 2,
    cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 30, cy + 40, { steps: 5 });
  await page.mouse.move(cx + 60, cy + 80, { steps: 5 });
  await page.mouse.up();
  await expect(page.getByText(`Plan ${wc2.x}, ${wc2.y}`)).toHaveCount(0);
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('dialog')).toContainText(`Moved wc2 (${wc2.en})`);
});

test('panning in Add landmark mode does not add a landmark', async ({ page }) => {
  await mock(page);
  await page.goto('/admin/');
  await page.getByRole('button', { name: /Halls 5–8/ }).click();
  await page.getByRole('button', { name: 'Add landmark' }).click();
  const box = (await page.locator('.plan-canvas').boundingBox())!;
  const cx = box.x + box.width / 2,
    cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 80, cy + 40, { steps: 8 });
  await page.mouse.up();
  await expect(page.locator('[data-lm="wc7"]')).toHaveCount(0);
  await page.mouse.click(cx, cy);
  await expect(page.locator('[data-lm="wc7"]')).toHaveCount(1);
});
