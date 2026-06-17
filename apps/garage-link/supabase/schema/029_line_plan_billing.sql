-- GARAGE LINK / LINE単体パッケージ billing foundation
-- LINE単体パッケージの料金プラン、月間配信数、従量課金見込みを管理するためのSQLです。
-- 本番DBへ直接適用せず、必ずstaging Supabaseで022〜028の確認後に適用してください。
-- 本SQLは既存データを削除しません。

create extension if not exists "pgcrypto";

-- tenantごとのLINE単体プラン契約です。
-- Stripe連携は後工程で行うため、まずは現在プランと通数無制限オプションだけを保持します。
create table if not exists public.tenant_subscriptions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  plan_code text not null default 'FREE',
  status text not null default 'active',
  unlimited_delivery_enabled boolean not null default false,
  current_period_start timestamptz,
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tenant_subscriptions_plan_code_check
    check (plan_code in ('FREE', 'LINE_BASIC', 'LINE_AUTO')),
  constraint tenant_subscriptions_status_check
    check (status in ('active', 'trialing', 'past_due', 'cancelled', 'suspended'))
);

comment on table public.tenant_subscriptions is 'tenant単位のLINE単体プラン契約。Secretや個人情報は保存しない';
comment on column public.tenant_subscriptions.unlimited_delivery_enabled is '本サービス上の配信通数上限を無制限にするオプション。FREEでは利用不可';

create unique index if not exists idx_tenant_subscriptions_active_one
on public.tenant_subscriptions(tenant_id)
where status = 'active';
create index if not exists idx_tenant_subscriptions_tenant_id on public.tenant_subscriptions(tenant_id);
create index if not exists idx_tenant_subscriptions_plan_code on public.tenant_subscriptions(plan_code);
create index if not exists idx_tenant_subscriptions_status on public.tenant_subscriptions(status);

drop trigger if exists set_tenant_subscriptions_updated_at on public.tenant_subscriptions;
create trigger set_tenant_subscriptions_updated_at
before update on public.tenant_subscriptions
for each row execute function public.set_updated_at();

-- 配信実行後の通数ログです。
-- メッセージ本文、LINE userId、顧客名、電話番号、住所は保存しません。
create table if not exists public.delivery_usage_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  store_id uuid references public.stores(id) on delete set null,
  line_account_id uuid,
  message_id uuid,
  delivery_id uuid,
  delivery_count integer not null default 0,
  billing_month text not null,
  created_at timestamptz not null default now()
);

comment on table public.delivery_usage_logs is 'tenant単位の月間配信通数集計ログ。本文・LINE userId・個人情報は保存しない';

create index if not exists idx_delivery_usage_logs_tenant_id on public.delivery_usage_logs(tenant_id);
create index if not exists idx_delivery_usage_logs_store_id on public.delivery_usage_logs(store_id);
create index if not exists idx_delivery_usage_logs_billing_month on public.delivery_usage_logs(billing_month);
create index if not exists idx_delivery_usage_logs_tenant_month on public.delivery_usage_logs(tenant_id, billing_month);

-- 従量課金見込みログです。
-- LINE BASIC / LINE AUTOで上限超過した場合だけ記録します。
create table if not exists public.delivery_overage_logs (
  id uuid primary key default gen_random_uuid(),
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

comment on table public.delivery_overage_logs is '配信数超過時の従量課金見込みログ。本文・LINE userId・個人情報は保存しない';

create index if not exists idx_delivery_overage_logs_tenant_id on public.delivery_overage_logs(tenant_id);
create index if not exists idx_delivery_overage_logs_store_id on public.delivery_overage_logs(store_id);
create index if not exists idx_delivery_overage_logs_billing_month on public.delivery_overage_logs(billing_month);
create index if not exists idx_delivery_overage_logs_status on public.delivery_overage_logs(status);

alter table public.tenant_subscriptions enable row level security;
alter table public.delivery_usage_logs enable row level security;
alter table public.delivery_overage_logs enable row level security;

-- 所属tenantの契約だけ参照できます。契約変更APIは後工程でowner/adminに限定して実装します。
drop policy if exists "tenant_subscriptions_select_own_tenant" on public.tenant_subscriptions;
create policy "tenant_subscriptions_select_own_tenant"
on public.tenant_subscriptions
for select
to authenticated
using (tenant_id in (select public.current_user_tenant_ids()));

drop policy if exists "tenant_subscriptions_insert_owner_admin" on public.tenant_subscriptions;
create policy "tenant_subscriptions_insert_owner_admin"
on public.tenant_subscriptions
for insert
to authenticated
with check (
  tenant_id in (
    select tenant_id
    from public.memberships
    where user_id = auth.uid()
      and status = 'active'
      and role in ('owner', 'admin')
  )
);

drop policy if exists "tenant_subscriptions_update_owner_admin" on public.tenant_subscriptions;
create policy "tenant_subscriptions_update_owner_admin"
on public.tenant_subscriptions
for update
to authenticated
using (
  tenant_id in (
    select tenant_id
    from public.memberships
    where user_id = auth.uid()
      and status = 'active'
      and role in ('owner', 'admin')
  )
)
with check (
  tenant_id in (
    select tenant_id
    from public.memberships
    where user_id = auth.uid()
      and status = 'active'
      and role in ('owner', 'admin')
  )
);

drop policy if exists "delivery_usage_logs_select_own_tenant" on public.delivery_usage_logs;
create policy "delivery_usage_logs_select_own_tenant"
on public.delivery_usage_logs
for select
to authenticated
using (tenant_id in (select public.current_user_tenant_ids()));

drop policy if exists "delivery_usage_logs_insert_own_tenant" on public.delivery_usage_logs;
create policy "delivery_usage_logs_insert_own_tenant"
on public.delivery_usage_logs
for insert
to authenticated
with check (tenant_id in (select public.current_user_tenant_ids()));

drop policy if exists "delivery_overage_logs_select_own_tenant" on public.delivery_overage_logs;
create policy "delivery_overage_logs_select_own_tenant"
on public.delivery_overage_logs
for select
to authenticated
using (tenant_id in (select public.current_user_tenant_ids()));

drop policy if exists "delivery_overage_logs_insert_own_tenant" on public.delivery_overage_logs;
create policy "delivery_overage_logs_insert_own_tenant"
on public.delivery_overage_logs
for insert
to authenticated
with check (tenant_id in (select public.current_user_tenant_ids()));

grant select, insert, update on public.tenant_subscriptions to authenticated;
grant select, insert on public.delivery_usage_logs to authenticated;
grant select, insert on public.delivery_overage_logs to authenticated;

-- FREEプランの初期契約を未設定tenantへ付与します。
-- 既に契約があるtenantは変更しません。
insert into public.tenant_subscriptions (tenant_id, plan_code, status, unlimited_delivery_enabled)
select t.id, 'FREE', 'active', false
from public.tenants t
where not exists (
  select 1
  from public.tenant_subscriptions ts
  where ts.tenant_id = t.id
    and ts.status = 'active'
);
