import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { loadVenue } from '../../src/lib/server/catalog';
import { georef, planToLatLng } from '../../src/lib/core/geo';

const venue = loadVenue('qsncc-lg-5-8');
const g = venue.geo ? georef(venue.geo.pins) : null;
const at = (x: number, y: number, accuracy = 15) => {
  const ll = planToLatLng(g!, [x, y]);
  return { latitude: ll.lat, longitude: ll.lng, accuracy };
};
const DURING_FAIR = new Date('2026-03-27T03:00:00Z');

test.skip(!g, 'qsncc-lg-5-8 has no map pins yet');

async function open(context: BrowserContext, page: Page, x: number, y: number, accuracy = 15) {
  await page.clock.setFixedTime(DURING_FAIR);
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation(at(x, y, accuracy));
  await page.goto('/e/bkkibf-2026/#to=A42');
  await page.getByRole('button', { name: 'EN', exact: true }).click();
  await page.locator('.locbtn').click();
}

async function arriveAtMrt(context: BrowserContext, page: Page, accuracy = 15) {
  await open(context, page, -200, 560, accuracy);
  await expect(page.locator('.outleg')).toBeVisible();
  await context.setGeolocation(at(260, 560, accuracy));
  await expect(page.locator('.mapbanner')).toContainText("You're at");
}

test('at the door: sends one spot, then does not ask again at this event', async ({ page, context }) => {
  const sent: Record<string, unknown>[] = [];
  await page.route('**/api/spots', async (route) => {
    sent.push(route.request().postDataJSON());
    await route.fulfill({ status: 204 });
  });
  await arriveAtMrt(context, page);
  await expect(page.locator('.spotask')).toContainText('Help line up the map?');
  await expect(page.getByRole('link', { name: 'What we keep' })).toHaveAttribute('href', '/what-we-keep/');
  await page.getByRole('button', { name: 'Send this spot' }).click();
  await expect(page.locator('.toast')).toContainText('Thanks. Spot sent.');
  await expect(page.locator('.spotask')).toHaveCount(0);
  expect(sent).toHaveLength(1);
  expect(sent[0]).toMatchObject({ event: 'bkkibf-2026', kind: 'door', place: 'mrt', accuracy: 15 });
  expect(Object.keys(sent[0]).sort()).toEqual(['accuracy', 'event', 'kind', 'lat', 'lng', 'place']);
  await page.reload();
  await page.locator('.locbtn').click();
  await expect(page.locator('.mapbanner')).toContainText("You're at");
  await expect(page.locator('.spotask')).toHaveCount(0);
});

test('a failed send says so and lets the guest carry on', async ({ page, context }) => {
  await page.route('**/api/spots', (route) => route.fulfill({ status: 500, body: '{}' }));
  await arriveAtMrt(context, page);
  await page.getByRole('button', { name: 'Send this spot' }).click();
  await expect(page.locator('.toast')).toContainText("Couldn't send the spot. You can carry on.");
  await expect(page.locator('#from')).toHaveValue('mrt');
});

test('no thanks with the box ticked never asks again at this event', async ({ page, context }) => {
  let calls = 0;
  await page.route('**/api/spots', (route) => {
    calls++;
    return route.fulfill({ status: 204 });
  });
  await arriveAtMrt(context, page);
  await page.getByLabel("Don't ask again at this event").check();
  await page.getByRole('button', { name: 'No thanks' }).click();
  await expect(page.locator('.spotask')).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('bf:bkkibf-2026:asked'))).toBe('never');
  expect(calls).toBe(0);
});

test('picking a hall indoors offers a hall spot', async ({ page, context }) => {
  const sent: Record<string, unknown>[] = [];
  await page.route('**/api/spots', async (route) => {
    sent.push(route.request().postDataJSON());
    await route.fulfill({ status: 204 });
  });
  await open(context, page, 1000, 900);
  await page.locator('.hallbtn', { hasText: 'Hall 6' }).click();
  await expect(page.locator('.spotask')).toContainText('this hall');
  await page.getByRole('button', { name: 'Send this spot' }).click();
  await expect.poll(() => sent.length).toBe(1);
  expect(sent[0]).toMatchObject({ kind: 'hall', place: 'hall6' });
});

test('a rough reading at the door does not ask', async ({ page, context }) => {
  await arriveAtMrt(context, page, 70);
  await expect(page.locator('.spotask')).toHaveCount(0);
});
