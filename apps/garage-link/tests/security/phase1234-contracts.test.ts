import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

test.describe('Phase 1: 在庫発火点分離（038）', () => {
  test('在庫変動履歴と請求単品販売の確定/取消関数が安全設計である', async () => {
    const sql = await readFile('supabase/schema/038_stock_movements_and_invoice_sale.sql', 'utf8');
    expect(sql).toContain('create table if not exists public.repair_part_stock_movements');
    expect(sql).toContain("source_type in ('maintenance_job','invoice_sale','manual')");
    expect(sql).toContain('create or replace function public.confirm_invoice_part_stock');
    expect(sql).toContain('create or replace function public.cancel_invoice_part_stock');
    // 整備案件紐付き請求は在庫を動かさない（発火点分離）
    expect(sql).toContain('maintenance_job_id is not null');
    // 冪等・差分のためのスナップショット
    expect(sql).toContain('parts_stock_committed');
    // 在庫不足ブロック（日本語）
    expect(sql).toContain('在庫不足です');
    // テナント分離（RLS優先のSECURITY INVOKER）
    expect(sql).toContain('security invoker');
    // 既存の整備案件在庫関数を破壊しない（adjust_repair_part_stock を再定義しない）
    expect(sql).not.toContain('function public.adjust_repair_part_stock');
  });
});

test.describe('Phase 4: 候補生成（040）', () => {
  test('フォロー候補生成は冪等・除外・スコープを満たし直接送信しない', async () => {
    const sql = await readFile('supabase/schema/040_followup_candidate_generation.sql', 'utf8');
    expect(sql).toContain('create or replace function public.generate_followup_candidate_events');
    // 4種別を生成
    for (const t of ['periodic_inspection', 'post_delivery_follow_up', 'review_request', 'long_no_contact']) {
      expect(sql).toContain(`'${t}'`);
    }
    // 買替は生成しない（種別のみ維持）
    expect(sql).not.toContain("'repurchase', 'pending'");
    // 冪等
    expect(sql).toContain('on conflict (idempotency_key) do nothing');
    // 除外: 配信停止・LINE未連携・削除
    expect(sql).toContain("delivery_permission,'') = 'allowed'");
    expect(sql).toContain("line_friend_status,'') = 'linked'");
    expect(sql).toContain('c.deleted_at is null');
    // company/store スコープ
    expect(sql).toContain('st.tenant_id as company_id');
    expect(sql).toContain('cfg.store_id = p_store_id');
    // 直接LINE送信を含まない
    expect(sql).not.toContain('api.line.me');
  });
});

test.describe('Phase 2: 在庫利益・回転（041）', () => {
  test('在庫指標RPCと長期滞留閾値（初期90日）が定義される', async () => {
    const sql = await readFile('supabase/schema/041_inventory_profit_turnover.sql', 'utf8');
    expect(sql).toContain('create or replace function public.inventory_dashboard_metrics');
    expect(sql).toContain('long_stay_threshold_days integer not null default 90');
    for (const k of ['inventory_total_cost', 'expected_gross_profit', 'long_stay_count', 'avg_days_in_stock', 'sold_this_month_count', 'realized_gross_profit_this_month']) {
      expect(sql).toContain(k);
    }
    // 在庫対象から売約済み・納車済み・廃車を除外
    expect(sql).toContain("not in ('売約済み','sold','納車済み','廃車','scrapped')");
    expect(sql).toContain('security invoker');
  });
});

test.describe('Phase 4 UI/API: 配信候補', () => {
  test('events APIは event_type を返し種別フィルタ可能', async () => {
    const src = await readFile('src/app/api/customer-follow-up/inspection-reminders/events/route.ts', 'utf8');
    expect(src).toContain('event_type');
    expect(src).toContain('CANDIDATE_EVENT_TYPES');
    expect(src).toContain("url.searchParams.get('event_type')");
  });
});

test.describe('Phase 4 ジョブ配線: generate_followup_candidate_events の呼び出し', () => {
  test('ジョブルートが車検案内とフォロー候補の両方のRPCを呼ぶ', async () => {
    const src = await readFile('src/app/api/jobs/inspection-reminders/route.ts', 'utf8');
    expect(src).toContain("'generate_inspection_reminder_events'");
    expect(src).toContain("'generate_followup_candidate_events'");
  });

  test('GET/POSTともに共通ヘルパー経由でstore_idスコープを渡す', async () => {
    const src = await readFile('src/app/api/jobs/inspection-reminders/route.ts', 'utf8');
    expect(src).toContain('runGenerationJobs(service, null)');
    expect(src).toContain('runGenerationJobs(service, member.store_id)');
  });

  test('片方のRPCが失敗しても、もう一方の結果を握り潰さない（部分成功を許容）', async () => {
    const src = await readFile('src/app/api/jobs/inspection-reminders/route.ts', 'utf8');
    // 2つのRPC呼び出しはそれぞれ独立してerrorチェックされ、どちらかのthrowで
    // もう一方の結果が失われることはない（try/catchでまとめて握り潰さない設計）。
    expect(src).toContain('if (inspectionError) {');
    expect(src).toContain('if (followupError) {');
    expect(src).toContain('errors: string[]');
    // 両方失敗した場合のみ500として扱う（片方成功なら ok:true で返す）。
    expect(src).toContain('errors.length === 2');
  });

  test('レスポンスに種別ごとの内訳（breakdown）を含む', async () => {
    const src = await readFile('src/app/api/jobs/inspection-reminders/route.ts', 'utf8');
    expect(src).toContain('inspection_reminder: number; followup_candidates: number');
    expect(src).toContain('breakdown,');
  });
});

test.describe('Phase 4: eligibility集計を車検案内(inspection_reminder)のみに限定', () => {
  test('event_counts CTEが event_type=inspection_reminder で絞り込まれている', async () => {
    const sql = await readFile(
      'supabase/migrations/20260702000000_inspection_reminder_eligibility_scope_event_type.sql',
      'utf8'
    );
    const ctePos = sql.indexOf('event_counts as (');
    expect(ctePos).toBeGreaterThanOrEqual(0);
    const cteEnd = sql.indexOf('group by e.status', ctePos);
    expect(cteEnd).toBeGreaterThan(ctePos);
    const cte = sql.slice(ctePos, cteEnd);
    expect(cte).toContain("e.event_type = 'inspection_reminder'");
    expect(cte).toContain('e.store_id = p_store_id');
  });

  test('認可チェック・PII非公開・SECURITY DEFINER等の不変条件は維持されている', async () => {
    const sql = await readFile(
      'supabase/migrations/20260702000000_inspection_reminder_eligibility_scope_event_type.sql',
      'utf8'
    );
    expect(sql).toContain('security definer');
    expect(sql).toContain('stable');
    expect(sql).toContain('set search_path = public, pg_temp');
    expect(sql).toContain('auth.uid()');
    expect(sql).toContain("sm.role     in ('owner', 'admin')");
    expect(sql).toContain('revoke all on function public.get_inspection_reminder_eligibility_summary(uuid) from public');
    expect(sql).toContain('grant execute on function public.get_inspection_reminder_eligibility_summary(uuid) to authenticated');
    const piiFields = ['customer_name', 'vehicle_name', 'registration_no', 'phone', 'email', 'line_user_id', 'vin'];
    for (const field of piiFields) {
      expect(sql).not.toContain(field);
    }
  });
});

test.describe('Phase 4 UI: 車検案内履歴ページは車検案内以外の種別を混在表示しない', () => {
  test('履歴ページは events API へ event_type=inspection_reminder を明示的に渡す', async () => {
    const src = await readFile('src/app/customer-follow-up/inspection-reminders/page.tsx', 'utf8');
    expect(src).toContain("params.set('event_type', 'inspection_reminder')");
  });

  test('配信候補一覧ページは種別を固定せず、ユーザーの絞り込み状態をそのまま渡す', async () => {
    const src = await readFile('src/app/customer-follow-up/delivery-candidates/page.tsx', 'utf8');
    expect(src).not.toContain("params.set('event_type', 'inspection_reminder')");
    expect(src).toContain("if (typeFilter) params.set('event_type', typeFilter)");
  });
});
