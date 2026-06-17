-- GARAGE LINK tenant security foundation
-- 破壊的変更なしでtenant_id基盤を追加するSQLです。
-- 既存の stores / store_members / store_id ベースの画面・RLSは残します。

create extension if not exists "pgcrypto";

-- updated_atを自動更新する共通関数です。既に存在していても安全に上書きします。
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- 会社・契約単位の親テーブルです。
-- LINE単体利用からGARAGE LINKへアップグレードしても、同じtenant_idを使い続けます。
create table if not exists public.tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  status text not null default 'active',
  plan_code text not null default 'line',
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.tenants is '会社・契約単位のtenant。LINE単体とGARAGE LINK本体で共通利用する';

-- tenantごとに利用可能な機能を管理します。
-- 例: line / customer / vehicle / deal / maintenance / invoice
create table if not exists public.tenant_features (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  feature_code text not null,
  enabled boolean not null default true,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, feature_code)
);

comment on table public.tenant_features is 'tenantごとの有効機能。LINE単体からGARAGE LINKへのアップグレードに使う';

-- tenant単位のメンバーシップです。
-- 既存の store_members は互換のため残し、段階的に memberships へ移行します。
create table if not exists public.memberships (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  store_id uuid references public.stores(id) on delete set null,
  user_id uuid references auth.users(id) on delete cascade,
  email text,
  role text not null default 'viewer',
  status text not null default 'active',
  display_name text,
  invited_at timestamptz,
  joined_at timestamptz,
  last_login_at timestamptz,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, user_id),
  constraint memberships_role_check check (role in ('owner', 'admin', 'staff', 'viewer')),
  constraint memberships_status_check check (status in ('active', 'suspended', 'invited'))
);

comment on table public.memberships is 'tenant単位のユーザー所属・権限。store_membersから段階移行する';

-- 不審操作・権限不足・Webhook署名不一致などを保存します。
-- detailsにはsecretや個人情報を入れないでください。
create table if not exists public.security_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete set null,
  user_id uuid,
  event_type text not null,
  severity text not null default 'medium',
  ip_address text,
  user_agent text,
  details jsonb,
  created_at timestamptz not null default now(),
  constraint security_events_event_type_check check (
    event_type in (
      'webhook_signature_invalid',
      'webhook_secret_missing',
      'tenant_access_denied',
      'role_access_denied',
      'feature_access_denied',
      'rate_limit_exceeded',
      'suspicious_request'
    )
  ),
  constraint security_events_severity_check check (severity in ('low', 'medium', 'high', 'critical'))
);

comment on table public.security_events is 'セキュリティイベントログ。secretや個人情報は保存しない';

-- 既存 stores に tenant_id を追加します。store_idベース互換は残します。
alter table public.stores add column if not exists tenant_id uuid references public.tenants(id) on delete set null;
alter table public.stores add column if not exists created_by uuid;
alter table public.stores add column if not exists updated_by uuid;

-- 既存storeにtenantがない場合、店舗ごとにtenantを補完します。
-- 同名店舗があっても誤紐づけしないように、store_id -> tenant_id の一時マッピングを作ります。
create temporary table if not exists store_tenant_backfill (
  store_id uuid primary key,
  tenant_id uuid not null
) on commit drop;

truncate table store_tenant_backfill;

insert into store_tenant_backfill (store_id, tenant_id)
select stores.id, gen_random_uuid()
from public.stores
where stores.tenant_id is null;

insert into public.tenants (id, name, plan_code, created_at, updated_at)
select
  store_tenant_backfill.tenant_id,
  coalesce(stores.name, 'GARAGE LINK tenant'),
  coalesce(stores.plan_code, 'line'),
  now(),
  now()
from store_tenant_backfill
join public.stores on stores.id = store_tenant_backfill.store_id
on conflict (id) do nothing;

update public.stores
set tenant_id = store_tenant_backfill.tenant_id
from store_tenant_backfill
where stores.id = store_tenant_backfill.store_id
  and stores.tenant_id is null;

-- 既存store_membersからmembershipsを補完します。
insert into public.memberships (tenant_id, store_id, user_id, role, display_name, email, status, joined_at, created_at, updated_at)
select
  stores.tenant_id,
  store_members.store_id,
  store_members.user_id,
  case
    when store_members.role in ('owner', 'admin', 'staff', 'viewer') then store_members.role
    when store_members.role = 'implementer' then 'admin'
    else 'viewer'
  end,
  store_members.display_name,
  store_members.email,
  coalesce(store_members.status, 'active'),
  store_members.joined_at,
  store_members.created_at,
  now()
from public.store_members
join public.stores on stores.id = store_members.store_id
where stores.tenant_id is not null
  and store_members.user_id is not null
on conflict (tenant_id, user_id) do nothing;

-- LINE単体利用を初期featureとして有効化します。
insert into public.tenant_features (tenant_id, feature_code, enabled)
select tenants.id, 'line', true
from public.tenants
on conflict (tenant_id, feature_code) do nothing;

-- GARAGE LINK既存店舗向けの基本featureを補完します。
insert into public.tenant_features (tenant_id, feature_code, enabled)
select distinct stores.tenant_id, feature_code, true
from public.stores
cross join (
  values ('customer'), ('vehicle'), ('deal'), ('maintenance'), ('invoice')
) as features(feature_code)
where stores.tenant_id is not null
on conflict (tenant_id, feature_code) do nothing;

-- tenant系ヘルパー関数です。
create or replace function public.current_user_tenant_ids()
returns setof uuid
language sql
security definer
set search_path = public
stable
as $$
  select memberships.tenant_id
  from public.memberships
  where memberships.user_id = auth.uid()
    and memberships.status = 'active'
  union
  select stores.tenant_id
  from public.store_members
  join public.stores on stores.id = store_members.store_id
  where store_members.user_id = auth.uid()
    and stores.tenant_id is not null;
$$;

create or replace function public.current_user_role_for_tenant(target_tenant_id uuid)
returns text
language sql
security definer
set search_path = public
stable
as $$
  select memberships.role
  from public.memberships
  where memberships.user_id = auth.uid()
    and memberships.tenant_id = target_tenant_id
    and memberships.status = 'active'
  order by
    case memberships.role
      when 'owner' then 1
      when 'admin' then 2
      when 'staff' then 3
      else 4
    end
  limit 1;
$$;

create or replace function public.has_tenant_feature(target_tenant_id uuid, target_feature_code text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.tenant_features
    where tenant_id = target_tenant_id
      and feature_code = target_feature_code
      and enabled = true
  );
$$;

grant execute on function public.current_user_tenant_ids() to authenticated;
grant execute on function public.current_user_role_for_tenant(uuid) to authenticated;
grant execute on function public.has_tenant_feature(uuid, text) to authenticated;

create index if not exists idx_stores_tenant_id on public.stores(tenant_id);
create index if not exists idx_tenant_features_tenant_id on public.tenant_features(tenant_id);
create index if not exists idx_tenant_features_feature_code on public.tenant_features(feature_code);
create index if not exists idx_memberships_tenant_id on public.memberships(tenant_id);
create index if not exists idx_memberships_user_id on public.memberships(user_id);
create index if not exists idx_memberships_role on public.memberships(role);
create index if not exists idx_memberships_status on public.memberships(status);
create index if not exists idx_security_events_tenant_id on public.security_events(tenant_id);
create index if not exists idx_security_events_user_id on public.security_events(user_id);
create index if not exists idx_security_events_event_type on public.security_events(event_type);
create index if not exists idx_security_events_created_at on public.security_events(created_at);

drop trigger if exists set_tenants_updated_at on public.tenants;
create trigger set_tenants_updated_at before update on public.tenants for each row execute function public.set_updated_at();

drop trigger if exists set_tenant_features_updated_at on public.tenant_features;
create trigger set_tenant_features_updated_at before update on public.tenant_features for each row execute function public.set_updated_at();

drop trigger if exists set_memberships_updated_at on public.memberships;
create trigger set_memberships_updated_at before update on public.memberships for each row execute function public.set_updated_at();

alter table public.tenants enable row level security;
alter table public.tenant_features enable row level security;
alter table public.memberships enable row level security;
alter table public.security_events enable row level security;

-- tenants: 所属tenantのみ参照。作成・更新・削除はowner/adminに限定します。
drop policy if exists "tenants_select_own" on public.tenants;
create policy "tenants_select_own" on public.tenants
for select to authenticated
using (id in (select public.current_user_tenant_ids()));

drop policy if exists "tenants_update_admin" on public.tenants;
create policy "tenants_update_admin" on public.tenants
for update to authenticated
using (public.current_user_role_for_tenant(id) in ('owner', 'admin'))
with check (public.current_user_role_for_tenant(id) in ('owner', 'admin'));

-- tenant_features: 所属tenantのみ参照。変更はowner/adminのみ。
drop policy if exists "tenant_features_select_own" on public.tenant_features;
create policy "tenant_features_select_own" on public.tenant_features
for select to authenticated
using (tenant_id in (select public.current_user_tenant_ids()));

drop policy if exists "tenant_features_insert_admin" on public.tenant_features;
create policy "tenant_features_insert_admin" on public.tenant_features
for insert to authenticated
with check (public.current_user_role_for_tenant(tenant_id) in ('owner', 'admin'));

drop policy if exists "tenant_features_update_admin" on public.tenant_features;
create policy "tenant_features_update_admin" on public.tenant_features
for update to authenticated
using (public.current_user_role_for_tenant(tenant_id) in ('owner', 'admin'))
with check (public.current_user_role_for_tenant(tenant_id) in ('owner', 'admin'));

-- memberships: 所属tenantのみ参照。招待・権限変更はowner/adminのみ。
drop policy if exists "memberships_select_own" on public.memberships;
create policy "memberships_select_own" on public.memberships
for select to authenticated
using (tenant_id in (select public.current_user_tenant_ids()));

drop policy if exists "memberships_insert_admin" on public.memberships;
create policy "memberships_insert_admin" on public.memberships
for insert to authenticated
with check (public.current_user_role_for_tenant(tenant_id) in ('owner', 'admin'));

drop policy if exists "memberships_update_admin" on public.memberships;
create policy "memberships_update_admin" on public.memberships
for update to authenticated
using (public.current_user_role_for_tenant(tenant_id) in ('owner', 'admin'))
with check (public.current_user_role_for_tenant(tenant_id) in ('owner', 'admin'));

-- security_events: 所属tenantのみ参照。insertはAPI/サーバー処理からも行います。
drop policy if exists "security_events_select_admin" on public.security_events;
create policy "security_events_select_admin" on public.security_events
for select to authenticated
using (
  tenant_id in (select public.current_user_tenant_ids())
  and public.current_user_role_for_tenant(tenant_id) in ('owner', 'admin')
);

drop policy if exists "security_events_insert_own_or_null" on public.security_events;
create policy "security_events_insert_own_or_null" on public.security_events
for insert to authenticated
with check (
  tenant_id is null
  or tenant_id in (select public.current_user_tenant_ids())
);

grant select, update on public.tenants to authenticated;
grant select, insert, update on public.tenant_features to authenticated;
grant select, insert, update on public.memberships to authenticated;
grant select, insert on public.security_events to authenticated;

-- 確認用:
-- select * from public.tenants;
-- select * from public.tenant_features;
-- select * from public.memberships;
-- select * from public.security_events order by created_at desc;
