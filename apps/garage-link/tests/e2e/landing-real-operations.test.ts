import { expect, test } from '@playwright/test';

const mobileDestinations = [
  { label: 'デモ', url: /\/#live-demo$/ },
  { label: '体験', url: /\/#product-story$/ },
  { label: '料金', url: /\/pricing$/ },
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

      if (destination.label === 'デモ' || destination.label === '体験') {
        await expect(trigger).toHaveAttribute('aria-expanded', 'false');
        await expect(menu).toBeHidden();
      }

      if (destination.label === 'ログイン') {
        await expect(page.getByRole('heading', { name: 'ログイン' })).toBeVisible();
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
    await page.getByRole('button', { name: 'メニューを閉じる' }).last().click({ position: { x: 12, y: 280 } });
    await expect(menu).toBeHidden();
  });

  test('hero signup CTA reaches an operable registration form', async ({ page }) => {
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

    await expect(page).toHaveURL(/\/signup\?placement=hero$/);
    await expect(page.getByRole('heading', { name: 'アカウント作成' })).toBeVisible();

    const submit = page.getByRole('button', { name: '無料でアカウントを作成する' });
    await page.getByLabel('メールアドレス *').fill('operation-check@example.com');
    await page.getByLabel('パスワード *').fill('test-password-123');
    await page.getByLabel('パスワード確認 *').fill('test-password-123');
    await page.getByRole('checkbox').check();
    await expect(submit).toBeEnabled();

    await submit.click();
    await expect(page.getByRole('alert').filter({ hasText: 'Operation blocked by end-to-end test' })).toBeVisible();

    const conversionEvents = await page.evaluate(() =>
      (window as typeof window & { __garageConversionEvents: string[] }).__garageConversionEvents,
    );
    expect(conversionEvents).toEqual(expect.arrayContaining([
      'lp_signup_cta_click',
      'signup_start',
      'signup_form_engaged',
      'signup_submit',
    ]));
  });

  test('homepage embeds the product as interactive DOM, not product screenshots', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('heading', { name: /車両を中心に、\s*仕事をひとつに。/ })).toBeVisible();
    await expect(page.getByTestId('garage-scroll-story-demo')).toBeVisible();
    await expect(page.getByTestId('garage-live-demo')).toHaveCount(0);
    await expect(page.locator('img[src*="/product-screens/"]')).toHaveCount(0);
    await expect(page.locator('a[href="/demo"]').first()).toBeVisible();
  });

  test('Product Theatre tabs change the product state and record story interaction', async ({ page }) => {
    await page.addInitScript(() => {
      const events: string[] = [];
      Object.defineProperty(window, '__platformEvents', { value: events });
      window.addEventListener('garage-link:conversion', (event) => {
        events.push((event as CustomEvent<{ event: string }>).detail.event);
      });
    });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto('/');

    const story = page.locator('#product-story');
    await expect(story).toBeVisible();
    const storyDemo = page.getByTestId('garage-scroll-story-demo');
    await expect(storyDemo.getByRole('heading', { name: '車両', exact: true })).toBeVisible();

    const tabs = story.getByRole('tab');
    await tabs.nth(2).click();
    await expect(storyDemo.getByRole('heading', { name: '商談', exact: true })).toBeVisible();

    await tabs.nth(3).click();
    await expect(storyDemo.getByRole('heading', { name: '見積', exact: true })).toBeVisible();
    const events = await page.evaluate(() =>
      (window as typeof window & { __platformEvents: string[] }).__platformEvents,
    );
    expect(events.filter((event) => event === 'demo_interaction')).toHaveLength(2);
  });

  test('live demo regenerates data and supports vehicle to deal to quote flow', async ({ page }) => {
    await page.addInitScript(() => {
      const eventNames: string[] = [];
      Object.defineProperty(window, '__garageDemoEvents', { value: eventNames, writable: false });
      window.addEventListener('garage-link:conversion', (event) => {
        eventNames.push((event as CustomEvent<{ event: string }>).detail.event);
      });
    });

    await page.goto('/demo?scenario=used-car&management=excel&goal=inventory');
    const demo = page.getByTestId('garage-live-demo');

    await demo.getByLabel('デモ業態').selectOption('motorcycle');
    await demo.getByLabel('デモ管理方法').selectOption('mixed');
    await demo.getByLabel('デモ目的').selectOption('sales');
    await demo.getByRole('button', { name: 'この条件でデモを作る' }).click();

    await expect(demo.getByText('GARAGE LINK Riders')).toBeVisible();
    await expect(demo.getByText('商談', { exact: true }).last()).toBeVisible();

    await demo.getByRole('button', { name: /車両/ }).first().click();
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

    const events = await page.evaluate(() =>
      (window as typeof window & { __garageDemoEvents: string[] }).__garageDemoEvents,
    );
    expect(events).toEqual(expect.arrayContaining([
      'demo_scenario_generated',
      'demo_vehicle_created',
      'demo_deal_created',
      'demo_quote_opened',
    ]));
  });

  test('outbound lead attribution survives landing signup CTA', async ({ page }) => {
    await page.goto('/?source=outbound&lead=shop-001');
    await page.locator('a[href*="placement=hero"]').click();
    await expect(page).toHaveURL(/\/signup\?placement=hero$/);

    const attribution = await page.evaluate(() =>
      window.sessionStorage.getItem('garage-link-signup-attribution'),
    );
    expect(attribution).toContain('"source":"outbound"');
    expect(attribution).toContain('"lead":"shop-001"');
  });

  test('standalone live demo is public and keeps source/lead attribution', async ({ page }) => {
    await page.goto('/demo?source=outbound&lead=shop-demo-001&scenario=maintenance&goal=maintenance');

    await expect(page.getByRole('heading', { name: '登録する前に、触って決める。' })).toBeVisible();
    await expect(page.getByTestId('garage-live-demo')).toBeVisible();
    await expect(page.locator('img[src*="/product-screens/"]')).toHaveCount(0);
    await expect(page.getByTestId('garage-live-demo').getByText('かんなぎ整備サービス')).toBeVisible();

    const attribution = await page.evaluate(() =>
      window.sessionStorage.getItem('garage-link-signup-attribution'),
    );
    expect(attribution).toContain('"source":"outbound"');
    expect(attribution).toContain('"lead":"shop-demo-001"');
  });
});

test('product story and demo open are separately attributed from four signup placements', async ({ page }) => {
  await page.addInitScript(() => {
    window.addEventListener('garage-link:conversion', (event) => {
      const records = JSON.parse(sessionStorage.getItem('qa-conversion-records') ?? '[]');
      records.push((event as CustomEvent).detail);
      sessionStorage.setItem('qa-conversion-records', JSON.stringify(records));
    });
  });
  for (const placement of ['hero', 'product_story', 'pricing_free', 'final']) {
    await page.goto('/');
    await page.locator(`a[href="/signup?placement=${placement}"]`).click();
    await expect(page).toHaveURL(new RegExp(`/signup\\?placement=${placement}$`));
    await expect(page.getByRole('heading', { name: 'アカウント作成' })).toBeVisible();
    const records = await page.evaluate(() => JSON.parse(sessionStorage.getItem('qa-conversion-records') ?? '[]'));
    expect(records).toEqual(expect.arrayContaining([expect.objectContaining({ event: 'lp_signup_cta_click', placement })]));
  }
  await page.goto('/');
  await page.getByRole('tab', { name: '商談', exact: true }).click();
  let records = await page.evaluate(() => JSON.parse(sessionStorage.getItem('qa-conversion-records') ?? '[]'));
  expect(records).toEqual(expect.arrayContaining([expect.objectContaining({ event: 'demo_interaction', placement: 'product_story', demo_action: 'product_story_switch', demo_view: 'deals' })]));
  await page.locator('#live-demo').getByRole('link', { name: '触って確かめる' }).click();
  await expect(page).toHaveURL(/\/demo$/);
  await expect(page.getByTestId('garage-live-demo')).toBeVisible();
  records = await page.evaluate(() => JSON.parse(sessionStorage.getItem('qa-conversion-records') ?? '[]'));
  expect(records).toEqual(expect.arrayContaining([expect.objectContaining({ event: 'demo_interaction', placement: 'product_demo', demo_action: 'demo_open' })]));
});
