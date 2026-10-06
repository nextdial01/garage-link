import { expect, test } from '@playwright/test';

test.describe('GARAGE LINK embedded live demo', () => {
  test('dedicated demo has no product screenshots and can build a tailored demo', async ({ page }) => {
    await page.goto('/demo?scenario=used-car&management=excel&goal=inventory');

    const demo = page.getByTestId('garage-live-demo');
    await expect(demo).toBeVisible();
    await expect(page.locator('img[src*="/product-screens/"]')).toHaveCount(0);

    await demo.getByLabel('デモ業態').selectOption('motorcycle');
    await demo.getByLabel('デモ管理方法').selectOption('mixed');
    await demo.getByLabel('デモ目的').selectOption('sales');
    await demo.getByRole('button', { name: 'この条件でデモを作る' }).click();

    await expect(demo.getByText('GARAGE LINK Riders')).toBeVisible();

    await demo.getByRole('button', { name: '車両', exact: true, includeHidden: true }).first().click();
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

  test('desktop Product Platform tabs change the actual product state without a sticky stage', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto('/');

    const story = page.locator('#product-story');
    const stage = page.getByTestId('garage-scroll-story-stage');
    await expect(stage).toBeVisible();
    expect(await stage.evaluate((element) => getComputedStyle(element).position)).not.toMatch(/sticky|fixed/);

    const tabs = story.getByRole('tab');
    const storyDemo = page.getByTestId('garage-scroll-story-demo');
    await expect(storyDemo.getByRole('heading', { name: '車両', exact: true, includeHidden: true })).toBeVisible();

    await tabs.nth(2).click();
    await expect(tabs.nth(2)).toHaveAttribute('aria-selected', 'true');
    await expect(storyDemo.getByRole('heading', { name: '商談', exact: true, includeHidden: true })).toBeVisible();

    await tabs.nth(3).click();
    await expect(tabs.nth(3)).toHaveAttribute('aria-selected', 'true');
    await expect(storyDemo.getByRole('heading', { name: '見積', exact: true, includeHidden: true })).toBeVisible();
  });

  test('mobile Product Platform exposes all five tap targets and keeps the selected state', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');

    const story = page.locator('#product-story');
    const stage = page.getByTestId('garage-scroll-story-stage');
    expect(await stage.evaluate((element) => getComputedStyle(element).position)).not.toMatch(/sticky|fixed/);

    const tabs = story.getByRole('tab');
    await expect(tabs).toHaveCount(5);
    await tabs.nth(4).click();
    expect(await stage.evaluate((element) => element.scrollTop)).toBe(0);
    await expect(page.getByTestId('garage-scroll-story-demo').getByRole('heading', { name: '整備', exact: true, includeHidden: true })).toBeVisible();
    await expect(tabs.nth(4)).toHaveAttribute('aria-selected', 'true');
    await expect(story.getByRole('tabpanel')).toHaveAttribute('data-active-view', 'maintenance');
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
