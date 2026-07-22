-- GARAGE LINK 契約単位の上限・課金権限をテナント単位へ統一する。
-- 料金表の上限は同一契約配下の全店舗合算で判定する。

alter table public.company_subscriptions
  add column if not exists tenant_id uuid references public.tenants(id) on delete cascade,
  add column if not exists pending_plan text,
  add column if not exists pending_plan_effective_at timestamptz;

alter table public.plan_change_requests
  add column if not exists tenant_id uuid references public.tenants(id) on delete cascade;

update public.company_subscriptions cs
set tenant_id = s.tenant_id
from public.stores s
where s.id = cs.company_id and cs.tenant_id is null;

update public.plan_change_requests pcr
set tenant_id = s.tenant_id
from public.stores s
where s.id = pcr.company_id and pcr.tenant_id is null;

-- 過去に店舗単位で複数のactive契約ができていた場合は、更新日の新しい1件を契約として残す。
with ranked as (
  select id,
         row_number() over (partition by tenant_id order by updated_at desc nulls last, started_at desc nulls last, id) as position
  from public.company_subscriptions
  where tenant_id is not null and status = 'active'
)
update public.company_subscriptions cs
set status = 'suspended'
from ranked
where ranked.id = cs.id and ranked.position > 1;

create unique index if not exists idx_company_subscriptions_tenant_active
  on public.company_subscriptions(tenant_id)
  where status = 'active' and tenant_id is not null;
create index if not exists idx_company_subscriptions_tenant_id on public.company_subscriptions(tenant_id);
create index if not exists idx_plan_change_requests_tenant_id on public.plan_change_requests(tenant_id);

alter table public.company_subscriptions drop constraint if exists company_subscriptions_pending_plan_check;
alter table public.company_subscriptions
  add constraint company_subscriptions_pending_plan_check
  check (pending_plan is null or pending_plan in ('starter', 'standard', 'pro'));

create or replace function public.get_company_subscription(p_company_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid;
  v_subscription public.company_subscriptions%rowtype;
begin
  select s.tenant_id into v_tenant_id from public.stores s where s.id = p_company_id;
  if auth.uid() is null or v_tenant_id is null or v_tenant_id not in (select public.current_user_tenant_ids()) then
    raise exception '所属会社が見つかりません。';
  end if;

  select * into v_subscription
  from public.company_subscriptions cs
  where cs.tenant_id = v_tenant_id and cs.status = 'active'
  order by cs.updated_at desc nulls last limit 1;

  if not found then return null; end if;
  return to_jsonb(v_subscription);
end;
$$;

create or replace function public.ensure_company_subscription(p_company_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid;
  v_subscription public.company_subscriptions%rowtype;
begin
  select s.tenant_id into v_tenant_id from public.stores s where s.id = p_company_id;
  if auth.uid() is null or v_tenant_id is null or v_tenant_id not in (select public.current_user_tenant_ids()) then
    raise exception '所属会社が見つかりません。';
  end if;

  select * into v_subscription
  from public.company_subscriptions cs
  where cs.tenant_id = v_tenant_id and cs.status = 'active'
  order by cs.updated_at desc nulls last limit 1;
  if found then return to_jsonb(v_subscription); end if;

  insert into public.company_subscriptions (
    company_id, tenant_id, plan, status, included_staff_count, extra_staff_count,
    included_store_count, extra_store_count, storage_limit_mb, extra_storage_gb,
    current_inventory_limit, l_link_integration_enabled
  ) values (
    p_company_id, v_tenant_id, 'free', 'active', 1, 0, 1, 0, 500, 0, 5, false
  ) returning * into v_subscription;
  return to_jsonb(v_subscription);
end;
$$;

-- owner/adminは同一tenantの全店舗を操作可能。staff/viewerは割当店舗のみ。
create or replace function public.current_user_store_ids()
returns setof uuid
language sql
security definer
set search_path = public
stable
as $$
  select s.id
  from public.stores s
  join public.memberships m on m.tenant_id = s.tenant_id
  where m.user_id = auth.uid() and m.status = 'active' and m.role in ('owner', 'admin')
  union
  select sm.store_id
  from public.store_members sm
  where sm.user_id = auth.uid() and coalesce(sm.status, 'active') = 'active';
$$;

create or replace function public.get_garage_plan_usage(p_store_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_tenant_id uuid;
  v_store_ids uuid[];
  v_inventory bigint;
  v_documents bigint;
  v_staff bigint;
  v_stores bigint;
  v_storage_bytes bigint;
begin
  select tenant_id into v_tenant_id from public.stores where id = p_store_id;
  if auth.uid() is null or v_tenant_id is null or v_tenant_id not in (select public.current_user_tenant_ids()) then
    raise exception '所属会社が見つかりません。';
  end if;

  select coalesce(array_agg(id), array[]::uuid[]), count(*)
    into v_store_ids, v_stores
  from public.stores where tenant_id = v_tenant_id;

  select count(*) into v_inventory
  from public.vehicles v
  where v.store_id = any(v_store_ids)
    and v.deleted_at is null
    and coalesce(v.is_archived, false) = false
    and lower(coalesce(v.status, '')) not in ('売却済み', '納車済み', 'sold', 'delivered', 'archived', 'deleted');

  select
    (select count(*) from public.quotes q where q.store_id = any(v_store_ids) and q.created_at >= date_trunc('month', now())) +
    (select count(*) from public.invoices i where i.store_id = any(v_store_ids) and i.created_at >= date_trunc('month', now()))
  into v_documents;

  select count(*) into v_staff
  from public.store_members sm
  join public.stores s on s.id = sm.store_id
  where s.tenant_id = v_tenant_id and coalesce(sm.status, 'active') <> 'suspended';

  select coalesce(sum(size_bytes), 0) into v_storage_bytes
  from public.uploaded_files where tenant_id = v_tenant_id;

  return jsonb_build_object(
    'tenant_id', v_tenant_id,
    'inventory_count', v_inventory,
    'document_count', v_documents,
    'staff_count', v_staff,
    'store_count', v_stores,
    'storage_bytes', v_storage_bytes
  );
end;
$$;

create or replace function public.list_accessible_garage_stores()
returns table (id uuid, name text, company_name text, tenant_id uuid, is_current boolean)
language sql
security definer
set search_path = public
stable
as $$
  with current_store as (
    select sm.store_id
    from public.store_members sm
    where sm.user_id = auth.uid()
    order by sm.updated_at desc nulls last, sm.created_at asc
    limit 1
  )
  select s.id, s.name, s.company_name, s.tenant_id, s.id = cs.store_id
  from public.stores s
  left join current_store cs on true
  where s.id in (select public.current_user_store_ids())
  order by (s.id = cs.store_id) desc, s.name asc;
$$;

create or replace function public.switch_active_garage_store(p_store_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid;
  v_member_id uuid;
begin
  select tenant_id into v_tenant_id from public.stores where id = p_store_id;
  if auth.uid() is null or v_tenant_id is null or p_store_id not in (select public.current_user_store_ids()) then
    raise exception '切替できる店舗ではありません。';
  end if;

  select sm.id into v_member_id
  from public.store_members sm
  join public.stores s on s.id = sm.store_id
  where sm.user_id = auth.uid() and s.tenant_id = v_tenant_id
  order by sm.updated_at desc nulls last, sm.created_at asc
  limit 1;

  if v_member_id is null then raise exception '所属情報が見つかりません。'; end if;
  update public.store_members set store_id = p_store_id where id = v_member_id;
  update public.memberships
    set store_id = p_store_id
    where tenant_id = v_tenant_id and user_id = auth.uid();
  return jsonb_build_object('ok', true, 'store_id', p_store_id);
end;
$$;

create or replace function public.create_garage_store(p_name text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_membership public.memberships%rowtype;
  v_store public.stores%rowtype;
begin
  select * into v_membership
  from public.memberships
  where user_id = auth.uid() and status = 'active' and role in ('owner', 'admin')
  order by created_at asc limit 1;
  if not found then raise exception '店舗を追加する権限がありません。'; end if;
  if nullif(trim(p_name), '') is null then raise exception '店舗名を入力してください。'; end if;

  insert into public.stores (name, company_name, tenant_id, status, created_by, updated_by)
  select trim(p_name), t.name, v_membership.tenant_id, 'active', auth.uid(), auth.uid()
  from public.tenants t where t.id = v_membership.tenant_id
  returning * into v_store;

  return jsonb_build_object('id', v_store.id, 'name', v_store.name, 'tenant_id', v_store.tenant_id);
end;
$$;

create or replace function public.garage_plan_limit_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_store_id uuid;
  v_tenant_id uuid;
  v_subscription public.company_subscriptions%rowtype;
  v_store_ids uuid[];
  v_count bigint;
  v_limit bigint;
  v_used_bytes bigint;
begin
  if tg_table_name = 'stores' then
    v_store_id := new.id;
    v_tenant_id := new.tenant_id;
  else
    v_store_id := new.store_id;
    v_tenant_id := null;
  end if;
  if v_tenant_id is null then
    select tenant_id into v_tenant_id from public.stores where id = v_store_id;
  end if;
  if v_tenant_id is null then return new; end if;

  select coalesce(array_agg(id), array[]::uuid[]) into v_store_ids
  from public.stores where tenant_id = v_tenant_id;

  select * into v_subscription
  from public.company_subscriptions
  where tenant_id = v_tenant_id and status = 'active'
  order by updated_at desc nulls last limit 1;
  if not found then
    v_subscription.plan := 'free';
    v_subscription.included_staff_count := 1;
    v_subscription.extra_staff_count := 0;
    v_subscription.included_store_count := 1;
    v_subscription.extra_store_count := 0;
    v_subscription.storage_limit_mb := 500;
    v_subscription.extra_storage_gb := 0;
    v_subscription.current_inventory_limit := 5;
  end if;

  if tg_table_name = 'vehicles' then
    if new.deleted_at is null and coalesce(new.is_archived, false) = false
       and lower(coalesce(new.status, '')) not in ('売却済み', '納車済み', 'sold', 'delivered', 'archived', 'deleted') then
      select count(*) into v_count from public.vehicles v
      where v.store_id = any(v_store_ids)
        and v.id is distinct from new.id
        and v.deleted_at is null
        and coalesce(v.is_archived, false) = false
        and lower(coalesce(v.status, '')) not in ('売却済み', '納車済み', 'sold', 'delivered', 'archived', 'deleted');
      if v_count >= v_subscription.current_inventory_limit then
        raise exception '契約全店舗の在庫登録上限（%台）に達しています。', v_subscription.current_inventory_limit using errcode = 'P0001';
      end if;
    end if;
  elsif tg_table_name in ('quotes', 'invoices') and v_subscription.plan in ('free', 'starter') then
    v_limit := case v_subscription.plan when 'starter' then 20 else 5 end;
    select
      (select count(*) from public.quotes q where q.store_id = any(v_store_ids) and q.created_at >= date_trunc('month', now())) +
      (select count(*) from public.invoices i where i.store_id = any(v_store_ids) and i.created_at >= date_trunc('month', now()))
    into v_count;
    if v_count >= v_limit then
      raise exception '契約全店舗の今月の見積・請求作成上限（%件）に達しています。', v_limit using errcode = 'P0001';
    end if;
  elsif tg_table_name = 'uploaded_files' then
    v_limit := (v_subscription.storage_limit_mb + v_subscription.extra_storage_gb * 1024)::bigint * 1024 * 1024;
    select coalesce(sum(size_bytes), 0) into v_used_bytes from public.uploaded_files where tenant_id = v_tenant_id;
    if v_used_bytes + new.size_bytes > v_limit then
      raise exception '契約全店舗のストレージ上限に達しています。' using errcode = 'P0001';
    end if;
  elsif tg_table_name = 'store_members' and coalesce(new.status, 'active') <> 'suspended' then
    v_limit := v_subscription.included_staff_count + v_subscription.extra_staff_count;
    select count(*) into v_count
    from public.store_members sm
    join public.stores s on s.id = sm.store_id
    where s.tenant_id = v_tenant_id
      and sm.id is distinct from new.id
      and coalesce(sm.status, 'active') <> 'suspended';
    if v_count >= v_limit then
      raise exception '契約全店舗のスタッフ上限（%名）に達しています。', v_limit using errcode = 'P0001';
    end if;
  elsif tg_table_name = 'stores' then
    v_limit := v_subscription.included_store_count + v_subscription.extra_store_count;
    select count(*) into v_count from public.stores s
    where s.tenant_id = v_tenant_id and s.id is distinct from new.id;
    if v_count >= v_limit then
      raise exception '契約の店舗上限（%店舗）に達しています。', v_limit using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists guard_vehicle_plan_limit on public.vehicles;
create trigger guard_vehicle_plan_limit before insert or update of status, deleted_at, is_archived on public.vehicles
for each row execute function public.garage_plan_limit_guard();
drop trigger if exists guard_quote_plan_limit on public.quotes;
create trigger guard_quote_plan_limit before insert on public.quotes
for each row execute function public.garage_plan_limit_guard();
drop trigger if exists guard_invoice_plan_limit on public.invoices;
create trigger guard_invoice_plan_limit before insert on public.invoices
for each row execute function public.garage_plan_limit_guard();
drop trigger if exists guard_storage_plan_limit on public.uploaded_files;
create trigger guard_storage_plan_limit before insert on public.uploaded_files
for each row execute function public.garage_plan_limit_guard();
drop trigger if exists guard_staff_plan_limit on public.store_members;
create trigger guard_staff_plan_limit before insert or update of status on public.store_members
for each row execute function public.garage_plan_limit_guard();
drop trigger if exists guard_store_plan_limit on public.stores;
create trigger guard_store_plan_limit before insert on public.stores
for each row execute function public.garage_plan_limit_guard();

-- 契約者は申込を作成・参照のみ。契約反映と申込の承認・完了はservice_role限定。
revoke insert, update on public.company_subscriptions from authenticated;
revoke update on public.plan_change_requests from authenticated;
revoke execute on function public.complete_plan_change_request(uuid) from authenticated;
grant execute on function public.complete_plan_change_request(uuid) to service_role;
grant select on public.company_subscriptions to authenticated;
grant select, insert on public.plan_change_requests to authenticated;
grant execute on function public.get_company_subscription(uuid) to authenticated;
grant execute on function public.ensure_company_subscription(uuid) to authenticated;
grant execute on function public.current_user_store_ids() to authenticated;
grant execute on function public.get_garage_plan_usage(uuid) to authenticated;
grant execute on function public.list_accessible_garage_stores() to authenticated;
grant execute on function public.switch_active_garage_store(uuid) to authenticated;
grant execute on function public.create_garage_store(text) to authenticated;

drop policy if exists "company_subscriptions_insert_owner_admin" on public.company_subscriptions;
drop policy if exists "company_subscriptions_update_owner_admin" on public.company_subscriptions;
drop policy if exists "plan_change_requests_update_owner_admin" on public.plan_change_requests;

drop policy if exists "company_subscriptions_select_member_store" on public.company_subscriptions;
drop policy if exists "company_subscriptions_select_tenant_member" on public.company_subscriptions;
create policy "company_subscriptions_select_tenant_member"
on public.company_subscriptions for select to authenticated
using (tenant_id in (select public.current_user_tenant_ids()));

drop policy if exists "plan_change_requests_select_member_store" on public.plan_change_requests;
drop policy if exists "plan_change_requests_select_tenant_member" on public.plan_change_requests;
create policy "plan_change_requests_select_tenant_member"
on public.plan_change_requests for select to authenticated
using (tenant_id in (select public.current_user_tenant_ids()));

drop policy if exists "plan_change_requests_insert_owner_admin" on public.plan_change_requests;
drop policy if exists "plan_change_requests_insert_tenant_owner_admin" on public.plan_change_requests;
create policy "plan_change_requests_insert_tenant_owner_admin"
on public.plan_change_requests for insert to authenticated
with check (
  requested_by = auth.uid()
  and tenant_id in (
    select m.tenant_id from public.memberships m
    where m.user_id = auth.uid() and m.status = 'active' and m.role in ('owner', 'admin')
  )
);
