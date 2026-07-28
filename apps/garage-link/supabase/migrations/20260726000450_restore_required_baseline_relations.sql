-- DB-003: restore required baseline relations on timestamp-migration upgrade paths.
-- These relations are part of the canonical fresh schema, but had no timestamped
-- creation migration. Existing relations are validated; ambiguous shapes fail closed.
begin;

do $db003$
declare
  v_relation text;
  v_column text;
  v_required_columns jsonb := jsonb_build_object(
    'payment_items', jsonb_build_array('id','store_id','deal_id','quote_id','invoice_id','payment_order','payment_method','amount','scheduled_date','note','created_at','updated_at'),
    'trade_in_vehicles', jsonb_build_array('id','store_id','deal_id','customer_id','maker','model_name','grade','model_year','mileage_km','vin','registration_no','inspection_expiry_date','color','condition_status','appraisal_amount','loan_balance','trade_in_amount','memo','created_at','updated_at'),
    'delivery_usage_logs', jsonb_build_array('id','tenant_id','store_id','line_account_id','message_id','delivery_id','delivery_count','billing_month','created_at'),
    'delivery_overage_logs', jsonb_build_array('id','tenant_id','store_id','line_account_id','delivery_id','included_limit','used_before','delivery_count','overage_count','overage_unit','overage_unit_price','estimated_overage_amount','billing_month','status','created_at')
  );
begin
  foreach v_relation in array array['payment_items','trade_in_vehicles','delivery_usage_logs','delivery_overage_logs'] loop
    if to_regclass('public.' || v_relation) is not null then
      for v_column in select jsonb_array_elements_text(v_required_columns -> v_relation) loop
        if not exists (
          select 1 from information_schema.columns
          where table_schema='public' and table_name=v_relation and column_name=v_column
        ) then
          raise exception 'DB003_RELATION_SHAPE_MISMATCH: %.% missing', v_relation, v_column;
        end if;
      end loop;
    end if;
  end loop;
end;
$db003$;

create table if not exists public.trade_in_vehicles (
  id uuid primary key default extensions.gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  deal_id uuid references public.deals(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  maker text,
  model_name text,
  grade text,
  model_year integer,
  mileage_km integer,
  vin text,
  registration_no text,
  inspection_expiry_date date,
  color text,
  condition_status text,
  appraisal_amount integer default 0,
  loan_balance integer default 0,
  trade_in_amount integer default 0,
  memo text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.payment_items (
  id uuid primary key default extensions.gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  deal_id uuid references public.deals(id) on delete cascade,
  quote_id uuid references public.quotes(id) on delete cascade,
  invoice_id uuid,
  payment_order integer default 0,
  payment_method text,
  amount integer default 0,
  scheduled_date date,
  note text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.delivery_usage_logs (
  id uuid primary key default extensions.gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  store_id uuid references public.stores(id) on delete set null,
  line_account_id uuid,
  message_id uuid,
  delivery_id uuid,
  delivery_count integer not null default 0,
  billing_month text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.delivery_overage_logs (
  id uuid primary key default extensions.gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  store_id uuid references public.stores(id) on delete set null,
  line_account_id uuid,
  delivery_id uuid,
  included_limit integer not null,
  used_before integer not null default 0,
  delivery_count integer not null default 0,
  overage_count integer not null default 0,
  overage_unit integer,
  overage_unit_price integer,
  estimated_overage_amount integer not null default 0,
  billing_month text not null,
  status text not null default 'estimated',
  created_at timestamptz not null default now()
);

comment on table public.trade_in_vehicles is '商談に紐づく下取り車両情報';
comment on table public.payment_items is '支払方法の複数内訳';
comment on table public.delivery_usage_logs is 'tenant単位の月間配信通数集計ログ。本文・LINE userId・個人情報は保存しない';
comment on table public.delivery_overage_logs is '配信数超過時の従量課金見込みログ。本文・LINE userId・個人情報は保存しない';

create index if not exists idx_trade_in_vehicles_store_id on public.trade_in_vehicles(store_id);
create index if not exists idx_trade_in_vehicles_deal_id on public.trade_in_vehicles(deal_id);
create index if not exists idx_payment_items_store_id on public.payment_items(store_id);
create index if not exists idx_payment_items_deal_id on public.payment_items(deal_id);
create index if not exists idx_payment_items_quote_id on public.payment_items(quote_id);
create index if not exists idx_delivery_usage_logs_tenant_id on public.delivery_usage_logs(tenant_id);
create index if not exists idx_delivery_usage_logs_store_id on public.delivery_usage_logs(store_id);
create index if not exists idx_delivery_usage_logs_billing_month on public.delivery_usage_logs(billing_month);
create index if not exists idx_delivery_usage_logs_tenant_month on public.delivery_usage_logs(tenant_id,billing_month);
create index if not exists idx_delivery_overage_logs_tenant_id on public.delivery_overage_logs(tenant_id);
create index if not exists idx_delivery_overage_logs_store_id on public.delivery_overage_logs(store_id);
create index if not exists idx_delivery_overage_logs_billing_month on public.delivery_overage_logs(billing_month);
create index if not exists idx_delivery_overage_logs_status on public.delivery_overage_logs(status);

drop trigger if exists set_trade_in_vehicles_updated_at on public.trade_in_vehicles;
create trigger set_trade_in_vehicles_updated_at before update on public.trade_in_vehicles
for each row execute function public.set_updated_at();
drop trigger if exists set_payment_items_updated_at on public.payment_items;
create trigger set_payment_items_updated_at before update on public.payment_items
for each row execute function public.set_updated_at();

alter table public.trade_in_vehicles enable row level security;
alter table public.payment_items enable row level security;
alter table public.delivery_usage_logs enable row level security;
alter table public.delivery_overage_logs enable row level security;

-- G1-B ran before this compatibility migration on upgrades. Reapply the exact
-- role boundaries here so newly restored relations never inherit broad policies.
do $db003$
declare
  v_table text;
  v_policy record;
begin
  foreach v_table in array array['payment_items','trade_in_vehicles','delivery_usage_logs','delivery_overage_logs'] loop
    for v_policy in
      select polname from pg_policy
      where polrelid=to_regclass('public.' || v_table) and polcmd in ('a','w','d','*')
    loop
      execute format('drop policy if exists %I on public.%I',v_policy.polname,v_table);
    end loop;
    execute format('revoke insert,update,delete on public.%I from anon',v_table);
  end loop;
end;
$db003$;

grant select,insert,update,delete on public.trade_in_vehicles to authenticated;
create policy g1b_insert_role on public.trade_in_vehicles for insert to authenticated
with check (public.current_user_can_write_store(store_id));
create policy g1b_update_role on public.trade_in_vehicles for update to authenticated
using (public.current_user_can_write_store(store_id)) with check (public.current_user_can_write_store(store_id));
create policy g1b_delete_admin_role on public.trade_in_vehicles for delete to authenticated
using (public.current_user_can_admin_store(store_id));

grant select,insert,update,delete on public.payment_items to authenticated;
create policy g1b_insert_admin_role on public.payment_items for insert to authenticated
with check (public.current_user_can_admin_store(store_id));
create policy g1b_update_admin_role on public.payment_items for update to authenticated
using (public.current_user_can_admin_store(store_id)) with check (public.current_user_can_admin_store(store_id));
create policy g1b_delete_admin_role on public.payment_items for delete to authenticated
using (public.current_user_can_admin_store(store_id));

grant select,insert on public.delivery_usage_logs to authenticated;
revoke update,delete on public.delivery_usage_logs from anon,authenticated;
create policy g1b_append_admin_role on public.delivery_usage_logs for insert to authenticated
with check (store_id is not null and public.current_user_can_admin_store(store_id));

grant select,insert on public.delivery_overage_logs to authenticated;
revoke update,delete on public.delivery_overage_logs from anon,authenticated;
create policy g1b_append_admin_role on public.delivery_overage_logs for insert to authenticated
with check (store_id is not null and public.current_user_can_admin_store(store_id));

-- Existing SELECT semantics are retained. A restored relation receives one
-- fail-closed SELECT policy only when no canonical SELECT policy survived.
do $db003$
declare
  v_table text;
begin
  foreach v_table in array array['payment_items','trade_in_vehicles','delivery_usage_logs','delivery_overage_logs'] loop
    if not exists (
      select 1 from pg_policy
      where polrelid=to_regclass('public.' || v_table) and polcmd in ('r','*')
    ) then
      execute format(
        'create policy db003_select_member_stores on public.%I for select to authenticated using (store_id is not null and store_id in (select public.current_user_store_ids()))',
        v_table
      );
    end if;
  end loop;
end;
$db003$;

do $db003$
declare
  v_relation text;
begin
  foreach v_relation in array array['payment_items','trade_in_vehicles','delivery_usage_logs','delivery_overage_logs'] loop
    if to_regclass('public.' || v_relation) is null then
      raise exception 'DB003_REQUIRED_RELATION_ABSENT_AFTER_EXPAND: %',v_relation;
    end if;
    if not exists (
      select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relname=v_relation and c.relrowsecurity
    ) then
      raise exception 'DB003_REQUIRED_RLS_DISABLED: %',v_relation;
    end if;
  end loop;
end;
$db003$;

commit;
