-- GARAGE LINK G1-B: role-aware business write lock
-- G1-A の memberships 正本を維持し、業務データの書込みを role ごとに fail-closed 化する。
-- SELECT範囲、車両売約transaction、業務status仕様は変更しない。

-- ---------------------------------------------------------------------------
-- 1. memberships-only role helpers
-- ---------------------------------------------------------------------------
create or replace function public.current_user_store_role(p_store_id uuid)
returns text
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select m.role
  from public.memberships m
  join public.tenants t
    on t.id = m.tenant_id
   and t.status = 'active'
  join public.stores assigned_store
    on assigned_store.id = m.store_id
   and assigned_store.tenant_id = m.tenant_id
   and public.store_is_authorization_eligible(assigned_store.status)
  join public.stores target_store
    on target_store.id = p_store_id
   and target_store.tenant_id = m.tenant_id
   and public.store_is_authorization_eligible(target_store.status)
  join auth.users u on u.id = m.user_id
  where m.user_id = auth.uid()
    and m.status = 'active'
    and m.role in ('owner', 'admin', 'implementer', 'staff', 'viewer')
    and m.disabled_at is null
    and m.deleted_at is null
    and coalesce(m.invite_accepted_at, m.joined_at) is not null
    and (m.role in ('owner', 'admin') or m.store_id = p_store_id)
  limit 1;
$$;

create or replace function public.current_user_can_write_store(p_store_id uuid)
returns boolean
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select coalesce(public.current_user_store_role(p_store_id) in ('owner', 'admin', 'staff'), false);
$$;

create or replace function public.current_user_can_admin_store(p_store_id uuid)
returns boolean
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select coalesce(public.current_user_store_role(p_store_id) in ('owner', 'admin'), false);
$$;

create or replace function public.current_user_can_implement_store(p_store_id uuid)
returns boolean
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select coalesce(public.current_user_store_role(p_store_id) in ('owner', 'admin', 'implementer'), false);
$$;

create or replace function public.current_user_can_append_store(p_store_id uuid)
returns boolean
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select coalesce(public.current_user_store_role(p_store_id) in ('owner', 'admin', 'implementer', 'staff'), false);
$$;

-- G1-A helperから旧表を完全に外す。旧表不一致は権限を復活させず、membershipsのroleを正本とする。
create or replace function public.current_user_tenant_ids()
returns setof uuid
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select m.tenant_id
  from public.memberships m
  join public.tenants t on t.id = m.tenant_id and t.status = 'active'
  join public.stores s on s.id = m.store_id and s.tenant_id = m.tenant_id and public.store_is_authorization_eligible(s.status)
  join auth.users u on u.id = m.user_id
  where m.user_id = auth.uid()
    and m.status = 'active'
    and m.role in ('owner', 'admin', 'implementer', 'staff', 'viewer')
    and m.disabled_at is null
    and m.deleted_at is null
    and coalesce(m.invite_accepted_at, m.joined_at) is not null;
$$;

create or replace function public.current_user_store_ids()
returns setof uuid
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select target_store.id
  from public.memberships m
  join public.tenants t on t.id = m.tenant_id and t.status = 'active'
  join public.stores assigned_store
    on assigned_store.id = m.store_id
   and assigned_store.tenant_id = m.tenant_id
   and public.store_is_authorization_eligible(assigned_store.status)
  join public.stores target_store
    on target_store.tenant_id = m.tenant_id
   and public.store_is_authorization_eligible(target_store.status)
   and (m.role in ('owner', 'admin') or target_store.id = m.store_id)
  join auth.users u on u.id = m.user_id
  where m.user_id = auth.uid()
    and m.status = 'active'
    and m.role in ('owner', 'admin', 'implementer', 'staff', 'viewer')
    and m.disabled_at is null
    and m.deleted_at is null
    and coalesce(m.invite_accepted_at, m.joined_at) is not null;
$$;

create or replace function public.current_user_role_for_tenant(target_tenant_id uuid)
returns text
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select m.role
  from public.memberships m
  join public.tenants t on t.id = m.tenant_id and t.status = 'active'
  join public.stores s on s.id = m.store_id and s.tenant_id = m.tenant_id and public.store_is_authorization_eligible(s.status)
  join auth.users u on u.id = m.user_id
  where m.user_id = auth.uid()
    and m.tenant_id = target_tenant_id
    and m.status = 'active'
    and m.role in ('owner', 'admin', 'implementer', 'staff', 'viewer')
    and m.disabled_at is null
    and m.deleted_at is null
    and coalesce(m.invite_accepted_at, m.joined_at) is not null
  limit 1;
$$;

revoke all on function public.current_user_store_role(uuid) from public, anon;
revoke all on function public.current_user_can_write_store(uuid) from public, anon;
revoke all on function public.current_user_can_admin_store(uuid) from public, anon;
revoke all on function public.current_user_can_implement_store(uuid) from public, anon;
revoke all on function public.current_user_can_append_store(uuid) from public, anon;
grant execute on function public.current_user_store_role(uuid) to authenticated;
grant execute on function public.current_user_can_write_store(uuid) to authenticated;
grant execute on function public.current_user_can_admin_store(uuid) to authenticated;
grant execute on function public.current_user_can_implement_store(uuid) to authenticated;
grant execute on function public.current_user_can_append_store(uuid) to authenticated;

-- Data API pre-request guards must never recover administrator privileges from
-- the legacy compatibility table. Keep these definitions here so G1-B is safe
-- even when the older AAL2 / email-OTP migrations were applied beforehand.
create or replace function public.enforce_administrator_aal2()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  jwt jsonb := auth.jwt();
  jwt_role text := coalesce(jwt ->> 'role', '');
  v_user_id uuid := auth.uid();
  is_administrator boolean := false;
begin
  if jwt_role in ('service_role', 'supabase_admin') or v_user_id is null then return; end if;
  select exists (
    select 1
    from public.memberships m
    join public.tenants t on t.id = m.tenant_id and t.status = 'active'
    join public.stores s on s.id = m.store_id and s.tenant_id = m.tenant_id and public.store_is_authorization_eligible(s.status)
    join auth.users u on u.id = m.user_id
    where m.user_id = v_user_id
      and m.status = 'active'
      and m.role in ('owner', 'admin')
      and m.disabled_at is null
      and m.deleted_at is null
      and coalesce(m.invite_accepted_at, m.joined_at) is not null
  ) into is_administrator;
  if is_administrator and coalesce(jwt ->> 'aal', 'aal1') <> 'aal2' then
    raise insufficient_privilege using message = 'MFA verification is required for administrator access';
  end if;
end;
$$;

create or replace function public.enforce_administrator_email_otp()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  jwt jsonb := auth.jwt();
  jwt_role text := coalesce(jwt ->> 'role', '');
  v_user_id uuid := auth.uid();
  v_session_id uuid;
  is_administrator boolean := false;
begin
  if jwt_role in ('service_role', 'supabase_admin') or v_user_id is null then return; end if;
  begin
    v_session_id := nullif(jwt ->> 'session_id', '')::uuid;
  exception when others then
    v_session_id := null;
  end;
  select exists (
    select 1
    from public.memberships m
    join public.tenants t on t.id = m.tenant_id and t.status = 'active'
    join public.stores s on s.id = m.store_id and s.tenant_id = m.tenant_id and public.store_is_authorization_eligible(s.status)
    join auth.users u on u.id = m.user_id
    where m.user_id = v_user_id
      and m.status = 'active'
      and m.role in ('owner', 'admin', 'implementer')
      and m.disabled_at is null
      and m.deleted_at is null
      and coalesce(m.invite_accepted_at, m.joined_at) is not null
  ) into is_administrator;
  if is_administrator and coalesce(jwt ->> 'aal', 'aal1') <> 'aal2' and not exists (
    select 1 from public.admin_trusted_sessions
    where user_id = v_user_id and session_id = v_session_id and revoked_at is null and expires_at > now()
  ) then
    raise insufficient_privilege using message = 'Email OTP verification is required for administrator access';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Remove every existing write/ALL policy from G1-B classified tables.
--    PostgreSQL permissive policies are OR-combined, so leaving one broad policy is unsafe.
-- ---------------------------------------------------------------------------
do $g1b$
declare
  v_table text;
  v_policy record;
  v_tables text[] := array[
    'accounting_export_settings','appointments','audit_logs','customers','data_export_logs','data_import_logs',
    'deals','inventory_count_items','inventory_counts','invoice_items','invoices','inspection_reminder_settings',
    'inspection_reminder_timings','line_auto_replies','line_campaign_targets','line_campaigns','line_form_questions',
    'line_forms','line_message_drafts','line_rich_menus','line_routes','line_settings','line_step_messages','line_steps',
    'line_tags','line_templates','maintenance_job_parts','maintenance_jobs','payment_items','quote_items','quotes',
    'repair_part_stock_movements','repair_parts','security_events','stores','tenants','trade_in_vehicles','uploaded_files',
    'vehicle_listing_statuses','vehicles','admin_access_credentials','admin_email_otp_challenges','admin_trusted_sessions',
    'auth_login_attempts','company_subscriptions','delivery_overage_logs','delivery_usage_logs','inspection_reminder_events',
    'line_delivery_logs','line_form_responses','line_friends','line_link_inbound_nonces','line_message_logs',
    'line_test_delivery_logs','line_webhook_events','ll_friend_info_fields','ll_friend_info_folders','ll_friend_info_values',
    'll_subscriptions','plan_change_requests','stripe_webhook_events','tenant_features','tenant_subscriptions'
  ];
begin
  foreach v_table in array v_tables loop
    if to_regclass('public.' || v_table) is null then continue; end if;
    for v_policy in
      select polname
      from pg_policy
      where polrelid = to_regclass('public.' || v_table)
        and polcmd in ('a', 'w', 'd', '*')
    loop
      execute format('drop policy if exists %I on public.%I', v_policy.polname, v_table);
    end loop;
  end loop;
end;
$g1b$;

-- ---------------------------------------------------------------------------
-- 3. Store-scoped policy generators
-- ---------------------------------------------------------------------------
do $g1b$
declare
  v_table text;
  v_normal text[] := array[
    'appointments','customers','deals','inventory_count_items','inventory_counts','invoice_items','invoices',
    'maintenance_job_parts','maintenance_jobs','quote_items','quotes','repair_parts','trade_in_vehicles',
    'uploaded_files','vehicle_listing_statuses','vehicles'
  ];
  v_implementer text[] := array[
    'accounting_export_settings','line_auto_replies','line_campaign_targets','line_campaigns','line_form_questions',
    'line_forms','line_message_drafts','line_rich_menus','line_routes','line_settings','line_step_messages','line_steps',
    'line_tags','line_templates'
  ];
  v_admin text[] := array['inspection_reminder_settings','inspection_reminder_timings','payment_items'];
begin
  foreach v_table in array v_normal loop
    if to_regclass('public.' || v_table) is null then continue; end if;
    execute format('alter table public.%I enable row level security', v_table);
    execute format('grant select, insert, update, delete on public.%I to authenticated', v_table);
    execute format('revoke insert, update, delete on public.%I from anon', v_table);
    execute format('create policy g1b_insert_role on public.%I for insert to authenticated with check (public.current_user_can_write_store(store_id))', v_table);
    execute format('create policy g1b_update_role on public.%I for update to authenticated using (public.current_user_can_write_store(store_id)) with check (public.current_user_can_write_store(store_id))', v_table);
    execute format('create policy g1b_delete_admin_role on public.%I for delete to authenticated using (public.current_user_can_admin_store(store_id))', v_table);
  end loop;

  foreach v_table in array v_implementer loop
    if to_regclass('public.' || v_table) is null then continue; end if;
    execute format('alter table public.%I enable row level security', v_table);
    execute format('grant select, insert, update, delete on public.%I to authenticated', v_table);
    execute format('revoke insert, update, delete on public.%I from anon', v_table);
    execute format('create policy g1b_insert_implementer_role on public.%I for insert to authenticated with check (public.current_user_can_implement_store(store_id))', v_table);
    execute format('create policy g1b_update_implementer_role on public.%I for update to authenticated using (public.current_user_can_implement_store(store_id)) with check (public.current_user_can_implement_store(store_id))', v_table);
    execute format('create policy g1b_delete_implementer_role on public.%I for delete to authenticated using (public.current_user_can_implement_store(store_id))', v_table);
  end loop;

  foreach v_table in array v_admin loop
    if to_regclass('public.' || v_table) is null then continue; end if;
    execute format('alter table public.%I enable row level security', v_table);
    execute format('grant select, insert, update, delete on public.%I to authenticated', v_table);
    execute format('revoke insert, update, delete on public.%I from anon', v_table);
    execute format('create policy g1b_insert_admin_role on public.%I for insert to authenticated with check (public.current_user_can_admin_store(store_id))', v_table);
    execute format('create policy g1b_update_admin_role on public.%I for update to authenticated using (public.current_user_can_admin_store(store_id)) with check (public.current_user_can_admin_store(store_id))', v_table);
    execute format('create policy g1b_delete_admin_role on public.%I for delete to authenticated using (public.current_user_can_admin_store(store_id))', v_table);
  end loop;
end;
$g1b$;

-- Append-only audit tables: viewerはINSERTも不可、UPDATE/DELETEは全role不可。
do $g1b$
declare
  v_table text;
begin
  foreach v_table in array array['audit_logs','data_export_logs','data_import_logs'] loop
    if to_regclass('public.' || v_table) is null then continue; end if;
    execute format('alter table public.%I enable row level security', v_table);
    execute format('grant select, insert on public.%I to authenticated', v_table);
    execute format('revoke update, delete on public.%I from anon, authenticated', v_table);
    execute format('create policy g1b_append_role on public.%I for insert to authenticated with check (public.current_user_can_append_store(store_id))', v_table);
  end loop;
end;
$g1b$;

do $g1b$
begin
  if to_regclass('public.security_events') is not null then
    alter table public.security_events enable row level security;
    grant select, insert on public.security_events to authenticated;
    revoke update, delete on public.security_events from anon, authenticated;
    create policy g1b_append_role on public.security_events
      for insert to authenticated
      with check (
        public.current_user_role_for_tenant(tenant_id) in ('owner', 'admin', 'implementer', 'staff')
      );
  end if;
end;
$g1b$;

-- Stock movement rows are only created by owner/admin stock RPCs.
do $g1b$
begin
  if to_regclass('public.repair_part_stock_movements') is not null then
    alter table public.repair_part_stock_movements enable row level security;
    grant select, insert on public.repair_part_stock_movements to authenticated;
    revoke update, delete on public.repair_part_stock_movements from anon, authenticated;
    create policy g1b_append_admin_role on public.repair_part_stock_movements
      for insert to authenticated with check (public.current_user_can_admin_store(store_id));
  end if;
end;
$g1b$;

-- Operation-specific append/update surfaces used by existing business flows.
-- They remain non-deletable and viewer cannot mutate them.
do $g1b$
begin
  if to_regclass('public.line_form_responses') is not null then
    alter table public.line_form_responses enable row level security;
    grant select, update on public.line_form_responses to authenticated;
    revoke insert, delete on public.line_form_responses from anon, authenticated;
    create policy g1b_update_inquiry_role on public.line_form_responses
      for update to authenticated
      using (public.current_user_can_write_store(store_id))
      with check (public.current_user_can_write_store(store_id));
  end if;
  if to_regclass('public.line_test_delivery_logs') is not null then
    alter table public.line_test_delivery_logs enable row level security;
    grant select, insert on public.line_test_delivery_logs to authenticated;
    revoke update, delete on public.line_test_delivery_logs from anon, authenticated;
    create policy g1b_append_test_delivery_role on public.line_test_delivery_logs
      for insert to authenticated with check (public.current_user_can_append_store(store_id));
  end if;
end;
$g1b$;

do $g1b$
declare
  v_table text;
begin
  foreach v_table in array array[
    'delivery_overage_logs','delivery_usage_logs','line_delivery_logs','line_message_logs'
  ] loop
    if to_regclass('public.' || v_table) is null then continue; end if;
    execute format('alter table public.%I enable row level security', v_table);
    execute format('grant select, insert on public.%I to authenticated', v_table);
    execute format('revoke update, delete on public.%I from anon, authenticated', v_table);
    execute format('create policy g1b_append_admin_role on public.%I for insert to authenticated with check (public.current_user_can_admin_store(store_id))', v_table);
  end loop;
end;
$g1b$;

-- ---------------------------------------------------------------------------
-- 4. Tenant/store settings
-- ---------------------------------------------------------------------------
do $g1b$
begin
  if to_regclass('public.stores') is not null then
    alter table public.stores enable row level security;
    grant select, insert, update, delete on public.stores to authenticated;
    revoke insert, update, delete on public.stores from anon;
    create policy g1b_stores_insert_admin on public.stores
      for insert to authenticated
      with check (public.current_user_role_for_tenant(tenant_id) in ('owner', 'admin'));
    create policy g1b_stores_update_admin on public.stores
      for update to authenticated
      using (public.current_user_can_admin_store(id))
      with check (public.current_user_role_for_tenant(tenant_id) in ('owner', 'admin'));
    create policy g1b_stores_delete_admin on public.stores
      for delete to authenticated using (public.current_user_can_admin_store(id));
  end if;

  if to_regclass('public.tenants') is not null then
    alter table public.tenants enable row level security;
    grant select, update on public.tenants to authenticated;
    revoke insert, delete on public.tenants from anon, authenticated;
    create policy g1b_tenants_update_admin on public.tenants
      for update to authenticated
      using (public.current_user_role_for_tenant(id) in ('owner', 'admin'))
      with check (public.current_user_role_for_tenant(id) in ('owner', 'admin'));
  end if;
end;
$g1b$;

-- ---------------------------------------------------------------------------
-- 5. Parent store consistency for the critical business graph.
-- ---------------------------------------------------------------------------
drop policy if exists g1b_insert_role on public.deals;
drop policy if exists g1b_update_role on public.deals;
create policy g1b_insert_role on public.deals for insert to authenticated with check (
  public.current_user_can_write_store(store_id)
  and (customer_id is null or exists (select 1 from public.customers p where p.id = customer_id and p.store_id = store_id))
  and (vehicle_id is null or exists (select 1 from public.vehicles p where p.id = vehicle_id and p.store_id = store_id))
);
create policy g1b_update_role on public.deals for update to authenticated
using (public.current_user_can_write_store(store_id)) with check (
  public.current_user_can_write_store(store_id)
  and (customer_id is null or exists (select 1 from public.customers p where p.id = customer_id and p.store_id = store_id))
  and (vehicle_id is null or exists (select 1 from public.vehicles p where p.id = vehicle_id and p.store_id = store_id))
);

drop policy if exists g1b_insert_role on public.quotes;
drop policy if exists g1b_update_role on public.quotes;
create policy g1b_insert_role on public.quotes for insert to authenticated with check (
  public.current_user_can_write_store(store_id)
  and (deal_id is null or exists (select 1 from public.deals p where p.id = deal_id and p.store_id = store_id))
  and (customer_id is null or exists (select 1 from public.customers p where p.id = customer_id and p.store_id = store_id))
  and (vehicle_id is null or exists (select 1 from public.vehicles p where p.id = vehicle_id and p.store_id = store_id))
);
create policy g1b_update_role on public.quotes for update to authenticated
using (public.current_user_can_write_store(store_id)) with check (
  public.current_user_can_write_store(store_id)
  and (deal_id is null or exists (select 1 from public.deals p where p.id = deal_id and p.store_id = store_id))
  and (customer_id is null or exists (select 1 from public.customers p where p.id = customer_id and p.store_id = store_id))
  and (vehicle_id is null or exists (select 1 from public.vehicles p where p.id = vehicle_id and p.store_id = store_id))
);

drop policy if exists g1b_insert_role on public.invoices;
drop policy if exists g1b_update_role on public.invoices;
create policy g1b_insert_role on public.invoices for insert to authenticated with check (
  public.current_user_can_write_store(store_id)
  and (quote_id is null or exists (select 1 from public.quotes p where p.id = quote_id and p.store_id = store_id))
  and (deal_id is null or exists (select 1 from public.deals p where p.id = deal_id and p.store_id = store_id))
  and (customer_id is null or exists (select 1 from public.customers p where p.id = customer_id and p.store_id = store_id))
  and (vehicle_id is null or exists (select 1 from public.vehicles p where p.id = vehicle_id and p.store_id = store_id))
);
create policy g1b_update_role on public.invoices for update to authenticated
using (public.current_user_can_write_store(store_id)) with check (
  public.current_user_can_write_store(store_id)
  and (quote_id is null or exists (select 1 from public.quotes p where p.id = quote_id and p.store_id = store_id))
  and (deal_id is null or exists (select 1 from public.deals p where p.id = deal_id and p.store_id = store_id))
  and (customer_id is null or exists (select 1 from public.customers p where p.id = customer_id and p.store_id = store_id))
  and (vehicle_id is null or exists (select 1 from public.vehicles p where p.id = vehicle_id and p.store_id = store_id))
);

drop policy if exists g1b_insert_role on public.maintenance_jobs;
drop policy if exists g1b_update_role on public.maintenance_jobs;
create policy g1b_insert_role on public.maintenance_jobs for insert to authenticated with check (
  public.current_user_can_write_store(store_id)
  and (customer_id is null or exists (select 1 from public.customers p where p.id = customer_id and p.store_id = store_id))
  and (vehicle_id is null or exists (select 1 from public.vehicles p where p.id = vehicle_id and p.store_id = store_id))
);
create policy g1b_update_role on public.maintenance_jobs for update to authenticated
using (public.current_user_can_write_store(store_id)) with check (
  public.current_user_can_write_store(store_id)
  and (customer_id is null or exists (select 1 from public.customers p where p.id = customer_id and p.store_id = store_id))
  and (vehicle_id is null or exists (select 1 from public.vehicles p where p.id = vehicle_id and p.store_id = store_id))
);

-- Child rows must stay in the same store as their parent.
do $g1b$
begin
  if to_regclass('public.quote_items') is not null then
    drop policy if exists g1b_insert_role on public.quote_items;
    drop policy if exists g1b_update_role on public.quote_items;
    create policy g1b_insert_role on public.quote_items for insert to authenticated with check (
      public.current_user_can_write_store(store_id)
      and exists (select 1 from public.quotes p where p.id = quote_id and p.store_id = store_id));
    create policy g1b_update_role on public.quote_items for update to authenticated
      using (public.current_user_can_write_store(store_id)) with check (
        public.current_user_can_write_store(store_id)
        and exists (select 1 from public.quotes p where p.id = quote_id and p.store_id = store_id));
  end if;
  if to_regclass('public.invoice_items') is not null then
    drop policy if exists g1b_insert_role on public.invoice_items;
    drop policy if exists g1b_update_role on public.invoice_items;
    create policy g1b_insert_role on public.invoice_items for insert to authenticated with check (
      public.current_user_can_write_store(store_id)
      and exists (select 1 from public.invoices p where p.id = invoice_id and p.store_id = store_id));
    create policy g1b_update_role on public.invoice_items for update to authenticated
      using (public.current_user_can_write_store(store_id)) with check (
        public.current_user_can_write_store(store_id)
        and exists (select 1 from public.invoices p where p.id = invoice_id and p.store_id = store_id));
  end if;
  if to_regclass('public.inventory_count_items') is not null then
    drop policy if exists g1b_insert_role on public.inventory_count_items;
    drop policy if exists g1b_update_role on public.inventory_count_items;
    create policy g1b_insert_role on public.inventory_count_items for insert to authenticated with check (
      public.current_user_can_write_store(store_id)
      and exists (select 1 from public.inventory_counts p where p.id = inventory_count_id and p.store_id = store_id)
      and (vehicle_id is null or exists (select 1 from public.vehicles p where p.id = vehicle_id and p.store_id = store_id)));
    create policy g1b_update_role on public.inventory_count_items for update to authenticated
      using (public.current_user_can_write_store(store_id)) with check (
        public.current_user_can_write_store(store_id)
        and exists (select 1 from public.inventory_counts p where p.id = inventory_count_id and p.store_id = store_id)
        and (vehicle_id is null or exists (select 1 from public.vehicles p where p.id = vehicle_id and p.store_id = store_id)));
  end if;
end;
$g1b$;

-- ---------------------------------------------------------------------------
-- 6. service-only / legacy tables: authenticated and anon have no writes.
-- ---------------------------------------------------------------------------
do $g1b$
declare
  v_table text;
  v_service text[] := array[
    'admin_access_credentials','admin_email_otp_challenges','admin_trusted_sessions','auth_login_attempts',
    'company_subscriptions','inspection_reminder_events',
    'line_friends','line_link_inbound_nonces',
    'line_webhook_events','ll_friend_info_fields','ll_friend_info_folders',
    'll_friend_info_values','ll_subscriptions','plan_change_requests','stripe_webhook_events','tenant_features',
    'tenant_subscriptions'
  ];
begin
  foreach v_table in array v_service loop
    if to_regclass('public.' || v_table) is null then continue; end if;
    execute format('alter table public.%I enable row level security', v_table);
    execute format('revoke insert, update, delete on public.%I from anon, authenticated', v_table);
  end loop;
  revoke insert, update, delete on public.memberships from anon, authenticated;
  revoke insert, update, delete on public.store_members from anon, authenticated;
end;
$g1b$;

-- ---------------------------------------------------------------------------
-- 7. Mutation RPC wrappers. The original implementation is retained under an
--    internal name; the public signature checks the latest membership at call time.
-- ---------------------------------------------------------------------------
do $g1b$
begin
  if to_regprocedure('public.adjust_repair_part_stock(uuid,uuid,integer)') is not null
     and to_regprocedure('public.adjust_repair_part_stock_g1b_impl(uuid,uuid,integer)') is null then
    alter function public.adjust_repair_part_stock(uuid, uuid, integer) rename to adjust_repair_part_stock_g1b_impl;
  end if;
  if to_regprocedure('public.confirm_invoice_part_stock(uuid,uuid)') is not null
     and to_regprocedure('public.confirm_invoice_part_stock_g1b_impl(uuid,uuid)') is null then
    alter function public.confirm_invoice_part_stock(uuid, uuid) rename to confirm_invoice_part_stock_g1b_impl;
  end if;
  if to_regprocedure('public.cancel_invoice_part_stock(uuid,uuid)') is not null
     and to_regprocedure('public.cancel_invoice_part_stock_g1b_impl(uuid,uuid)') is null then
    alter function public.cancel_invoice_part_stock(uuid, uuid) rename to cancel_invoice_part_stock_g1b_impl;
  end if;
  if to_regprocedure('public.generate_followup_candidate_events(uuid,date)') is not null
     and to_regprocedure('public.generate_followup_candidate_events_g1b_impl(uuid,date)') is null then
    alter function public.generate_followup_candidate_events(uuid, date) rename to generate_followup_candidate_events_g1b_impl;
  end if;
  if to_regprocedure('public.generate_inspection_reminder_events(uuid,date)') is not null
     and to_regprocedure('public.generate_inspection_reminder_events_g1b_impl(uuid,date)') is null then
    alter function public.generate_inspection_reminder_events(uuid, date) rename to generate_inspection_reminder_events_g1b_impl;
  end if;
  if to_regprocedure('public.ensure_company_subscription(uuid)') is not null
     and to_regprocedure('public.ensure_company_subscription_g1b_impl(uuid)') is null then
    alter function public.ensure_company_subscription(uuid) rename to ensure_company_subscription_g1b_impl;
  end if;
  if to_regprocedure('public.switch_active_garage_store(uuid)') is not null
     and to_regprocedure('public.switch_active_garage_store_g1b_impl(uuid)') is null then
    alter function public.switch_active_garage_store(uuid) rename to switch_active_garage_store_g1b_impl;
  end if;
end;
$g1b$;

create or replace function public.adjust_repair_part_stock(p_part_id uuid, p_store_id uuid, p_delta integer)
returns json language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not public.current_user_can_admin_store(p_store_id) then
    raise exception using errcode = '42501', message = '在庫を確定・取消する権限がありません。';
  end if;
  return public.adjust_repair_part_stock_g1b_impl(p_part_id, p_store_id, p_delta);
end;
$$;

create or replace function public.confirm_invoice_part_stock(p_invoice_id uuid, p_store_id uuid)
returns json language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not public.current_user_can_admin_store(p_store_id) then
    raise exception using errcode = '42501', message = '部品在庫を確定する権限がありません。';
  end if;
  return public.confirm_invoice_part_stock_g1b_impl(p_invoice_id, p_store_id);
end;
$$;

create or replace function public.cancel_invoice_part_stock(p_invoice_id uuid, p_store_id uuid)
returns json language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not public.current_user_can_admin_store(p_store_id) then
    raise exception using errcode = '42501', message = '部品在庫確定を取消す権限がありません。';
  end if;
  return public.cancel_invoice_part_stock_g1b_impl(p_invoice_id, p_store_id);
end;
$$;

create or replace function public.generate_followup_candidate_events(p_store_id uuid, p_today date default current_date)
returns integer language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if auth.role() <> 'service_role' and not public.current_user_can_admin_store(p_store_id) then
    raise exception using errcode = '42501', message = '候補を生成する権限がありません。';
  end if;
  return public.generate_followup_candidate_events_g1b_impl(p_store_id, p_today);
end;
$$;

create or replace function public.generate_inspection_reminder_events(p_store_id uuid default null, p_today date default current_date)
returns integer language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if auth.role() <> 'service_role' and (p_store_id is null or not public.current_user_can_admin_store(p_store_id)) then
    raise exception using errcode = '42501', message = '候補を生成する権限がありません。';
  end if;
  return public.generate_inspection_reminder_events_g1b_impl(p_store_id, p_today);
end;
$$;

create or replace function public.ensure_company_subscription(p_company_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if auth.role() <> 'service_role'
     and public.current_user_role_for_tenant(p_company_id) not in ('owner', 'admin') then
    raise exception using errcode = '42501', message = '契約情報を作成する権限がありません。';
  end if;
  return public.ensure_company_subscription_g1b_impl(p_company_id);
end;
$$;

create or replace function public.switch_active_garage_store(p_store_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if public.current_user_store_role(p_store_id) not in ('owner', 'admin', 'implementer', 'staff') then
    raise exception using errcode = '42501', message = '店舗を切替える権限がありません。';
  end if;
  return public.switch_active_garage_store_g1b_impl(p_store_id);
end;
$$;

revoke all on function public.adjust_repair_part_stock_g1b_impl(uuid, uuid, integer) from public, anon, authenticated;
revoke all on function public.confirm_invoice_part_stock_g1b_impl(uuid, uuid) from public, anon, authenticated;
revoke all on function public.cancel_invoice_part_stock_g1b_impl(uuid, uuid) from public, anon, authenticated;
revoke all on function public.generate_followup_candidate_events_g1b_impl(uuid, date) from public, anon, authenticated;
revoke all on function public.generate_inspection_reminder_events_g1b_impl(uuid, date) from public, anon, authenticated;
revoke all on function public.ensure_company_subscription_g1b_impl(uuid) from public, anon, authenticated;
revoke all on function public.switch_active_garage_store_g1b_impl(uuid) from public, anon, authenticated;

revoke all on function public.adjust_repair_part_stock(uuid, uuid, integer) from public, anon;
revoke all on function public.confirm_invoice_part_stock(uuid, uuid) from public, anon;
revoke all on function public.cancel_invoice_part_stock(uuid, uuid) from public, anon;
revoke all on function public.generate_followup_candidate_events(uuid, date) from public, anon;
revoke all on function public.generate_inspection_reminder_events(uuid, date) from public, anon;
revoke all on function public.ensure_company_subscription(uuid) from public, anon;
revoke all on function public.switch_active_garage_store(uuid) from public, anon;
grant execute on function public.adjust_repair_part_stock(uuid, uuid, integer) to authenticated;
grant execute on function public.confirm_invoice_part_stock(uuid, uuid) to authenticated;
grant execute on function public.cancel_invoice_part_stock(uuid, uuid) to authenticated;
grant execute on function public.generate_followup_candidate_events(uuid, date) to authenticated, service_role;
grant execute on function public.generate_inspection_reminder_events(uuid, date) to authenticated, service_role;
grant execute on function public.ensure_company_subscription(uuid) to authenticated, service_role;
grant execute on function public.switch_active_garage_store(uuid) to authenticated;

-- Older read payload functions selected their store/role from store_members.
-- Retain their payload implementation only behind a canonical-membership guard.
-- Any missing/mismatched compatibility row denies the call; it can never grant.
create or replace function public.current_user_legacy_surface_is_consistent()
returns boolean
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select auth.uid() is not null
    and exists (
      select 1
      from public.memberships m
      join public.tenants t on t.id = m.tenant_id and t.status = 'active'
      join public.stores s on s.id = m.store_id and s.tenant_id = m.tenant_id and public.store_is_authorization_eligible(s.status)
      join auth.users u on u.id = m.user_id
      where m.user_id = auth.uid()
        and m.status = 'active'
        and m.role in ('owner', 'admin', 'implementer', 'staff', 'viewer')
        and m.disabled_at is null
        and m.deleted_at is null
        and coalesce(m.invite_accepted_at, m.joined_at) is not null
    )
    and not exists (
      select 1
      from public.store_members sm
      where sm.user_id = auth.uid()
        and coalesce(sm.status, 'active') in ('active', 'member')
        and not exists (
          select 1
          from public.memberships m
          join public.stores s on s.id = m.store_id and s.tenant_id = m.tenant_id and public.store_is_authorization_eligible(s.status)
          join public.tenants t on t.id = m.tenant_id and t.status = 'active'
          where m.user_id = auth.uid()
            and m.store_id = sm.store_id
            and m.role = sm.role
            and m.status = 'active'
            and m.disabled_at is null
            and m.deleted_at is null
            and coalesce(m.invite_accepted_at, m.joined_at) is not null
        )
    )
    and not exists (
      select 1
      from public.memberships m
      join public.stores s on s.id = m.store_id and s.tenant_id = m.tenant_id and public.store_is_authorization_eligible(s.status)
      join public.tenants t on t.id = m.tenant_id and t.status = 'active'
      where m.user_id = auth.uid()
        and m.status = 'active'
        and m.role in ('owner', 'admin', 'implementer', 'staff', 'viewer')
        and m.disabled_at is null
        and m.deleted_at is null
        and coalesce(m.invite_accepted_at, m.joined_at) is not null
        and not exists (
          select 1 from public.store_members sm
          where sm.user_id = m.user_id
            and sm.store_id = m.store_id
            and sm.role = m.role
            and coalesce(sm.status, 'active') in ('active', 'member')
        )
    );
$$;

do $g1b$
begin
  if to_regprocedure('public.get_garage_ui_context()') is not null
     and to_regprocedure('public.get_garage_ui_context_g1b_impl()') is null then
    alter function public.get_garage_ui_context() rename to get_garage_ui_context_g1b_impl;
  end if;
  if to_regprocedure('public.get_garage_dashboard_payload()') is not null
     and to_regprocedure('public.get_garage_dashboard_payload_g1b_impl()') is null then
    alter function public.get_garage_dashboard_payload() rename to get_garage_dashboard_payload_g1b_impl;
  end if;
  if to_regprocedure('public.get_garage_analytics_payload()') is not null
     and to_regprocedure('public.get_garage_analytics_payload_g1b_impl()') is null then
    alter function public.get_garage_analytics_payload() rename to get_garage_analytics_payload_g1b_impl;
  end if;
  if to_regprocedure('public.get_garage_plan_usage(uuid)') is not null
     and to_regprocedure('public.get_garage_plan_usage_g1b_impl(uuid)') is null then
    alter function public.get_garage_plan_usage(uuid) rename to get_garage_plan_usage_g1b_impl;
  end if;
  if to_regprocedure('public.get_inspection_reminder_eligibility_summary(uuid)') is not null
     and to_regprocedure('public.get_inspection_reminder_eligibility_summary_g1b_impl(uuid)') is null then
    alter function public.get_inspection_reminder_eligibility_summary(uuid) rename to get_inspection_reminder_eligibility_summary_g1b_impl;
  end if;
  if to_regprocedure('public.get_member_contract_access()') is not null
     and to_regprocedure('public.get_member_contract_access_g1b_impl()') is null then
    alter function public.get_member_contract_access() rename to get_member_contract_access_g1b_impl;
  end if;
end;
$g1b$;

create or replace function public.get_garage_ui_context()
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not public.current_user_legacy_surface_is_consistent() then
    raise exception using errcode = '42501', message = '所属情報を確認できません。';
  end if;
  return public.get_garage_ui_context_g1b_impl();
end;
$$;

create or replace function public.get_garage_dashboard_payload()
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not public.current_user_legacy_surface_is_consistent() then
    raise exception using errcode = '42501', message = '所属情報を確認できません。';
  end if;
  return public.get_garage_dashboard_payload_g1b_impl();
end;
$$;

create or replace function public.get_garage_analytics_payload()
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not public.current_user_legacy_surface_is_consistent() then
    raise exception using errcode = '42501', message = '所属情報を確認できません。';
  end if;
  return public.get_garage_analytics_payload_g1b_impl();
end;
$$;

create or replace function public.get_garage_plan_usage(p_store_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not public.current_user_legacy_surface_is_consistent()
     or public.current_user_store_role(p_store_id) is null then
    raise exception using errcode = '42501', message = '所属情報を確認できません。';
  end if;
  return public.get_garage_plan_usage_g1b_impl(p_store_id);
end;
$$;

create or replace function public.get_inspection_reminder_eligibility_summary(p_store_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not public.current_user_legacy_surface_is_consistent()
     or not public.current_user_can_admin_store(p_store_id) then
    raise exception using errcode = '42501', message = '閲覧する権限がありません。';
  end if;
  return public.get_inspection_reminder_eligibility_summary_g1b_impl(p_store_id);
end;
$$;

create or replace function public.get_member_contract_access()
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null then return jsonb_build_object('state', 'anonymous'); end if;
  if not public.current_user_legacy_surface_is_consistent() then
    return jsonb_build_object('state', 'no_store');
  end if;
  return public.get_member_contract_access_g1b_impl();
end;
$$;

revoke all on function public.current_user_legacy_surface_is_consistent() from public, anon, authenticated;
revoke all on function public.get_garage_ui_context_g1b_impl() from public, anon, authenticated;
revoke all on function public.get_garage_dashboard_payload_g1b_impl() from public, anon, authenticated;
revoke all on function public.get_garage_analytics_payload_g1b_impl() from public, anon, authenticated;
revoke all on function public.get_garage_plan_usage_g1b_impl(uuid) from public, anon, authenticated;
revoke all on function public.get_inspection_reminder_eligibility_summary_g1b_impl(uuid) from public, anon, authenticated;
revoke all on function public.get_member_contract_access_g1b_impl() from public, anon, authenticated;
grant execute on function public.get_garage_ui_context() to authenticated;
grant execute on function public.get_garage_dashboard_payload() to authenticated;
grant execute on function public.get_garage_analytics_payload() to authenticated;
grant execute on function public.get_garage_plan_usage(uuid) to authenticated;
grant execute on function public.get_inspection_reminder_eligibility_summary(uuid) to authenticated;
grant execute on function public.get_member_contract_access() to anon, authenticated;

-- These RPCs are never direct authenticated mutation surfaces.
revoke execute on function public.complete_plan_change_request(uuid) from public, anon, authenticated;
grant execute on function public.complete_plan_change_request(uuid) to service_role;
revoke execute on function public.mark_company_subscription_cancelled(uuid) from public, anon, authenticated;
revoke execute on function public.reactivate_company_subscription(uuid) from public, anon, authenticated;
revoke execute on function public.purge_expired_store_data() from public, anon, authenticated;
grant execute on function public.mark_company_subscription_cancelled(uuid) to service_role;
grant execute on function public.reactivate_company_subscription(uuid) to service_role;
grant execute on function public.purge_expired_store_data() to service_role;

-- GARAGE LINKに残る旧L-LINK互換mutationはuser-facing surfaceにしない。
-- 旧create関数はstore_membersへ直接書くため、存在する環境では必ず閉じる。
do $g1b$
begin
  if to_regprocedure('public.create_llink_company_for_current_user(text,text)') is not null then
    revoke all on function public.create_llink_company_for_current_user(text, text) from public, anon, authenticated;
  end if;
  if to_regprocedure('public.ensure_ll_subscription(uuid)') is not null then
    revoke all on function public.ensure_ll_subscription(uuid) from public, anon, authenticated;
    grant execute on function public.ensure_ll_subscription(uuid) to service_role;
  end if;
  if to_regprocedure('public.mark_ll_subscription_cancelled(uuid)') is not null then
    revoke all on function public.mark_ll_subscription_cancelled(uuid) from public, anon, authenticated;
    grant execute on function public.mark_ll_subscription_cancelled(uuid) to service_role;
  end if;
  if to_regprocedure('public.reactivate_ll_subscription(uuid)') is not null then
    revoke all on function public.reactivate_ll_subscription(uuid) from public, anon, authenticated;
    grant execute on function public.reactivate_ll_subscription(uuid) to service_role;
  end if;
end;
$g1b$;

-- Trigger/helper functions are not caller-facing RPCs.
revoke all on function public.membership_legacy_is_consistent(uuid, uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.guard_store_members_compatibility() from public, anon, authenticated;
revoke all on function public.guard_membership_owner_and_identity() from public, anon, authenticated;
revoke all on function public.membership_plan_limit_guard() from public, anon, authenticated;
revoke all on function public.garage_plan_limit_guard() from public, anon, authenticated;
