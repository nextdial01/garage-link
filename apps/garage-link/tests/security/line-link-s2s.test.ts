import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

// コメントを除去して静的コード解析のアサーション誤検知を防ぐヘルパー
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
}

test.describe('L-LINK ↔ GARAGE LINK S2S セキュリティ契約（ソース静的検査）', () => {
  test('S2S APIルート（route.ts）のセキュリティ契約', async () => {
    const rawSrc = await readFile('src/app/api/s2s/line-link/delivery-candidates/route.ts', 'utf8');
    const src = stripComments(rawSrc);

    // 1. POSTメソッドのみを公開
    expect(rawSrc).toContain('export async function POST');
    expect(rawSrc).not.toContain('export async function GET');
    expect(rawSrc).not.toContain('export async function PUT');
    expect(rawSrc).not.toContain('export async function DELETE');

    // 2. 認証処理を verifyLLinkS2SRequest に委譲していること
    expect(src).toContain('verifyLLinkS2SRequest');

    // 3. store_idによる店舗スコープの制限
    expect(src).toContain(".eq('store_id', auth.storeId)");
    expect(src).toContain(".eq('status', 'pending')");

    // 4. 個人情報（PII）の排除（コメント外のコード内に機密キーが含まれていないこと）
    expect(src).not.toContain('line_user_id');
    expect(src).not.toContain('phone');
    expect(src).not.toContain('email');
    expect(src).not.toContain('vehicle_id');
    expect(src).not.toContain('vin');

    // 5. データベースの行（Row）をそのまま返すのではなく、ホワイトリスト形式で詰め替えて返却していること
    expect(src).toContain('const candidates = rows');
    expect(src).toContain('.map(');
    expect(src).toContain('event_id: row.id');
    expect(src).toContain('store_id: row.store_id');
    expect(src).toContain('customer_id: row.customer_id');
    expect(src).toContain('event_type: row.event_type');
    expect(src).toContain('reference_date: row.inspection_expiry_date');

    // 6. 機密情報（シークレット、service_role）をレスポンスに露出させないこと
    // NextResponse.json に SUPABASE_SERVICE_ROLE_KEY が直接渡されていないことをアサート
    expect(src).not.toMatch(/NextResponse\.json\([^)]*SUPABASE_SERVICE_ROLE_KEY[^)]*\)/);
  });

  test('S2S認証モジュール（s2sAuth.ts）のセキュリティ契約', async () => {
    const rawSrc = await readFile('src/lib/line-link/s2sAuth.ts', 'utf8');
    const src = stripComments(rawSrc);

    // 1. タイミングセーフな比較を使用
    expect(src).toContain('timingSafeEqual');

    // 2. タイムスタンプ許容誤差 (300秒)
    expect(src).toContain('TIMESTAMP_TOLERANCE_SEC = 300');

    // 3. nonce一意性の有効期限 (10分)
    expect(src).toContain('NONCE_TTL_MIN = 10');

    // 4. 環境変数プレフィックス規約
    expect(src).toContain('LL_INBOUND_S2S_SECRET__');

    // 5. server-only モジュール
    expect(rawSrc).toContain("import 'server-only';");

    // 6. 重複 nonce 防止の書き込み、および例外発生時（一意性違反 23505）の fail-closed 処理
    expect(src).toContain('line_link_inbound_nonces');
    expect(src).toContain('insert({ nonce');
    expect(src).toContain("'replayed_nonce'");
    expect(src).toContain('23505'); // PRIMARY KEY違反のエラーコード
  });

  test('データベーススキーマ・権限設定（042, 043）のセキュリティ契約', async () => {
    const schema042 = await readFile('supabase/schema/042_line_link_inbound_nonces.sql', 'utf8');
    const schema043 = await readFile('supabase/schema/043_line_link_s2s_service_role_grants.sql', 'utf8');

    // 1. nonceストアテーブルのRLS有効化、および権限が service_role のみに限定されていること
    expect(schema042).toContain('create table if not exists public.line_link_inbound_nonces');
    expect(schema042).toContain('nonce text primary key');
    expect(schema042).toContain('alter table public.line_link_inbound_nonces enable row level security');
    expect(schema042).toContain('grant select, insert, delete on table public.line_link_inbound_nonces to service_role');
    expect(schema042).not.toMatch(/grant.*to authenticated/i);
    expect(schema042).not.toMatch(/grant.*to anon/i);

    // 2. delivery-candidates 用の閲覧権限が service_role のみに限定され、他のロールに広げていないこと
    expect(schema043).toContain('grant select on table public.inspection_reminder_events to service_role');
    expect(schema043).not.toMatch(/grant.*to authenticated/i);
    expect(schema043).not.toMatch(/grant.*to anon/i);
  });
});
