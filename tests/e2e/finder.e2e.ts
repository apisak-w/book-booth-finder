import { test, expect } from '@playwright/test';

test('deep link renders the card and steps', async ({ page }) => {
  await page.goto('/e/bkkibf-2026/#to=K16&from=mrt');
  await expect(page.locator('.bigcode')).toHaveText('K16');
  await page.getByRole('button', { name: 'EN', exact: true }).click();
  await expect(page.locator('.steps li')).toContainText(['Start at MRT']);
  await expect(page.locator('.steps')).toContainText('Turn into aisle K');
  await expect(page.locator('#layer-route path.line')).toHaveCount(1);
});

test('search picks a booth and updates the hash', async ({ page }) => {
  await page.goto('/e/bkkibf-2026/');
  await page.locator('#q').fill('T02');
  await page.locator('.results button').first().click();
  await expect(page.locator('.bigcode')).toHaveText('T02');
  await expect(page).toHaveURL(/#to=T02/);
});

test('tapping a booth on the map selects it', async ({ page }) => {
  await page.goto('/e/bkkibf-2026/#to=K16');
  await page.locator('[data-b]').filter({ hasText: 'K16' }).first().click();
  await expect(page.locator('.bigcode')).toHaveText('K16');
});

test('language choice survives a reload', async ({ page }) => {
  await page.goto('/e/bkkibf-2026/');
  await page.getByRole('button', { name: 'EN', exact: true }).click();
  await page.reload();
  await expect(page.locator('header .brand b')).toHaveText('Booth Finder');
});

test('the start point persists and the share link carries it', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/e/bkkibf-2026/#to=K16');
  await page.locator('#from').selectOption('door6');
  await expect(page).toHaveURL(/from=door6/);
  await page.reload();
  await expect(page.locator('#from')).toHaveValue('door6');
});
