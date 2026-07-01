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

test.describe('車検案内: 失効した pending イベントの無効化（stale event invalidation）', () => {
  // generate_inspection_reminder_events の本文だけを取り出すヘルパー。
  // テーブルDDLのCHECK制約（status in (...)）等、関数外の文字列を誤検出しないようにする。
  function extractGenerateFunctionBody(sql: string) {
    const start = sql.indexOf('create or replace function public.generate_inspection_reminder_events');
    expect(start).toBeGreaterThanOrEqual(0);
    const end = sql.indexOf('grant execute on function public.generate_inspection_reminder_events', start);
    expect(end).toBeGreaterThan(start);
    return sql.slice(start, end);
  }

  test('満了日が一致しない pending イベントは 状態=skipped・error_detail 付きで無効化される', async () => {
    const sql = await readFile('supabase/schema/035_inspection_reminders.sql', 'utf8');
    const fnBody = extractGenerateFunctionBody(sql);

    // 0a: 車両は存在するが現況が一致しない場合の UPDATE。
    expect(fnBody).toContain("set status = 'skipped',");
    expect(fnBody).toContain('error_detail = case');
    expect(fnBody).toContain("else 'stale: vehicle expiry date changed'");
    expect(fnBody).toContain('from public.vehicles v');
    expect(fnBody).toContain('where v.id = e.vehicle_id');
    expect(fnBody).toContain('v.inspection_expiry_date <> e.inspection_expiry_date');
    // 対象は inspection_reminder タイプの pending 行のみ。
    expect(fnBody).toContain("and e.event_type = 'inspection_reminder'");
    expect(fnBody).toContain("and e.status = 'pending'");
  });

  test('満了日が一致する pending イベントは無効化条件に一致せず、pending のまま残る（catch-all 節が存在しない）', async () => {
    const sql = await readFile('supabase/schema/035_inspection_reminders.sql', 'utf8');
    const fnBody = extractGenerateFunctionBody(sql);

    const zeroAStart = fnBody.indexOf('-- 0a.');
    const zeroBStart = fnBody.indexOf('-- 0b.');
    expect(zeroAStart).toBeGreaterThanOrEqual(0);
    expect(zeroBStart).toBeGreaterThan(zeroAStart);
    const zeroABlock = fnBody.slice(zeroAStart, zeroBStart);

    // 無効化条件は「削除済み / アーカイブ済み / 満了日null / 満了日不一致」の4つのみ。
    expect(zeroABlock).toContain('v.deleted_at is not null');
    expect(zeroABlock).toContain('coalesce(v.is_archived, false)');
    expect(zeroABlock).toContain('v.inspection_expiry_date is null');
    expect(zeroABlock).toContain('v.inspection_expiry_date <> e.inspection_expiry_date');

    // catch-all（true 等の無条件節）が無いことを確認: or で結ばれる条件はちょうど3回（=4条件）。
    const orConnectors = zeroABlock.match(/\n\s+or /g) ?? [];
    expect(orConnectors.length).toBe(3);

    // 上記4条件すべてに合致しない車両（=満了日が現況と一致する車両）は
    // このWHERE句にヒットしないため、当該pendingイベントはこの関数呼び出しでは変更されない。
  });

  test('completed / processing / failed / skipped の行、他 event_type の行は変更されない', async () => {
    const sql = await readFile('supabase/schema/035_inspection_reminders.sql', 'utf8');
    const fnBody = extractGenerateFunctionBody(sql);

    // この関数が書き込む status は 'skipped' のみ（0a・0bの2箇所）。
    const skippedSetCount = (fnBody.match(/status = 'skipped'/g) ?? []).length;
    expect(skippedSetCount).toBe(2);
    expect(fnBody).not.toContain("status = 'completed'");
    expect(fnBody).not.toContain("status = 'processing'");
    expect(fnBody).not.toContain("status = 'failed'");

    // 2つのUPDATEは両方とも status='pending' の行のみを対象にしている
    // （'processing'/'completed'/'failed'/既にskipped済みの行はWHERE句で除外される）。
    const pendingFilterCount = (fnBody.match(/e\.status = 'pending'/g) ?? []).length;
    expect(pendingFilterCount).toBe(2);

    // 両方とも event_type='inspection_reminder' に限定（他種別の配信候補には影響しない）。
    const eventTypeFilterCount = (fnBody.match(/e\.event_type = 'inspection_reminder'/g) ?? []).length;
    expect(eventTypeFilterCount).toBe(2);
  });

  test('削除済み・アーカイブ済み・満了日null・参照消失（vehicle_id が null）の車両は pending の車検案内イベントのみ無効化する', async () => {
    const sql = await readFile('supabase/schema/035_inspection_reminders.sql', 'utf8');
    const fnBody = extractGenerateFunctionBody(sql);

    // 0a: 車両行は存在するが 削除済み/アーカイブ済み/満了日null。
    expect(fnBody).toContain("when v.deleted_at is not null then 'stale: vehicle deleted or missing'");
    expect(fnBody).toContain("when coalesce(v.is_archived, false) then 'stale: vehicle archived'");
    expect(fnBody).toContain("when v.inspection_expiry_date is null then 'stale: vehicle expiry date cleared'");

    // 0b: 車両行自体が消失（on delete set null で vehicle_id が null になったケース）。
    expect(fnBody).toContain('-- 0b.');
    expect(fnBody).toContain('and e.vehicle_id is null');
    expect(fnBody).toContain("error_detail = 'stale: vehicle deleted or missing'");

    // 両方とも店舗スコープ（p_store_id）と event_type='inspection_reminder' に限定。
    const storeScopeCount = (fnBody.match(/\(p_store_id is null or e\.store_id = p_store_id\)/g) ?? []).length;
    expect(storeScopeCount).toBe(2);
  });

  test('新規イベント生成・冪等キー重複防止ロジックは無効化処理の追加後も変更されておらず、無効化は生成より前に実行される', async () => {
    const sql = await readFile('supabase/schema/035_inspection_reminders.sql', 'utf8');
    const fnBody = extractGenerateFunctionBody(sql);

    // 冪等性キーの形式・重複防止・オフセット判定は既存のまま。
    expect(fnBody).toContain(
      "store_id::text || ':' || vehicle_id::text || ':' || inspection_expiry_date::text || ':' || offset_days::text"
    );
    expect(fnBody).toContain('on conflict (idempotency_key) do nothing');
    expect(fnBody).toContain('(v.inspection_expiry_date - v_today) = t.offset_days');

    // 実行順序: 無効化(0a/0b) → 対象抽出(eligible) → INSERT → GET DIAGNOSTICS。
    // 無効化を生成の直前・同一関数呼び出し内で行うことでアトミック性を保つ。
    const zeroAIdx = fnBody.indexOf('-- 0a.');
    const zeroBIdx = fnBody.indexOf('-- 0b.');
    const eligibleIdx = fnBody.indexOf('with eligible as (');
    const insertIdx = fnBody.indexOf('insert into public.inspection_reminder_events (');
    const diagnosticsIdx = fnBody.indexOf('get diagnostics v_count = row_count;');

    expect(zeroAIdx).toBeGreaterThanOrEqual(0);
    expect(zeroBIdx).toBeGreaterThan(zeroAIdx);
    expect(eligibleIdx).toBeGreaterThan(zeroBIdx);
    expect(insertIdx).toBeGreaterThan(eligibleIdx);
    expect(diagnosticsIdx).toBeGreaterThan(insertIdx);

    // GET DIAGNOSTICS が INSERT の直後に位置する（=戻り値は新規生成件数のみを表し、
    // 無効化で更新された件数を含まない）ことを、両UPDATE文がINSERTより前にあることから保証する。
  });

  test('20260628（stale event invalidation）のロジックは、その後のパッチ（20260703の認可チェック追加）を経た schema/035 にも失われず残っている', async () => {
    // 20260628 は「schema/035 と完全一致（デプロイ差分なし）」を担保する時点固定のmigration。
    // 20260703_generate_events_store_authorization.sql で schema/035 の同関数へ認可チェックを
    // 追加したことにより、schema/035 は 20260628 より新しい内容を持つようになった（意図的な差分）。
    // 20260628自体は履歴migrationのため編集しない。ここでは「完全一致」ではなく、
    // 20260628が導入した失効判定ロジックが最新のschema/035からも失われていないことを確認する
    // （最新パッチとの完全一致は generate-events-tenant-authorization.test.ts 側で別途担保する）。
    const schemaSql = await readFile('supabase/schema/035_inspection_reminders.sql', 'utf8');
    const migrationSql = await readFile(
      'supabase/migrations/20260628000000_inspection_reminder_stale_event_invalidation.sql',
      'utf8'
    );

    const extract = (sql: string) => {
      const start = sql.indexOf('create or replace function public.generate_inspection_reminder_events');
      const end = sql.indexOf('grant execute on function public.generate_inspection_reminder_events', start);
      return sql.slice(start, end).trim();
    };

    const migrationBody = extract(migrationSql);
    const schemaBody = extract(schemaSql);

    // migration側にも grant 文が保持されていること（authenticated が実行権限を失わない）。
    expect(migrationSql).toContain(
      'grant execute on function public.generate_inspection_reminder_events(uuid, date) to authenticated;'
    );

    // 20260628の本体（宣言部・認可チェックの有無を除く、ロジック本体）が schema/035 の本体に
    // すべて含まれていることを、declare〜beginブロックを除いた「0. 失効判定」以降で比較する。
    const migrationLogic = migrationBody.slice(migrationBody.indexOf('-- 0. 既存 pending イベントの失効判定'));
    const schemaLogic = schemaBody.slice(schemaBody.indexOf('-- 0. 既存 pending イベントの失効判定'));
    expect(schemaLogic).toBe(migrationLogic);
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

test.describe('車検案内: L-LINK 取込確認応答（ACK）関数 acknowledge_inspection_reminder_events', () => {
  // 関数本文だけを取り出すヘルパー（grant文の手前まで）。他のCHECK制約等の文字列を誤検出しない。
  function extractAckFunctionBody(sql: string) {
    const start = sql.indexOf('create or replace function public.acknowledge_inspection_reminder_events');
    expect(start).toBeGreaterThanOrEqual(0);
    const end = sql.indexOf('grant execute on function public.acknowledge_inspection_reminder_events', start);
    expect(end).toBeGreaterThan(start);
    return sql.slice(start, end);
  }

  test('SECURITY DEFINER・明示的な search_path・service_role への execute 権限・生テーブル UPDATE 権限なし', async () => {
    const sql = await readFile('supabase/migrations/20260629000000_inspection_reminder_ack_fn.sql', 'utf8');
    expect(sql).toContain('security definer');
    expect(sql).toContain('set search_path = public');
    expect(sql).toContain(
      'grant execute on function public.acknowledge_inspection_reminder_events(uuid, jsonb) to service_role'
    );
    expect(sql).toContain(
      'revoke all on function public.acknowledge_inspection_reminder_events(uuid, jsonb) from public'
    );
    // inspection_reminder_events への生の UPDATE 権限付与は行わない（書き込みは本関数経由のみ）。
    expect(sql).not.toMatch(/grant\s+update\s+on\s+table\s+public\.inspection_reminder_events/i);
  });

  test('pending イベントは completed に遷移し、external_reference_id が確認応答値で設定される', async () => {
    const sql = await readFile('supabase/migrations/20260629000000_inspection_reminder_ack_fn.sql', 'utf8');
    const fnBody = extractAckFunctionBody(sql);

    expect(fnBody).toContain("set status = 'completed',");
    expect(fnBody).toContain('external_reference_id = i.external_reference_id');
    // 遷移対象は pending の行のみ。
    expect(fnBody).toContain("and e.status = 'pending'");
    // 店舗スコープは p_store_id のみ（bodyのstore_idではない — 関数はp_store_idしか受け取らない）。
    expect(fnBody).toContain('and e.store_id = p_store_id');
  });

  test('同一イベントの再確認応答は冪等で、already_acknowledged を返しエラーにならない', async () => {
    const sql = await readFile('supabase/migrations/20260629000000_inspection_reminder_ack_fn.sql', 'utf8');
    const fnBody = extractAckFunctionBody(sql);

    // 既に completed の行を再確認応答した場合の専用分岐が存在する。
    expect(fnBody).toContain("and e.status = 'completed'");
    expect(fnBody).toContain("then 'already_acknowledged'");
    // 直前の update で処理済みの event_id は already 側で二重集計しない。
    expect(fnBody).toContain('i.event_id_text not in (select event_id_text from updated)');
    // 関数全体に raise exception が無い（正常系のミスマッチで例外を投げない設計）。
    expect(fnBody).not.toContain('raise exception');
  });

  test('別店舗のイベント・skipped 等 pending/completed 以外のイベントは rejected になり、存在有無を明かさない', async () => {
    const sql = await readFile('supabase/migrations/20260629000000_inspection_reminder_ack_fn.sql', 'utf8');
    const fnBody = extractAckFunctionBody(sql);

    // updated（pending→completed）は e.store_id = p_store_id かつ e.status = 'pending' の行のみに限定。
    // already（idempotent）は e.store_id = p_store_id かつ e.status = 'completed' の行のみに限定。
    // → 別店舗のイベント・pending/completed 以外（skipped/failed/processing）は両方に一致せず、
    //   CASE式の else 分岐（'rejected'）に落ちる。else 以外に固有の理由を返す分岐は存在しない。
    const caseIdx = fnBody.indexOf('case');
    const caseEndIdx = fnBody.indexOf('end as outcome');
    expect(caseIdx).toBeGreaterThanOrEqual(0);
    expect(caseEndIdx).toBeGreaterThan(caseIdx);
    const caseBlock = fnBody.slice(caseIdx, caseEndIdx);
    expect(caseBlock).toContain("then 'acknowledged'");
    expect(caseBlock).toContain("then 'already_acknowledged'");
    expect(caseBlock).toContain("else 'rejected'");
    // else 分岐は唯一のフォールバックであり、'rejected' 以外の固有理由を返す分岐は存在しない。
    const whenCount = (caseBlock.match(/\bwhen\b/g) ?? []).length;
    expect(whenCount).toBe(2);
  });

  test('入力バッチは event_id ごとに独立して処理され、一部不正でもバッチ全体は失敗しない', async () => {
    const sql = await readFile('supabase/migrations/20260629000000_inspection_reminder_ack_fn.sql', 'utf8');
    const fnBody = extractAckFunctionBody(sql);

    // outcomes は input の全行を起点に left join で組み立てられるため、
    // マッチしない event_id も欠落せず 'rejected' として結果に含まれる（バッチ全体の失敗にならない）。
    expect(fnBody).toContain('from input i');
    expect(fnBody).toContain('left join updated u on u.event_id_text = i.event_id_text');
    expect(fnBody).toContain('left join already a on a.event_id_text = i.event_id_text');
    // 結果は event_id ごとの配列（jsonb_agg）として返る。単一の成功/失敗フラグではない。
    expect(fnBody).toContain('jsonb_agg(jsonb_build_object(\'event_id\', event_id_text, \'outcome\', outcome))');
    // 空配列・全滅時も落ちない（coalesce で空配列にフォールバック）。
    expect(fnBody).toContain("coalesce(");
    expect(fnBody).toContain("'[]'::jsonb");
  });

  test('migration と schema/035 の関数定義が完全一致する（デプロイ差分なし）', async () => {
    const migrationSql = await readFile('supabase/migrations/20260629000000_inspection_reminder_ack_fn.sql', 'utf8');
    const schemaSql = await readFile('supabase/schema/035_inspection_reminders.sql', 'utf8');

    const extract = (sql: string) => {
      const start = sql.indexOf('create or replace function public.acknowledge_inspection_reminder_events');
      const end = sql.indexOf('grant execute on function public.acknowledge_inspection_reminder_events', start);
      return sql.slice(start, end).trim();
    };

    expect(extract(migrationSql)).toBe(extract(schemaSql));
    expect(schemaSql).toContain(
      'grant execute on function public.acknowledge_inspection_reminder_events(uuid, jsonb) to service_role;'
    );
  });
});

test.describe('車検案内: L-LINK 確認応答（ACK）ルート — 既存の候補取得ルートは無変更', () => {
  test('ACKルートは POST のみで HMAC 検証・auth.storeId 限定・LINE非呼び出し', async () => {
    const source = await readFile(
      'src/app/api/s2s/line-link/delivery-candidates/ack/route.ts',
      'utf8'
    );
    expect(source).toContain('export async function POST(');
    expect(source).not.toContain('export async function GET(');
    expect(source).toContain('verifyLLinkS2SRequest');
    expect(source).toContain('p_store_id: auth.storeId');
    expect(source).not.toContain('SUPABASE_ANON_KEY');
    expect(source).not.toMatch(/api\.line\.me|messages\/(push|multicast|broadcast)/);
    expect(source).toContain("logServerError('line_link_s2s_ack_failed'");
  });

  test('ACKルートはリクエストbodyのstore_idを一切参照しない', async () => {
    const source = await readFile(
      'src/app/api/s2s/line-link/delivery-candidates/ack/route.ts',
      'utf8'
    );
    expect(source).not.toMatch(/body\.store_id|parsedBody\.store_id/i);
  });

  test('既存の候補取得ルート（/api/s2s/line-link/delivery-candidates）は読み取り専用のまま変更されていない', async () => {
    const source = await readFile(
      'src/app/api/s2s/line-link/delivery-candidates/route.ts',
      'utf8'
    );
    // pending のみ・store_idスコープのSELECTのみという既存契約が維持されている。
    expect(source).toContain(".eq('store_id', auth.storeId)");
    expect(source).toContain(".eq('status', 'pending')");
    expect(source).not.toMatch(/\.update\(|\.upsert\(|\.insert\(|\.delete\(/);
  });
});
