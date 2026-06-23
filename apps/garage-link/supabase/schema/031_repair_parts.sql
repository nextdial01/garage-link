-- GARAGE LINK repair_parts
-- 整備・修理用部品の在庫管理テーブルです。
-- 既存データを消さず、開発中に再実行しやすい形にしています。

create extension if not exists "pgcrypto";

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.repair_parts (
  id              uuid        primary key default gen_random_uuid(),
  store_id        uuid        not null references public.stores(id) on delete cascade,
  part_no         text,
  name            text        not null,
  category        text,
  stock           integer     not null default 0,
  unit_price      numeric(12,2),
  low_stock_threshold integer not null default 5,
  status          text        not null default '在庫あり',
  supplier_name   text,
  memo            text,
  deleted_at      timestamptz,
  deleted_by      text,
  is_archived     boolean     not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint repair_parts_status_check check (
    status in ('在庫あり', '在庫少', '発注待ち', '廃番')
  )
);

comment on table public.repair_parts is '整備・修理用部品の在庫管理';
comment on column public.repair_parts.low_stock_threshold is '在庫少アラートを出す閾値。stock <= この値になると在庫少とみなす';
comment on column public.repair_parts.status is '在庫あり / 在庫少 / 発注待ち / 廃番';

create index if not exists idx_repair_parts_store_id on public.repair_parts(store_id);
create index if not exists idx_repair_parts_store_status on public.repair_parts(store_id, status);
create index if not exists idx_repair_parts_store_deleted_at on public.repair_parts(store_id, deleted_at);
create index if not exists idx_repair_parts_store_is_archived on public.repair_parts(store_id, is_archived);

drop trigger if exists set_repair_parts_updated_at on public.repair_parts;
create trigger set_repair_parts_updated_at
before update on public.repair_parts
for each row execute function public.set_updated_at();

alter table public.repair_parts enable row level security;

drop policy if exists "repair_parts_select_member_stores" on public.repair_parts;
create policy "repair_parts_select_member_stores"
on public.repair_parts for select to authenticated
using (store_id in (select public.current_user_store_ids()));

drop policy if exists "repair_parts_insert_member_stores" on public.repair_parts;
create policy "repair_parts_insert_member_stores"
on public.repair_parts for insert to authenticated
with check (store_id in (select public.current_user_store_ids()));

drop policy if exists "repair_parts_update_member_stores" on public.repair_parts;
create policy "repair_parts_update_member_stores"
on public.repair_parts for update to authenticated
using (store_id in (select public.current_user_store_ids()))
with check (store_id in (select public.current_user_store_ids()));

drop policy if exists "repair_parts_delete_member_stores" on public.repair_parts;
create policy "repair_parts_delete_member_stores"
on public.repair_parts for delete to authenticated
using (store_id in (select public.current_user_store_ids()));

grant select, insert, update, delete on public.repair_parts to authenticated;
