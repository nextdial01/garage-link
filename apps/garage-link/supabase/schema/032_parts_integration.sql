-- GARAGE LINK 032: 部品連携
-- repair_partsの拡張、整備案件部品明細、見積・請求への部品連携、
-- 在庫安全減算関数を追加します。

-- ==================================================
-- 1. repair_parts テーブルに列を追加
-- ==================================================
alter table public.repair_parts
  add column if not exists reorder_point   integer      not null default 0,
  add column if not exists min_stock       integer      not null default 0,
  add column if not exists last_purchase_date  date,
  add column if not exists last_purchase_price numeric(12,2),
  add column if not exists location_shelf  text;

comment on column public.repair_parts.reorder_point      is '発注点。在庫がこの値以下になったら発注を検討する';
comment on column public.repair_parts.min_stock          is '最低在庫数。補充後もこの数量を維持する目安';
comment on column public.repair_parts.last_purchase_date is '最終仕入日';
comment on column public.repair_parts.last_purchase_price is '最終仕入単価（原価）';
comment on column public.repair_parts.location_shelf     is '棚番・保管場所';

-- ==================================================
-- 2. maintenance_job_parts テーブル（整備案件使用部品明細）
-- ==================================================
create table if not exists public.maintenance_job_parts (
  id                  uuid        primary key default gen_random_uuid(),
  store_id            uuid        not null references public.stores(id) on delete cascade,
  job_id              uuid        not null references public.maintenance_jobs(id) on delete cascade,
  part_id             uuid        references public.repair_parts(id) on delete set null,

  -- 使用時点のスナップショット（マスタが後から変わっても記録を保持）
  part_no             text,
  name                text        not null,
  quantity            integer     not null default 1,
  unit_price          numeric(12,2) not null default 0,
  cost_price          numeric(12,2),
  discount_amount     numeric(12,2) not null default 0,
  tax_rate            numeric(4,3) not null default 0.100,
  tax_amount          numeric(12,2) not null default 0,
  subtotal_amount     numeric(12,2) not null default 0,
  work_memo           text,

  -- 在庫確定フラグ（trueの時だけ在庫が減算済み）
  stock_adjusted      boolean     not null default false,
  stock_adjusted_at   timestamptz,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

comment on table  public.maintenance_job_parts                   is '整備案件ごとの使用部品明細';
comment on column public.maintenance_job_parts.part_id           is 'repair_partsへの参照。NULL=部品マスタ未登録の臨時部品';
comment on column public.maintenance_job_parts.stock_adjusted    is 'trueの時は在庫が減算済み。削除時は在庫を戻す必要がある';

create index if not exists idx_maintenance_job_parts_store_id on public.maintenance_job_parts(store_id);
create index if not exists idx_maintenance_job_parts_job_id   on public.maintenance_job_parts(job_id);
create index if not exists idx_maintenance_job_parts_part_id  on public.maintenance_job_parts(part_id);

drop trigger if exists set_maintenance_job_parts_updated_at on public.maintenance_job_parts;
create trigger set_maintenance_job_parts_updated_at
  before update on public.maintenance_job_parts
  for each row execute function public.set_updated_at();

alter table public.maintenance_job_parts enable row level security;

drop policy if exists "mjp_select_own_store" on public.maintenance_job_parts;
create policy "mjp_select_own_store"
  on public.maintenance_job_parts for select to authenticated
  using (store_id in (select public.current_user_store_ids()));

drop policy if exists "mjp_insert_own_store" on public.maintenance_job_parts;
create policy "mjp_insert_own_store"
  on public.maintenance_job_parts for insert to authenticated
  with check (store_id in (select public.current_user_store_ids()));

drop policy if exists "mjp_update_own_store" on public.maintenance_job_parts;
create policy "mjp_update_own_store"
  on public.maintenance_job_parts for update to authenticated
  using (store_id in (select public.current_user_store_ids()))
  with check (store_id in (select public.current_user_store_ids()));

drop policy if exists "mjp_delete_own_store" on public.maintenance_job_parts;
create policy "mjp_delete_own_store"
  on public.maintenance_job_parts for delete to authenticated
  using (store_id in (select public.current_user_store_ids()));

grant select, insert, update, delete on public.maintenance_job_parts to authenticated;

-- ==================================================
-- 3. quote_items / invoice_items に part_id, cost_price を追加
-- ==================================================
alter table public.quote_items
  add column if not exists part_id    uuid references public.repair_parts(id) on delete set null,
  add column if not exists cost_price integer default 0;

alter table public.invoice_items
  add column if not exists part_id    uuid references public.repair_parts(id) on delete set null,
  add column if not exists cost_price integer default 0;

comment on column public.quote_items.part_id    is '紐づく部品マスタID（部品明細の場合）';
comment on column public.quote_items.cost_price is '原価。顧客向け帳票には表示しない';
comment on column public.invoice_items.part_id  is '紐づく部品マスタID（部品明細の場合）';
comment on column public.invoice_items.cost_price is '原価。顧客向け帳票には表示しない';

create index if not exists idx_quote_items_part_id   on public.quote_items(part_id);
create index if not exists idx_invoice_items_part_id on public.invoice_items(part_id);

-- ==================================================
-- 4. 在庫安全減算関数
-- ==================================================
-- SECURITY INVOKER: 呼び出したユーザーの権限で実行するため、
-- repair_parts の RLS によりテナント間の不正アクセスを防止します。
create or replace function public.adjust_repair_part_stock(
  p_part_id  uuid,
  p_store_id uuid,
  p_delta    integer  -- 負数で減算、正数で加算
)
returns json
language plpgsql
security invoker
as $$
declare
  v_current_stock integer;
  v_new_stock     integer;
begin
  -- 行ロックを取得してから在庫を確認（二重減算防止）
  select stock into v_current_stock
  from public.repair_parts
  where id = p_part_id
    and store_id = p_store_id
    and deleted_at is null
  for update;

  if not found then
    return json_build_object('ok', false, 'error', '部品が見つかりません');
  end if;

  v_new_stock := v_current_stock + p_delta;

  if v_new_stock < 0 then
    return json_build_object(
      'ok',            false,
      'error',         '在庫不足です',
      'current_stock', v_current_stock,
      'delta',         p_delta
    );
  end if;

  update public.repair_parts
  set
    stock      = v_new_stock,
    status     = case
                   when v_new_stock <= 0                  then '発注待ち'
                   when v_new_stock <= low_stock_threshold then '在庫少'
                   else                                        '在庫あり'
                 end,
    updated_at = now()
  where id = p_part_id and store_id = p_store_id;

  return json_build_object(
    'ok',             true,
    'previous_stock', v_current_stock,
    'new_stock',      v_new_stock
  );
end;
$$;

grant execute on function public.adjust_repair_part_stock(uuid, uuid, integer) to authenticated;

-- 確認用:
-- select column_name from information_schema.columns where table_name = 'repair_parts' order by ordinal_position;
-- select * from public.maintenance_job_parts limit 5;
-- select adjust_repair_part_stock('<uuid>', '<store_uuid>', -1);
