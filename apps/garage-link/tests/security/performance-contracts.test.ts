import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import {
  createGarageUiContextCache,
  normalizeGarageUiContext,
} from '../../src/lib/store/garageUiContextCore';

test.describe('共通UIコンテキスト', () => {
  test('同時に複数箇所から要求されても読み込み処理は1回だけ実行する', async () => {
    let loadCount = 0;
    const cache = createGarageUiContextCache(async () => {
      loadCount += 1;
      await Promise.resolve();
      return normalizeGarageUiContext({
        store_id: 'store-1',
        store_label: 'テスト店舗',
        role: 'owner',
        onboarding_completed: true,
        stores: [],
        counts: {},
      });
    });

    const [shell, sidebar, page] = await Promise.all([
      cache.get(),
      cache.get(),
      cache.get(),
    ]);

    expect(loadCount).toBe(1);
    expect(shell).toBe(sidebar);
    expect(sidebar).toBe(page);
    expect(shell.storeLabel).toBe('テスト店舗');
  });

  test('RPCの欠損値を安全な初期値へ正規化する', () => {
    expect(normalizeGarageUiContext(null)).toMatchObject({
      storeId: '',
      storeLabel: '店舗',
      role: 'viewer',
      onboardingCompleted: false,
      stores: [],
    });
  });
});

test.describe('共通UIコンテキストの実装契約', () => {
  test('ダッシュボードの日時依存表示はハイドレーション完了後に描画する', async () => {
    const dashboard = await readFile('src/app/dashboard/page.tsx', 'utf8');

    expect(dashboard).toContain('const [isHydrated, setIsHydrated] = useState(false)');
    expect(dashboard).toContain('setIsHydrated(true)');
    expect(dashboard).toContain("data-testid=\"dashboard-hydration-fallback\"");
  });

  test('ダッシュボードの業務データは1つのRPCで取得する', async () => {
    const dashboard = await readFile('src/app/dashboard/page.tsx', 'utf8');
    const sql = await readFile(
      'supabase/migrations/20260724000200_garage_dashboard_payload.sql',
      'utf8',
    );

    expect(dashboard).toContain("rpc('get_garage_dashboard_payload'");
    expect(dashboard).not.toContain(".from<VehicleRow>('vehicles')");
    expect(sql).toContain('create or replace function public.get_garage_dashboard_payload()');
    expect(sql).toContain('auth.uid()');
    expect(sql).toContain("v_role in ('owner', 'admin')");
  });

  test('サイドバーとシェルは業務テーブルを直接取得せず共通ローダーを使う', async () => {
    const [sidebar, shell] = await Promise.all([
      readFile('src/components/AppSidebar.tsx', 'utf8'),
      readFile('src/components/AppShell.tsx', 'utf8'),
    ]);

    for (const source of [sidebar, shell]) {
      expect(source).toContain('getGarageUiContext');
      expect(source).not.toContain(".from<VehicleRow>('vehicles')");
      expect(source).not.toContain(".from<DealRow>('deals')");
      expect(source).not.toContain(".from<CustomerRow>('customers')");
      expect(source).not.toContain(".from<AppointmentRow>('appointments')");
      expect(source).not.toContain(".from<MaintenanceRow>('maintenance_jobs')");
      expect(source).not.toContain(".from<InquiryRow>('line_form_responses')");
    }
  });

  test('主要画面はログイン・所属店舗を再取得せず共通ローダーを使う', async () => {
    const pagePaths = [
      'src/app/dashboard/page.tsx',
      'src/app/vehicles/page.tsx',
      'src/app/customers/page.tsx',
      'src/app/deals/page.tsx',
      'src/app/appointments/page.tsx',
      'src/app/maintenance/page.tsx',
      'src/app/inquiries/page.tsx',
      'src/app/parts/page.tsx',
      'src/app/analytics/page.tsx',
    ];

    for (const pagePath of pagePaths) {
      const source = await readFile(pagePath, 'utf8');
      expect(source, pagePath).toContain('getGarageUiContext');
      expect(source, pagePath).not.toContain('.auth.getUser()');
      expect(source, pagePath).not.toContain("('store_members')");
    }
  });

  test('DB側で店舗コンテキストと件数を1つのRPCへ集約する', async () => {
    const sql = await readFile(
      'supabase/migrations/20260724000100_garage_ui_context.sql',
      'utf8',
    );

    expect(sql).toContain('create or replace function public.get_garage_ui_context()');
    expect(sql).toContain('auth.uid()');
    expect(sql).toContain("grant execute on function public.get_garage_ui_context() to authenticated");
    for (const table of [
      'vehicles',
      'vehicle_listing_statuses',
      'deals',
      'customers',
      'appointments',
      'maintenance_jobs',
      'line_form_responses',
    ]) {
      expect(sql).toContain(`public.${table}`);
    }
  });
});
