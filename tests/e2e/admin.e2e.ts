import { test, expect, type Page } from '@playwright/test';
import { loadVenue } from '../../src/lib/server/catalog';
import { georef, planToLatLng } from '../../src/lib/core/geo';

const venue = loadVenue('qsncc-lg-5-8');
const g = venue.geo ? georef(venue.geo.pins) : null;
const mrt = venue.landmarks.find((l) => l.id === 'mrt')!;
const spots = g
  ? Array.from({ length: 6 }, (_, k) => ({
      event: 'bkkibf-2026',
      kind: 'door',
      place: 'mrt',
      ...planToLatLng(g, [mrt.x + 59 + 5 * Math.cos(k), mrt.y + 5 * Math.sin(k)]),
      accuracy: 8,
      hour: '2026-03-27T03',
    }))
  : [];

async function mock(page: Page, signedIn: boolean, list = spots) {
  await page.route(/\/api\/admin\/me$/, (r) => r.fulfill({ json: { signedIn, hasPasskeys: true, passkeys: [] } }));
  await page.route(/\/api\/admin\/spots/, (r) => r.fulfill({ json: { spots: list, decisions: [] } }));
}

test('signed out: offers passkey sign-in and set-up', async ({ page }) => {
  await mock(page, false);
  await page.goto('/admin/');
  await expect(page.getByRole('button', { name: 'Sign in with a passkey' })).toBeVisible();
  await expect(page.getByText('Set up a passkey')).toBeVisible();
});

test('signed in with no venue pinned yet: says so', async ({ page }) => {
  test.skip(!!g, 'qsncc-lg-5-8 has map pins');
  await mock(page, true);
  await page.goto('/admin/');
  await expect(page.getByText('No venue has map pins yet.')).toBeVisible();
});

test('signed in: shows what guests suggest and opens a pull request on Move pin', async ({ page }) => {
  test.skip(!g, 'qsncc-lg-5-8 has no map pins yet');
  await mock(page, true);
  let posted: unknown = null;
  await page.route(/\/api\/admin\/decisions$/, async (r) => {
    posted = r.request().postDataJSON();
    await r.fulfill({ json: { pr: 'https://github.com/apisak-w/book-booth-finder/pull/8' } });
  });
  await page.goto('/admin/');
  const place = page.getByRole('button', { name: /MRT QSNCC station \(exit 3\)/ });
  await expect(place).toContainText('6 spots · suggests a move');
  await place.click();
  await expect(page.getByText('Map pin checks pass after the move.')).toBeVisible();
  await page.getByRole('button', { name: 'Move pin' }).click();
  await expect(page.getByRole('link', { name: 'Open the pull request' })).toHaveAttribute(
    'href',
    'https://github.com/apisak-w/book-booth-finder/pull/8',
  );
  expect(posted).toEqual({
    venue: 'qsncc-lg-5-8',
    place: 'mrt',
    action: 'move',
    filters: { accuracy: true, near: true, eventDays: true },
  });
});

test('Move pin stays off with too few spots and says why', async ({ page }) => {
  test.skip(!g, 'qsncc-lg-5-8 has no map pins yet');
  await mock(page, true, spots.slice(0, 2));
  await page.goto('/admin/');
  await expect(page.getByRole('button', { name: 'Move pin' })).toBeDisabled();
  await expect(page.getByText('Only 2 good spots. Moving a pin needs 5.')).toBeVisible();
});
