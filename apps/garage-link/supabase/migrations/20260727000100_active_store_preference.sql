-- GARAGE LINK G1-D: active store preference.
-- memberships remains the tenant/role source of truth. Assignments never grant
-- access without a current active membership, and preferences are not authority.
begin;

create unique index if not exists g1d_memberships_id_tenant_uidx
  on public.memberships(id, tenant_id);

create table if not exists public.membership_store_assignments (
  id uuid primary key default extensions.gen_random_uuid(),
  membership_id uuid not null,
  tenant_id uuid not null,
  store_id uuid not null,
  created_by uuid references auth.users(id) on delete set null,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (membership_id, store_id),
  constraint membership_store_assignments_membership_tenant_fk
    foreign key (membership_id, tenant_id)
    references public.memberships(id, tenant_id) on delete cascade,
  constraint membership_store_assignments_store_tenant_fk
    foreign key (store_id, tenant_id)
    references public.stores(id, tenant_id) on delete cascade
);

create index if not exists membership_store_assignments_tenant_store_idx
  on public.membership_store_assignments(tenant_id, store_id, membership_id)
  where deleted_at is null;
create index if not exists membership_store_assignments_membership_idx
  on public.membership_store_assignments(membership_id, store_id)
  where deleted_at is null;

-- The legacy membership.store_id is deterministic and can seed one assignment.
-- No user is assigned to an additional store by inference.
insert into public.membership_store_assignments(
  membership_id, tenant_id, store_id, created_by
)
select m.id, m.tenant_id, m.store_id, m.created_by
from public.memberships m
join public.stores s on s.id=m.store_id and s.tenant_id=m.tenant_id
where m.store_id is not null
on conflict (membership_id, store_id) do nothing;

create table if not exists public.user_active_store_preferences (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  active_store_id uuid not null,
  version bigint not null default 1 check (version > 0),
  correlation_id text not null check (char_length(correlation_id) between 1 and 128),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, tenant_id),
  constraint user_active_store_preferences_store_tenant_fk
    foreign key (active_store_id, tenant_id)
    references public.stores(id, tenant_id) on delete cascade
);

create index if not exists user_active_store_preferences_lookup_idx
  on public.user_active_store_preferences(user_id, tenant_id, active_store_id);
create index if not exists user_active_store_preferences_recent_idx
  on public.user_active_store_preferences(user_id, updated_at desc);

alter table public.membership_store_assignments enable row level security;
alter table public.user_active_store_preferences enable row level security;

drop policy if exists g1d_assignment_select_own on public.membership_store_assignments;
create policy g1d_assignment_select_own
on public.membership_store_assignments for select to authenticated
using (
  exists (
    select 1 from public.memberships m
    where m.id=membership_id and m.user_id=auth.uid()
  )
);

drop policy if exists g1d_preference_select_own on public.user_active_store_preferences;
create policy g1d_preference_select_own
on public.user_active_store_preferences for select to authenticated
using (user_id = auth.uid());

drop policy if exists g1d_preference_insert_own on public.user_active_store_preferences;
create policy g1d_preference_insert_own
on public.user_active_store_preferences for insert to authenticated
with check (user_id = auth.uid());

drop policy if exists g1d_preference_update_own on public.user_active_store_preferences;
create policy g1d_preference_update_own
on public.user_active_store_preferences for update to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists g1d_preference_delete_own on public.user_active_store_preferences;
create policy g1d_preference_delete_own
on public.user_active_store_preferences for delete to authenticated
using (user_id = auth.uid());

revoke all on public.membership_store_assignments from public, anon, authenticated;
revoke all on public.user_active_store_preferences from public, anon, authenticated;
grant select on public.membership_store_assignments to authenticated;
grant select on public.user_active_store_preferences to authenticated;

create or replace function public.current_user_accessible_store_ids()
returns setof uuid
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select distinct s.id
  from public.memberships m
  join public.tenants t on t.id=m.tenant_id and t.status='active'
  join public.stores s on s.tenant_id=m.tenant_id
    and public.store_is_authorization_eligible(s.status)
  left join public.membership_store_assignments msa
    on msa.membership_id=m.id
   and msa.tenant_id=m.tenant_id
   and msa.store_id=s.id
   and msa.deleted_at is null
  join auth.users u on u.id=m.user_id
  where m.user_id=auth.uid()
    and m.status='active'
    and m.role in ('owner','admin','implementer','staff','viewer')
    and m.disabled_at is null
    and m.deleted_at is null
    and coalesce(m.invite_accepted_at,m.joined_at) is not null
    and (m.role in ('owner','admin') or msa.id is not null);
$$;

create or replace function public.current_user_can_access_store(p_store_id uuid)
returns boolean
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select auth.uid() is not null
    and p_store_id is not null
    and exists (
      select 1 from public.current_user_accessible_store_ids() s(id)
      where s.id=p_store_id
    );
$$;

create or replace function public.current_user_active_store_id()
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
stable
as $$
declare
  v_store_id uuid;
  v_count integer;
begin
  if auth.uid() is null then return null; end if;

  select p.active_store_id into v_store_id
  from public.user_active_store_preferences p
  where p.user_id=auth.uid()
    and public.current_user_can_access_store(p.active_store_id)
  order by p.updated_at desc, p.id
  limit 1;
  if v_store_id is not null then return v_store_id; end if;

  select count(*), (array_agg(id order by id))[1] into v_count, v_store_id
  from public.current_user_accessible_store_ids() s(id);
  if v_count=1 then return v_store_id; end if;
  return null;
end;
$$;

-- RLS policies use only the resolved active store. Accessible stores are listed
-- through the separate helper above and never broaden row access by themselves.
create or replace function public.current_user_store_ids()
returns setof uuid
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select active_store_id
  from (select public.current_user_active_store_id() active_store_id) x
  where active_store_id is not null;
$$;

create or replace function public.current_user_store_role(p_store_id uuid)
returns text
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select m.role
  from public.memberships m
  join public.tenants t on t.id=m.tenant_id and t.status='active'
  join public.stores s
    on s.id=p_store_id and s.tenant_id=m.tenant_id
   and public.store_is_authorization_eligible(s.status)
  join auth.users u on u.id=m.user_id
  where m.user_id=auth.uid()
    and p_store_id=public.current_user_active_store_id()
    and m.status='active'
    and m.role in ('owner','admin','implementer','staff','viewer')
    and m.disabled_at is null
    and m.deleted_at is null
    and coalesce(m.invite_accepted_at,m.joined_at) is not null
    and public.current_user_can_access_store(p_store_id)
  limit 1;
$$;

-- Compatibility read model for application screens that need the current user's
-- tenant role together with the resolved active store. It never changes or
-- exposes memberships.store_id as authority.
create or replace view public.current_user_active_store_membership
with (security_invoker=true, security_barrier=true)
as
select
  m.id,
  m.tenant_id,
  active_store.id as store_id,
  m.user_id,
  m.email,
  m.role,
  m.status,
  m.display_name,
  m.invited_at,
  m.joined_at,
  m.last_login_at,
  m.memo
from public.memberships m
join public.tenants t on t.id=m.tenant_id and t.status='active'
join public.stores active_store
  on active_store.id=public.current_user_active_store_id()
 and active_store.tenant_id=m.tenant_id
 and public.store_is_authorization_eligible(active_store.status)
where m.user_id=auth.uid()
  and m.status='active'
  and m.disabled_at is null
  and m.deleted_at is null
  and coalesce(m.invite_accepted_at,m.joined_at) is not null
  and public.current_user_can_access_store(active_store.id);

revoke all on public.current_user_active_store_membership from public,anon,authenticated;
grant select on public.current_user_active_store_membership to authenticated;

create or replace function public.list_accessible_garage_stores()
returns table (id uuid, name text, company_name text, tenant_id uuid, is_current boolean)
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select s.id, s.name, s.company_name, s.tenant_id,
         s.id=public.current_user_active_store_id()
  from public.stores s
  where s.id in (select public.current_user_accessible_store_ids())
  order by s.tenant_id, (s.id=public.current_user_active_store_id()) desc,
           coalesce(s.name,s.company_name,''), s.id;
$$;

create or replace function public.get_garage_ui_context_v2()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
stable
as $$
declare
  v_user_id uuid := auth.uid();
  v_store_id uuid;
  v_role text := 'viewer';
  v_display_name text := '';
  v_store public.stores%rowtype;
  v_stores jsonb := '[]'::jsonb;
  v_store_count integer := 0;
  v_today date := (now() at time zone 'Asia/Tokyo')::date;
  v_counts jsonb := '{}'::jsonb;
begin
  if v_user_id is null then
    raise exception using errcode='42501', message='G1D_UNAUTHENTICATED';
  end if;

  v_store_id:=public.current_user_active_store_id();
  select coalesce(jsonb_agg(to_jsonb(store_row)),'[]'::jsonb),count(*)
    into v_stores,v_store_count
  from public.list_accessible_garage_stores() store_row;

  select m.role,coalesce(m.display_name,'') into v_role,v_display_name
  from public.memberships m
  join public.tenants t on t.id=m.tenant_id and t.status='active'
  where m.user_id=v_user_id and m.status='active'
    and m.disabled_at is null and m.deleted_at is null
    and coalesce(m.invite_accepted_at,m.joined_at) is not null
    and (v_store_id is null or exists (
      select 1 from public.stores s where s.id=v_store_id and s.tenant_id=m.tenant_id
    ))
  order by m.created_at,m.id limit 1;

  if v_store_id is null then
    return jsonb_build_object(
      'state',case when v_store_count>0 then 'selection_required' else 'no_access' end,
      'tenant_id','', 'store_id','', 'store_label',
      case when v_store_count>0 then '店舗を選択' else '店舗未登録' end,
      'role',coalesce(v_role,'viewer'),'display_name',coalesce(v_display_name,''),
      'long_stay_threshold_days',90,'onboarding_completed',false,
      'primary_navigation_tabs',null,'stores',v_stores,'counts','{}'::jsonb
    );
  end if;

  select * into strict v_store from public.stores
  where id=v_store_id and public.store_is_authorization_eligible(status);

  select jsonb_build_object(
    'vehicle_attention',(select count(*) from public.vehicles vehicle
      where vehicle.store_id=v_store_id and vehicle.deleted_at is null
        and coalesce(vehicle.is_archived,false)=false and (
          vehicle.market_value is null or nullif(trim(vehicle.market_source),'') is null
          or vehicle.market_checked_at is null
          or v_today-coalesce(vehicle.purchase_date,vehicle.created_at::date)>coalesce(v_store.long_stay_threshold_days,90)
          or exists (select 1 from public.vehicle_listing_statuses listing
            where listing.store_id=v_store_id and listing.vehicle_id=vehicle.id
              and (listing.status='エラー' or (vehicle.status in ('売約済み','納車済み') and listing.status='掲載中')))
        )),
    'deals_today',(select count(*) from public.deals deal where deal.store_id=v_store_id
      and deal.deleted_at is null and coalesce(deal.is_archived,false)=false
      and deal.next_action_at::date=v_today and coalesce(deal.status,'') not in ('成約','失注')),
    'deals_overdue',(select count(*) from public.deals deal where deal.store_id=v_store_id
      and deal.deleted_at is null and coalesce(deal.is_archived,false)=false
      and deal.next_action_at::date<v_today and coalesce(deal.status,'') not in ('成約','失注')),
    'customers_today',(select count(*) from public.customers customer where customer.store_id=v_store_id
      and customer.deleted_at is null and coalesce(customer.is_archived,false)=false
      and customer.next_action_date=v_today and coalesce(customer.customer_status,'')<>'対応不要'),
    'customers_overdue',(select count(*) from public.customers customer where customer.store_id=v_store_id
      and customer.deleted_at is null and coalesce(customer.is_archived,false)=false
      and customer.next_action_date<v_today and coalesce(customer.customer_status,'')<>'対応不要'),
    'appointments_today',(select count(*) from public.appointments appointment where appointment.store_id=v_store_id
      and (appointment.scheduled_at at time zone 'Asia/Tokyo')::date=v_today
      and appointment.status in ('予約済み','確認済み')),
    'appointments_open',(select count(*) from public.appointments appointment where appointment.store_id=v_store_id
      and appointment.status in ('予約済み','確認済み')),
    'maintenance_today',(select count(*) from public.maintenance_jobs job where job.store_id=v_store_id
      and job.scheduled_delivery_at::date=v_today
      and coalesce(job.status,'') not in ('completed','delivered','完了','納車済み')),
    'maintenance_overdue',(select count(*) from public.maintenance_jobs job where job.store_id=v_store_id
      and job.scheduled_delivery_at::date<v_today
      and coalesce(job.status,'') not in ('completed','delivered','完了','納車済み')),
    'inquiry_pending',(select count(*) from public.line_form_responses inquiry
      where inquiry.store_id=v_store_id and inquiry.response_status<>'completed')
  ) into v_counts;

  return jsonb_build_object(
    'state','active','tenant_id',v_store.tenant_id,'store_id',v_store_id,
    'store_label',coalesce(nullif(trim(v_store.name),''),'店舗'),
    'role',coalesce(v_role,'viewer'),'display_name',coalesce(v_display_name,''),
    'long_stay_threshold_days',coalesce(v_store.long_stay_threshold_days,90),
    'onboarding_completed',v_store.onboarding_completed_at is not null,
    'primary_navigation_tabs',v_store.primary_navigation_tabs,
    'stores',v_stores,'counts',v_counts
  );
end;
$$;

create or replace function public.get_garage_dashboard_payload_v2()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
stable
as $$
declare
  v_store_id uuid := public.current_user_active_store_id();
  v_role text;
begin
  if auth.uid() is null then raise exception using errcode='42501',message='G1D_UNAUTHENTICATED'; end if;
  if v_store_id is null then raise exception using errcode='42501',message='G1D_ACTIVE_STORE_REQUIRED'; end if;
  v_role:=public.current_user_store_role(v_store_id);
  if v_role is null then raise exception using errcode='42501',message='G1D_STORE_FORBIDDEN'; end if;

  return jsonb_build_object(
    'vehicles',(select coalesce(jsonb_agg(to_jsonb(r) order by r.created_at desc),'[]'::jsonb) from (
      select id,management_no,maker,model_name,status,location_name,total_price,listing_price,
        purchase_price,direct_cost_special,direct_cost_accessories,direct_cost_agency,direct_cost_legal,
        purchase_date,sale_price,sold_date,market_value,market_source,market_checked_at,created_at,is_archived,deleted_at
      from public.vehicles where store_id=v_store_id
    ) r),
    'deals',(select coalesce(jsonb_agg(to_jsonb(r) order by r.created_at desc),'[]'::jsonb) from (
      select id,deal_no,title,status,assigned_user_name,next_action_at,created_at,vehicle_id
      from public.deals where store_id=v_store_id
    ) r),
    'invoices',case when v_role in ('owner','admin') then
      (select coalesce(jsonb_agg(to_jsonb(r)-'_sort_created_at' order by r._sort_created_at desc),'[]'::jsonb) from (
        select id,vehicle_id,issue_date,issue_status,total_amount,created_at _sort_created_at
        from public.invoices where store_id=v_store_id
      ) r) else '[]'::jsonb end,
    'maintenance_jobs',(select coalesce(jsonb_agg(to_jsonb(r) order by r.scheduled_delivery_at asc),'[]'::jsonb) from (
      select id,job_no reception_no,vehicle_id,job_type,status,scheduled_delivery_at,assigned_user_name
      from public.maintenance_jobs where store_id=v_store_id
    ) r),
    'appointments',(select coalesce(jsonb_agg(to_jsonb(r) order by r.scheduled_at asc),'[]'::jsonb) from (
      select id,customer_id,vehicle_id,appointment_type,scheduled_at,status,assigned_user_name
      from public.appointments where store_id=v_store_id
    ) r),
    'inquiries',(select coalesce(jsonb_agg(to_jsonb(r) order by r.submitted_at desc),'[]'::jsonb) from (
      select id,customer_id,deal_id,answers,submitted_at,source_route,response_status,assigned_user_name,next_action_at
      from public.line_form_responses where store_id=v_store_id
    ) r),
    'customers',(select coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) from (
      select id,name,next_action_date from public.customers where store_id=v_store_id
    ) r),
    'listing_statuses',(select coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) from (
      select vehicle_id,channel,status from public.vehicle_listing_statuses where store_id=v_store_id
    ) r),
    'store_info',(select jsonb_build_object(
      'long_stay_threshold_days',long_stay_threshold_days,
      'management_target_gross_profit_yen',case when v_role in ('owner','admin') then management_target_gross_profit_yen else null end,
      'l_link_onboarding_completed_at',l_link_onboarding_completed_at,
      'sales_recognition_basis',case when v_role in ('owner','admin') then sales_recognition_basis else null end,
      'purchase_recognition_basis',case when v_role in ('owner','admin') then purchase_recognition_basis else null end,
      'business_type',business_type
    ) from public.stores where id=v_store_id)
  );
end;
$$;

create or replace function public.get_garage_analytics_payload_v2()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
stable
as $$
declare
  v_store_id uuid := public.current_user_active_store_id();
begin
  if auth.uid() is null then raise exception using errcode='42501',message='G1D_UNAUTHENTICATED'; end if;
  if v_store_id is null or public.current_user_store_role(v_store_id) is null then
    raise exception using errcode='42501',message='G1D_ACTIVE_STORE_REQUIRED';
  end if;
  return jsonb_build_object(
    'vehicles',(select coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) from (
      select id,management_no,maker,model_name,base_price,total_price,status,location_name from public.vehicles where store_id=v_store_id
    ) r),
    'customers',(select coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) from (
      select id,name,line_display_name,line_friend_status,delivery_permission from public.customers where store_id=v_store_id
    ) r),
    'deals',(select coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) from (
      select id,customer_id,vehicle_id,title,status,probability,source,next_action_at,assigned_user_name from public.deals where store_id=v_store_id
    ) r),
    'quotes',(select coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) from (
      select id,status,issue_status,total_amount from public.quotes where store_id=v_store_id
    ) r),
    'invoices',(select coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) from (
      select id,status,issue_status,total_amount,unpaid_amount from public.invoices where store_id=v_store_id
    ) r),
    'maintenance_jobs',(select coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) from (
      select id,customer_id,vehicle_id,job_no,job_type,status,scheduled_delivery_at,next_inspection_date,assigned_user_name
      from public.maintenance_jobs where store_id=v_store_id
    ) r),
    'line_friends',(select coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) from (
      select id,customer_id,line_display_name,friend_status,delivery_permission,tag_names from public.line_friends where store_id=v_store_id
    ) r),
    'line_message_logs',(select coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) from (
      select id,customer_id,line_display_name,message_type,title,send_status,error_message,sent_at,created_at
      from public.line_message_logs where store_id=v_store_id
    ) r),
    'line_tags',(select coalesce(jsonb_agg(jsonb_build_object('id',id)),'[]'::jsonb) from public.line_tags where store_id=v_store_id),
    'line_templates',(select coalesce(jsonb_agg(jsonb_build_object('id',id)),'[]'::jsonb) from public.line_templates where store_id=v_store_id),
    'line_steps',(select coalesce(jsonb_agg(jsonb_build_object('id',id)),'[]'::jsonb) from public.line_steps where store_id=v_store_id),
    'line_campaigns',(select coalesce(jsonb_agg(jsonb_build_object('id',id)),'[]'::jsonb) from public.line_campaigns where store_id=v_store_id)
  );
end;
$$;

-- Old one-argument switch mutated memberships/store_members. Keep the symbol
-- fail-closed for stale clients but remove authenticated execution.
create or replace function public.switch_active_garage_store(p_store_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  raise exception using errcode='42501', message='G1D_LEGACY_SWITCH_DISABLED';
end;
$$;

create or replace function public.switch_active_garage_store(
  p_tenant_id uuid,
  p_store_id uuid,
  p_correlation_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_membership public.memberships%rowtype;
  v_preference public.user_active_store_preferences%rowtype;
  v_previous_store_id uuid;
  v_changed boolean := false;
begin
  if v_user_id is null then
    raise exception using errcode='42501', message='G1D_UNAUTHENTICATED';
  end if;
  if p_tenant_id is null or p_store_id is null
     or nullif(btrim(p_correlation_id),'') is null
     or char_length(p_correlation_id)>128 then
    raise exception using errcode='22023', message='G1D_INVALID_REQUEST';
  end if;

  select m.* into v_membership
  from public.memberships m
  join public.tenants t on t.id=m.tenant_id and t.status='active'
  join auth.users u on u.id=m.user_id
  where m.user_id=v_user_id
    and m.tenant_id=p_tenant_id
    and m.status='active'
    and m.role in ('owner','admin','implementer','staff','viewer')
    and m.disabled_at is null
    and m.deleted_at is null
    and coalesce(m.invite_accepted_at,m.joined_at) is not null
  for update of m;
  if not found then
    raise exception using errcode='42501', message='G1D_MEMBERSHIP_FORBIDDEN';
  end if;

  if not exists (
    select 1 from public.stores s
    where s.id=p_store_id and s.tenant_id=p_tenant_id
      and public.store_is_authorization_eligible(s.status)
  ) or not public.current_user_can_access_store(p_store_id) then
    raise exception using errcode='42501', message='G1D_STORE_FORBIDDEN';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text || ':' || p_tenant_id::text, 0));

  select * into v_preference
  from public.user_active_store_preferences
  where user_id=v_user_id and tenant_id=p_tenant_id
  for update;

  if found and v_preference.active_store_id=p_store_id then
    return jsonb_build_object(
      'ok',true,'tenant_id',p_tenant_id,'store_id',p_store_id,
      'role',v_membership.role,'version',v_preference.version,
      'correlation_id',p_correlation_id,'changed',false
    );
  end if;

  v_previous_store_id := v_preference.active_store_id;
  insert into public.user_active_store_preferences(
    user_id,tenant_id,active_store_id,version,correlation_id,created_at,updated_at
  ) values (
    v_user_id,p_tenant_id,p_store_id,1,p_correlation_id,now(),now()
  )
  on conflict (user_id, tenant_id) do update
    set active_store_id=excluded.active_store_id,
        version=public.user_active_store_preferences.version+1,
        correlation_id=excluded.correlation_id,
        updated_at=now()
  returning * into v_preference;
  v_changed := true;

  insert into public.audit_logs(
    store_id,user_id,user_role,action,target_type,target_id,before_data,after_data,metadata
  ) values (
    p_store_id,v_user_id,v_membership.role,'change_active_store',
    'active_store_preference',v_preference.id,
    jsonb_build_object('store_id',v_previous_store_id),
    jsonb_build_object('store_id',p_store_id,'version',v_preference.version),
    jsonb_build_object('tenant_id',p_tenant_id,'source','api','correlation_id',p_correlation_id,'result','success')
  );

  return jsonb_build_object(
    'ok',true,'tenant_id',p_tenant_id,'store_id',p_store_id,
    'role',v_membership.role,'version',v_preference.version,
    'correlation_id',p_correlation_id,'changed',v_changed
  );
end;
$$;

create or replace function public.set_membership_store_assignment(
  p_membership_id uuid,
  p_store_id uuid,
  p_enabled boolean,
  p_correlation_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor public.memberships%rowtype;
  v_target public.memberships%rowtype;
  v_assignment_id uuid;
begin
  if auth.uid() is null or p_membership_id is null or p_store_id is null
     or p_enabled is null or nullif(btrim(p_correlation_id),'') is null
     or char_length(p_correlation_id)>128 then
    raise exception using errcode='42501', message='G1D_ASSIGNMENT_FORBIDDEN';
  end if;
  select * into v_target from public.memberships
  where id=p_membership_id and status='active' and disabled_at is null and deleted_at is null;
  if not found then raise exception using errcode='42501', message='G1D_ASSIGNMENT_FORBIDDEN'; end if;
  select * into v_actor from public.memberships
  where user_id=auth.uid() and tenant_id=v_target.tenant_id
    and status='active' and disabled_at is null and deleted_at is null
    and coalesce(invite_accepted_at,joined_at) is not null;
  if not found or v_actor.role not in ('owner','admin')
     or (v_actor.role='admin' and v_target.role not in ('staff','viewer'))
     or not exists (
       select 1 from public.stores s
       where s.id=p_store_id and s.tenant_id=v_target.tenant_id
         and public.store_is_authorization_eligible(s.status)
     ) then
    raise exception using errcode='42501', message='G1D_ASSIGNMENT_FORBIDDEN';
  end if;

  if p_enabled then
    insert into public.membership_store_assignments(
      membership_id,tenant_id,store_id,created_by,deleted_at,updated_at
    ) values (
      v_target.id,v_target.tenant_id,p_store_id,auth.uid(),null,now()
    )
    on conflict (membership_id,store_id) do update
      set deleted_at=null,updated_at=now(),created_by=auth.uid()
    returning id into v_assignment_id;
  else
    update public.membership_store_assignments
    set deleted_at=now(),updated_at=now()
    where membership_id=v_target.id and store_id=p_store_id and deleted_at is null
    returning id into v_assignment_id;
  end if;

  insert into public.audit_logs(
    store_id,user_id,user_role,action,target_type,target_id,after_data,metadata
  ) values (
    p_store_id,auth.uid(),v_actor.role,
    case when p_enabled then 'assign_store' else 'unassign_store' end,
    'membership_store_assignment',v_assignment_id,
    jsonb_build_object('enabled',p_enabled),
    jsonb_build_object('tenant_id',v_target.tenant_id,'source','api','correlation_id',p_correlation_id)
  );
  return jsonb_build_object('ok',true,'assignment_id',v_assignment_id,'enabled',p_enabled);
end;
$$;

revoke all on function public.current_user_accessible_store_ids() from public, anon;
revoke all on function public.current_user_can_access_store(uuid) from public, anon;
revoke all on function public.current_user_active_store_id() from public, anon;
revoke all on function public.current_user_store_ids() from public, anon;
revoke all on function public.current_user_store_role(uuid) from public, anon;
revoke all on function public.list_accessible_garage_stores() from public, anon;
revoke all on function public.get_garage_ui_context_v2() from public, anon;
revoke all on function public.get_garage_dashboard_payload_v2() from public, anon;
revoke all on function public.get_garage_analytics_payload_v2() from public, anon;
revoke all on function public.switch_active_garage_store(uuid) from public, anon, authenticated;
revoke all on function public.switch_active_garage_store(uuid,uuid,text) from public, anon;
revoke all on function public.set_membership_store_assignment(uuid,uuid,boolean,text) from public, anon;
grant execute on function public.current_user_accessible_store_ids() to authenticated;
grant execute on function public.current_user_can_access_store(uuid) to authenticated;
grant execute on function public.current_user_active_store_id() to authenticated;
grant execute on function public.current_user_store_ids() to authenticated;
grant execute on function public.current_user_store_role(uuid) to authenticated;
grant execute on function public.list_accessible_garage_stores() to authenticated;
grant execute on function public.get_garage_ui_context_v2() to authenticated;
grant execute on function public.get_garage_dashboard_payload_v2() to authenticated;
grant execute on function public.get_garage_analytics_payload_v2() to authenticated;
grant execute on function public.switch_active_garage_store(uuid, uuid, text) to authenticated;
grant execute on function public.set_membership_store_assignment(uuid,uuid,boolean,text) to authenticated;

notify pgrst, 'reload schema';
commit;
