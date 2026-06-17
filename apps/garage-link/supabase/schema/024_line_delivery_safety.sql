-- GARAGE LINK LINE delivery safety
-- LINE配信事故を防ぐため、配信前確認・テスト配信・配信履歴を追加します。
-- 既存データは削除しません。

create extension if not exists "pgcrypto";

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- 第1段階のsecurity_eventsに、配信安全化で必要なイベント種別を追加します。
alter table public.security_events
drop constraint if exists security_events_event_type_check;

alter table public.security_events
add constraint security_events_event_type_check check (
  event_type in (
    'webhook_signature_invalid',
    'webhook_secret_missing',
    'webhook_env_secret_fallback_used',
    'tenant_access_denied',
    'role_access_denied',
    'feature_access_denied',
    'rate_limit_exceeded',
    'suspicious_request',
    'cross_tenant_delivery_blocked',
    'delivery_rate_limited',
    'delivery_target_mismatch',
    'line_token_decrypt_failed',
    'line_token_missing'
  )
);

-- LINE下書きに、配信前確認とテスト配信の状態を保存します。
alter table public.line_message_drafts
  add column if not exists tenant_id uuid references public.tenants(id) on delete set null,
  add column if not exists delivery_confirmed_at timestamptz,
  add column if not exists delivery_confirmed_by uuid,
  add column if not exists target_count_snapshot integer,
  add column if not exists target_condition_snapshot jsonb,
  add column if not exists message_snapshot jsonb,
  add column if not exists test_sent_at timestamptz,
  add column if not exists test_sent_by uuid,
  add column if not exists last_delivery_attempt_at timestamptz;

-- 既存storeのtenant_idを下書きに補完します。
update public.line_message_drafts
set tenant_id = stores.tenant_id
from public.stores
where line_message_drafts.store_id = stores.id
  and line_message_drafts.tenant_id is null
  and stores.tenant_id is not null;

create index if not exists idx_line_message_drafts_tenant_id on public.line_message_drafts(tenant_id);
create index if not exists idx_line_message_drafts_delivery_confirmed_at on public.line_message_drafts(delivery_confirmed_at);
create index if not exists idx_line_message_drafts_test_sent_at on public.line_message_drafts(test_sent_at);

-- 一斉配信にも同じ確認情報を持たせます。実送信本体は後工程で分割配信にします。
alter table public.line_campaigns
  add column if not exists tenant_id uuid references public.tenants(id) on delete set null,
  add column if not exists delivery_confirmed_at timestamptz,
  add column if not exists delivery_confirmed_by uuid,
  add column if not exists target_count_snapshot integer,
  add column if not exists target_condition_snapshot jsonb,
  add column if not exists message_snapshot jsonb,
  add column if not exists test_sent_at timestamptz,
  add column if not exists test_sent_by uuid,
  add column if not exists last_delivery_attempt_at timestamptz;

update public.line_campaigns
set tenant_id = stores.tenant_id
from public.stores
where line_campaigns.store_id = stores.id
  and line_campaigns.tenant_id is null
  and stores.tenant_id is not null;

create index if not exists idx_line_campaigns_tenant_id on public.line_campaigns(tenant_id);
create index if not exists idx_line_campaigns_delivery_confirmed_at on public.line_campaigns(delivery_confirmed_at);

-- 配信対象のtenant混入検知に使う補助カラムです。既存store_id運用は残します。
alter table public.line_friends
  add column if not exists tenant_id uuid references public.tenants(id) on delete set null;

update public.line_friends
set tenant_id = stores.tenant_id
from public.stores
where line_friends.store_id = stores.id
  and line_friends.tenant_id is null
  and stores.tenant_id is not null;

create index if not exists idx_line_friends_tenant_id on public.line_friends(tenant_id);

alter table public.line_campaign_targets
  add column if not exists tenant_id uuid references public.tenants(id) on delete set null;

update public.line_campaign_targets
set tenant_id = stores.tenant_id
from public.stores
where line_campaign_targets.store_id = stores.id
  and line_campaign_targets.tenant_id is null
  and stores.tenant_id is not null;

create index if not exists idx_line_campaign_targets_tenant_id on public.line_campaign_targets(tenant_id);

-- テスト配信ログです。本配信ログとは分けます。
create table if not exists public.line_test_delivery_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete set null,
  store_id uuid not null references public.stores(id) on delete cascade,
  line_account_id uuid,
  message_id uuid references public.line_message_drafts(id) on delete set null,
  campaign_id uuid references public.line_campaigns(id) on delete set null,
  test_recipient text,
  sent_by uuid,
  sent_at timestamptz,
  status text not null default 'pending',
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.line_test_delivery_logs is 'LINEテスト配信ログ。本配信ログとは分離して保存する';

create index if not exists idx_line_test_delivery_logs_tenant_id on public.line_test_delivery_logs(tenant_id);
create index if not exists idx_line_test_delivery_logs_store_id on public.line_test_delivery_logs(store_id);
create index if not exists idx_line_test_delivery_logs_message_id on public.line_test_delivery_logs(message_id);
create index if not exists idx_line_test_delivery_logs_campaign_id on public.line_test_delivery_logs(campaign_id);
create index if not exists idx_line_test_delivery_logs_sent_at on public.line_test_delivery_logs(sent_at);

drop trigger if exists set_line_test_delivery_logs_updated_at on public.line_test_delivery_logs;
create trigger set_line_test_delivery_logs_updated_at
before update on public.line_test_delivery_logs
for each row
execute function public.set_updated_at();

alter table public.line_test_delivery_logs enable row level security;

drop policy if exists "line_test_delivery_logs_select_own_store" on public.line_test_delivery_logs;
create policy "line_test_delivery_logs_select_own_store"
on public.line_test_delivery_logs
for select
to authenticated
using (store_id in (select public.current_user_store_ids()));

drop policy if exists "line_test_delivery_logs_insert_own_store" on public.line_test_delivery_logs;
create policy "line_test_delivery_logs_insert_own_store"
on public.line_test_delivery_logs
for insert
to authenticated
with check (store_id in (select public.current_user_store_ids()));

-- 本配信の集計ログです。個別の送信ログは既存line_message_logsにも残します。
create table if not exists public.line_delivery_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete set null,
  store_id uuid not null references public.stores(id) on delete cascade,
  line_account_id uuid,
  message_id uuid references public.line_message_drafts(id) on delete set null,
  campaign_id uuid references public.line_campaigns(id) on delete set null,
  delivery_type text not null default 'single',
  status text not null default 'pending',
  target_count integer not null default 0,
  sent_count integer not null default 0,
  failed_count integer not null default 0,
  skipped_count integer not null default 0,
  target_condition_snapshot jsonb,
  message_snapshot jsonb,
  scheduled_at timestamptz,
  confirmed_at timestamptz,
  confirmed_by uuid,
  sent_at timestamptz,
  sent_by uuid,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.line_delivery_logs is 'LINE本配信の集計ログ。SecretやAccess Tokenは保存しない';

create index if not exists idx_line_delivery_logs_tenant_id on public.line_delivery_logs(tenant_id);
create index if not exists idx_line_delivery_logs_store_id on public.line_delivery_logs(store_id);
create index if not exists idx_line_delivery_logs_message_id on public.line_delivery_logs(message_id);
create index if not exists idx_line_delivery_logs_campaign_id on public.line_delivery_logs(campaign_id);
create index if not exists idx_line_delivery_logs_status on public.line_delivery_logs(status);
create index if not exists idx_line_delivery_logs_sent_at on public.line_delivery_logs(sent_at);

drop trigger if exists set_line_delivery_logs_updated_at on public.line_delivery_logs;
create trigger set_line_delivery_logs_updated_at
before update on public.line_delivery_logs
for each row
execute function public.set_updated_at();

alter table public.line_delivery_logs enable row level security;

drop policy if exists "line_delivery_logs_select_own_store" on public.line_delivery_logs;
create policy "line_delivery_logs_select_own_store"
on public.line_delivery_logs
for select
to authenticated
using (store_id in (select public.current_user_store_ids()));

drop policy if exists "line_delivery_logs_insert_own_store" on public.line_delivery_logs;
create policy "line_delivery_logs_insert_own_store"
on public.line_delivery_logs
for insert
to authenticated
with check (store_id in (select public.current_user_store_ids()));

grant select, insert on public.line_test_delivery_logs to authenticated;
grant select, insert on public.line_delivery_logs to authenticated;

-- 確認用:
-- select * from public.line_test_delivery_logs order by created_at desc;
-- select * from public.line_delivery_logs order by created_at desc;
