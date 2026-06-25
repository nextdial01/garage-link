-- 038 在庫変動履歴 ＋ 請求書（整備案件に紐付かない部品単品販売）の在庫確定/取消
--
-- 方針（仕様確定版）:
--   - 整備案件由来の在庫減算は従来どおり maintenance_job_parts + adjust_repair_part_stock が唯一の発火点（本migrationは変更しない）。
--   - 請求書由来は「整備案件に紐付かない（maintenance_job_id is null）」請求が確定したときだけ在庫を動かす。
--   - すべての在庫変動を repair_part_stock_movements に記録し、由来(source_type)で識別する。
--   - 原子性・冪等性・差分調整・在庫不足ブロックを confirm/cancel 関数内（単一トランザクション）で担保。
--   - SECURITY INVOKER + RLS でテナント/店舗分離を維持。
--
-- 影響: 新規テーブル1、invoicesへ列追加2、新規関数2。既存データ・既存関数は不変。

-- 1. 在庫変動履歴
create table if not exists public.repair_part_stock_movements (
  id          uuid primary key default gen_random_uuid(),
  store_id    uuid not null references public.stores(id) on delete cascade,
  part_id     uuid not null references public.repair_parts(id) on delete cascade,
  delta       integer not null,                 -- 負=減算 / 正=復元・入荷
  source_type text not null,                    -- 'maintenance_job' | 'invoice_sale' | 'manual'
  source_id   uuid,                             -- 由来レコードID（job_id / invoice_id 等）
  reason      text,
  created_by  uuid,
  created_at  timestamptz not null default now(),
  constraint stock_movements_source_type_check
    check (source_type in ('maintenance_job','invoice_sale','manual'))
);
comment on table public.repair_part_stock_movements is '部品在庫の変動履歴。source_typeで整備案件由来/請求単品販売由来/手動を識別';
create index if not exists idx_stock_movements_store_part on public.repair_part_stock_movements(store_id, part_id, created_at desc);
create index if not exists idx_stock_movements_source on public.repair_part_stock_movements(source_type, source_id);

alter table public.repair_part_stock_movements enable row level security;
drop policy if exists "stock_movements_select_member" on public.repair_part_stock_movements;
create policy "stock_movements_select_member" on public.repair_part_stock_movements
  for select to authenticated
  using (store_id in (select public.current_user_store_ids()));
-- 変更は関数経由のみ（直接INSERTはRLSで許可しない＝関数はSECURITY INVOKERだが、INSERTポリシーを所属店舗に限定）
drop policy if exists "stock_movements_insert_member" on public.repair_part_stock_movements;
create policy "stock_movements_insert_member" on public.repair_part_stock_movements
  for insert to authenticated
  with check (store_id in (select public.current_user_store_ids()));

grant select, insert on public.repair_part_stock_movements to authenticated;

-- 2. invoices に在庫確定状態を保持（冪等・差分のためのスナップショット）
alter table public.invoices
  add column if not exists parts_stock_adjusted boolean not null default false,
  add column if not exists parts_stock_committed jsonb not null default '{}'::jsonb,
  add column if not exists parts_stock_adjusted_at timestamptz;
comment on column public.invoices.parts_stock_committed is '在庫減算済みの {part_id: quantity} スナップショット。再確定時の差分計算に使用';

-- 3. 請求書（単品販売）在庫確定: 冪等・差分・不足ブロック・履歴記録
create or replace function public.confirm_invoice_part_stock(
  p_invoice_id uuid,
  p_store_id   uuid
)
returns json
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_inv        public.invoices%rowtype;
  v_prev       jsonb;
  v_desired    jsonb := '{}'::jsonb;
  r            record;
  v_part       uuid;
  v_prev_qty   integer;
  v_desired_qty integer;
  v_delta      integer;
  v_cur_stock  integer;
  v_part_name  text;
begin
  select * into v_inv from public.invoices
   where id = p_invoice_id and store_id = p_store_id and deleted_at is null
   for update;
  if not found then
    return json_build_object('ok', false, 'error', '請求書が見つかりません');
  end if;

  -- 整備案件に紐付く請求は在庫を動かさない（在庫は整備案件側で確定済み）
  if v_inv.maintenance_job_id is not null then
    return json_build_object('ok', true, 'skipped', true, 'reason', 'maintenance_job_linked');
  end if;

  v_prev := coalesce(v_inv.parts_stock_committed, '{}'::jsonb);

  -- 望ましい在庫減算量（part_idを持つ明細の数量合計）
  for r in
    select part_id, sum(coalesce(quantity,0))::int as qty
    from public.invoice_items
    where invoice_id = p_invoice_id and store_id = p_store_id and part_id is not null
    group by part_id
  loop
    v_desired := v_desired || jsonb_build_object(r.part_id::text, r.qty);
  end loop;

  -- 検証パス: 全部品で差分適用後に在庫が負にならないか（不足は日本語でブロック）
  for v_part in
    select distinct key::uuid from (
      select jsonb_object_keys(v_prev) as key
      union select jsonb_object_keys(v_desired) as key
    ) k
  loop
    v_prev_qty    := coalesce((v_prev ->> v_part::text)::int, 0);
    v_desired_qty := coalesce((v_desired ->> v_part::text)::int, 0);
    v_delta := v_prev_qty - v_desired_qty;   -- 追加減算は負、戻しは正
    if v_delta = 0 then continue; end if;
    select stock, name into v_cur_stock, v_part_name from public.repair_parts
      where id = v_part and store_id = p_store_id and deleted_at is null for update;
    if not found then
      return json_build_object('ok', false, 'error', '部品が見つかりません', 'part_id', v_part);
    end if;
    if v_cur_stock + v_delta < 0 then
      return json_build_object('ok', false, 'error', '在庫不足です',
        'part_name', v_part_name, 'required', v_desired_qty, 'current_stock', v_cur_stock);
    end if;
  end loop;

  -- 適用パス: 差分のみ反映＋履歴
  for v_part in
    select distinct key::uuid from (
      select jsonb_object_keys(v_prev) as key
      union select jsonb_object_keys(v_desired) as key
    ) k
  loop
    v_prev_qty    := coalesce((v_prev ->> v_part::text)::int, 0);
    v_desired_qty := coalesce((v_desired ->> v_part::text)::int, 0);
    v_delta := v_prev_qty - v_desired_qty;
    if v_delta = 0 then continue; end if;
    update public.repair_parts
      set stock = stock + v_delta,
          status = case when stock + v_delta <= 0 then '発注待ち'
                        when stock + v_delta <= low_stock_threshold then '在庫少'
                        else '在庫あり' end,
          updated_at = now()
      where id = v_part and store_id = p_store_id;
    insert into public.repair_part_stock_movements(store_id, part_id, delta, source_type, source_id, reason)
      values (p_store_id, v_part, v_delta, 'invoice_sale', p_invoice_id, '請求確定による在庫調整');
  end loop;

  update public.invoices
    set parts_stock_adjusted = true,
        parts_stock_committed = v_desired,
        parts_stock_adjusted_at = now()
    where id = p_invoice_id and store_id = p_store_id;

  return json_build_object('ok', true, 'committed', v_desired);
end;
$$;

grant execute on function public.confirm_invoice_part_stock(uuid, uuid) to authenticated;

-- 4. 請求書（単品販売）在庫取消: 減算済み分を全て復元
create or replace function public.cancel_invoice_part_stock(
  p_invoice_id uuid,
  p_store_id   uuid
)
returns json
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_inv  public.invoices%rowtype;
  v_prev jsonb;
  v_part uuid;
  v_qty  integer;
begin
  select * into v_inv from public.invoices
   where id = p_invoice_id and store_id = p_store_id for update;
  if not found then
    return json_build_object('ok', false, 'error', '請求書が見つかりません');
  end if;
  if not v_inv.parts_stock_adjusted then
    return json_build_object('ok', true, 'skipped', true, 'reason', 'not_adjusted');
  end if;
  v_prev := coalesce(v_inv.parts_stock_committed, '{}'::jsonb);

  for v_part in select key::uuid from jsonb_object_keys(v_prev) key loop
    v_qty := coalesce((v_prev ->> v_part::text)::int, 0);
    if v_qty = 0 then continue; end if;
    update public.repair_parts
      set stock = stock + v_qty,
          status = case when stock + v_qty <= 0 then '発注待ち'
                        when stock + v_qty <= low_stock_threshold then '在庫少'
                        else '在庫あり' end,
          updated_at = now()
      where id = v_part and store_id = p_store_id;
    insert into public.repair_part_stock_movements(store_id, part_id, delta, source_type, source_id, reason)
      values (p_store_id, v_part, v_qty, 'invoice_sale', p_invoice_id, '請求取消による在庫復元');
  end loop;

  update public.invoices
    set parts_stock_adjusted = false,
        parts_stock_committed = '{}'::jsonb,
        parts_stock_adjusted_at = now()
    where id = p_invoice_id and store_id = p_store_id;

  return json_build_object('ok', true, 'restored', v_prev);
end;
$$;

grant execute on function public.cancel_invoice_part_stock(uuid, uuid) to authenticated;

-- ロールバック:
-- drop function if exists public.cancel_invoice_part_stock(uuid, uuid);
-- drop function if exists public.confirm_invoice_part_stock(uuid, uuid);
-- alter table public.invoices drop column if exists parts_stock_adjusted, drop column if exists parts_stock_committed, drop column if exists parts_stock_adjusted_at;
-- drop table if exists public.repair_part_stock_movements;
