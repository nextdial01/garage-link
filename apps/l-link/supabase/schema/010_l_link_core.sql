-- L-Link core schema
-- 初期ローンチでは商品・決済系を作成しません。
-- 将来検討: ll_products / ll_orders / ll_payments / ll_product_pages / ll_affiliates

create extension if not exists pgcrypto;

-- L-Link単体でも初期設定できるよう、GARAGE LINK互換の会社/店舗・所属テーブルを最小構成で用意します。
-- GARAGE LINK側に既に stores / store_members がある環境では既存テーブルを壊さず、足りないカラムだけ補います。
create table if not exists public.stores (
  id uuid primary key default gen_random_uuid(),
  name text,
  business_type text,
  postal_code text,
  prefecture text,
  address text,
  phone text,
  email text,
  status text not null default 'active',
  plan_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.store_members (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'owner',
  display_name text,
  email text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ll_line_accounts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  account_name text,
  channel_id text,
  basic_id text,
  line_bot_user_id text,
  channel_secret_encrypted text,
  channel_access_token_encrypted text,
  channel_secret_last4 text,
  channel_access_token_last4 text,
  webhook_url text,
  is_connected boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ll_line_webhook_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  line_account_id uuid references public.ll_line_accounts(id) on delete cascade,
  event_id text,
  event_type text not null,
  source_type text,
  source_user_hash text,
  message_type text,
  raw_event_hash text,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  status text not null default 'received',
  error_code text,
  created_at timestamptz not null default now()
);

create table if not exists public.ll_line_friends (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  line_account_id uuid not null references public.ll_line_accounts(id) on delete cascade,
  line_user_id text not null,
  display_name text,
  picture_url text,
  status_message text,
  language text,
  friend_status text not null default 'active',
  followed_at timestamptz,
  unfollowed_at timestamptz,
  last_message_at timestamptz,
  last_interaction_at timestamptz,
  profile_fetched_at timestamptz,
  profile_fetch_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ll_friend_profiles (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  line_friend_id uuid not null unique references public.ll_line_friends(id) on delete cascade,
  real_name text,
  kana text,
  phone text,
  email text,
  birth_date date,
  gender text,
  postal_code text,
  address text,
  customer_status text,
  source text,
  assigned_staff_id uuid,
  preferred_contact_method text,
  interest_category text,
  memo_summary text,
  owned_vehicle text,
  vehicle_inspection_expiry_date date,
  desired_vehicle text,
  inquiry_type text,
  preferred_visit_date date,
  last_contact_note text,
  next_follow_up_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ll_friend_notes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  line_friend_id uuid not null references public.ll_line_friends(id) on delete cascade,
  body text not null,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.ll_tags (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  name text not null,
  color text,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ll_friend_tags (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  line_friend_id uuid not null references public.ll_line_friends(id) on delete cascade,
  tag_id uuid not null references public.ll_tags(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.ll_inflow_routes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  name text not null,
  route_code text,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ll_inflow_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  line_friend_id uuid references public.ll_line_friends(id) on delete set null,
  inflow_route_id uuid references public.ll_inflow_routes(id) on delete set null,
  event_type text,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.ll_forms (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  title text not null,
  status text not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ll_form_questions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  form_id uuid not null references public.ll_forms(id) on delete cascade,
  label text not null,
  question_type text not null,
  sort_order integer not null default 0,
  is_required boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.ll_form_answers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  form_id uuid not null references public.ll_forms(id) on delete cascade,
  line_friend_id uuid references public.ll_line_friends(id) on delete set null,
  submitted_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.ll_form_answer_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  form_answer_id uuid not null references public.ll_form_answers(id) on delete cascade,
  question_id uuid references public.ll_form_questions(id) on delete set null,
  answer_text text,
  created_at timestamptz not null default now()
);

create table if not exists public.ll_rich_menus (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  title text not null,
  status text not null default 'draft',
  image_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ll_rich_menu_areas (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  rich_menu_id uuid not null references public.ll_rich_menus(id) on delete cascade,
  label text,
  action_type text,
  action_value text,
  bounds jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.ll_segments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ll_segment_conditions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  segment_id uuid not null references public.ll_segments(id) on delete cascade,
  condition_type text not null,
  operator text not null,
  value text,
  created_at timestamptz not null default now()
);

create table if not exists public.ll_broadcasts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  title text not null,
  status text not null default 'draft',
  message_type text not null default 'text',
  message_body text,
  scheduled_at timestamptz,
  delivery_confirmed_at timestamptz,
  delivery_confirmed_by uuid,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ll_broadcast_targets (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  broadcast_id uuid not null references public.ll_broadcasts(id) on delete cascade,
  segment_id uuid references public.ll_segments(id) on delete set null,
  target_snapshot jsonb not null default '{}'::jsonb,
  target_count integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.ll_scheduled_messages (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  broadcast_id uuid references public.ll_broadcasts(id) on delete cascade,
  scheduled_at timestamptz not null,
  status text not null default 'scheduled',
  created_at timestamptz not null default now()
);

create table if not exists public.ll_step_scenarios (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  title text not null,
  status text not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ll_step_messages (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  scenario_id uuid not null references public.ll_step_scenarios(id) on delete cascade,
  title text not null,
  delay_minutes integer not null default 0,
  message_body text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.ll_scenario_branches (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  scenario_id uuid not null references public.ll_step_scenarios(id) on delete cascade,
  condition_type text not null,
  next_step_message_id uuid references public.ll_step_messages(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.ll_message_logs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  line_account_id uuid references public.ll_line_accounts(id) on delete set null,
  line_friend_id uuid references public.ll_line_friends(id) on delete set null,
  direction text not null,
  message_type text,
  message_body text,
  message_hash text,
  sent_at timestamptz,
  received_at timestamptz,
  status text not null default 'received',
  created_at timestamptz not null default now()
);

create table if not exists public.ll_delivery_counts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  line_account_id uuid references public.ll_line_accounts(id) on delete set null,
  billing_month text not null,
  delivery_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ll_click_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  line_friend_id uuid references public.ll_line_friends(id) on delete set null,
  url_hash text,
  clicked_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.ll_staff_roles (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  user_id uuid,
  role text not null default 'staff',
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ll_permissions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  role text not null,
  permission_code text not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);

-- ================================================================
-- ALTER TABLE ADD COLUMN IF NOT EXISTS
-- 既存DBに対して不足カラムを補う。CREATE TABLE より必ず後、
-- CREATE INDEX より必ず前に実行する。
-- ================================================================

-- stores
alter table public.stores add column if not exists name text;
alter table public.stores add column if not exists business_type text;
alter table public.stores add column if not exists industry text;
alter table public.stores add column if not exists postal_code text;
alter table public.stores add column if not exists prefecture text;
alter table public.stores add column if not exists address text;
alter table public.stores add column if not exists phone text;
alter table public.stores add column if not exists email text;
alter table public.stores add column if not exists contact_name text;
alter table public.stores add column if not exists status text not null default 'active';
alter table public.stores add column if not exists plan_code text;
alter table public.stores add column if not exists created_at timestamptz not null default now();
alter table public.stores add column if not exists updated_at timestamptz not null default now();

-- store_members
alter table public.store_members add column if not exists store_id uuid references public.stores(id) on delete cascade;
alter table public.store_members add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.store_members add column if not exists role text not null default 'owner';
alter table public.store_members add column if not exists display_name text;
alter table public.store_members add column if not exists email text;
alter table public.store_members add column if not exists status text not null default 'active';
alter table public.store_members add column if not exists created_at timestamptz not null default now();
alter table public.store_members add column if not exists updated_at timestamptz not null default now();

-- ll_line_accounts
alter table public.ll_line_accounts add column if not exists verified_at timestamptz;
alter table public.ll_line_accounts add column if not exists connection_status text not null default 'not_verified';
alter table public.ll_line_accounts add column if not exists last_connection_error text;

-- ll_line_webhook_events
alter table public.ll_line_webhook_events add column if not exists line_friend_id uuid references public.ll_line_friends(id) on delete set null;
alter table public.ll_line_webhook_events add column if not exists source_user_hash text;
alter table public.ll_line_webhook_events add column if not exists raw_event_hash text;
alter table public.ll_line_webhook_events add column if not exists event_id text;
alter table public.ll_line_webhook_events add column if not exists status text not null default 'received';

-- ll_line_friends
alter table public.ll_line_friends add column if not exists friend_status text not null default 'active';
alter table public.ll_line_friends add column if not exists last_message_at timestamptz;
alter table public.ll_line_friends add column if not exists last_interaction_at timestamptz;
alter table public.ll_line_friends add column if not exists profile_fetch_error text;
alter table public.ll_line_friends add column if not exists last_message_text text;

-- ll_friend_notes
alter table public.ll_friend_notes add column if not exists deleted_at timestamptz;

-- ll_forms
alter table public.ll_forms add column if not exists description text;
alter table public.ll_forms add column if not exists is_public boolean not null default false;
alter table public.ll_forms add column if not exists auto_tag_ids uuid[] not null default '{}'::uuid[];
alter table public.ll_forms add column if not exists status text not null default 'draft';

-- ll_form_questions
alter table public.ll_form_questions add column if not exists options text[] not null default '{}'::text[];
alter table public.ll_form_questions add column if not exists profile_mapping text;
alter table public.ll_form_questions add column if not exists auto_tag_id uuid references public.ll_tags(id) on delete set null;
alter table public.ll_form_questions add column if not exists choice_tag_map jsonb not null default '{}'::jsonb;

-- ll_form_answers
alter table public.ll_form_answers add column if not exists line_user_id text;
alter table public.ll_form_answers add column if not exists source text;

-- ll_form_answer_items
alter table public.ll_form_answer_items add column if not exists answer_values text[] not null default '{}'::text[];

-- ll_rich_menus
alter table public.ll_rich_menus add column if not exists line_account_id uuid references public.ll_line_accounts(id) on delete set null;
alter table public.ll_rich_menus add column if not exists name text;
alter table public.ll_rich_menus add column if not exists description text;
alter table public.ll_rich_menus add column if not exists image_url text;
alter table public.ll_rich_menus add column if not exists size_type text not null default 'large';
alter table public.ll_rich_menus add column if not exists width integer not null default 2500;
alter table public.ll_rich_menus add column if not exists height integer not null default 1686;
alter table public.ll_rich_menus add column if not exists is_default boolean not null default false;
alter table public.ll_rich_menus add column if not exists target_memo text;
alter table public.ll_rich_menus add column if not exists line_rich_menu_id text;
alter table public.ll_rich_menus add column if not exists published_at timestamptz;
alter table public.ll_rich_menus add column if not exists status text not null default 'draft';

-- ll_rich_menu_areas
alter table public.ll_rich_menu_areas add column if not exists x integer not null default 0;
alter table public.ll_rich_menu_areas add column if not exists y integer not null default 0;
alter table public.ll_rich_menu_areas add column if not exists width integer not null default 0;
alter table public.ll_rich_menu_areas add column if not exists height integer not null default 0;
alter table public.ll_rich_menu_areas add column if not exists sort_order integer not null default 0;
alter table public.ll_rich_menu_areas add column if not exists updated_at timestamptz not null default now();

-- ll_segments  ← status は index より前に必須
alter table public.ll_segments add column if not exists description text;
alter table public.ll_segments add column if not exists status text not null default 'active';

-- ll_segment_conditions
alter table public.ll_segment_conditions add column if not exists field text;
alter table public.ll_segment_conditions add column if not exists value_json jsonb not null default '{}'::jsonb;
alter table public.ll_segment_conditions add column if not exists sort_order integer not null default 0;
alter table public.ll_segment_conditions add column if not exists updated_at timestamptz not null default now();

-- ll_broadcasts
alter table public.ll_broadcasts add column if not exists line_account_id uuid references public.ll_line_accounts(id) on delete set null;
alter table public.ll_broadcasts add column if not exists name text;
alter table public.ll_broadcasts add column if not exists message_text text;
alter table public.ll_broadcasts add column if not exists target_type text not null default 'all';
alter table public.ll_broadcasts add column if not exists target_tag_ids uuid[] not null default '{}'::uuid[];
alter table public.ll_broadcasts add column if not exists target_segment_id uuid references public.ll_segments(id) on delete set null;
alter table public.ll_broadcasts add column if not exists target_count integer not null default 0;
alter table public.ll_broadcasts add column if not exists status text not null default 'draft';

-- ll_broadcast_targets
alter table public.ll_broadcast_targets add column if not exists line_friend_id uuid references public.ll_line_friends(id) on delete set null;
alter table public.ll_broadcast_targets add column if not exists line_user_id text;
alter table public.ll_broadcast_targets add column if not exists status text not null default 'preview';
alter table public.ll_broadcast_targets add column if not exists updated_at timestamptz not null default now();

-- ll_message_logs
alter table public.ll_message_logs add column if not exists status text not null default 'received';
alter table public.ll_message_logs add column if not exists webhook_event_id text;

-- ================================================================
-- UNIQUE CONSTRAINTS (drop + re-add for idempotency)
-- ================================================================

alter table public.store_members drop constraint if exists store_members_store_user_unique;
alter table public.store_members drop constraint if exists store_members_store_id_user_id_key;
alter table public.store_members add constraint store_members_store_user_unique unique (store_id, user_id);

alter table public.ll_line_friends drop constraint if exists ll_line_friends_company_account_user_unique;
alter table public.ll_line_friends add constraint ll_line_friends_company_account_user_unique unique (company_id, line_account_id, line_user_id);

alter table public.ll_tags drop constraint if exists ll_tags_company_name_key;
alter table public.ll_tags drop constraint if exists ll_tags_company_id_name_key;
alter table public.ll_tags add constraint ll_tags_company_name_key unique (company_id, name);

alter table public.ll_friend_tags drop constraint if exists ll_friend_tags_company_friend_tag_key;
alter table public.ll_friend_tags drop constraint if exists ll_friend_tags_company_id_line_friend_id_tag_id_key;
alter table public.ll_friend_tags add constraint ll_friend_tags_company_friend_tag_key unique (company_id, line_friend_id, tag_id);

alter table public.ll_delivery_counts drop constraint if exists ll_delivery_counts_company_account_month_key;
alter table public.ll_delivery_counts drop constraint if exists ll_delivery_counts_company_id_line_account_id_billing_month_key;
alter table public.ll_delivery_counts add constraint ll_delivery_counts_company_account_month_key unique (company_id, line_account_id, billing_month);

alter table public.ll_permissions drop constraint if exists ll_permissions_company_role_code_key;
alter table public.ll_permissions drop constraint if exists ll_permissions_company_id_role_permission_code_key;
alter table public.ll_permissions add constraint ll_permissions_company_role_code_key unique (company_id, role, permission_code);

alter table public.ll_staff_roles drop constraint if exists ll_staff_roles_company_user_key;
alter table public.ll_staff_roles drop constraint if exists ll_staff_roles_company_id_user_id_key;
alter table public.ll_staff_roles add constraint ll_staff_roles_company_user_key unique (company_id, user_id);

-- ================================================================
-- CREATE INDEX
-- すべての ALTER TABLE ADD COLUMN の後に実行する。
-- ================================================================

create index if not exists idx_ll_stores_status on public.stores(status);
create index if not exists idx_ll_store_members_user_id on public.store_members(user_id);
create index if not exists idx_ll_store_members_store_id on public.store_members(store_id);

create index if not exists ll_line_accounts_company_idx on public.ll_line_accounts(company_id);
create index if not exists ll_line_friends_company_account_idx on public.ll_line_friends(company_id, line_account_id);
create index if not exists ll_friend_profiles_company_friend_idx on public.ll_friend_profiles(company_id, line_friend_id);
create index if not exists ll_friend_notes_company_friend_idx on public.ll_friend_notes(company_id, line_friend_id);
create index if not exists ll_friend_tags_company_friend_idx on public.ll_friend_tags(company_id, line_friend_id);
create index if not exists ll_webhook_events_company_account_idx on public.ll_line_webhook_events(company_id, line_account_id);
create index if not exists ll_message_logs_company_friend_idx on public.ll_message_logs(company_id, line_friend_id);
create index if not exists ll_forms_company_status_idx on public.ll_forms(company_id, status);
create index if not exists ll_form_questions_company_form_idx on public.ll_form_questions(company_id, form_id);
create index if not exists ll_form_answers_company_form_idx on public.ll_form_answers(company_id, form_id);
create index if not exists ll_form_answers_company_friend_idx on public.ll_form_answers(company_id, line_friend_id);
create index if not exists ll_form_answer_items_company_answer_idx on public.ll_form_answer_items(company_id, form_answer_id);
create index if not exists ll_rich_menus_company_status_idx on public.ll_rich_menus(company_id, status);
create index if not exists ll_rich_menu_areas_company_menu_idx on public.ll_rich_menu_areas(company_id, rich_menu_id);
create index if not exists ll_segments_company_status_idx on public.ll_segments(company_id, status);
create index if not exists ll_segment_conditions_company_segment_idx on public.ll_segment_conditions(company_id, segment_id);
create index if not exists ll_broadcasts_company_status_idx on public.ll_broadcasts(company_id, status);
create index if not exists ll_broadcast_targets_company_broadcast_idx on public.ll_broadcast_targets(company_id, broadcast_id);
create index if not exists ll_staff_roles_company_user_idx on public.ll_staff_roles(company_id, user_id);
create index if not exists ll_permissions_company_role_idx on public.ll_permissions(company_id, role);
create index if not exists ll_message_logs_company_created_idx on public.ll_message_logs(company_id, created_at desc);
create index if not exists ll_message_logs_webhook_event_idx on public.ll_message_logs(company_id, webhook_event_id);

-- Webhook event idempotency
create unique index if not exists ll_line_webhook_events_company_event_id_uniq
  on public.ll_line_webhook_events(company_id, event_id)
  where event_id is not null;

-- Message log idempotency
create unique index if not exists ll_message_logs_company_webhook_event_id_uniq
  on public.ll_message_logs(company_id, webhook_event_id)
  where webhook_event_id is not null;

-- ================================================================
-- UPDATED_AT TRIGGER
-- ================================================================

create or replace function public.ll_set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'stores',
    'store_members',
    'll_line_accounts',
    'll_line_friends',
    'll_friend_profiles',
    'll_friend_notes',
    'll_tags',
    'll_inflow_routes',
    'll_forms',
    'll_rich_menu_areas',
    'll_rich_menus',
    'll_segments',
    'll_segment_conditions',
    'll_broadcasts',
    'll_broadcast_targets',
    'll_delivery_counts',
    'll_staff_roles'
  ]
  loop
    execute format('drop trigger if exists %I on public.%I', table_name || '_set_updated_at', table_name);
    execute format(
      'create trigger %I before update on public.%I for each row execute function public.ll_set_updated_at()',
      table_name || '_set_updated_at',
      table_name
    );
  end loop;
end $$;

-- ================================================================
-- ROW LEVEL SECURITY
-- ================================================================

alter table public.stores enable row level security;
alter table public.store_members enable row level security;
alter table public.ll_line_accounts enable row level security;
alter table public.ll_line_webhook_events enable row level security;
alter table public.ll_line_friends enable row level security;
alter table public.ll_friend_profiles enable row level security;
alter table public.ll_friend_notes enable row level security;
alter table public.ll_tags enable row level security;
alter table public.ll_friend_tags enable row level security;
alter table public.ll_inflow_routes enable row level security;
alter table public.ll_inflow_events enable row level security;
alter table public.ll_forms enable row level security;
alter table public.ll_form_questions enable row level security;
alter table public.ll_form_answers enable row level security;
alter table public.ll_form_answer_items enable row level security;
alter table public.ll_rich_menus enable row level security;
alter table public.ll_rich_menu_areas enable row level security;
alter table public.ll_broadcasts enable row level security;
alter table public.ll_broadcast_targets enable row level security;
alter table public.ll_segments enable row level security;
alter table public.ll_segment_conditions enable row level security;
alter table public.ll_scheduled_messages enable row level security;
alter table public.ll_step_scenarios enable row level security;
alter table public.ll_step_messages enable row level security;
alter table public.ll_scenario_branches enable row level security;
alter table public.ll_message_logs enable row level security;
alter table public.ll_delivery_counts enable row level security;
alter table public.ll_click_events enable row level security;
alter table public.ll_staff_roles enable row level security;
alter table public.ll_permissions enable row level security;

-- ================================================================
-- HELPER FUNCTIONS
-- ================================================================

create or replace function public.ll_current_user_company_ids()
returns setof uuid
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return query
  select distinct company_id
  from public.ll_staff_roles
  where user_id = auth.uid()
    and status = 'active';

  if to_regclass('public.store_members') is not null then
    return query execute
      'select distinct store_id as company_id
       from public.store_members
       where user_id = auth.uid()
         and coalesce(status, ''active'') = ''active''';
  end if;
end;
$$;

create or replace function public.ll_current_user_role(p_company_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  resolved_role text;
begin
  select role into resolved_role
  from public.ll_staff_roles
  where company_id = p_company_id
    and user_id = auth.uid()
    and status = 'active'
  order by case role
    when 'owner' then 1
    when 'admin' then 2
    when 'staff' then 3
    when 'viewer' then 4
    else 9
  end
  limit 1;

  if resolved_role is not null then
    return resolved_role;
  end if;

  if to_regclass('public.store_members') is not null then
    execute
      'select case
         when role = ''implementer'' then ''admin''
         when role in (''owner'', ''admin'', ''staff'', ''viewer'') then role
         else ''viewer''
       end
       from public.store_members
       where store_id = $1
         and user_id = auth.uid()
         and coalesce(status, ''active'') = ''active''
       order by case role
         when ''owner'' then 1
         when ''admin'' then 2
         when ''implementer'' then 2
         when ''staff'' then 3
         when ''viewer'' then 4
         else 9
       end
       limit 1'
    into resolved_role
    using p_company_id;
  end if;

  return resolved_role;
end;
$$;

create or replace function public.ll_has_company_role(p_company_id uuid, p_roles text[])
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  allowed boolean;
begin
  select exists (
    select 1
    from public.ll_staff_roles
    where company_id = p_company_id
      and user_id = auth.uid()
      and status = 'active'
      and role = any(p_roles)
  )
  into allowed;

  if allowed then
    return true;
  end if;

  if to_regclass('public.store_members') is not null then
    execute
      'select exists (
         select 1
         from public.store_members
         where store_id = $1
           and user_id = auth.uid()
           and coalesce(status, ''active'') = ''active''
           and (
             case
               when role = ''implementer'' then ''admin''
               when role in (''owner'', ''admin'', ''staff'', ''viewer'') then role
               else ''viewer''
             end
           ) = any($2)
       )'
    into allowed
    using p_company_id, p_roles;
  end if;

  return coalesce(allowed, false);
end;
$$;

-- ================================================================
-- RLS POLICIES (ll_* tables bulk)
-- ================================================================

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'll_line_webhook_events',
    'll_line_friends',
    'll_friend_profiles',
    'll_friend_notes',
    'll_tags',
    'll_friend_tags',
    'll_inflow_routes',
    'll_inflow_events',
    'll_forms',
    'll_form_questions',
    'll_form_answers',
    'll_form_answer_items',
    'll_rich_menus',
    'll_rich_menu_areas',
    'll_broadcasts',
    'll_broadcast_targets',
    'll_segments',
    'll_segment_conditions',
    'll_scheduled_messages',
    'll_step_scenarios',
    'll_step_messages',
    'll_scenario_branches',
    'll_message_logs',
    'll_delivery_counts',
    'll_click_events'
  ]
  loop
    execute format('drop policy if exists %I on public.%I', table_name || '_select_company', table_name);
    execute format('drop policy if exists %I on public.%I', table_name || '_insert_staff', table_name);
    execute format('drop policy if exists %I on public.%I', table_name || '_update_staff', table_name);
    execute format('drop policy if exists %I on public.%I', table_name || '_delete_admin', table_name);

    execute format(
      'create policy %I on public.%I for select using (company_id in (select public.ll_current_user_company_ids()))',
      table_name || '_select_company',
      table_name
    );
    execute format(
      'create policy %I on public.%I for insert with check (public.ll_has_company_role(company_id, array[''owner'', ''admin'', ''staff'']))',
      table_name || '_insert_staff',
      table_name
    );
    execute format(
      'create policy %I on public.%I for update using (public.ll_has_company_role(company_id, array[''owner'', ''admin'', ''staff''])) with check (public.ll_has_company_role(company_id, array[''owner'', ''admin'', ''staff'']))',
      table_name || '_update_staff',
      table_name
    );
    execute format(
      'create policy %I on public.%I for delete using (public.ll_has_company_role(company_id, array[''owner'', ''admin'']))',
      table_name || '_delete_admin',
      table_name
    );
  end loop;
end $$;

-- stores policies
drop policy if exists ll_stores_select_member on public.stores;
drop policy if exists ll_stores_insert_authenticated on public.stores;
drop policy if exists ll_stores_update_admin on public.stores;
drop policy if exists ll_store_members_select_member on public.store_members;
drop policy if exists ll_store_members_insert_admin_or_self on public.store_members;
drop policy if exists ll_store_members_update_admin on public.store_members;
drop policy if exists ll_store_members_delete_owner on public.store_members;

create policy ll_stores_select_member
  on public.stores
  for select
  using (id in (select public.ll_current_user_company_ids()));

create policy ll_stores_insert_authenticated
  on public.stores
  for insert
  with check (auth.uid() is not null);

create policy ll_stores_update_admin
  on public.stores
  for update
  using (public.ll_has_company_role(id, array['owner', 'admin']))
  with check (public.ll_has_company_role(id, array['owner', 'admin']));

create policy ll_store_members_select_member
  on public.store_members
  for select
  using (store_id in (select public.ll_current_user_company_ids()));

create policy ll_store_members_insert_admin_or_self
  on public.store_members
  for insert
  with check (
    auth.uid() = user_id
    or public.ll_has_company_role(store_id, array['owner', 'admin'])
  );

create policy ll_store_members_update_admin
  on public.store_members
  for update
  using (public.ll_has_company_role(store_id, array['owner', 'admin']))
  with check (public.ll_has_company_role(store_id, array['owner', 'admin']));

create policy ll_store_members_delete_owner
  on public.store_members
  for delete
  using (public.ll_has_company_role(store_id, array['owner']));

-- ll_line_accounts policies
drop policy if exists ll_line_accounts_select_company on public.ll_line_accounts;
drop policy if exists ll_line_accounts_insert_admin on public.ll_line_accounts;
drop policy if exists ll_line_accounts_update_admin on public.ll_line_accounts;
drop policy if exists ll_line_accounts_delete_owner on public.ll_line_accounts;

create policy ll_line_accounts_select_company
  on public.ll_line_accounts
  for select
  using (company_id in (select public.ll_current_user_company_ids()));

create policy ll_line_accounts_insert_admin
  on public.ll_line_accounts
  for insert
  with check (public.ll_has_company_role(company_id, array['owner', 'admin', 'staff']));

create policy ll_line_accounts_update_admin
  on public.ll_line_accounts
  for update
  using (public.ll_has_company_role(company_id, array['owner', 'admin', 'staff']))
  with check (public.ll_has_company_role(company_id, array['owner', 'admin', 'staff']));

create policy ll_line_accounts_delete_owner
  on public.ll_line_accounts
  for delete
  using (public.ll_has_company_role(company_id, array['owner']));

-- ll_staff_roles policies
drop policy if exists ll_staff_roles_select_company on public.ll_staff_roles;
drop policy if exists ll_staff_roles_insert_admin on public.ll_staff_roles;
drop policy if exists ll_staff_roles_update_admin on public.ll_staff_roles;
drop policy if exists ll_staff_roles_delete_owner on public.ll_staff_roles;

create policy ll_staff_roles_select_company
  on public.ll_staff_roles
  for select
  using (company_id in (select public.ll_current_user_company_ids()));

create policy ll_staff_roles_insert_admin
  on public.ll_staff_roles
  for insert
  with check (public.ll_has_company_role(company_id, array['owner', 'admin']));

create policy ll_staff_roles_update_admin
  on public.ll_staff_roles
  for update
  using (public.ll_has_company_role(company_id, array['owner', 'admin']))
  with check (public.ll_has_company_role(company_id, array['owner', 'admin']));

create policy ll_staff_roles_delete_owner
  on public.ll_staff_roles
  for delete
  using (public.ll_has_company_role(company_id, array['owner']));

-- ll_permissions policies
drop policy if exists ll_permissions_select_company on public.ll_permissions;
drop policy if exists ll_permissions_insert_admin on public.ll_permissions;
drop policy if exists ll_permissions_update_admin on public.ll_permissions;
drop policy if exists ll_permissions_delete_owner on public.ll_permissions;

create policy ll_permissions_select_company
  on public.ll_permissions
  for select
  using (company_id in (select public.ll_current_user_company_ids()));

create policy ll_permissions_insert_admin
  on public.ll_permissions
  for insert
  with check (public.ll_has_company_role(company_id, array['owner', 'admin']));

create policy ll_permissions_update_admin
  on public.ll_permissions
  for update
  using (public.ll_has_company_role(company_id, array['owner', 'admin']))
  with check (public.ll_has_company_role(company_id, array['owner', 'admin']));

create policy ll_permissions_delete_owner
  on public.ll_permissions
  for delete
  using (public.ll_has_company_role(company_id, array['owner']));

-- ================================================================
-- GRANTS
-- 初期設定のserver actionはservice roleで stores / store_members / ll_staff_roles を作成します。
-- service role keyはサーバー側のみで使用し、ブラウザには出しません。
-- ================================================================

grant select, insert, update on table public.stores to service_role;
grant select, insert, update on table public.store_members to service_role;
grant select, insert, update on table public.ll_line_accounts to service_role;
grant select, insert, update on table public.ll_line_webhook_events to service_role;
grant select, insert, update on table public.ll_line_friends to service_role;
grant select, insert, update on table public.ll_friend_profiles to service_role;
grant select, insert, update, delete on table public.ll_friend_notes to service_role;
grant select, insert, update on table public.ll_message_logs to service_role;
grant select, insert, update, delete on table public.ll_tags to service_role;
grant select, insert, update, delete on table public.ll_friend_tags to service_role;
grant select, insert, update, delete on table public.ll_forms to service_role;
grant select, insert, update, delete on table public.ll_form_questions to service_role;
grant select, insert, update, delete on table public.ll_form_answers to service_role;
grant select, insert, update, delete on table public.ll_form_answer_items to service_role;
grant select, insert, update, delete on table public.ll_rich_menus to service_role;
grant select, insert, update, delete on table public.ll_rich_menu_areas to service_role;
grant select, insert, update, delete on table public.ll_segments to service_role;
grant select, insert, update, delete on table public.ll_segment_conditions to service_role;
grant select, insert, update, delete on table public.ll_broadcasts to service_role;
grant select, insert, update, delete on table public.ll_broadcast_targets to service_role;
grant select, insert, update on table public.ll_staff_roles to service_role;
grant select, insert, update on table public.ll_permissions to service_role;
grant usage, select on all sequences in schema public to service_role;
