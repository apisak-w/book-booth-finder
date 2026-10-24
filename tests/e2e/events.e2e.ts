import { test, expect, type Page } from '@playwright/test';

const onDay2 = async (page: Page) => {
  await page.clock.setFixedTime(new Date('2026-10-24T03:00:00Z'));
  await page.goto('/');
};

test('opens on On now with the Book Expo card', async ({ page }) => {
  await onDay2(page);
  await expect(page.getByRole('tab', { name: 'กำลังจัด · 1' })).toHaveAttribute('aria-selected', 'true');
  const card = page.locator('.event-card.live');
  await expect(card).toContainText('มหกรรมหนังสือระดับชาติ ครั้งที่ 31');
  await expect(card).toContainText('วันที่ 2 จาก 10');
  await expect(card).toContainText('เปิด 10.00–21.00 น.');
  await expect(card.locator('img.poster')).toHaveJSProperty('complete', true);
  expect(await card.locator('img.poster').evaluate((i: HTMLImageElement) => i.naturalWidth)).toBe(1030);
});

test('past tab shows the National Book Fair and opens it', async ({ page }) => {
  await onDay2(page);
  await page.getByRole('tab', { name: 'จบแล้ว' }).click();
  const card = page.locator('.event-card', { hasText: 'สัปดาห์หนังสือ' });
  await expect(card.locator('.badge')).toHaveText('จบแล้ว');
  await card.click();
  await expect(page).toHaveURL(/\/e\/bkkibf-2026\/$/);
  await expect(page.locator('.notice')).toBeVisible();
});

test('coming up tab says nothing is coming yet', async ({ page }) => {
  await onDay2(page);
  await page.getByRole('tab', { name: 'เร็ว ๆ นี้' }).click();
  await expect(page.getByRole('tabpanel')).toContainText('ยังไม่มีงานที่กำลังจะมา');
});

test('arrow keys move between tabs', async ({ page }) => {
  await onDay2(page);
  await page.getByRole('tab', { name: 'กำลังจัด · 1' }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'เร็ว ๆ นี้' })).toHaveAttribute('aria-selected', 'true');
});

test('after every event has ended it opens on Past', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-12-01T03:00:00Z'));
  await page.goto('/');
  await expect(page.getByRole('tab', { name: 'จบแล้ว' })).toHaveAttribute('aria-selected', 'true');
});

test('a poster that fails to load leaves a usable card', async ({ page }) => {
  await page.route('**/poster.*.jpg', (r) => r.abort());
  await onDay2(page);
  const card = page.locator('.event-card.live');
  await expect(card.getByText('หาบูธ')).toBeVisible();
  expect(await card.locator('img.poster').evaluate((i: HTMLImageElement) => i.naturalWidth)).toBe(0);
  await expect(card.locator('img.poster')).toBeHidden();
  expect((await card.locator('.poster-box').boundingBox())?.height).toBeGreaterThan(60);
});

test('long names wrap without sideways scroll', async ({ page }) => {
  await onDay2(page);
  await page.getByRole('tab', { name: 'จบแล้ว' }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('English shows the day count in English', async ({ page }) => {
  await onDay2(page);
  await page.getByRole('button', { name: 'EN', exact: true }).click();
  await expect(page.locator('.event-card.live')).toContainText('Day 2 of 10');
});

test('old share links redirect to the 2026 event', async ({ page }) => {
  await page.goto('/#to=K16&from=door6');
  await expect(page).toHaveURL(/\/e\/bkkibf-2026\/#to=K16&from=door6$/);
  await expect(page.locator('.bigcode')).toHaveText('K16');
});

test('unknown event shows the not-found page', async ({ page }) => {
  await page.goto('/e/does-not-exist/');
  await expect(page.locator('.notice')).toContainText('ไม่พบงานนี้');
  expect((await page.getByRole('link', { name: 'งานทั้งหมด' }).last().boundingBox())?.height).toBeGreaterThanOrEqual(44);
});

test.describe('before the script runs', () => {
  test.use({ javaScriptEnabled: false });

  test('every event is already a link', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('a.event-card[href="/e/bookexpo-2026/"]')).toBeVisible();
    await expect(page.locator('a.event-card[href="/e/bkkibf-2026/"]')).toBeVisible();
  });
});
