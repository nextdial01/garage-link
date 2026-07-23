import { access, readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { GET as healthGET } from '../../src/app/api/health/route';
import { buildStoragePath, privateStorageBucket } from '../../src/lib/storage/pathsCore';

// 認証・実DB・Secretを使わずに、main push前に壊れやすい契約を自動確認するテストです。
// 実ログイン/実DB更新が必要な確認は docs/manual-smoke-test.md 側に分離しています。

const tenantId = '11111111-1111-1111-1111-111111111111';
const storeId = '22222222-2222-2222-2222-222222222222';

test.describe('Pre-release contracts (認証不要)', () => {
  test('/api/health: 環境変数不足時は503とconfig_missingを返し、Secretを含まない', async () => {
    const keys = ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'NEXT_PUBLIC_SUPABASE_ANON_KEY'];
    const saved = new Map(keys.map((key) => [key, process.env[key]]));

    try {
      // env未設定の決定的な分岐のみ検証する（DBへは接続しない）。
      for (const key of keys) {
        delete process.env[key];
      }

      const response = await healthGET();
      const body = (await response.json()) as Record<string, unknown>;

      expect(response.status).toBe(503);
      expect(body).toMatchObject({ ok: false, service: 'garage-link', code: 'config_missing' });
      // Secretや接続情報を漏らさない（最小レスポンスのみ）。
      expect(Object.keys(body).sort()).toEqual(['code', 'ok', 'service']);
      expect(JSON.stringify(body)).not.toMatch(/key|secret|token|url|password/i);
    } finally {
      for (const [key, value] of saved) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });

  test('Storage path生成は tenants/{tenant_id}/stores/{store_id}/... 形式を守る', () => {
    const result = buildStoragePath({
      tenantId,
      storeId,
      purpose: 'company_logo',
      originalFileName: 'logo.png',
    });
    expect(result.path).toMatch(
      new RegExp(`^tenants/${tenantId}/stores/${storeId}/company/logo/[0-9a-f-]+\\.png$`)
    );
    expect(result.path).not.toContain('..');
    expect(result.path).not.toContain('\\');
    expect(result.path).not.toContain('//');
    expect(result.path.startsWith('/')).toBe(false);
  });

  test('private bucketは company-assets（コード・026・034で整合）', async () => {
    expect(privateStorageBucket).toBe('company-assets');

    const sql026 = await readFile('supabase/schema/026_storage_security.sql', 'utf8');
    expect(sql026).toContain("bucket text not null default 'company-assets'");
    expect(sql026).toContain("bucket in ('company-assets', 'garage-public-assets')");
    expect(sql026).not.toContain("'garage-private'");
  });

  test('034: uploaded_files.pathのCHECKが形式と危険文字を制限している', async () => {
    const sql034 = await readFile('supabase/schema/034_storage_path_hardening.sql', 'utf8');
    expect(sql034).toContain("path like 'tenants/%/stores/%/%'");
    expect(sql034).toContain("position('..' in path) = 0"); // パストラバーサル
    expect(sql034).toContain("position('\\\\' in path) = 0"); // バックスラッシュ
    expect(sql034).toContain("position('//' in path) = 0"); // 連続スラッシュ
    expect(sql034).toContain("path not like '/%'"); // 絶対path
    expect(sql034).toContain('length(path) between 1 and 1024'); // 長さ制限
    // NULバイト(0x00)リテラルはtext型に格納できずSQLが実行不能になるため、DB側では検査しない。
    expect(sql034).not.toContain("position(E'\\0' in path)");
  });

  test('主要画面のルーティング対象ファイルが存在する', async () => {
    const pages = [
      'settings/company',
      'parts',
      'maintenance',
      'quotes',
      'invoices',
      'settings/billing',
      'admin/plan-requests',
    ];
    for (const page of pages) {
      await expect(access(`src/app/${page}/page.tsx`)).resolves.toBeUndefined();
    }
    // ヘルスチェックとエラー境界も存在すること。
    await expect(access('src/app/api/health/route.ts')).resolves.toBeUndefined();
    await expect(access('src/app/error.tsx')).resolves.toBeUndefined();
    await expect(access('src/app/global-error.tsx')).resolves.toBeUndefined();
  });

  test('狭い画面のメニューからログアウトできる', async () => {
    const menuPage = await readFile('src/app/menu/page.tsx', 'utf8');

    expect(menuPage).toContain('href="/logout"');
    expect(menuPage).toContain('ログアウト');
    expect(menuPage).toContain('lg:hidden');
  });

  test('complete_plan_change_request: 二重反映防止ロジックが維持されている', async () => {
    const sql = await readFile('supabase/schema/030_company_billing_requests.sql', 'utf8');

    // 関数定義と安全設定
    expect(sql).toContain('create or replace function public.complete_plan_change_request(p_request_id uuid)');
    expect(sql).toContain('set search_path = public');

    // 既に反映済みなら何もしないガード
    expect(sql).toContain('if v_request.completed_at is not null then');
    expect(sql).toContain("'already_completed', true");

    // 行ロックで競合を防ぎ、completed_at is null のときだけ確定する
    expect(sql).toContain('for update');
    expect(sql).toContain("status = 'completed'");
    expect(sql).toContain('completed_at = v_now');
    expect(sql).toContain('and completed_at is null');
  });
});
