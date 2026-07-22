import { expect, test } from '@playwright/test';

const mobileDestinations = [
  { label: '機能', url: /\/#features$/ },
  { label: '料金', url: /\/pricing$/ },
  { label: '業種別', url: /\/#industries$/ },
  { label: 'FAQ', url: /\/faq$/ },
  { label: 'ログイン', url: /\/login$/ },
] as const;

test.describe('GARAGE LINK LP real operations', () => {
  for (const destination of mobileDestinations) {
    test(`mobile menu actually navigates to ${destination.label}`, async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto('/');

      const trigger = page.getByTestId('mobile-menu-trigger');
      await trigger.click();
      const menu = page.getByRole('navigation', { name: 'スマホメニュー' });
      await expect(menu).toBeVisible();

      await menu.getByRole('link', { name: destination.label }).click();
      await expect(page).toHaveURL(destination.url);

      if (destination.label === '機能' || destination.label === '業種別') {
        await expect(trigger).toHaveAttribute('aria-expanded', 'false');
        await expect(menu).toBeHidden();
      } else {
        await expect(page.locator('body')).not.toBeEmpty();
      }

      if (destination.label === 'ログイン') {
        await expect(page.getByRole('heading', { name: 'ログイン' })).toBeVisible();
        await expect(page.getByAltText('L-LINK')).toBeAttached();
        await expect(page.getByAltText('L-touring')).toBeAttached();
      }
    });
  }

  test('close button and backdrop both close the menu', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');

    const trigger = page.getByTestId('mobile-menu-trigger');
    const menu = page.getByRole('navigation', { name: 'スマホメニュー' });

    await trigger.click();
    await expect(menu).toBeVisible();
    await trigger.click();
    await expect(menu).toBeHidden();

    await trigger.click();
    await expect(menu).toBeVisible();
    await page.getByRole('button', { name: 'メニューを閉じる' }).last().click({ position: { x: 12, y: 300 } });
    await expect(menu).toBeHidden();
  });

  test('hero CTA reaches an operable signup form and fires conversion steps', async ({ page }) => {
    await page.addInitScript(() => {
      const eventNames: string[] = [];
      Object.defineProperty(window, '__garageConversionEvents', { value: eventNames, writable: false });
      window.addEventListener('garage-link:conversion', (event) => {
        eventNames.push((event as CustomEvent<{ event: string }>).detail.event);
      });
    });

    await page.route('**/auth/v1/signup**', async (route) => {
      await route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Operation blocked by end-to-end test' }),
      });
    });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await page.locator('a[href*="placement=hero"]').click();

    await expect(page).toHaveURL(/\/signup\?source=landing&placement=hero$/);
    await expect(page.getByRole('heading', { name: 'アカウント作成' })).toBeVisible();

    const submit = page.getByRole('button', { name: '無料でアカウントを作成する' });
    await expect(submit).toBeDisabled();

    await page.getByLabel('店舗名 *').fill('操作確認テスト店舗');
    await page.getByLabel('担当者名 *').fill('操作確認担当');
    await page.getByLabel('メールアドレス *').fill('operation-check@example.com');
    await page.getByLabel('パスワード *').fill('test-password-123');
    await page.getByLabel('パスワード確認 *').fill('test-password-123');
    await page.getByRole('checkbox').check();
    await expect(submit).toBeEnabled();

    await submit.click();
    await expect(page.getByRole('alert')).toBeVisible();

    const conversionEvents = await page.evaluate(() =>
      (window as typeof window & { __garageConversionEvents: string[] }).__garageConversionEvents,
    );
    expect(conversionEvents).toEqual(expect.arrayContaining([
      'lp_signup_cta_click',
      'signup_start',
      'signup_submit',
    ]));

    const attribution = await page.evaluate(() =>
      window.sessionStorage.getItem('garage-link-signup-attribution'),
    );
    expect(attribution).toContain('"placement":"hero"');
  });

  test('all signup CTA placements point to the tracked registration route', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');

    for (const placement of ['header', 'hero', 'final', 'mobile_sticky']) {
      await expect(page.locator(`a[href="/signup?source=landing&placement=${placement}"]`)).toHaveCount(1);
    }
  });
});
