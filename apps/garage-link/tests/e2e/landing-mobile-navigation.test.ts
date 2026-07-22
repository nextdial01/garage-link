import { expect, test } from '@playwright/test';

test.describe('GARAGE LINK LP mobile navigation', () => {
  for (const width of [360, 390, 430]) {
    test(`opens, closes, and follows an in-page destination at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
      await page.goto('/');

      const trigger = page.getByTestId('mobile-menu-trigger');

      await expect(trigger).toBeVisible();
      await expect(trigger).toHaveAttribute('aria-expanded', 'false');

      await trigger.click();
      await expect(trigger).toHaveAttribute('aria-expanded', 'true');
      await expect(page.getByRole('navigation', { name: 'スマホメニュー' })).toBeVisible();

      await page.keyboard.press('Escape');
      await expect(trigger).toHaveAttribute('aria-expanded', 'false');
      await expect(page.getByRole('navigation', { name: 'スマホメニュー' })).toBeHidden();

      await trigger.click();
      await page.getByRole('navigation', { name: 'スマホメニュー' }).getByRole('link', { name: '機能' }).click();
      await expect(page).toHaveURL(/#features$/);
      await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    });
  }

  test('keeps the mobile control hidden on desktop', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/');

    await expect(page.getByTestId('mobile-menu-trigger')).toBeHidden();
    await expect(page.getByRole('navigation', { name: 'メインナビゲーション' })).toBeVisible();
  });

  test('uses one maintained icon system instead of one-off inline drawings', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');

    expect(await page.locator('main svg.lucide').count()).toBeGreaterThanOrEqual(10);
  });
});
