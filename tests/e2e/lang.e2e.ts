import { test, expect } from '@playwright/test';

const brand = (page: import('@playwright/test').Page) => page.locator('header .brand b');

test.describe('a Thai device', () => {
  test.use({ locale: 'th-TH' });

  test('opens in Thai', async ({ page }) => {
    await page.goto('/e/bkkibf-2026/');
    await expect(brand(page)).toHaveText('ค้นหาบูธ');
    await expect(page.locator('html')).toHaveAttribute('lang', 'th');
  });
});

test.describe('an English device', () => {
  test.use({ locale: 'en-US' });

  test('opens in English', async ({ page }) => {
    await page.goto('/e/bkkibf-2026/');
    await expect(brand(page)).toHaveText('Booth Finder');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  });

  test('a saved choice beats the device language', async ({ page }) => {
    await page.goto('/e/bkkibf-2026/');
    await page.getByRole('button', { name: 'ไทย', exact: true }).click();
    await page.reload();
    await expect(brand(page)).toHaveText('ค้นหาบูธ');
  });
});

test.describe('a device in another language', () => {
  test.use({ locale: 'ja-JP' });

  test('falls back to English', async ({ page }) => {
    await page.goto('/e/bkkibf-2026/');
    await expect(brand(page)).toHaveText('Booth Finder');
  });
});
