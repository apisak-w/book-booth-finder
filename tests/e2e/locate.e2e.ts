import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { loadVenue } from '../../src/lib/server/catalog';
import { georef, planToLatLng } from '../../src/lib/core/geo';

const venue = loadVenue('qsncc-lg-5-8');
const g = venue.geo ? georef(venue.geo.pins) : null;
const at = (x: number, y: number, accuracy = 15) => {
  const ll = planToLatLng(g!, [x, y]);
  return { latitude: ll.lat, longitude: ll.lng, accuracy };
};
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
);

test.skip(!g, 'qsncc-lg-5-8 has no map pins yet');

async function open(context: BrowserContext, page: Page, x: number, y: number, accuracy = 15) {
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation(at(x, y, accuracy));
  await page.goto('/e/bkkibf-2026/#to=A42');
  await page.getByRole('button', { name: 'EN', exact: true }).click();
  await page.locator('.locbtn').click();
}

test('outside: walks to the best entrance, then hands off at the door', async ({ page, context }) => {
  await open(context, page, -200, 560);
  await expect(page.locator('.outleg')).toContainText('Walk to MRT QSNCC station (exit 3)');
  await expect(page.locator('#layer-you .dot')).toHaveCount(1);
  await expect(page.locator('#layer-street')).toHaveCount(1);
  await context.setGeolocation(at(260, 560));
  await expect(page.locator('.mapbanner')).toContainText("You're at MRT QSNCC station (exit 3)");
  await expect(page.locator('#from')).toHaveValue('mrt');
  await expect(page.locator('#layer-you .dot')).toHaveCount(0);
  await page.reload();
  await expect(page.locator('#from')).toHaveValue('mrt');
});

test('inside: asks which hall and starts from that hall door', async ({ page, context }) => {
  await open(context, page, 1000, 900);
  await expect(page.locator('.hallq')).toContainText('Which hall are you in?');
  await expect(page.locator('.hallbtn.guess')).toContainText('Hall 6');
  await page.locator('.hallbtn', { hasText: 'Hall 6' }).click();
  await expect(page.locator('#from')).toHaveValue('door6');
  await expect(page.locator('.hallq')).toHaveCount(0);
});

test('weak GPS says so and does not hand off', async ({ page, context }) => {
  await open(context, page, 260, 560, 250);
  await expect(page.locator('.from .hint')).toContainText('GPS is weak here');
  await expect(page.locator('.mapbanner')).toHaveCount(0);
});

test('location refused shows the note and keeps the list', async ({ page, context }) => {
  await context.clearPermissions();
  await page.goto('/e/bkkibf-2026/#to=A42');
  await page.getByRole('button', { name: 'EN', exact: true }).click();
  await page.locator('.locbtn').click();
  await expect(page.locator('.from .hint')).toContainText('Location is off for this site');
  await expect(page.locator('#from')).toBeEnabled();
});

test('picking from the list while locating stops locating', async ({ page, context }) => {
  await open(context, page, -200, 560);
  await expect(page.locator('#layer-you .dot')).toHaveCount(1);
  await page.locator('#from').selectOption('door6');
  await expect(page.locator('#layer-you .dot')).toHaveCount(0);
  await context.setGeolocation(at(-150, 560));
  await page.waitForTimeout(500);
  await expect(page.locator('#from')).toHaveValue('door6');
});

test('tile errors fall back to the offline map', async ({ page, context }) => {
  await open(context, page, -200, 560);
  await expect(page.locator('.chip.offline')).toHaveText('Offline map');
});

test('working tiles hide the offline chip and show their credit', async ({ page, context }) => {
  await page.route('**/__tiles/**', (r) => r.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
  await open(context, page, -200, 560);
  await expect(page.locator('#layer-street image').first()).toBeAttached();
  await expect(page.locator('.chip.offline')).toHaveCount(0);
  await expect(page.locator('.credit')).toContainText('Test tiles');
});

test('no fix at all says location could not be found', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'geolocation', {
      value: {
        watchPosition: (_ok: unknown, fail: (e: { code: number }) => void) => {
          setTimeout(() => fail({ code: 2 }), 50);
          return 1;
        },
        clearWatch: () => {},
      },
    });
  });
  await page.goto('/e/bkkibf-2026/#to=A42');
  await page.getByRole('button', { name: 'EN', exact: true }).click();
  await page.locator('.locbtn').click();
  await expect(page.locator('.from .hint')).toContainText("We couldn't find your location");
});

test('a GPS hiccup after the first fix keeps locating', async ({ page }) => {
  await page.addInitScript(
    (p) => {
      Object.defineProperty(navigator, 'geolocation', {
        value: {
          watchPosition: (ok: (pos: unknown) => void, fail: (e: { code: number }) => void) => {
            setTimeout(() => ok({ coords: { latitude: p.latitude, longitude: p.longitude, accuracy: 15 } }), 50);
            setTimeout(() => fail({ code: 3 }), 150);
            return 1;
          },
          clearWatch: () => {},
        },
      });
    },
    at(-200, 560),
  );
  await page.goto('/e/bkkibf-2026/#to=A42');
  await page.getByRole('button', { name: 'EN', exact: true }).click();
  await page.locator('.locbtn').click();
  await expect(page.locator('.outleg')).toBeVisible();
  await page.waitForTimeout(400);
  await expect(page.locator('.outleg')).toBeVisible();
  await expect(page.locator('.from .hint')).toHaveCount(0);
});
