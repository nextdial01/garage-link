-- Additive business contract. Historical values and snapshots remain unchanged.
begin;
create table if not exists public.store_master_entries (
 id uuid primary key default gen_random_uuid(),
 store_id uuid not null references public.stores(id),
 kind text not null check(kind in ('vehicle_maker','part_category','work_category','unit','reception_route','part_supplier')),
 label text not null check(length(btrim(label)) > 0),
 is_active boolean not null default true,
 sort_order integer not null default 0,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(store_id,kind,label)
);
alter table public.store_master_entries enable row level security;
revoke all on public.store_master_entries from public,anon,authenticated,service_role;
grant select,insert,update on public.store_master_entries to authenticated;
grant select,insert,update on public.store_master_entries to service_role;
drop policy if exists master_read on public.store_master_entries;
create policy master_read on public.store_master_entries for select to authenticated
 using(store_id in (select public.current_user_store_ids()));
drop policy if exists master_insert on public.store_master_entries;
create policy master_insert on public.store_master_entries for insert to authenticated
 with check(public.current_user_can_admin_store(store_id));
drop policy if exists master_update on public.store_master_entries;
create policy master_update on public.store_master_entries for update to authenticated
 using(public.current_user_can_admin_store(store_id)) with check(public.current_user_can_admin_store(store_id));
drop trigger if exists master_scope_immutable on public.store_master_entries;
create trigger master_scope_immutable before update on public.store_master_entries
 for each row execute function public.guard_scope_columns_immutable();
drop trigger if exists master_updated_at on public.store_master_entries;
create trigger master_updated_at before update on public.store_master_entries
 for each row execute function public.set_updated_at();
-- Preserve the exact legacy labels; never rewrite vehicle/part rows.
insert into public.store_master_entries(store_id,kind,label)
 select distinct store_id,'vehicle_maker',maker from public.vehicles
 where maker is not null and length(btrim(maker)) > 0 on conflict do nothing;
insert into public.store_master_entries(store_id,kind,label)
 select distinct store_id,'part_category',category from public.repair_parts
 where category is not null and length(btrim(category)) > 0 on conflict do nothing;
alter table public.vehicles add column if not exists liability_insurance_expiry_date date;
alter table public.stores add column if not exists tax_display_mode text not null default 'included'
 check(tax_display_mode in ('included','excluded'));
alter table public.quotes add column if not exists tax_display_mode text check(tax_display_mode in ('included','excluded'));
alter table public.invoices add column if not exists tax_display_mode text check(tax_display_mode in ('included','excluded'));
alter table public.maintenance_jobs add column if not exists tax_display_mode text check(tax_display_mode in ('included','excluded'));
alter table public.maintenance_jobs add column if not exists work_details jsonb not null default '[]'::jsonb check(jsonb_typeof(work_details)='array');
alter table public.maintenance_jobs add column if not exists work_details_version integer not null default 0 check(work_details_version>=0);
alter table public.quote_items add column if not exists unit text, add column if not exists note text, add column if not exists tax_category text;
alter table public.invoice_items add column if not exists unit text, add column if not exists note text, add column if not exists tax_category text;
alter table public.quotes add column if not exists discount_input_amount numeric;
alter table public.invoices add column if not exists discount_input_amount numeric;
alter table public.maintenance_jobs add column if not exists discount_input_amount numeric;
-- Widen integer inventory only. Existing unconstrained numeric line quantities stay numeric.
alter table public.repair_parts alter column stock type numeric(15,3),
 alter column low_stock_threshold type numeric(15,3), alter column reorder_point type numeric(15,3), alter column min_stock type numeric(15,3);
alter table public.maintenance_job_parts alter column quantity type numeric(15,3);
alter table public.repair_part_stock_movements alter column delta type numeric(15,3);

create or replace function public.adjust_repair_part_stock_decimal(p_part_id uuid,p_store_id uuid,p_delta numeric)
returns json language plpgsql security definer set search_path=public,pg_temp as $$
declare v_stock numeric; v_next numeric;
begin
 if not public.current_user_can_admin_store(p_store_id) then
  raise exception '在庫を確定・取消する権限がありません。' using errcode='42501';
 end if;
 if p_delta is null or p_delta::text in ('NaN','Infinity','-Infinity') or p_delta<>round(p_delta,3) then
  raise exception '数量は小数第3位まで入力してください。' using errcode='22023';
 end if;
 select stock into v_stock from public.repair_parts where id=p_part_id and store_id=p_store_id and deleted_at is null for update;
 if not found then return json_build_object('ok',false,'error','部品が見つかりません'); end if;
 v_next:=v_stock+p_delta;
 if v_next<0 then return json_build_object('ok',false,'error','在庫不足です','current_stock',v_stock,'delta',p_delta); end if;
 update public.repair_parts set stock=v_next,status=case when v_next<=0 then '発注待ち' when v_next<=low_stock_threshold then '在庫少' else '在庫あり' end,updated_at=now()
 where id=p_part_id and store_id=p_store_id;
 return json_build_object('ok',true,'previous_stock',v_stock,'new_stock',v_next);
end $$;
revoke all on function public.adjust_repair_part_stock_decimal(uuid,uuid,numeric) from public,anon;
grant execute on function public.adjust_repair_part_stock_decimal(uuid,uuid,numeric) to authenticated;
-- Integer clients preserve their API while no longer rounding an existing fractional stock.
create or replace function public.adjust_repair_part_stock(p_part_id uuid,p_store_id uuid,p_delta integer)
returns json language sql security invoker set search_path=public,pg_temp as $$
 select public.adjust_repair_part_stock_decimal(p_part_id,p_store_id,p_delta::numeric)
$$;

create or replace function public.confirm_invoice_part_stock_g1b_impl(
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
  v_prev_qty   numeric;
  v_desired_qty numeric;
  v_delta      numeric;
  v_cur_stock  numeric;
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

  if exists(select 1 from public.invoice_items where invoice_id=p_invoice_id and store_id=p_store_id and part_id is not null and (quantity<0 or quantity::text in ('NaN','Infinity','-Infinity') or quantity<>round(quantity,3))) then raise exception '在庫数量が不正です' using errcode='22023'; end if;

  -- 望ましい在庫減算量（part_idを持つ明細の数量合計）
  for r in
    select part_id, sum(coalesce(quantity,0))::numeric as qty
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
    ) k order by key::uuid
  loop
    v_prev_qty    := coalesce((v_prev ->> v_part::text)::numeric, 0);
    v_desired_qty := coalesce((v_desired ->> v_part::text)::numeric, 0);
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
    ) k order by key::uuid
  loop
    v_prev_qty    := coalesce((v_prev ->> v_part::text)::numeric, 0);
    v_desired_qty := coalesce((v_desired ->> v_part::text)::numeric, 0);
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
revoke all on function public.confirm_invoice_part_stock_g1b_impl(uuid,uuid) from public,anon,authenticated;

create or replace function public.cancel_invoice_part_stock_g1b_impl(
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
  v_qty  numeric;
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

  for v_part in select key::uuid from jsonb_object_keys(v_prev) key order by key::uuid loop
    v_qty := coalesce((v_prev ->> v_part::text)::numeric, 0);
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
revoke all on function public.cancel_invoice_part_stock_g1b_impl(uuid,uuid) from public,anon,authenticated;

-- quotes identifies itself with id; quote_items refers to it with quote_id.
-- Keep the existing sale snapshot and internal accounting protections intact.
create or replace function public.guard_sale_quote_snapshot()
returns trigger language plpgsql set search_path=public,pg_temp as $$
declare v_quote_id uuid;
begin
  if tg_table_name='quotes' then
    v_quote_id := coalesce(new.id,old.id);
  else
    v_quote_id := coalesce(new.quote_id,old.quote_id);
  end if;
  if coalesce(current_setting('app.g4a_accounting_rpc',true),'')='on' then return coalesce(new,old); end if;
  if exists (select 1 from public.vehicle_sale_claims c where c.quote_id=v_quote_id and c.status in ('active','delivered')) then
    if tg_table_name='quotes' then
      if new.discount_input_amount is distinct from old.discount_input_amount or new.tax_display_mode is distinct from old.tax_display_mode or new.status is distinct from old.status or new.issue_status is distinct from old.issue_status
         or new.quote_no is distinct from old.quote_no or new.deal_id is distinct from old.deal_id
         or new.vehicle_id is distinct from old.vehicle_id or new.subtotal_amount is distinct from old.subtotal_amount
         or new.tax_amount is distinct from old.tax_amount or new.discount_amount is distinct from old.discount_amount
         or new.trade_in_amount is distinct from old.trade_in_amount or new.total_amount is distinct from old.total_amount
      then raise exception 'G4A_SALE_QUOTE_SNAPSHOT_IMMUTABLE' using errcode='42501'; end if;
      return new;
    end if;
    raise exception 'G4A_SALE_QUOTE_SNAPSHOT_IMMUTABLE' using errcode='42501';
  end if;
  return coalesce(new,old);
end $$;

create or replace function public.guard_invoice_accounting_state()
returns trigger language plpgsql set search_path=public,pg_temp as $$
declare v_internal boolean := coalesce(current_setting('app.g4a_accounting_rpc',true),'')='on';
begin
  if v_internal then return new; end if;
  if old.issue_status <> 'draft' and (
    new.discount_input_amount is distinct from old.discount_input_amount or new.tax_display_mode is distinct from old.tax_display_mode or new.invoice_no is distinct from old.invoice_no or new.quote_id is distinct from old.quote_id
    or new.deal_id is distinct from old.deal_id or new.customer_id is distinct from old.customer_id
    or new.vehicle_id is distinct from old.vehicle_id or new.subtotal_amount is distinct from old.subtotal_amount
    or new.tax_amount is distinct from old.tax_amount or new.discount_amount is distinct from old.discount_amount
    or new.trade_in_amount is distinct from old.trade_in_amount or new.total_amount is distinct from old.total_amount
  ) then raise exception 'G4A_ISSUED_INVOICE_IMMUTABLE' using errcode='42501'; end if;
  if new.paid_amount is distinct from old.paid_amount or new.unpaid_amount is distinct from old.unpaid_amount
     or new.status is distinct from old.status or new.issue_status is distinct from old.issue_status
     or new.issued_at is distinct from old.issued_at or new.cancelled_at is distinct from old.cancelled_at
  then raise exception 'G4A_PAYMENT_TOTAL_RPC_ONLY' using errcode='42501'; end if;
  return new;
end $$;
commit;

-- Safe application rollback: revert callers and leave these additive columns/table in place.
-- Never narrow fractional columns to integer or drop populated snapshots during rollback.

notify pgrst, 'reload schema';
