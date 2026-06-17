-- GARAGE LINK LINE管理機能パック
-- タグ、テンプレート、一斉配信、ステップ配信、フォーム、リッチメニュー、自動応答、流入経路を追加します。
-- 既存データは削除しないため、開発中に再実行しやすいSQLです。

create extension if not exists "pgcrypto";

-- updated_atを自動更新する共通関数です。
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- LINE友だちに付与するタグを管理します。
create table if not exists public.line_tags (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  name text not null,
  color text default '#2563eb',
  description text,
  tag_type text default 'manual',
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(store_id, name)
);

-- よく使うLINEメッセージ文を管理します。
create table if not exists public.line_templates (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  name text not null,
  template_type text default 'text',
  category text,
  body text not null,
  variables text[],
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 一斉配信の下書き、予約、送信状態を管理します。
create table if not exists public.line_campaigns (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  title text not null,
  message_type text default 'text',
  body text not null,
  target_type text default 'all',
  target_tags text[],
  exclude_tags text[],
  status text default 'draft',
  scheduled_at timestamptz,
  sent_at timestamptz,
  created_by text,
  target_count integer default 0,
  sent_count integer default 0,
  failed_count integer default 0,
  internal_memo text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 一斉配信ごとの送信対象者を保存します。
create table if not exists public.line_campaign_targets (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  campaign_id uuid not null references public.line_campaigns(id) on delete cascade,
  line_friend_id uuid references public.line_friends(id) on delete set null,
  customer_id uuid references public.customers(id) on delete set null,
  line_user_id text,
  line_display_name text,
  send_status text default 'pending',
  sent_at timestamptz,
  error_message text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- シナリオ配信本体を管理します。
create table if not exists public.line_steps (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  name text not null,
  description text,
  trigger_type text default 'manual',
  status text default 'draft',
  start_condition jsonb,
  stop_condition jsonb,
  is_active boolean default false,
  internal_memo text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- シナリオ内の各配信メッセージを管理します。
create table if not exists public.line_step_messages (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  step_id uuid not null references public.line_steps(id) on delete cascade,
  message_order integer default 0,
  delay_amount integer default 0,
  delay_unit text default 'days',
  title text,
  body text not null,
  message_type text default 'text',
  action_type text,
  action_payload jsonb,
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 回答フォーム本体を管理します。
create table if not exists public.line_forms (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  name text not null,
  description text,
  form_type text default 'general',
  status text default 'draft',
  public_slug text,
  thanks_message text,
  submit_button_label text default '送信する',
  completion_action text,
  linked_tags text[],
  internal_memo text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(store_id, public_slug)
);

-- フォームの質問項目を管理します。
create table if not exists public.line_form_questions (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  form_id uuid not null references public.line_forms(id) on delete cascade,
  question_order integer default 0,
  label text not null,
  field_type text default 'text',
  required boolean default false,
  options jsonb,
  placeholder text,
  help_text text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- フォーム回答を保存します。
create table if not exists public.line_form_responses (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  form_id uuid references public.line_forms(id) on delete set null,
  customer_id uuid references public.customers(id) on delete set null,
  line_friend_id uuid references public.line_friends(id) on delete set null,
  line_user_id text,
  answers jsonb not null,
  submitted_at timestamptz default now(),
  source_route text,
  internal_memo text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- LINEリッチメニュー設定を管理します。
create table if not exists public.line_rich_menus (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  name text not null,
  status text default 'draft',
  image_path text,
  line_rich_menu_id text,
  chat_bar_text text default 'メニュー',
  selected boolean default false,
  layout_type text default 'large',
  areas jsonb,
  internal_memo text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- キーワード自動応答を管理します。
create table if not exists public.line_auto_replies (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  name text not null,
  trigger_keyword text,
  match_type text default 'contains',
  response_body text not null,
  priority integer default 0,
  is_active boolean default true,
  internal_memo text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- LINE登録や問い合わせの流入経路を管理します。
create table if not exists public.line_routes (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  name text not null,
  route_code text not null,
  route_type text default 'qr',
  description text,
  landing_url text,
  qr_image_path text,
  linked_tags text[],
  linked_step_id uuid references public.line_steps(id) on delete set null,
  friend_count integer default 0,
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(store_id, route_code)
);

-- 検索・集計を速くするためのindexです。
create index if not exists line_tags_store_id_idx on public.line_tags(store_id);
create index if not exists line_templates_store_id_idx on public.line_templates(store_id);
create index if not exists line_campaigns_store_id_idx on public.line_campaigns(store_id);
create index if not exists line_campaigns_status_idx on public.line_campaigns(status);
create index if not exists line_campaign_targets_store_id_idx on public.line_campaign_targets(store_id);
create index if not exists line_campaign_targets_campaign_id_idx on public.line_campaign_targets(campaign_id);
create index if not exists line_steps_store_id_idx on public.line_steps(store_id);
create index if not exists line_step_messages_store_id_idx on public.line_step_messages(store_id);
create index if not exists line_step_messages_step_id_idx on public.line_step_messages(step_id);
create index if not exists line_forms_store_id_idx on public.line_forms(store_id);
create index if not exists line_forms_public_slug_idx on public.line_forms(public_slug);
create index if not exists line_form_questions_store_id_idx on public.line_form_questions(store_id);
create index if not exists line_form_questions_form_id_idx on public.line_form_questions(form_id);
create index if not exists line_form_responses_store_id_idx on public.line_form_responses(store_id);
create index if not exists line_form_responses_form_id_idx on public.line_form_responses(form_id);
create index if not exists line_rich_menus_store_id_idx on public.line_rich_menus(store_id);
create index if not exists line_auto_replies_store_id_idx on public.line_auto_replies(store_id);
create index if not exists line_routes_store_id_idx on public.line_routes(store_id);
create index if not exists line_routes_route_code_idx on public.line_routes(route_code);

-- updated_at triggerを設定します。
drop trigger if exists set_line_tags_updated_at on public.line_tags;
create trigger set_line_tags_updated_at before update on public.line_tags for each row execute function public.set_updated_at();

drop trigger if exists set_line_templates_updated_at on public.line_templates;
create trigger set_line_templates_updated_at before update on public.line_templates for each row execute function public.set_updated_at();

drop trigger if exists set_line_campaigns_updated_at on public.line_campaigns;
create trigger set_line_campaigns_updated_at before update on public.line_campaigns for each row execute function public.set_updated_at();

drop trigger if exists set_line_campaign_targets_updated_at on public.line_campaign_targets;
create trigger set_line_campaign_targets_updated_at before update on public.line_campaign_targets for each row execute function public.set_updated_at();

drop trigger if exists set_line_steps_updated_at on public.line_steps;
create trigger set_line_steps_updated_at before update on public.line_steps for each row execute function public.set_updated_at();

drop trigger if exists set_line_step_messages_updated_at on public.line_step_messages;
create trigger set_line_step_messages_updated_at before update on public.line_step_messages for each row execute function public.set_updated_at();

drop trigger if exists set_line_forms_updated_at on public.line_forms;
create trigger set_line_forms_updated_at before update on public.line_forms for each row execute function public.set_updated_at();

drop trigger if exists set_line_form_questions_updated_at on public.line_form_questions;
create trigger set_line_form_questions_updated_at before update on public.line_form_questions for each row execute function public.set_updated_at();

drop trigger if exists set_line_form_responses_updated_at on public.line_form_responses;
create trigger set_line_form_responses_updated_at before update on public.line_form_responses for each row execute function public.set_updated_at();

drop trigger if exists set_line_rich_menus_updated_at on public.line_rich_menus;
create trigger set_line_rich_menus_updated_at before update on public.line_rich_menus for each row execute function public.set_updated_at();

drop trigger if exists set_line_auto_replies_updated_at on public.line_auto_replies;
create trigger set_line_auto_replies_updated_at before update on public.line_auto_replies for each row execute function public.set_updated_at();

drop trigger if exists set_line_routes_updated_at on public.line_routes;
create trigger set_line_routes_updated_at before update on public.line_routes for each row execute function public.set_updated_at();

-- RLSを有効化します。
alter table public.line_tags enable row level security;
alter table public.line_templates enable row level security;
alter table public.line_campaigns enable row level security;
alter table public.line_campaign_targets enable row level security;
alter table public.line_steps enable row level security;
alter table public.line_step_messages enable row level security;
alter table public.line_forms enable row level security;
alter table public.line_form_questions enable row level security;
alter table public.line_form_responses enable row level security;
alter table public.line_rich_menus enable row level security;
alter table public.line_auto_replies enable row level security;
alter table public.line_routes enable row level security;

-- 所属店舗のデータだけ操作できるpolicyをまとめて作成します。
drop policy if exists "line_tags_select_own_store" on public.line_tags;
create policy "line_tags_select_own_store" on public.line_tags for select using (store_id in (select public.current_user_store_ids()));
drop policy if exists "line_tags_insert_own_store" on public.line_tags;
create policy "line_tags_insert_own_store" on public.line_tags for insert with check (store_id in (select public.current_user_store_ids()));
drop policy if exists "line_tags_update_own_store" on public.line_tags;
create policy "line_tags_update_own_store" on public.line_tags for update using (store_id in (select public.current_user_store_ids())) with check (store_id in (select public.current_user_store_ids()));
drop policy if exists "line_tags_delete_own_store" on public.line_tags;
create policy "line_tags_delete_own_store" on public.line_tags for delete using (store_id in (select public.current_user_store_ids()));

drop policy if exists "line_templates_select_own_store" on public.line_templates;
create policy "line_templates_select_own_store" on public.line_templates for select using (store_id in (select public.current_user_store_ids()));
drop policy if exists "line_templates_insert_own_store" on public.line_templates;
create policy "line_templates_insert_own_store" on public.line_templates for insert with check (store_id in (select public.current_user_store_ids()));
drop policy if exists "line_templates_update_own_store" on public.line_templates;
create policy "line_templates_update_own_store" on public.line_templates for update using (store_id in (select public.current_user_store_ids())) with check (store_id in (select public.current_user_store_ids()));
drop policy if exists "line_templates_delete_own_store" on public.line_templates;
create policy "line_templates_delete_own_store" on public.line_templates for delete using (store_id in (select public.current_user_store_ids()));

drop policy if exists "line_campaigns_select_own_store" on public.line_campaigns;
create policy "line_campaigns_select_own_store" on public.line_campaigns for select using (store_id in (select public.current_user_store_ids()));
drop policy if exists "line_campaigns_insert_own_store" on public.line_campaigns;
create policy "line_campaigns_insert_own_store" on public.line_campaigns for insert with check (store_id in (select public.current_user_store_ids()));
drop policy if exists "line_campaigns_update_own_store" on public.line_campaigns;
create policy "line_campaigns_update_own_store" on public.line_campaigns for update using (store_id in (select public.current_user_store_ids())) with check (store_id in (select public.current_user_store_ids()));
drop policy if exists "line_campaigns_delete_own_store" on public.line_campaigns;
create policy "line_campaigns_delete_own_store" on public.line_campaigns for delete using (store_id in (select public.current_user_store_ids()));

drop policy if exists "line_campaign_targets_select_own_store" on public.line_campaign_targets;
create policy "line_campaign_targets_select_own_store" on public.line_campaign_targets for select using (store_id in (select public.current_user_store_ids()));
drop policy if exists "line_campaign_targets_insert_own_store" on public.line_campaign_targets;
create policy "line_campaign_targets_insert_own_store" on public.line_campaign_targets for insert with check (store_id in (select public.current_user_store_ids()));
drop policy if exists "line_campaign_targets_update_own_store" on public.line_campaign_targets;
create policy "line_campaign_targets_update_own_store" on public.line_campaign_targets for update using (store_id in (select public.current_user_store_ids())) with check (store_id in (select public.current_user_store_ids()));
drop policy if exists "line_campaign_targets_delete_own_store" on public.line_campaign_targets;
create policy "line_campaign_targets_delete_own_store" on public.line_campaign_targets for delete using (store_id in (select public.current_user_store_ids()));

drop policy if exists "line_steps_select_own_store" on public.line_steps;
create policy "line_steps_select_own_store" on public.line_steps for select using (store_id in (select public.current_user_store_ids()));
drop policy if exists "line_steps_insert_own_store" on public.line_steps;
create policy "line_steps_insert_own_store" on public.line_steps for insert with check (store_id in (select public.current_user_store_ids()));
drop policy if exists "line_steps_update_own_store" on public.line_steps;
create policy "line_steps_update_own_store" on public.line_steps for update using (store_id in (select public.current_user_store_ids())) with check (store_id in (select public.current_user_store_ids()));
drop policy if exists "line_steps_delete_own_store" on public.line_steps;
create policy "line_steps_delete_own_store" on public.line_steps for delete using (store_id in (select public.current_user_store_ids()));

drop policy if exists "line_step_messages_select_own_store" on public.line_step_messages;
create policy "line_step_messages_select_own_store" on public.line_step_messages for select using (store_id in (select public.current_user_store_ids()));
drop policy if exists "line_step_messages_insert_own_store" on public.line_step_messages;
create policy "line_step_messages_insert_own_store" on public.line_step_messages for insert with check (store_id in (select public.current_user_store_ids()));
drop policy if exists "line_step_messages_update_own_store" on public.line_step_messages;
create policy "line_step_messages_update_own_store" on public.line_step_messages for update using (store_id in (select public.current_user_store_ids())) with check (store_id in (select public.current_user_store_ids()));
drop policy if exists "line_step_messages_delete_own_store" on public.line_step_messages;
create policy "line_step_messages_delete_own_store" on public.line_step_messages for delete using (store_id in (select public.current_user_store_ids()));

drop policy if exists "line_forms_select_own_store" on public.line_forms;
create policy "line_forms_select_own_store" on public.line_forms for select using (store_id in (select public.current_user_store_ids()));
drop policy if exists "line_forms_insert_own_store" on public.line_forms;
create policy "line_forms_insert_own_store" on public.line_forms for insert with check (store_id in (select public.current_user_store_ids()));
drop policy if exists "line_forms_update_own_store" on public.line_forms;
create policy "line_forms_update_own_store" on public.line_forms for update using (store_id in (select public.current_user_store_ids())) with check (store_id in (select public.current_user_store_ids()));
drop policy if exists "line_forms_delete_own_store" on public.line_forms;
create policy "line_forms_delete_own_store" on public.line_forms for delete using (store_id in (select public.current_user_store_ids()));

drop policy if exists "line_form_questions_select_own_store" on public.line_form_questions;
create policy "line_form_questions_select_own_store" on public.line_form_questions for select using (store_id in (select public.current_user_store_ids()));
drop policy if exists "line_form_questions_insert_own_store" on public.line_form_questions;
create policy "line_form_questions_insert_own_store" on public.line_form_questions for insert with check (store_id in (select public.current_user_store_ids()));
drop policy if exists "line_form_questions_update_own_store" on public.line_form_questions;
create policy "line_form_questions_update_own_store" on public.line_form_questions for update using (store_id in (select public.current_user_store_ids())) with check (store_id in (select public.current_user_store_ids()));
drop policy if exists "line_form_questions_delete_own_store" on public.line_form_questions;
create policy "line_form_questions_delete_own_store" on public.line_form_questions for delete using (store_id in (select public.current_user_store_ids()));

drop policy if exists "line_form_responses_select_own_store" on public.line_form_responses;
create policy "line_form_responses_select_own_store" on public.line_form_responses for select using (store_id in (select public.current_user_store_ids()));
drop policy if exists "line_form_responses_insert_own_store" on public.line_form_responses;
create policy "line_form_responses_insert_own_store" on public.line_form_responses for insert with check (store_id in (select public.current_user_store_ids()));
drop policy if exists "line_form_responses_update_own_store" on public.line_form_responses;
create policy "line_form_responses_update_own_store" on public.line_form_responses for update using (store_id in (select public.current_user_store_ids())) with check (store_id in (select public.current_user_store_ids()));
drop policy if exists "line_form_responses_delete_own_store" on public.line_form_responses;
create policy "line_form_responses_delete_own_store" on public.line_form_responses for delete using (store_id in (select public.current_user_store_ids()));

drop policy if exists "line_rich_menus_select_own_store" on public.line_rich_menus;
create policy "line_rich_menus_select_own_store" on public.line_rich_menus for select using (store_id in (select public.current_user_store_ids()));
drop policy if exists "line_rich_menus_insert_own_store" on public.line_rich_menus;
create policy "line_rich_menus_insert_own_store" on public.line_rich_menus for insert with check (store_id in (select public.current_user_store_ids()));
drop policy if exists "line_rich_menus_update_own_store" on public.line_rich_menus;
create policy "line_rich_menus_update_own_store" on public.line_rich_menus for update using (store_id in (select public.current_user_store_ids())) with check (store_id in (select public.current_user_store_ids()));
drop policy if exists "line_rich_menus_delete_own_store" on public.line_rich_menus;
create policy "line_rich_menus_delete_own_store" on public.line_rich_menus for delete using (store_id in (select public.current_user_store_ids()));

drop policy if exists "line_auto_replies_select_own_store" on public.line_auto_replies;
create policy "line_auto_replies_select_own_store" on public.line_auto_replies for select using (store_id in (select public.current_user_store_ids()));
drop policy if exists "line_auto_replies_insert_own_store" on public.line_auto_replies;
create policy "line_auto_replies_insert_own_store" on public.line_auto_replies for insert with check (store_id in (select public.current_user_store_ids()));
drop policy if exists "line_auto_replies_update_own_store" on public.line_auto_replies;
create policy "line_auto_replies_update_own_store" on public.line_auto_replies for update using (store_id in (select public.current_user_store_ids())) with check (store_id in (select public.current_user_store_ids()));
drop policy if exists "line_auto_replies_delete_own_store" on public.line_auto_replies;
create policy "line_auto_replies_delete_own_store" on public.line_auto_replies for delete using (store_id in (select public.current_user_store_ids()));

drop policy if exists "line_routes_select_own_store" on public.line_routes;
create policy "line_routes_select_own_store" on public.line_routes for select using (store_id in (select public.current_user_store_ids()));
drop policy if exists "line_routes_insert_own_store" on public.line_routes;
create policy "line_routes_insert_own_store" on public.line_routes for insert with check (store_id in (select public.current_user_store_ids()));
drop policy if exists "line_routes_update_own_store" on public.line_routes;
create policy "line_routes_update_own_store" on public.line_routes for update using (store_id in (select public.current_user_store_ids())) with check (store_id in (select public.current_user_store_ids()));
drop policy if exists "line_routes_delete_own_store" on public.line_routes;
create policy "line_routes_delete_own_store" on public.line_routes for delete using (store_id in (select public.current_user_store_ids()));

grant select, insert, update, delete on public.line_tags to authenticated;
grant select, insert, update, delete on public.line_templates to authenticated;
grant select, insert, update, delete on public.line_campaigns to authenticated;
grant select, insert, update, delete on public.line_campaign_targets to authenticated;
grant select, insert, update, delete on public.line_steps to authenticated;
grant select, insert, update, delete on public.line_step_messages to authenticated;
grant select, insert, update, delete on public.line_forms to authenticated;
grant select, insert, update, delete on public.line_form_questions to authenticated;
grant select, insert, update, delete on public.line_form_responses to authenticated;
grant select, insert, update, delete on public.line_rich_menus to authenticated;
grant select, insert, update, delete on public.line_auto_replies to authenticated;
grant select, insert, update, delete on public.line_routes to authenticated;

-- 確認用:
-- select * from public.line_tags;
-- select * from public.line_templates;
-- select * from public.line_campaigns;
-- select * from public.line_steps;
-- select * from public.line_forms;
-- select * from public.line_rich_menus;
-- select * from public.line_auto_replies;
-- select * from public.line_routes;
