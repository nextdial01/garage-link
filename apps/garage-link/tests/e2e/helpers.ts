import { expect, type Locator, type Page } from '@playwright/test';

export const hasE2ECredentials = Boolean(process.env.E2E_EMAIL && process.env.E2E_PASSWORD);

const appErrorText = /Application error|Module not found|500 Internal Server Error/i;

type FieldCandidate = {
  labels?: string[];
  placeholders?: string[];
  names?: string[];
  texts?: string[];
};

async function firstVisible(candidates: Locator[]) {
  for (const candidate of candidates) {
    const locator = candidate.first();
    try {
      if (await locator.isVisible({ timeout: 700 })) {
        return locator;
      }
    } catch {
      // Try the next locator candidate.
    }
  }

  throw new Error('入力欄が見つかりませんでした。');
}

export async function assertNoAppError(page: Page) {
  expect(page.url()).toBeTruthy();
  await expect(page.locator('body')).not.toContainText(appErrorText);
}

export async function findField(page: Page, candidate: FieldCandidate) {
  const locators: Locator[] = [];

  for (const label of candidate.labels ?? []) {
    locators.push(page.getByLabel(label, { exact: true }));
    locators.push(page.getByLabel(label));
  }

  for (const placeholder of candidate.placeholders ?? []) {
    locators.push(page.getByPlaceholder(placeholder, { exact: true }));
    locators.push(page.getByPlaceholder(placeholder));
  }

  for (const name of candidate.names ?? []) {
    locators.push(page.locator(`[name="${name}"]`));
    locators.push(page.locator(`#${name}`));
  }

  for (const text of candidate.texts ?? []) {
    locators.push(
      page
        .getByText(text, { exact: true })
        .locator('xpath=ancestor-or-self::*[self::label or self::div or self::section][1]')
        .locator('input, textarea, select')
    );
  }

  return firstVisible(locators);
}

export async function fillField(page: Page, candidate: FieldCandidate, value: string) {
  const field = await findField(page, candidate);
  const tagName = await field.evaluate((element) => element.tagName.toLowerCase());

  if (tagName === 'select') {
    await field.selectOption({ label: value }).catch(async () => {
      await field.selectOption(value);
    });
    return;
  }

  await field.fill(value);
}

export async function clickButtonByCandidates(page: Page, candidates: (string | RegExp)[]) {
  const locators = candidates.flatMap((candidate) => [
    page.getByRole('button', { name: candidate }),
    page.getByText(candidate).locator('xpath=ancestor-or-self::button[1]'),
  ]);
  const button = await firstVisible(locators);
  await button.click();
}

const log = (message: string) => console.info(`[e2e:login] ${message}`);

// waitForLoadState('networkidle') はダッシュボードの継続的なバックグラウンド通信
// （リアルタイム購読・ポーリング等）がある画面では"idle"に一切到達せず無期限に
// ハングしうる。代わりにURL遷移を明示的timeout付きで待つ。
async function waitForNavigationAway(page: Page, fromPathPrefix: string, timeoutMs: number) {
  await page.waitForURL((url) => !url.pathname.startsWith(fromPathPrefix), { timeout: timeoutMs });
}

export async function login(page: Page) {
  if (!hasE2ECredentials) {
    throw new Error('E2E_EMAIL and E2E_PASSWORD are required.');
  }

  log('navigating to /login');
  await page.goto('/login');
  await fillField(page, { labels: ['メールアドレス'], names: ['email'] }, process.env.E2E_EMAIL ?? '');
  await fillField(page, { labels: ['パスワード'], names: ['password'] }, process.env.E2E_PASSWORD ?? '');
  log('submitting credentials');
  await clickButtonByCandidates(page, [/ログイン/]);
  await waitForNavigationAway(page, '/login', 20_000);
  log(`post-login, now at ${page.url()}`);
  expect(new URL(page.url()).pathname).not.toBe('/security/email-otp');
  await assertNoAppError(page);
  log('login complete');
}
