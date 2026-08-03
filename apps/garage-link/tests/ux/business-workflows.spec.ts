import { expect, test, type Locator } from '@playwright/test';
import { collectBrowserIssues } from './audit-helpers';

const ownerState = process.env.UX_OWNER_STATE_PATH;
test.use({ storageState: ownerState, trace: 'off', screenshot: 'only-on-failure', video: 'off' });
test.skip(!ownerState, 'UX owner storageState is required');
test.describe.configure({ mode: 'serial' });

const runMarker = `UXA-20260803-${Date.now()}`;
const customerName = `${runMarker}-顧客`;
const vehicleManagementNo = `${runMarker}-車両`;

async function expectSaved(page: Parameters<typeof collectBrowserIssues>[0], path: string, marker: string) {
  await page.waitForURL(new RegExp(`${path.replace('/', '\\/')}(?:\\?|$)`), { timeout: 30_000 });
  await expect(page.getByText(marker, { exact: false }).first()).toBeVisible({ timeout: 30_000 });
}

async function selectOptionContaining(
  select: Locator,
) {
  const value = await select.locator('option').nth(1).getAttribute('value');
  expect(value).toBeTruthy();
  await select.selectOption(value!);
}

function expectNoUnexpectedIssues(issues: ReturnType<typeof collectBrowserIssues>) {
  const unexpected = issues.filter((issue) => !(
    issue.kind === 'response'
    && /^403 POST https:\/\/gaytoojzwqkpuvfofeql\.supabase\.co\/rest\/v1\/rpc\/(?:get_garage_plan_usage|get_company_subscription)$/.test(issue.detail)
  ));
  expect(unexpected).toEqual([]);
}

test('1 車両を登録して一覧へ反映する', async ({ page }) => {
  const issues = collectBrowserIssues(page);
  await page.goto('/vehicles/new');
  await page.getByLabel('車台No').fill(`${runMarker}-VIN`);
  await page.getByLabel('メーカー名').fill('UX監査メーカー');
  await page.getByLabel('車名').fill('UX監査車');
  await page.getByLabel('車両No').fill(vehicleManagementNo);
  await page.getByLabel('仕入価格').fill('100000');
  await page.getByLabel('車両価格').fill('120000');
  await page.getByRole('button', { name: '車両を登録する' }).click();
  await expectSaved(page, '/vehicles', vehicleManagementNo);
  expectNoUnexpectedIssues(issues);
});

test('2 顧客を登録して一覧へ反映する', async ({ page }) => {
  const issues = collectBrowserIssues(page);
  await page.goto('/customers/new');
  await page.getByLabel('顧客/会社名', { exact: true }).fill(customerName);
  await page.getByLabel('コメント').fill(`${runMarker} UX監査専用・外部連絡禁止`);
  await page.getByRole('button', { name: '顧客を登録する' }).click();
  await expectSaved(page, '/customers', customerName);
  expectNoUnexpectedIssues(issues);
});

test('3 商談を登録して一覧へ反映する', async ({ page }) => {
  const issues = collectBrowserIssues(page);
  await page.goto('/deals/new');
  await page.getByLabel('商談番号').fill(`${runMarker}-D`);
  await page.getByLabel('商談タイトル').fill(`${runMarker}-商談`);
  await page.getByLabel('顧客選択').selectOption({ label: customerName });
  await page.getByRole('button', { name: '商談を登録する' }).click();
  await expectSaved(page, '/deals', `${runMarker}-商談`);
  expectNoUnexpectedIssues(issues);
});

test('4 見積書を作成して一覧へ反映する', async ({ page }) => {
  const issues = collectBrowserIssues(page);
  await page.goto('/quotes/new');
  await page.getByLabel('見積番号').fill(`${runMarker}-Q`);
  await page.getByLabel('見積タイトル').fill(`${runMarker}-見積`);
  await page.getByLabel('顧客選択').selectOption({ label: customerName });
  await selectOptionContaining(page.getByLabel('車両選択'));
  await page.getByLabel('車両本体価格').fill('120000');
  await page.getByRole('button', { name: '見積書を作成する' }).click();
  await expectSaved(page, '/quotes', `${runMarker}-Q`);
  expectNoUnexpectedIssues(issues);
});

test('5 請求書を下書き作成して一覧へ反映する', async ({ page }) => {
  const issues = collectBrowserIssues(page);
  await page.goto('/invoices/new');
  await page.getByLabel('請求番号').fill(`${runMarker}-I`);
  await page.getByLabel('請求タイトル（任意）').fill(`${runMarker}-請求`);
  await page.getByLabel('顧客選択').selectOption({ label: customerName });
  await selectOptionContaining(page.getByLabel('車両選択'));
  await page.getByLabel('車両本体価格').fill('120000');
  await page.getByRole('button', { name: '請求書を作成する' }).click();
  await expectSaved(page, '/invoices', `${runMarker}-I`);
  expectNoUnexpectedIssues(issues);
});

test('6 整備案件を登録して一覧へ反映する', async ({ page }) => {
  const issues = collectBrowserIssues(page);
  await page.goto('/maintenance/new');
  await page.getByLabel('受付番号').fill(`${runMarker}-M`);
  await page.getByLabel('顧客選択').selectOption({ label: customerName });
  await selectOptionContaining(page.getByLabel('車両選択'));
  await page.getByLabel('依頼内容').fill(`${runMarker} 安全なUX監査`);
  await page.getByRole('button', { name: '整備・車検を登録する' }).click();
  await expectSaved(page, '/maintenance', `${runMarker}-M`);
  expectNoUnexpectedIssues(issues);
});

test('7 来店予約を登録し詳細Dialogを開閉する', async ({ page }) => {
  const issues = collectBrowserIssues(page);
  await page.goto('/appointments');
  await page.getByRole('button', { name: '新しい予約を登録' }).click();
  await page.getByLabel(/予約日時/).fill('2026-08-10T10:30');
  await selectOptionContaining(page.locator('select[name="customer_id"]'));
  await selectOptionContaining(page.locator('select[name="vehicle_id"]'));
  await page.locator('input[name="note"]').fill(`${runMarker}-予約`);
  await page.locator('form').getByRole('button', { name: '予約を登録する' }).click();
  await expect(page.getByText('予約を登録しました。')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('button', { name: '閉じる' })).toBeVisible();
  await page.setViewportSize({ width: 900, height: 900 });
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText(`${runMarker}-予約`);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  expectNoUnexpectedIssues(issues);
});

test('8 棚卸しを登録して一覧へ反映する', async ({ page }) => {
  const issues = collectBrowserIssues(page);
  await page.goto('/inventory-counts/new');
  await page.getByLabel('棚卸し番号').fill(`${runMarker}-IC`);
  await page.getByLabel('棚卸し名').fill(`${runMarker}-棚卸し`);
  const row = page.locator('tbody tr').first();
  await selectOptionContaining(page.getByLabel('明細1の対象車両'));
  await row.locator('input').nth(6).fill('1');
  await page.getByRole('button', { name: '棚卸しを保存する' }).click();
  await expectSaved(page, '/inventory-counts', `${runMarker}-IC`);
  expectNoUnexpectedIssues(issues);
});
