-- GARAGE LINK 車検案内（顧客フォロー）基盤
-- 車検満了日をもとに案内対象を判定し、将来の外部連携（L-LINK等）に渡すためのイベントを記録します。
-- 既存の vehicles / customers / maintenance_jobs / deals は変更しません（参照のみ）。
-- 破壊的変更なし。rollback手順はファイル末尾のコメントを参照。

create extension if not exists "pgcrypto";

-- ================================================================
-- 1. 車検案内設定（店舗単位）
-- ================================================================
create table if not exists public.inspection_reminder_settings (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  -- 将来の会社/テナント軸スナップショット（022で付与した stores.tenant_id）。
  company_id uuid references public.tenants(id) on delete set null,
  enabled boolean not null default false,
  -- 対象除外ルール
  exclude_sold boolean not null default true,                 -- 売約済み車両を除外
  exclude_scrapped boolean not null default true,             -- 廃車車両を除外
  exclude_reserved_or_in_service boolean not null default true, -- 車検予約済み・入庫済みを除外
  require_customer_link boolean not null default true,        -- 顧客に紐づく車両のみ対象
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id)
);

comment on table public.inspection_reminder_settings is '店舗単位の車検案内設定。複数店舗化しても store_id 単位で拡張可能';

-- ================================================================
-- 2. 案内タイミング（車検満了の何日前か。店舗単位で複数）
-- ================================================================
create table if not exists public.inspection_reminder_timings (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  offset_days integer not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint inspection_reminder_timings_offset_range check (offset_days between 1 and 365),
  unique (store_id, offset_days)
);

comment on table public.inspection_reminder_timings is '車検満了の何日前に案内対象とするか。1〜365日、店舗内で重複不可';

-- ================================================================
-- 3. 案内イベント（外部連携待ちのスナップショット）
-- ================================================================
create table if not exists public.inspection_reminder_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.tenants(id) on delete set null,
  store_id uuid not null references public.stores(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  vehicle_id uuid references public.vehicles(id) on delete set null,
  inspection_expiry_date date not null,
  reminder_offset_days integer not null,
  event_type text not null default 'inspection_reminder',
  status text not null default 'pending',
  -- 冪等性キー: store_id:vehicle_id:満了日:タイミング日数（同一条件の重複生成を防ぐ）
  idempotency_key text not null,
  -- 外部連携用スナップショット（個人情報は最小限。redact方針に従い一覧では氏名等を過剰表示しない）
  customer_name text,
  vehicle_name text,
  maker text,
  model_name text,
  registration_no text,
  assigned_user_name text,
  -- 将来の外部連携先ID・エラー内容（nullable）
  external_reference_id text,
  error_detail text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint inspection_reminder_events_type_check check (event_type in ('inspection_reminder')),
  constraint inspection_reminder_events_status_check check (status in ('pending', 'processing', 'completed', 'skipped', 'failed')),
  unique (idempotency_key)
);

comment on table public.inspection_reminder_events is '車検案内の対象イベント。将来L-LINK等へ連携する。生成直後は pending';
comment on column public.inspection_reminder_events.idempotency_key is 'store_id:vehicle_id:inspection_expiry_date:offset_days。同一条件の二重生成防止';
comment on column public.inspection_reminder_events.external_reference_id is '将来の外部連携先ID（L-LINK配信下書きID等）。今回はnull';

create index if not exists idx_insp_settings_store on public.inspection_reminder_settings(store_id);
create index if not exists idx_insp_timings_store on public.inspection_reminder_timings(store_id, offset_days);
create index if not exists idx_insp_events_store_created on public.inspection_reminder_events(store_id, created_at desc);
create index if not exists idx_insp_events_status on public.inspection_reminder_events(store_id, status);
create index if not exists idx_insp_events_customer on public.inspection_reminder_events(store_id, customer_id);
create index if not exists idx_insp_events_vehicle on public.inspection_reminder_events(store_id, vehicle_id);

drop trigger if exists set_insp_settings_updated_at on public.inspection_reminder_settings;
create trigger set_insp_settings_updated_at before update on public.inspection_reminder_settings
for each row execute function public.set_updated_at();

drop trigger if exists set_insp_timings_updated_at on public.inspection_reminder_timings;
create trigger set_insp_timings_updated_at before update on public.inspection_reminder_timings
for each row execute function public.set_updated_at();

drop trigger if exists set_insp_events_updated_at on public.inspection_reminder_events;
create trigger set_insp_events_updated_at before update on public.inspection_reminder_events
for each row execute function public.set_updated_at();

-- ================================================================
-- 4. RLS（既存の current_user_store_ids / store_members を踏襲）
-- ================================================================
alter table public.inspection_reminder_settings enable row level security;
alter table public.inspection_reminder_timings enable row level security;
alter table public.inspection_reminder_events enable row level security;

-- 所属店舗のみ参照可。変更は owner/admin のみ。
drop policy if exists "insp_settings_select_member" on public.inspection_reminder_settings;
create policy "insp_settings_select_member" on public.inspection_reminder_settings
for select to authenticated
using (store_id in (select public.current_user_store_ids()));

drop policy if exists "insp_settings_write_admin" on public.inspection_reminder_settings;
create policy "insp_settings_write_admin" on public.inspection_reminder_settings
for all to authenticated
using (store_id in (select store_id from public.store_members where user_id = auth.uid() and role in ('owner', 'admin')))
with check (store_id in (select store_id from public.store_members where user_id = auth.uid() and role in ('owner', 'admin')));

drop policy if exists "insp_timings_select_member" on public.inspection_reminder_timings;
create policy "insp_timings_select_member" on public.inspection_reminder_timings
for select to authenticated
using (store_id in (select public.current_user_store_ids()));

drop policy if exists "insp_timings_write_admin" on public.inspection_reminder_timings;
create policy "insp_timings_write_admin" on public.inspection_reminder_timings
for all to authenticated
using (store_id in (select store_id from public.store_members where user_id = auth.uid() and role in ('owner', 'admin')))
with check (store_id in (select store_id from public.store_members where user_id = auth.uid() and role in ('owner', 'admin')));

-- イベント: 所属店舗のみ参照可。手動スキップ等の更新は owner/admin のみ。
-- 生成（INSERT）は SECURITY DEFINER 関数 / service role 経由のみ（authenticatedに直接INSERT権限を与えない）。
drop policy if exists "insp_events_select_member" on public.inspection_reminder_events;
create policy "insp_events_select_member" on public.inspection_reminder_events
for select to authenticated
using (store_id in (select public.current_user_store_ids()));

drop policy if exists "insp_events_update_admin" on public.inspection_reminder_events;
create policy "insp_events_update_admin" on public.inspection_reminder_events
for update to authenticated
using (store_id in (select store_id from public.store_members where user_id = auth.uid() and role in ('owner', 'admin')))
with check (store_id in (select store_id from public.store_members where user_id = auth.uid() and role in ('owner', 'admin')));

grant select, insert, update, delete on public.inspection_reminder_settings to authenticated;
grant select, insert, update, delete on public.inspection_reminder_timings to authenticated;
grant select, update on public.inspection_reminder_events to authenticated;

-- ================================================================
-- 5. イベント生成関数（冪等・テナント分離・Asia/Tokyo基準）
-- ================================================================
-- p_store_id=null: 全店舗（cron用）。指定時: その店舗のみ（手動実行用）。
-- SECURITY DEFINER でRLSをバイパスしてINSERTするが、p_store_id でスコープを限定する。
create or replace function public.generate_inspection_reminder_events(
  p_store_id uuid default null,
  p_today date default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date := coalesce(p_today, (now() at time zone 'Asia/Tokyo')::date);
  v_count integer;
begin
  with eligible as (
    select
      st.tenant_id as company_id,
      v.store_id,
      cust.customer_id,
      v.id as vehicle_id,
      v.inspection_expiry_date,
      t.offset_days,
      cust.customer_name,
      nullif(trim(both ' ' from
        coalesce(v.maker, '') || ' ' || coalesce(v.model_name, '') ||
        case when v.management_no is not null then ' (' || v.management_no || ')' else '' end
      ), '') as vehicle_name,
      v.maker,
      v.model_name,
      v.registration_no,
      cust.assigned_user_name
    from public.inspection_reminder_settings cfg
    join public.stores st on st.id = cfg.store_id
    join public.inspection_reminder_timings t on t.store_id = cfg.store_id and t.enabled
    join public.vehicles v on v.store_id = cfg.store_id
    -- 顧客紐付け: deals / maintenance_jobs のうち最新の顧客を採用
    join lateral (
      select customer_id, customer_name, assigned_user_name
      from (
        select d.customer_id, c.name as customer_name, d.assigned_user_name, d.created_at
        from public.deals d
        join public.customers c on c.id = d.customer_id
        where d.vehicle_id = v.id and d.store_id = v.store_id
          and d.customer_id is not null and d.deleted_at is null and c.deleted_at is null
        union all
        select mj.customer_id, c.name, mj.assigned_user_name, mj.created_at
        from public.maintenance_jobs mj
        join public.customers c on c.id = mj.customer_id
        where mj.vehicle_id = v.id and mj.store_id = v.store_id
          and mj.customer_id is not null and c.deleted_at is null
      ) src
      order by created_at desc nulls last
      limit 1
    ) cust on true
    where cfg.enabled
      and (p_store_id is null or cfg.store_id = p_store_id)
      and v.inspection_expiry_date is not null
      and v.deleted_at is null
      and coalesce(v.is_archived, false) = false
      and (not cfg.exclude_sold or coalesce(v.status, '') not in ('売約済み', 'sold'))
      and (not cfg.exclude_scrapped or coalesce(v.status, '') not in ('廃車', 'scrapped'))
      and (v.inspection_expiry_date - v_today) = t.offset_days
      and (
        not cfg.exclude_reserved_or_in_service
        or not exists (
          select 1
          from public.maintenance_jobs mj2
          where mj2.vehicle_id = v.id and mj2.store_id = v.store_id
            and coalesce(mj2.status, '') not in ('completed', 'delivered', 'cancelled')
            and (mj2.job_type = '車検' or mj2.scheduled_in_at is not null or mj2.actual_in_date is not null)
        )
      )
  )
  insert into public.inspection_reminder_events (
    company_id, store_id, customer_id, vehicle_id, inspection_expiry_date,
    reminder_offset_days, event_type, status, idempotency_key,
    customer_name, vehicle_name, maker, model_name, registration_no, assigned_user_name
  )
  select
    company_id, store_id, customer_id, vehicle_id, inspection_expiry_date,
    offset_days, 'inspection_reminder', 'pending',
    store_id::text || ':' || vehicle_id::text || ':' || inspection_expiry_date::text || ':' || offset_days::text,
    customer_name, vehicle_name, maker, model_name, registration_no, assigned_user_name
  from eligible
  where customer_id is not null  -- 顧客に紐づく車両のみ
  on conflict (idempotency_key) do nothing;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

grant execute on function public.generate_inspection_reminder_events(uuid, date) to authenticated;

-- ================================================================
-- 6. 既存店舗へ初期設定（OFF）と初期タイミング（90/60/30）を補完
-- ================================================================
insert into public.inspection_reminder_settings (store_id, company_id, enabled)
select s.id, s.tenant_id, false
from public.stores s
where not exists (
  select 1 from public.inspection_reminder_settings cfg where cfg.store_id = s.id
);

insert into public.inspection_reminder_timings (store_id, offset_days, enabled)
select s.id, d.offset_days, true
from public.stores s
cross join (values (90), (60), (30)) as d(offset_days)
where not exists (
  select 1 from public.inspection_reminder_timings t
  where t.store_id = s.id and t.offset_days = d.offset_days
);

-- 確認用:
-- select * from public.inspection_reminder_settings;
-- select store_id, offset_days, enabled from public.inspection_reminder_timings order by store_id, offset_days;
-- select public.generate_inspection_reminder_events(); -- 全店舗を当日基準で生成
-- select * from public.inspection_reminder_events order by created_at desc;

-- ================================================================
-- rollback（必要時に手動実行）:
-- drop function if exists public.generate_inspection_reminder_events(uuid, date);
-- drop table if exists public.inspection_reminder_events;
-- drop table if exists public.inspection_reminder_timings;
-- drop table if exists public.inspection_reminder_settings;
-- ※ 既存テーブル（vehicles/customers/maintenance_jobs/deals/stores）には影響しません。
