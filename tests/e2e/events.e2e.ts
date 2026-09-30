import { test, expect } from '@playwright/test';

test('root lists the 2026 event and links to it', async ({ page }) => {
  await page.goto('/');
  const card = page.locator('.event-card', { hasText: 'สัปดาห์หนังสือ' });
  await expect(card).toBeVisible();
  await expect(card.locator('.badge')).toHaveText('จบแล้ว');
  await card.click();
  await expect(page).toHaveURL(/\/e\/bkkibf-2026\/$/);
  await expect(page.locator('.notice')).toBeVisible();
});

test('old share links redirect to the 2026 event', async ({ page }) => {
  await page.goto('/#to=K16&from=door6');
  await expect(page).toHaveURL(/\/e\/bkkibf-2026\/#to=K16&from=door6$/);
  await expect(page.locator('.bigcode')).toHaveText('K16');
});

test('unknown event shows the not-found page', async ({ page }) => {
  await page.goto('/e/does-not-exist/');
  await expect(page.locator('.notice')).toContainText('ไม่พบงานนี้');
});
