-- Deployable migration promotion of supabase/schema/039_customer_deal_followup_fields.sql.
-- See 20260630000000_delivery_candidate_event_types.sql for why this promotion exists.
-- customers.last_contact_at added here is a hard dependency of
-- 20260701000000_followup_candidate_generation.sql's long_no_contact candidate block, so this
-- file must apply before it.
--
-- The SQL body below is byte-identical to supabase/schema/039_customer_deal_followup_fields.sql
-- as of this migration's creation (enforced by tests/security/migration-chain-037-041.test.ts).

-- 039 顧客・商談の再来店/フォロー用フィールド追加（Phase 3）
--
-- 既存項目を最大限活用し、不足分のみ追加:
--   deals: source(流入経路)・next_action_at(次回連絡)・trade_in_status は既存 → 利用。
--          不足: lost_reason(失注理由), last_contact_at(最終接触日)。
--   customers: next_action_date は既存 → 利用。不足: last_contact_at(最終接触日)。
-- いずれも nullable・既存データ非破壊。RLSは既存ポリシーを継承（列追加のみ）。

alter table public.deals
  add column if not exists lost_reason     text,
  add column if not exists last_contact_at timestamptz;
comment on column public.deals.lost_reason is '失注理由（status=lost等のとき）';
comment on column public.deals.last_contact_at is '最終接触日時。再来店・長期未接触判定に利用';

alter table public.customers
  add column if not exists last_contact_at timestamptz;
comment on column public.customers.last_contact_at is '最終接触日時。長期未接触候補の判定に利用';

create index if not exists idx_customers_last_contact on public.customers(store_id, last_contact_at);

-- ロールバック:
-- alter table public.customers drop column if exists last_contact_at;
-- alter table public.deals drop column if exists lost_reason, drop column if exists last_contact_at;
