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
