-- 044 車両の相場メモ・媒体掲載状態
--
-- 外部媒体の契約/APIに依存せず、まずは確認済みの相場情報と
-- 媒体ごとの掲載状態を安全に記録する。相場は出所・確認日・条件を必須にし、
-- 出所のない価格をアプリが相場として表示しない。

alter table public.vehicles
  add column if not exists market_source text,
  add column if not exists market_checked_at date,
  add column if not exists market_conditions text,
  add column if not exists market_note text;

comment on column public.vehicles.market_source is '参考相場の出所（Goo小売、AA、自店実績など）';
comment on column public.vehicles.market_checked_at is '参考相場を確認した日';
comment on column public.vehicles.market_conditions is '相場検索条件（年式、走行距離、地域など）';
comment on column public.vehicles.market_note is '相場判断に関する社内メモ';

create table if not exists public.vehicle_listing_statuses (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  channel text not null,
  status text not null default '未掲載',
  listing_url text,
  last_checked_at timestamptz,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (vehicle_id, channel),
  constraint vehicle_listing_statuses_channel_check check (channel in ('Goo', 'カーセンサー', '自社サイト', 'Google')),
  constraint vehicle_listing_statuses_status_check check (status in ('未掲載', '掲載中', 'エラー', '停止'))
);

create index if not exists idx_vehicle_listing_statuses_store_vehicle
  on public.vehicle_listing_statuses(store_id, vehicle_id);

drop trigger if exists set_vehicle_listing_statuses_updated_at on public.vehicle_listing_statuses;
create trigger set_vehicle_listing_statuses_updated_at
  before update on public.vehicle_listing_statuses
  for each row execute function public.set_updated_at();

alter table public.vehicle_listing_statuses enable row level security;

drop policy if exists "vehicle_listing_statuses_select_own_store" on public.vehicle_listing_statuses;
create policy "vehicle_listing_statuses_select_own_store"
  on public.vehicle_listing_statuses for select
  using (store_id in (select public.current_user_store_ids()));

drop policy if exists "vehicle_listing_statuses_insert_own_store" on public.vehicle_listing_statuses;
create policy "vehicle_listing_statuses_insert_own_store"
  on public.vehicle_listing_statuses for insert
  with check (store_id in (select public.current_user_store_ids()));

drop policy if exists "vehicle_listing_statuses_update_own_store" on public.vehicle_listing_statuses;
create policy "vehicle_listing_statuses_update_own_store"
  on public.vehicle_listing_statuses for update
  using (store_id in (select public.current_user_store_ids()))
  with check (store_id in (select public.current_user_store_ids()));

drop policy if exists "vehicle_listing_statuses_delete_own_store" on public.vehicle_listing_statuses;
create policy "vehicle_listing_statuses_delete_own_store"
  on public.vehicle_listing_statuses for delete
  using (store_id in (select public.current_user_store_ids()));

grant select, insert, update, delete on public.vehicle_listing_statuses to authenticated;

-- ロールバック:
-- drop table if exists public.vehicle_listing_statuses;
-- alter table public.vehicles drop column if exists market_source, drop column if exists market_checked_at,
--   drop column if exists market_conditions, drop column if exists market_note;
