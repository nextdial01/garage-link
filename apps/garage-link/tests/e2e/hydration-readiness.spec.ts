import { expect, test, type Page } from '@playwright/test';
import { hasE2ECredentials } from './helpers';

async function deferScripts(page: Page) {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  await page.route('**/_next/**/*.js', async (route) => { await gate; await route.continue(); });
  return release;
}

test('低速JSでも準備完了後の初回入力と1回ログインが成功する', async ({ page }) => {
  test.skip(!hasE2ECredentials, 'E2E_EMAIL and E2E_PASSWORD are required.');
  const release = await deferScripts(page);
  let posts = 0;
  page.on('request', (request) => { if (request.method() === 'POST' && new URL(request.url()).pathname === '/api/auth/password-login') posts += 1; });
  try {
    await page.goto('/login', { waitUntil: 'commit' });
    await expect(page.locator('#email')).toBeDisabled();
    await expect(page.locator('#password')).toBeDisabled();
    await expect(page.getByRole('button', { name: 'ログイン', exact: true })).toBeDisabled();
  } finally { release(); }
  await expect(page.locator('#email')).toBeEnabled();
  await page.locator('#email').fill(process.env.E2E_EMAIL!);
  await page.locator('#password').fill(process.env.E2E_PASSWORD!);
  await page.getByRole('button', { name: 'ログイン', exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  expect(posts).toBe(1);
  await page.reload();
  await expect(page).toHaveURL(/\/dashboard$/);
});

test('低速JSでも操作可能になったメニューの最初のtapが有効', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const release = await deferScripts(page);
  const trigger = page.getByTestId('mobile-menu-trigger');
  try {
    await page.goto('/', { waitUntil: 'commit' });
    await expect(trigger).toBeDisabled();
  } finally { release(); }
  await expect(trigger).toBeEnabled();
  await trigger.click();
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByRole('navigation', { name: 'スマホメニュー' })).toBeVisible();
  await page.getByRole('navigation', { name: 'スマホメニュー' }).getByRole('link', { name: '業種別', exact: true }).click();
  await expect(page).toHaveURL(/#industries$/);
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
});
