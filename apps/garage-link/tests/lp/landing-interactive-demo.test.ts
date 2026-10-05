import { expect, test } from '@playwright/test';

test.describe('GARAGE LINK embedded live demo', () => {
  test('homepage has no product screenshots and can build a tailored demo', async ({ page }) => {
    await page.goto('/?scenario=used-car&management=excel&goal=inventory');

    const demo = page.getByTestId('garage-live-demo');
    await expect(demo).toBeVisible();
    await expect(page.locator('img[src*="/product-screens/"]')).toHaveCount(0);

    await demo.getByLabel('デモ業態').selectOption('motorcycle');
    await demo.getByLabel('デモ管理方法').selectOption('mixed');
    await demo.getByLabel('デモ目的').selectOption('sales');
    await demo.getByRole('button', { name: 'この条件でデモを作る' }).click();

    await expect(demo.getByText('GARAGE LINK Riders')).toBeVisible();

    await demo.getByRole('button', { name: '車両', exact: true }).first().click();
    await demo.getByRole('button', { name: /車両を追加/ }).click();
    await demo.getByLabel('デモ車両メーカー').fill('BMW');
    await demo.getByLabel('デモ車両車名').fill('G 310 R');
    await demo.getByRole('button', { name: 'このデモに追加' }).click();

    await expect(demo.getByText('BMW G 310 R').first()).toBeVisible();
    await demo.getByRole('button', { name: 'この車両で商談を作る' }).click();
    await expect(demo.getByText('BMW G 310 R 新規商談').first()).toBeVisible();

    await demo.getByText('BMW G 310 R 新規商談').first().click();
    await expect(demo.getByText('見積書')).toBeVisible();
    await expect(demo.getByRole('link', { name: 'この状態から無料で始める' })).toBeVisible();
  });

  test('desktop scroll story advances the pinned product state', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto('/');

    const story = page.locator('#product-story');
    const stage = page.getByTestId('garage-scroll-story-stage');
    await expect(stage).toBeVisible();
    expect(await stage.evaluate((element) => getComputedStyle(element).position)).toBe('sticky');

    const steps = story.locator('button[data-story-index]');
    const storyDemo = page.getByTestId('garage-scroll-story-demo');
    await expect(storyDemo.getByRole('heading', { name: '車両', exact: true })).toBeVisible();

    await steps.nth(2).scrollIntoViewIfNeeded();
    await page.waitForTimeout(260);
    await expect(storyDemo).toBeInViewport({ ratio: 0.55 });
    await expect(storyDemo.getByRole('heading', { name: '商談', exact: true })).toBeVisible();

    await steps.nth(3).scrollIntoViewIfNeeded();
    await page.waitForTimeout(260);
    await expect(storyDemo).toBeInViewport({ ratio: 0.55 });
    await expect(storyDemo.getByRole('heading', { name: '見積', exact: true })).toBeVisible();
  });

  test('compact scroll story uses direct tap switching instead of sticky scrolling', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');

    const story = page.locator('#product-story');
    const stage = page.getByTestId('garage-scroll-story-stage');
    expect(await stage.evaluate((element) => getComputedStyle(element).position)).not.toBe('sticky');

    const steps = story.locator('button[data-story-index]');
    await steps.nth(4).click();
    await expect(page.getByTestId('garage-scroll-story-demo').getByRole('heading', { name: '整備', exact: true })).toBeVisible();
    await expect(steps.nth(4)).toHaveAttribute('aria-current', 'step');
  });

  test('standalone demo honors conversion scenario parameters', async ({ page }) => {
    await page.goto('/demo?source=outbound&lead=qa-shop&scenario=maintenance&management=mixed&goal=maintenance');

    const demo = page.getByTestId('garage-live-demo');
    await expect(demo.getByText('かんなぎ整備サービス')).toBeVisible();
    await expect(demo.getByText('整備', { exact: true }).last()).toBeVisible();
    await expect(page.locator('img[src*="/product-screens/"]')).toHaveCount(0);

    const attribution = await page.evaluate(() =>
      window.sessionStorage.getItem('garage-link-signup-attribution'),
    );
    expect(attribution).toContain('"source":"outbound"');
    expect(attribution).toContain('"lead":"qa-shop"');
  });
});
