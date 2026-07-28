-- G1-C: service role / tenant-store integrity (expand, fail-closed).
-- Ambiguous cross-scope rows are never guessed or repaired: the migration stops in precheck.
begin;

do $$
declare
  v_count bigint;
  v_relation record;
begin
  if exists (select 1 from public.stores where tenant_id is null) then
    raise exception 'G1C_PRECHECK_STORE_WITHOUT_TENANT';
  end if;

  for v_relation in
    select * from (values
      ('appointments','customer_id','customers'), ('appointments','vehicle_id','vehicles'), ('appointments','deal_id','deals'),
      ('deals','customer_id','customers'), ('deals','vehicle_id','vehicles'),
      ('quotes','deal_id','deals'), ('quotes','customer_id','customers'), ('quotes','vehicle_id','vehicles'), ('quotes','maintenance_job_id','maintenance_jobs'),
      ('invoices','quote_id','quotes'), ('invoices','deal_id','deals'), ('invoices','customer_id','customers'), ('invoices','vehicle_id','vehicles'), ('invoices','maintenance_job_id','maintenance_jobs'),
      ('payment_items','deal_id','deals'), ('payment_items','quote_id','quotes'), ('payment_items','invoice_id','invoices'),
      ('trade_in_vehicles','deal_id','deals'), ('trade_in_vehicles','customer_id','customers'),
      ('maintenance_jobs','customer_id','customers'), ('maintenance_jobs','vehicle_id','vehicles'),
      ('maintenance_job_parts','job_id','maintenance_jobs'), ('maintenance_job_parts','part_id','repair_parts'),
      ('inventory_count_items','inventory_count_id','inventory_counts'), ('inventory_count_items','vehicle_id','vehicles'),
      ('quote_items','quote_id','quotes'), ('quote_items','part_id','repair_parts'),
      ('invoice_items','invoice_id','invoices'), ('invoice_items','part_id','repair_parts'),
      ('repair_part_stock_movements','part_id','repair_parts'), ('vehicle_listing_statuses','vehicle_id','vehicles'),
      ('line_campaign_targets','campaign_id','line_campaigns'), ('line_campaign_targets','customer_id','customers'), ('line_campaign_targets','line_friend_id','line_friends'),
      ('line_delivery_logs','campaign_id','line_campaigns'), ('line_delivery_logs','message_id','line_message_drafts'),
      ('line_form_questions','form_id','line_forms'),
      ('line_form_responses','form_id','line_forms'), ('line_form_responses','line_friend_id','line_friends'), ('line_form_responses','customer_id','customers'), ('line_form_responses','vehicle_id','vehicles'), ('line_form_responses','deal_id','deals'),
      ('line_message_drafts','deal_id','deals'), ('line_message_drafts','customer_id','customers'), ('line_message_drafts','vehicle_id','vehicles'), ('line_message_drafts','quote_id','quotes'), ('line_message_drafts','invoice_id','invoices'), ('line_message_drafts','related_quote_id','quotes'), ('line_message_drafts','related_invoice_id','invoices'),
      ('line_message_logs','draft_id','line_message_drafts'), ('line_message_logs','deal_id','deals'), ('line_message_logs','customer_id','customers'), ('line_message_logs','vehicle_id','vehicles'), ('line_message_logs','quote_id','quotes'), ('line_message_logs','invoice_id','invoices'),
      ('line_routes','linked_step_id','line_steps'), ('line_step_messages','step_id','line_steps'),
      ('line_test_delivery_logs','campaign_id','line_campaigns'), ('line_test_delivery_logs','message_id','line_message_drafts'),
      ('inspection_reminder_events','customer_id','customers'), ('inspection_reminder_events','vehicle_id','vehicles')
    ) as x(child_table, parent_column, parent_table)
  loop
    execute format(
      'select count(*) from public.%I c join public.%I p on p.id=c.%I where c.%I is not null and c.store_id is distinct from p.store_id',
      v_relation.child_table, v_relation.parent_table, v_relation.parent_column, v_relation.parent_column
    ) into v_count;
    if v_count > 0 then
      raise exception 'G1C_PRECHECK_CROSS_SCOPE: %.% -> % (% rows)',
        v_relation.child_table, v_relation.parent_column, v_relation.parent_table, v_count;
    end if;
  end loop;
end;
$$;

-- Tenant aliases that can be derived uniquely from their store are backfilled before constraints.
update public.company_subscriptions c set tenant_id=s.tenant_id from public.stores s where c.company_id=s.id and c.tenant_id is null;
update public.plan_change_requests c set tenant_id=s.tenant_id from public.stores s where c.company_id=s.id and c.tenant_id is null;
update public.data_export_logs c set tenant_id=s.tenant_id from public.stores s where c.store_id=s.id and c.tenant_id is null;
update public.data_import_logs c set tenant_id=s.tenant_id from public.stores s where c.store_id=s.id and c.tenant_id is null;
update public.delivery_overage_logs c set tenant_id=s.tenant_id from public.stores s where c.store_id=s.id and c.tenant_id is null;
update public.delivery_usage_logs c set tenant_id=s.tenant_id from public.stores s where c.store_id=s.id and c.tenant_id is null;
update public.inspection_reminder_events c set company_id=s.tenant_id from public.stores s where c.store_id=s.id and c.company_id is null;
update public.inspection_reminder_settings c set company_id=s.tenant_id from public.stores s where c.store_id=s.id and c.company_id is null;
update public.line_campaign_targets c set tenant_id=s.tenant_id from public.stores s where c.store_id=s.id and c.tenant_id is null;
update public.line_campaigns c set tenant_id=s.tenant_id from public.stores s where c.store_id=s.id and c.tenant_id is null;
update public.line_delivery_logs c set tenant_id=s.tenant_id from public.stores s where c.store_id=s.id and c.tenant_id is null;
update public.line_friends c set tenant_id=s.tenant_id from public.stores s where c.store_id=s.id and c.tenant_id is null;
update public.line_message_drafts c set tenant_id=s.tenant_id from public.stores s where c.store_id=s.id and c.tenant_id is null;
update public.line_test_delivery_logs c set tenant_id=s.tenant_id from public.stores s where c.store_id=s.id and c.tenant_id is null;
update public.line_webhook_events c set tenant_id=s.tenant_id from public.stores s where c.store_id=s.id and c.tenant_id is null;
update public.uploaded_files c set tenant_id=s.tenant_id from public.stores s where c.store_id=s.id and c.tenant_id is null;

do $$
declare
  v_count bigint;
begin
  select count(*) into v_count from (
    select 1 from public.company_subscriptions c join public.stores s on s.id=c.company_id where c.tenant_id is distinct from s.tenant_id
    union all select 1 from public.plan_change_requests c join public.stores s on s.id=c.company_id where c.tenant_id is distinct from s.tenant_id
    union all select 1 from public.data_export_logs c join public.stores s on s.id=c.store_id where c.tenant_id is distinct from s.tenant_id
    union all select 1 from public.data_import_logs c join public.stores s on s.id=c.store_id where c.tenant_id is distinct from s.tenant_id
    union all select 1 from public.delivery_overage_logs c join public.stores s on s.id=c.store_id where c.tenant_id is distinct from s.tenant_id
    union all select 1 from public.delivery_usage_logs c join public.stores s on s.id=c.store_id where c.tenant_id is distinct from s.tenant_id
    union all select 1 from public.inspection_reminder_events c join public.stores s on s.id=c.store_id where c.company_id is distinct from s.tenant_id
    union all select 1 from public.inspection_reminder_settings c join public.stores s on s.id=c.store_id where c.company_id is distinct from s.tenant_id
    union all select 1 from public.line_campaign_targets c join public.stores s on s.id=c.store_id where c.tenant_id is distinct from s.tenant_id
    union all select 1 from public.line_campaigns c join public.stores s on s.id=c.store_id where c.tenant_id is distinct from s.tenant_id
    union all select 1 from public.line_delivery_logs c join public.stores s on s.id=c.store_id where c.tenant_id is distinct from s.tenant_id
    union all select 1 from public.line_friends c join public.stores s on s.id=c.store_id where c.tenant_id is distinct from s.tenant_id
    union all select 1 from public.line_message_drafts c join public.stores s on s.id=c.store_id where c.tenant_id is distinct from s.tenant_id
    union all select 1 from public.line_test_delivery_logs c join public.stores s on s.id=c.store_id where c.tenant_id is distinct from s.tenant_id
    union all select 1 from public.line_webhook_events c join public.stores s on s.id=c.store_id where c.tenant_id is distinct from s.tenant_id
    union all select 1 from public.uploaded_files c join public.stores s on s.id=c.store_id where c.tenant_id is distinct from s.tenant_id
  ) mismatches;
  if v_count > 0 then raise exception 'G1C_PRECHECK_TENANT_STORE_MISMATCH: %', v_count; end if;
end;
$$;

-- Composite parent keys. A unique index is sufficient as a PostgreSQL FK target.
create unique index if not exists g1c_customers_id_store_uidx on public.customers(id, store_id);
create unique index if not exists g1c_vehicles_id_store_uidx on public.vehicles(id, store_id);
create unique index if not exists g1c_deals_id_store_uidx on public.deals(id, store_id);
create unique index if not exists g1c_quotes_id_store_uidx on public.quotes(id, store_id);
create unique index if not exists g1c_invoices_id_store_uidx on public.invoices(id, store_id);
create unique index if not exists g1c_maintenance_jobs_id_store_uidx on public.maintenance_jobs(id, store_id);
create unique index if not exists g1c_repair_parts_id_store_uidx on public.repair_parts(id, store_id);
create unique index if not exists g1c_inventory_counts_id_store_uidx on public.inventory_counts(id, store_id);
create unique index if not exists g1c_line_forms_id_store_uidx on public.line_forms(id, store_id);
create unique index if not exists g1c_line_friends_id_store_uidx on public.line_friends(id, store_id);
create unique index if not exists g1c_line_campaigns_id_store_uidx on public.line_campaigns(id, store_id);
create unique index if not exists g1c_line_message_drafts_id_store_uidx on public.line_message_drafts(id, store_id);
create unique index if not exists g1c_line_steps_id_store_uidx on public.line_steps(id, store_id);

do $$
declare
  v_fk record;
begin
  for v_fk in
    select * from (values
      ('appointments','customer_id','customers','appointments_customer_store_fk'), ('appointments','vehicle_id','vehicles','appointments_vehicle_store_fk'), ('appointments','deal_id','deals','appointments_deal_store_fk'),
      ('deals','customer_id','customers','deals_customer_store_fk'), ('deals','vehicle_id','vehicles','deals_vehicle_store_fk'),
      ('quotes','deal_id','deals','quotes_deal_store_fk'), ('quotes','customer_id','customers','quotes_customer_store_fk'), ('quotes','vehicle_id','vehicles','quotes_vehicle_store_fk'), ('quotes','maintenance_job_id','maintenance_jobs','quotes_maintenance_job_store_fk'),
      ('invoices','quote_id','quotes','invoices_quote_store_fk'), ('invoices','deal_id','deals','invoices_deal_store_fk'), ('invoices','customer_id','customers','invoices_customer_store_fk'), ('invoices','vehicle_id','vehicles','invoices_vehicle_store_fk'), ('invoices','maintenance_job_id','maintenance_jobs','invoices_maintenance_job_store_fk'),
      ('payment_items','deal_id','deals','payment_items_deal_store_fk'), ('payment_items','quote_id','quotes','payment_items_quote_store_fk'), ('payment_items','invoice_id','invoices','payment_items_invoice_store_fk'),
      ('trade_in_vehicles','deal_id','deals','trade_in_vehicles_deal_store_fk'), ('trade_in_vehicles','customer_id','customers','trade_in_vehicles_customer_store_fk'),
      ('maintenance_jobs','customer_id','customers','maintenance_jobs_customer_store_fk'), ('maintenance_jobs','vehicle_id','vehicles','maintenance_jobs_vehicle_store_fk'),
      ('maintenance_job_parts','job_id','maintenance_jobs','maintenance_job_parts_job_store_fk'), ('maintenance_job_parts','part_id','repair_parts','maintenance_job_parts_part_store_fk'),
      ('inventory_count_items','inventory_count_id','inventory_counts','inventory_count_items_count_store_fk'), ('inventory_count_items','vehicle_id','vehicles','inventory_count_items_vehicle_store_fk'),
      ('quote_items','quote_id','quotes','quote_items_quote_store_fk'), ('quote_items','part_id','repair_parts','quote_items_part_store_fk'),
      ('invoice_items','invoice_id','invoices','invoice_items_invoice_store_fk'), ('invoice_items','part_id','repair_parts','invoice_items_part_store_fk'),
      ('repair_part_stock_movements','part_id','repair_parts','repair_part_stock_movements_part_store_fk'), ('vehicle_listing_statuses','vehicle_id','vehicles','vehicle_listing_statuses_vehicle_store_fk'),
      ('line_campaign_targets','campaign_id','line_campaigns','line_campaign_targets_campaign_store_fk'), ('line_campaign_targets','customer_id','customers','line_campaign_targets_customer_store_fk'), ('line_campaign_targets','line_friend_id','line_friends','line_campaign_targets_friend_store_fk'),
      ('line_delivery_logs','campaign_id','line_campaigns','line_delivery_logs_campaign_store_fk'), ('line_delivery_logs','message_id','line_message_drafts','line_delivery_logs_message_store_fk'),
      ('line_form_questions','form_id','line_forms','line_form_questions_form_store_fk'),
      ('line_form_responses','form_id','line_forms','line_form_responses_form_store_fk'), ('line_form_responses','line_friend_id','line_friends','line_form_responses_friend_store_fk'), ('line_form_responses','customer_id','customers','line_form_responses_customer_store_fk'), ('line_form_responses','vehicle_id','vehicles','line_form_responses_vehicle_store_fk'), ('line_form_responses','deal_id','deals','line_form_responses_deal_store_fk'),
      ('line_message_drafts','deal_id','deals','line_message_drafts_deal_store_fk'), ('line_message_drafts','customer_id','customers','line_message_drafts_customer_store_fk'), ('line_message_drafts','vehicle_id','vehicles','line_message_drafts_vehicle_store_fk'), ('line_message_drafts','quote_id','quotes','line_message_drafts_quote_store_fk'), ('line_message_drafts','invoice_id','invoices','line_message_drafts_invoice_store_fk'), ('line_message_drafts','related_quote_id','quotes','line_message_drafts_related_quote_store_fk'), ('line_message_drafts','related_invoice_id','invoices','line_message_drafts_related_invoice_store_fk'),
      ('line_message_logs','draft_id','line_message_drafts','line_message_logs_draft_store_fk'), ('line_message_logs','deal_id','deals','line_message_logs_deal_store_fk'), ('line_message_logs','customer_id','customers','line_message_logs_customer_store_fk'), ('line_message_logs','vehicle_id','vehicles','line_message_logs_vehicle_store_fk'), ('line_message_logs','quote_id','quotes','line_message_logs_quote_store_fk'), ('line_message_logs','invoice_id','invoices','line_message_logs_invoice_store_fk'),
      ('line_routes','linked_step_id','line_steps','line_routes_step_store_fk'), ('line_step_messages','step_id','line_steps','line_step_messages_step_store_fk'),
      ('line_test_delivery_logs','campaign_id','line_campaigns','line_test_delivery_logs_campaign_store_fk'), ('line_test_delivery_logs','message_id','line_message_drafts','line_test_delivery_logs_message_store_fk'),
      ('inspection_reminder_events','customer_id','customers','inspection_reminder_events_customer_store_fk'), ('inspection_reminder_events','vehicle_id','vehicles','inspection_reminder_events_vehicle_store_fk')
    ) as x(child_table, parent_column, parent_table, constraint_name)
  loop
    if not exists (select 1 from pg_constraint where conname=v_fk.constraint_name and conrelid=format('public.%I',v_fk.child_table)::regclass) then
      execute format('alter table public.%I add constraint %I foreign key (%I, store_id) references public.%I(id, store_id) not valid',
        v_fk.child_table, v_fk.constraint_name, v_fk.parent_column, v_fk.parent_table);
      execute format('alter table public.%I validate constraint %I', v_fk.child_table, v_fk.constraint_name);
    end if;
  end loop;
end;
$$;

-- Store/tenant aliases must name the same scope. NULL tenant cannot bypass the check when store is present.
do $$
declare
  v_fk record;
begin
  for v_fk in
    select * from (values
      ('company_subscriptions','company_id','tenant_id','company_subscriptions_store_tenant_fk'),
      ('plan_change_requests','company_id','tenant_id','plan_change_requests_store_tenant_fk'),
      ('data_export_logs','store_id','tenant_id','data_export_logs_store_tenant_fk'),
      ('data_import_logs','store_id','tenant_id','data_import_logs_store_tenant_fk'),
      ('delivery_overage_logs','store_id','tenant_id','delivery_overage_logs_store_tenant_fk'),
      ('delivery_usage_logs','store_id','tenant_id','delivery_usage_logs_store_tenant_fk'),
      ('inspection_reminder_events','store_id','company_id','inspection_reminder_events_store_tenant_fk'),
      ('inspection_reminder_settings','store_id','company_id','inspection_reminder_settings_store_tenant_fk'),
      ('line_campaign_targets','store_id','tenant_id','line_campaign_targets_store_tenant_fk'),
      ('line_campaigns','store_id','tenant_id','line_campaigns_store_tenant_fk'),
      ('line_delivery_logs','store_id','tenant_id','line_delivery_logs_store_tenant_fk'),
      ('line_friends','store_id','tenant_id','line_friends_store_tenant_fk'),
      ('line_message_drafts','store_id','tenant_id','line_message_drafts_store_tenant_fk'),
      ('line_test_delivery_logs','store_id','tenant_id','line_test_delivery_logs_store_tenant_fk'),
      ('line_webhook_events','store_id','tenant_id','line_webhook_events_store_tenant_fk'),
      ('uploaded_files','store_id','tenant_id','uploaded_files_store_tenant_fk')
    ) as x(child_table, store_column, tenant_column, constraint_name)
  loop
    if not exists (select 1 from pg_constraint where conname=v_fk.constraint_name and conrelid=format('public.%I',v_fk.child_table)::regclass) then
      execute format('alter table public.%I add constraint %I foreign key (%I, %I) references public.stores(id, tenant_id) not valid',
        v_fk.child_table, v_fk.constraint_name, v_fk.store_column, v_fk.tenant_column);
      execute format('alter table public.%I validate constraint %I', v_fk.child_table, v_fk.constraint_name);
    end if;
  end loop;
end;
$$;

create table if not exists public.line_link_connections (
  id uuid primary key default extensions.gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  key_id text not null check (key_id ~ '^[A-Za-z0-9_-]{1,32}$'),
  status text not null default 'active' check (status in ('active','inactive','revoked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint line_link_connections_key_id_key unique (key_id),
  constraint line_link_connections_store_tenant_fk foreign key (store_id, tenant_id) references public.stores(id, tenant_id) on delete cascade
);
alter table public.line_link_connections enable row level security;
revoke all on table public.line_link_connections from public, anon, authenticated;
grant select on table public.line_link_connections to service_role;

alter table public.line_link_inbound_nonces add column if not exists tenant_id uuid;
update public.line_link_inbound_nonces n set tenant_id=s.tenant_id from public.stores s where n.store_id=s.id and n.tenant_id is null;
do $$ begin
  if exists (select 1 from public.line_link_inbound_nonces where tenant_id is null) then
    raise exception 'G1C_PRECHECK_NONCE_SCOPE_UNKNOWN';
  end if;
end $$;
alter table public.line_link_inbound_nonces alter column tenant_id set not null;
do $$ begin
  if not exists (select 1 from pg_constraint where conrelid='public.line_link_inbound_nonces'::regclass and conname='line_link_inbound_nonces_store_tenant_fk') then
    alter table public.line_link_inbound_nonces add constraint line_link_inbound_nonces_store_tenant_fk
      foreign key (store_id, tenant_id) references public.stores(id, tenant_id) not valid;
    alter table public.line_link_inbound_nonces validate constraint line_link_inbound_nonces_store_tenant_fk;
  end if;
end $$;
create index if not exists line_link_connections_tenant_store_idx on public.line_link_connections(tenant_id, store_id) where status='active';
create index if not exists line_link_inbound_nonces_tenant_store_seen_idx on public.line_link_inbound_nonces(tenant_id, store_id, seen_at);

create or replace function public.guard_scope_columns_immutable()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if (to_jsonb(new)->'tenant_id') is distinct from (to_jsonb(old)->'tenant_id')
     or (to_jsonb(new)->'store_id') is distinct from (to_jsonb(old)->'store_id')
     or (to_jsonb(new)->'company_id') is distinct from (to_jsonb(old)->'company_id') then
    raise exception 'G1C_SCOPE_IMMUTABLE' using errcode='42501';
  end if;
  return new;
end;
$$;
revoke all on function public.guard_scope_columns_immutable() from public, anon, authenticated, service_role;

do $$
declare
  v_table record;
begin
  for v_table in
    select distinct c.table_name
    from information_schema.columns c
    where c.table_schema='public' and c.column_name in ('tenant_id','store_id','company_id')
      and c.table_name not in ('line_link_inbound_nonces')
  loop
    execute format('drop trigger if exists g1c_scope_immutable on public.%I', v_table.table_name);
    execute format('create trigger g1c_scope_immutable before update on public.%I for each row execute function public.guard_scope_columns_immutable()', v_table.table_name);
  end loop;
end;
$$;

create or replace function public.assert_service_tenant_store_context(p_tenant_id uuid, p_store_id uuid)
returns boolean
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select exists (
    select 1 from public.stores s
    where s.id=p_store_id and s.tenant_id=p_tenant_id
      and public.store_is_authorization_eligible(s.status)
  );
$$;
revoke all on function public.assert_service_tenant_store_context(uuid,uuid) from public, anon, authenticated;
grant execute on function public.assert_service_tenant_store_context(uuid,uuid) to service_role;

create or replace function public.purge_expired_store_data_for_tenant(p_tenant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row record;
  v_purged uuid[] := '{}';
begin
  if p_tenant_id is null or not exists (select 1 from public.tenants where id=p_tenant_id) then
    raise exception 'SCOPE_REQUIRED' using errcode='42501';
  end if;

  for v_row in
    select cs.company_id
    from public.company_subscriptions cs
    join public.stores s on s.id=cs.company_id and s.tenant_id=cs.tenant_id
    where cs.tenant_id=p_tenant_id
      and cs.status='cancelled'
      and cs.data_delete_scheduled_at is not null
      and cs.data_delete_scheduled_at <= now()
      and cs.data_deleted_at is null
    for update of cs skip locked
  loop
    update public.company_subscriptions
      set data_deleted_at=now(), updated_at=now()
      where company_id=v_row.company_id and tenant_id=p_tenant_id and data_deleted_at is null;
    delete from public.stores where id=v_row.company_id and tenant_id=p_tenant_id;
    v_purged := array_append(v_purged, v_row.company_id);
  end loop;
  return jsonb_build_object('tenant_id',p_tenant_id,'purged_count',coalesce(array_length(v_purged,1),0),'purged_store_ids',to_jsonb(v_purged));
end;
$$;
revoke all on function public.purge_expired_store_data_for_tenant(uuid) from public, anon, authenticated;
grant execute on function public.purge_expired_store_data_for_tenant(uuid) to service_role;
revoke execute on function public.purge_expired_store_data() from public, anon, authenticated, service_role;

commit;
