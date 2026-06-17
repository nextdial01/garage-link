-- GARAGE LINK company billing / plan request management
-- プラン・契約申込を保存するためのSQLです。
-- 現行スキーマにはcompaniesテーブルがないため、company_idには互換的にstores.idを保存します。
-- 将来tenant/company軸へ移行する場合も既存stores/store_membersを削除しません。

create extension if not exists "pgcrypto";

create table if not exists public.company_subscriptions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.stores(id) on delete cascade,
  plan text not null default 'free',
  status text not null default 'active',
  included_staff_count integer not null default 1,
  extra_staff_count integer not null default 0,
  included_store_count integer not null default 1,
  extra_store_count integer not null default 0,
  storage_limit_mb integer not null default 500,
  extra_storage_gb integer not null default 0,
  current_inventory_limit integer not null default 5,
  l_link_integration_enabled boolean not null default false,
  started_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint company_subscriptions_plan_check check (plan in ('free', 'starter', 'standard', 'pro')),
  constraint company_subscriptions_status_check check (status in ('active', 'trialing', 'past_due', 'cancelled', 'suspended'))
);

comment on table public.company_subscriptions is 'GARAGE LINKの契約プラン。company_idは現段階ではstores.idを保存する互換カラム';

-- 既に古い版のSQLをstaging等へ適用済みの場合に備え、新カラムを追加します。
-- 旧line_basic_enabledはすぐ削除せず、L-Link連携可否へ値だけ引き継ぎます。
alter table public.company_subscriptions
  add column if not exists l_link_integration_enabled boolean not null default false;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'company_subscriptions'
      and column_name = 'line_basic_enabled'
  ) then
    execute 'update public.company_subscriptions set l_link_integration_enabled = coalesce(l_link_integration_enabled, false) or coalesce(line_basic_enabled, false)';
  end if;
end $$;

create unique index if not exists idx_company_subscriptions_company_active
on public.company_subscriptions(company_id)
where status = 'active';
create index if not exists idx_company_subscriptions_company_id on public.company_subscriptions(company_id);
create index if not exists idx_company_subscriptions_plan on public.company_subscriptions(plan);

drop trigger if exists set_company_subscriptions_updated_at on public.company_subscriptions;
create trigger set_company_subscriptions_updated_at
before update on public.company_subscriptions
for each row execute function public.set_updated_at();

create table if not exists public.plan_change_requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.stores(id) on delete cascade,
  requested_by uuid not null references auth.users(id) on delete cascade,
  request_type text not null,
  current_plan text,
  requested_plan text,
  requested_extra_staff_count integer default 0,
  requested_extra_store_count integer default 0,
  requested_extra_storage_gb integer default 0,
  support_hours numeric default 0,
  message text,
  status text not null default 'pending',
  admin_note text,
  completed_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint plan_change_requests_type_check check (
    request_type in ('plan_change', 'add_staff', 'add_store', 'add_storage', 'support')
  ),
  constraint plan_change_requests_status_check check (
    status in ('pending', 'approved', 'rejected', 'completed')
  )
);

comment on table public.plan_change_requests is 'プラン変更・スタッフ追加・店舗追加・ストレージ追加・個別サポートの申込一覧';

create index if not exists idx_plan_change_requests_company_id on public.plan_change_requests(company_id);
create index if not exists idx_plan_change_requests_requested_by on public.plan_change_requests(requested_by);
create index if not exists idx_plan_change_requests_status on public.plan_change_requests(status);
create index if not exists idx_plan_change_requests_created_at on public.plan_change_requests(created_at);

-- completed_at は、管理者が申込を契約へ反映済みかを判定するための印です。
-- 既存環境へ再適用しても壊れないように、後方互換の追加DDLも用意します。
alter table public.plan_change_requests
  add column if not exists completed_at timestamptz;
create index if not exists idx_plan_change_requests_completed_at on public.plan_change_requests(completed_at);

drop trigger if exists set_plan_change_requests_updated_at on public.plan_change_requests;
create trigger set_plan_change_requests_updated_at
before update on public.plan_change_requests
for each row execute function public.set_updated_at();

-- 管理者が申込をcompletedにした時、契約内容へ一度だけ反映します。
-- completed_at が入っている申込は再反映せず、追加数の二重加算を防ぎます。
create or replace function public.complete_plan_change_request(p_request_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_request public.plan_change_requests%rowtype;
  v_subscription public.company_subscriptions%rowtype;
  v_plan text;
  v_now timestamptz := now();
begin
  select *
    into v_request
    from public.plan_change_requests
   where id = p_request_id
   for update;

  if not found then
    raise exception '申込情報が見つかりません。';
  end if;

  if v_request.completed_at is not null then
    return jsonb_build_object('already_completed', true, 'request_type', v_request.request_type);
  end if;

  update public.plan_change_requests
     set status = 'completed',
         completed_at = v_now
   where id = p_request_id
     and completed_at is null
   returning * into v_request;

  if v_request.request_type = 'support' then
    return jsonb_build_object('completed', true, 'request_type', v_request.request_type, 'subscription_updated', false);
  end if;

  select *
    into v_subscription
    from public.company_subscriptions
   where company_id = v_request.company_id
     and status = 'active'
   for update;

  if not found then
    insert into public.company_subscriptions (
      company_id,
      plan,
      status,
      included_staff_count,
      extra_staff_count,
      included_store_count,
      extra_store_count,
      storage_limit_mb,
      extra_storage_gb,
      current_inventory_limit,
      l_link_integration_enabled
    )
    values (
      v_request.company_id,
      'free',
      'active',
      1,
      0,
      1,
      0,
      500,
      0,
      5,
      false
    )
    returning * into v_subscription;
  end if;

  if v_request.request_type = 'plan_change' then
    v_plan := lower(coalesce(v_request.requested_plan, 'free'));

    if v_plan not in ('free', 'starter', 'standard', 'pro') then
      raise exception '希望プランが不正です。';
    end if;

    update public.company_subscriptions
       set plan = v_plan,
           status = 'active',
           included_staff_count = case v_plan
             when 'standard' then 3
             when 'pro' then 10
             else 1
           end,
           included_store_count = case v_plan
             when 'pro' then 3
             else 1
           end,
           storage_limit_mb = case v_plan
             when 'starter' then 2048
             when 'standard' then 10240
             when 'pro' then 51200
             else 500
           end,
           current_inventory_limit = case v_plan
             when 'starter' then 50
             when 'standard' then 200
             when 'pro' then 500
             else 5
           end,
           l_link_integration_enabled = v_plan in ('standard', 'pro')
     where id = v_subscription.id;
  elsif v_request.request_type = 'add_staff' then
    update public.company_subscriptions
       set extra_staff_count = coalesce(extra_staff_count, 0) + greatest(coalesce(v_request.requested_extra_staff_count, 0), 0)
     where id = v_subscription.id;
  elsif v_request.request_type = 'add_store' then
    update public.company_subscriptions
       set extra_store_count = coalesce(extra_store_count, 0) + greatest(coalesce(v_request.requested_extra_store_count, 0), 0)
     where id = v_subscription.id;
  elsif v_request.request_type = 'add_storage' then
    update public.company_subscriptions
       set extra_storage_gb = coalesce(extra_storage_gb, 0) + greatest(coalesce(v_request.requested_extra_storage_gb, 0), 0)
     where id = v_subscription.id;
  end if;

  return jsonb_build_object('completed', true, 'request_type', v_request.request_type, 'subscription_updated', true);
end;
$$;

grant execute on function public.complete_plan_change_request(uuid) to authenticated;

alter table public.company_subscriptions enable row level security;
alter table public.plan_change_requests enable row level security;

drop policy if exists "company_subscriptions_select_member_store" on public.company_subscriptions;
create policy "company_subscriptions_select_member_store"
on public.company_subscriptions
for select
to authenticated
using (company_id in (select public.current_user_store_ids()));

drop policy if exists "company_subscriptions_insert_owner_admin" on public.company_subscriptions;
create policy "company_subscriptions_insert_owner_admin"
on public.company_subscriptions
for insert
to authenticated
with check (
  company_id in (
    select store_id
    from public.store_members
    where user_id = auth.uid()
      and role in ('owner', 'admin')
  )
);

drop policy if exists "company_subscriptions_update_owner_admin" on public.company_subscriptions;
create policy "company_subscriptions_update_owner_admin"
on public.company_subscriptions
for update
to authenticated
using (
  company_id in (
    select store_id
    from public.store_members
    where user_id = auth.uid()
      and role in ('owner', 'admin')
  )
)
with check (
  company_id in (
    select store_id
    from public.store_members
    where user_id = auth.uid()
      and role in ('owner', 'admin')
  )
);

drop policy if exists "plan_change_requests_select_member_store" on public.plan_change_requests;
create policy "plan_change_requests_select_member_store"
on public.plan_change_requests
for select
to authenticated
using (company_id in (select public.current_user_store_ids()));

drop policy if exists "plan_change_requests_insert_owner_admin" on public.plan_change_requests;
create policy "plan_change_requests_insert_owner_admin"
on public.plan_change_requests
for insert
to authenticated
with check (
  requested_by = auth.uid()
  and company_id in (
    select store_id
    from public.store_members
    where user_id = auth.uid()
      and role in ('owner', 'admin')
  )
);

drop policy if exists "plan_change_requests_update_owner_admin" on public.plan_change_requests;
create policy "plan_change_requests_update_owner_admin"
on public.plan_change_requests
for update
to authenticated
using (
  company_id in (
    select store_id
    from public.store_members
    where user_id = auth.uid()
      and role in ('owner', 'admin')
  )
)
with check (
  company_id in (
    select store_id
    from public.store_members
    where user_id = auth.uid()
      and role in ('owner', 'admin')
  )
);

grant select, insert, update on public.company_subscriptions to authenticated;
grant select, insert, update on public.plan_change_requests to authenticated;

-- 既存店舗へFree契約を初期付与します。既にactive契約がある店舗は変更しません。
insert into public.company_subscriptions (
  company_id,
  plan,
  status,
  included_staff_count,
  included_store_count,
  storage_limit_mb,
  current_inventory_limit,
  l_link_integration_enabled
)
select
  s.id,
  'free',
  'active',
  1,
  1,
  500,
  5,
  false
from public.stores s
where not exists (
  select 1
  from public.company_subscriptions cs
  where cs.company_id = s.id
    and cs.status = 'active'
);
