import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import {
  DEFAULT_TIMINGS,
  isValidOffsetDays,
  validateTimings,
} from '../../src/lib/inspection-reminders/shared';

test.describe('車検案内: タイミング検証ロジック', () => {
  test('1〜365の整数のみ許可する', () => {
    expect(isValidOffsetDays(1)).toBe(true);
    expect(isValidOffsetDays(365)).toBe(true);
    expect(isValidOffsetDays(0)).toBe(false);
    expect(isValidOffsetDays(366)).toBe(false);
    expect(isValidOffsetDays(30.5)).toBe(false);
    expect(isValidOffsetDays('30')).toBe(false);
  });

  test('重複日数を拒否する', () => {
    const result = validateTimings([
      { offset_days: 30, enabled: true },
      { offset_days: 30, enabled: false },
    ]);
    expect(result.ok).toBe(false);
  });

  test('範囲外を拒否する', () => {
    expect(validateTimings([{ offset_days: 0, enabled: true }]).ok).toBe(false);
    expect(validateTimings([{ offset_days: 400, enabled: true }]).ok).toBe(false);
  });

  test('昇順に正規化する', () => {
    const result = validateTimings([
      { offset_days: 90, enabled: true },
      { offset_days: 30, enabled: true },
      { offset_days: 60, enabled: false },
    ]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.timings.map((t) => t.offset_days)).toEqual([30, 60, 90]);
    }
  });

  test('初期タイミングは90/60/30', () => {
    expect(DEFAULT_TIMINGS.map((t) => t.offset_days)).toEqual([90, 60, 30]);
  });
});

test.describe('車検案内: 設定APIのフォールバック安全性', () => {
  test('GETはDB取得エラーを握り潰さず throw する（テーブル不在で既定値を返さない）', async () => {
    const source = await readFile(
      'src/app/api/customer-follow-up/inspection-reminders/settings/route.ts',
      'utf8'
    );
    // error を必ず確認して throw → catch で500応答。
    expect(source).toContain('if (settingsError) throw');
    expect(source).toContain('if (timingError) throw');
    expect(source).toContain("code: 'inspection_settings_read_failed'");
  });

  test('設定画面はDBエラー時に明示メッセージを出し操作を止める', async () => {
    const source = await readFile(
      'src/app/settings/customer-follow-up/inspection-reminders/page.tsx',
      'utf8'
    );
    expect(source).toContain('設定の取得に失敗しました。データベース設定を確認してください。');
    expect(source).toContain('loadFailed');
    expect(source).toContain('disabled={isSaving || loadFailed}');
    expect(source).toContain('disabled={isRunning || loadFailed}');
  });
});

test.describe('車検案内: migration(035)の不変条件', () => {
  test('テーブル・冪等性・状態・RLSが定義されている', async () => {
    const sql = await readFile('supabase/schema/035_inspection_reminders.sql', 'utf8');

    // 3テーブル
    expect(sql).toContain('create table if not exists public.inspection_reminder_settings');
    expect(sql).toContain('create table if not exists public.inspection_reminder_timings');
    expect(sql).toContain('create table if not exists public.inspection_reminder_events');

    // 店舗単位・会社/店舗ID
    expect(sql).toContain('store_id uuid not null references public.stores(id)');
    expect(sql).toContain('company_id uuid references public.tenants(id)');

    // 1〜365の整数・店舗内重複不可
    expect(sql).toContain('offset_days between 1 and 365');
    expect(sql).toContain('unique (store_id, offset_days)');

    // イベント状態（5種）と生成直後pending・event_type
    expect(sql).toContain("status in ('pending', 'processing', 'completed', 'skipped', 'failed')");
    expect(sql).toContain("status text not null default 'pending'");
    expect(sql).toContain("event_type text not null default 'inspection_reminder'");

    // 冪等性キーのユニーク制約
    expect(sql).toContain('idempotency_key text not null');
    expect(sql).toContain('unique (idempotency_key)');

    // nullable な外部連携先ID・エラー内容
    expect(sql).toContain('external_reference_id text');
    expect(sql).toContain('error_detail text');

    // RLS有効化と参照/変更ポリシー
    expect(sql).toContain('alter table public.inspection_reminder_events enable row level security');
    expect(sql).toContain('current_user_store_ids()');
    expect(sql).toContain("role in ('owner', 'admin')");
  });

  test('生成関数: Asia/Tokyo基準・除外条件・顧客紐付け・冪等INSERT', async () => {
    const sql = await readFile('supabase/schema/035_inspection_reminders.sql', 'utf8');

    expect(sql).toContain('create or replace function public.generate_inspection_reminder_events');
    expect(sql).toContain("now() at time zone 'Asia/Tokyo'");

    // 残日数 = タイミング
    expect(sql).toContain('(v.inspection_expiry_date - v_today) = t.offset_days');

    // 除外: 売約済み / 廃車 / 削除済み / アーカイブ / 満了日null
    expect(sql).toContain("v.status, '') not in ('売約済み', 'sold')");
    expect(sql).toContain("v.status, '') not in ('廃車', 'scrapped')");
    expect(sql).toContain('v.deleted_at is null');
    expect(sql).toContain('coalesce(v.is_archived, false) = false');
    expect(sql).toContain('v.inspection_expiry_date is not null');

    // 車検予約済み・入庫済みの除外
    expect(sql).toContain("not in ('completed', 'delivered', 'cancelled')");
    expect(sql).toContain("mj2.job_type = '車検' or mj2.scheduled_in_at is not null or mj2.actual_in_date is not null");

    // 顧客に紐づく車両のみ・冪等INSERT
    expect(sql).toContain('where customer_id is not null');
    expect(sql).toContain('on conflict (idempotency_key) do nothing');
  });
});

test.describe('車検案内: 対象診断API（eligibility）', () => {
  test('未認証・非owner/admin は 401/403 を返す設計になっている', async () => {
    const source = await readFile(
      'src/app/api/customer-follow-up/inspection-reminders/eligibility/route.ts',
      'utf8'
    );
    // 未認証チェック
    expect(source).toContain("status: 401");
    // 非メンバーチェック
    expect(source).toContain("status: 403");
    expect(source).toContain("forbidden_no_membership");
    // 非owner/adminチェック
    expect(source).toContain("forbidden_role");
    expect(source).toContain('canManage');
  });

  test('store_id はサーバーセッションから取得し、リクエストから受け取らない（クロスストア隔離）', async () => {
    const source = await readFile(
      'src/app/api/customer-follow-up/inspection-reminders/eligibility/route.ts',
      'utf8'
    );
    // p_store_id は member.store_id (セッション由来) のみ。クエリパラメータや body から読まない。
    expect(source).toContain('p_store_id: member.store_id');
    // リクエスト body や query を参照する url.searchParams / request.json などが無いことを確認。
    expect(source).not.toContain('searchParams');
    expect(source).not.toContain('request.json');
    expect(source).not.toContain('request.text');
  });

  test('APIレスポンスに PII フィールドが含まれない（名前・電話・メール・VIN・登録番号を返さない）', async () => {
    const source = await readFile(
      'src/app/api/customer-follow-up/inspection-reminders/eligibility/route.ts',
      'utf8'
    );
    // API ルートは RPC 結果をそのまま返すのみ。PII フィールドは RPC 内で除外済み。
    const piiFields = ['customer_name', 'vehicle_name', 'registration_no', 'phone', 'email', 'line_user_id', 'vin'];
    for (const field of piiFields) {
      expect(source).not.toContain(field);
    }
  });

  test('DBファンクションが PII フィールドを集計値のみに限定している', async () => {
    const sql = await readFile(
      'supabase/migrations/20260627000000_inspection_reminder_eligibility_fn.sql',
      'utf8'
    );
    // jsonb_build_object が count(*) のみを返し、個別行を SELECT していないことを確認。
    expect(sql).toContain('count(*)');
    expect(sql).not.toContain('customer_name');
    expect(sql).not.toContain('registration_no');
    expect(sql).not.toContain('phone');
    expect(sql).not.toContain('email');
    expect(sql).not.toContain('line_user_id');
  });

  test('DBファンクションに SECURITY DEFINER・STABLE・安全な search_path・REVOKE が含まれる', async () => {
    const sql = await readFile(
      'supabase/migrations/20260627000000_inspection_reminder_eligibility_fn.sql',
      'utf8'
    );
    expect(sql).toContain('security definer');
    expect(sql).toContain('stable');
    // pg_temp を末尾に置くことで temp オブジェクトによるシャドーイングを防ぐ。
    expect(sql).toContain('set search_path = public, pg_temp');
    // デフォルトの PUBLIC 権限を剥奪してから authenticated のみ付与。
    expect(sql).toContain('revoke all on function public.get_inspection_reminder_eligibility_summary(uuid) from public');
    expect(sql).toContain('grant execute on function public.get_inspection_reminder_eligibility_summary(uuid) to authenticated');
  });

  test('既存イベントの冪等キーチェックが含まれる（新規生成可能数 ≠ 条件一致数）', async () => {
    const sql = await readFile(
      'supabase/migrations/20260627000000_inspection_reminder_eligibility_fn.sql',
      'utf8'
    );
    // 冪等キー形式: store_id:vehicle_id:inspection_expiry_date:offset_days
    expect(sql).toContain('idempotency_key');
    expect(sql).toContain('new_events_creatable_today');
    expect(sql).toContain('match_vehicle_conditions_today');
    // 冪等キーの構築式（generate_inspection_reminder_events と同じ形式）
    expect(sql).toContain("p_store_id::text || ':' || m.id::text || ':' ||");
  });

  test('eligibility SQL は generate_inspection_reminder_events と同じ除外条件を使用している', async () => {
    const sql = await readFile(
      'supabase/migrations/20260627000000_inspection_reminder_eligibility_fn.sql',
      'utf8'
    );
    // JST 基準日（生成関数と同一）
    expect(sql).toContain("now() at time zone 'Asia/Tokyo'");
    // 有効タイミングとの照合（= any(v_enabled_offsets) は = t.offset_days と等価）
    expect(sql).toContain('= any(v_enabled_offsets)');
    // 削除済み・アーカイブ・満了日null 除外
    // vehicles は v / vb エイリアスを使うので prefix なしで確認。
    expect(sql).toContain('deleted_at is null');
    expect(sql).toContain('coalesce(v.is_archived, false) = false');
    expect(sql).toContain('inspection_expiry_date is not null');
    // 売約済み・廃車 除外（cfg フラグに依存）
    expect(sql).toContain("not in ('売約済み', 'sold')");
    expect(sql).toContain("not in ('廃車', 'scrapped')");
    // 車検予約済み・入庫済み 除外
    expect(sql).toContain("not in ('completed', 'delivered', 'cancelled')");
    expect(sql).toContain("mj2.job_type = '車検' or mj2.scheduled_in_at is not null or mj2.actual_in_date is not null");
    // cfg.enabled を result に含めてUIが状態を表示できるようにする
    expect(sql).toContain('cfg_enabled');
  });

  test('設定画面が match_vehicle_conditions_today と new_events_creatable_today を区別して表示する', async () => {
    const source = await readFile(
      'src/app/settings/customer-follow-up/inspection-reminders/page.tsx',
      'utf8'
    );
    expect(source).toContain('match_vehicle_conditions_today');
    expect(source).toContain('new_events_creatable_today');
    // 両者が別ラベルで表示されることを確認
    expect(source).toContain('本日の除外条件を満たす台数');
    expect(source).toContain('本日新規生成可能なイベント数');
  });
});

test.describe('車検案内: eligibility DB関数の直接RPC認可（クロスストア・非owner攻撃防止）', () => {
  test('SQL関数が auth.uid() でセッションIDを検証している（セッションなし → 拒否）', async () => {
    const sql = await readFile(
      'supabase/migrations/20260627000000_inspection_reminder_eligibility_fn.sql',
      'utf8'
    );
    // auth.uid() を呼び出して null チェックしていることを確認。
    expect(sql).toContain('auth.uid()');
    expect(sql).toContain('v_caller_id is null');
    // null の場合に例外を raise していることを確認。
    expect(sql).toContain('raise exception');
  });

  test('SQL関数が store_members で owner/admin を確認してからデータを読む（クロスストア防止）', async () => {
    const sql = await readFile(
      'supabase/migrations/20260627000000_inspection_reminder_eligibility_fn.sql',
      'utf8'
    );
    // store_members を p_store_id + auth.uid() + role で絞り込んでいることを確認。
    expect(sql).toContain('from public.store_members sm');
    expect(sql).toContain('sm.store_id = p_store_id');
    expect(sql).toContain('sm.user_id  = v_caller_id');
    expect(sql).toContain("sm.role     in ('owner', 'admin')");
    // role が null（メンバーでない・権限不足）の場合も raise していることを確認。
    expect(sql).toContain('v_caller_role is null');
  });

  test('認可チェックがデータ読み取りより前に実行される順序になっている', async () => {
    const sql = await readFile(
      'supabase/migrations/20260627000000_inspection_reminder_eligibility_fn.sql',
      'utf8'
    );
    // auth.uid() チェックが inspection_reminder_settings 読み取りより前に現れること。
    const authCheckPos    = sql.indexOf('auth.uid()');
    const settingsReadPos = sql.indexOf('from public.inspection_reminder_settings');
    const vehiclesReadPos = sql.indexOf('from public.vehicles');
    expect(authCheckPos).toBeGreaterThanOrEqual(0);
    expect(settingsReadPos).toBeGreaterThan(authCheckPos);
    expect(vehiclesReadPos).toBeGreaterThan(authCheckPos);
  });

  test('認可エラーメッセージが generic（ストア存在・ロールを漏らさない）', async () => {
    const sql = await readFile(
      'supabase/migrations/20260627000000_inspection_reminder_eligibility_fn.sql',
      'utf8'
    );
    // 両方のエラーが同一の generic なメッセージを使用していることを確認。
    // 個別の理由（"store not found" / "not admin" 等）を返すと情報漏洩になる。
    const matches = sql.match(/raise exception '[^']+'/g) ?? [];
    // 少なくとも2か所で raise exception が発生する（セッションなし + 権限なし）。
    expect(matches.length).toBeGreaterThanOrEqual(2);
    // すべての raise が同一のメッセージを使用し、ストア/ロール情報を含まないことを確認。
    const uniqueMessages = new Set(matches);
    expect(uniqueMessages.size).toBe(1);
    // insufficient_privilege errcode を使用していることを確認。
    expect(sql).toContain("errcode = 'insufficient_privilege'");
  });

  test('認可を通過した後も p_store_id スコープで絞り込まれる（自分のストアのデータのみ）', async () => {
    const sql = await readFile(
      'supabase/migrations/20260627000000_inspection_reminder_eligibility_fn.sql',
      'utf8'
    );
    // store_members の認可チェック後、全テーブル参照が p_store_id で絞り込まれていること。
    const vehiclesFilter  = sql.includes('v.store_id = p_store_id');
    const eventsFilter    = sql.includes('e.store_id = p_store_id');
    const mjFilter        = sql.includes('mj.store_id   = p_store_id') ||
                            sql.includes('mj.store_id    = p_store_id') ||
                            sql.includes('mj2.store_id   = p_store_id');
    const dealsFilter     = sql.includes('d.store_id    = p_store_id') ||
                            sql.includes('d.store_id      = p_store_id');
    expect(vehiclesFilter).toBe(true);
    expect(eventsFilter).toBe(true);
    expect(mjFilter).toBe(true);
    expect(dealsFilter).toBe(true);
  });
});
