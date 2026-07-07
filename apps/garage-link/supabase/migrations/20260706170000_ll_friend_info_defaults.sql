-- L-LINK 友だち情報フォルダ・項目のデフォルト seed

create table if not exists public.ll_friend_info_folders (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  name text not null,
  sort_order integer not null default 0,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ll_friend_info_folders_company_name_key unique (company_id, name)
);

create table if not exists public.ll_friend_info_fields (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  folder_id uuid not null references public.ll_friend_info_folders(id) on delete cascade,
  name text not null,
  field_type text not null default 'text',
  system_key text,
  sort_order integer not null default 0,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ll_friend_info_fields_type_check check (field_type in ('text', 'date', 'number')),
  constraint ll_friend_info_fields_company_folder_name_key unique (company_id, folder_id, name)
);

create index if not exists ll_friend_info_folders_company_idx on public.ll_friend_info_folders(company_id, sort_order);
create index if not exists ll_friend_info_fields_company_folder_idx on public.ll_friend_info_fields(company_id, folder_id, sort_order);

create table if not exists public.ll_friend_info_values (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  line_friend_id uuid not null references public.ll_line_friends(id) on delete cascade,
  field_id uuid not null references public.ll_friend_info_fields(id) on delete cascade,
  value_text text,
  value_number numeric,
  value_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ll_friend_info_values_friend_field_key unique (line_friend_id, field_id)
);

create index if not exists ll_friend_info_values_company_field_idx
  on public.ll_friend_info_values(company_id, field_id);

comment on table public.ll_friend_info_folders is '友だち情報のフォルダ（基本情報・分析など）';
comment on table public.ll_friend_info_fields is '友だち情報項目定義。system_key がある項目は LINE/プロフィールから自動反映';
comment on table public.ll_friend_info_values is 'カスタム友だち情報の保存値（スコアリング等）';

create or replace function public.seed_llink_default_friend_schema(p_company_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_basic_folder_id uuid;
  v_analysis_folder_id uuid;
begin
  if p_company_id is null then
    return;
  end if;

  if exists (
    select 1 from public.ll_friend_info_folders f where f.company_id = p_company_id
  ) then
    return;
  end if;

  insert into public.ll_friend_info_folders (company_id, name, sort_order, is_default)
  values (p_company_id, '基本情報', 1, true)
  returning id into v_basic_folder_id;

  insert into public.ll_friend_info_folders (company_id, name, sort_order, is_default)
  values (p_company_id, '分析', 2, true)
  returning id into v_analysis_folder_id;

  insert into public.ll_friend_info_fields (company_id, folder_id, name, field_type, system_key, sort_order, is_default)
  values
    (p_company_id, v_basic_folder_id, 'システム表示名', 'text', 'system_display_name', 1, true),
    (p_company_id, v_basic_folder_id, '携帯電話', 'text', 'mobile_phone', 2, true),
    (p_company_id, v_basic_folder_id, 'メールアドレス', 'text', 'email', 3, true),
    (p_company_id, v_basic_folder_id, '生年月日', 'date', 'birth_date', 4, true),
    (p_company_id, v_analysis_folder_id, '最終反応日', 'date', 'last_reaction_date', 1, true),
    (p_company_id, v_analysis_folder_id, 'スコアリング', 'number', 'scoring', 2, true),
    (p_company_id, v_analysis_folder_id, 'A/Bテスト用乱数', 'number', 'ab_test_random', 3, true),
    (p_company_id, v_analysis_folder_id, '友だち追加日（最新）', 'date', 'friend_added_latest', 4, true),
    (p_company_id, v_analysis_folder_id, '友だち追加日（最初）', 'date', 'friend_added_first', 5, true);
end;
$$;

-- 新規会社作成時に seed
create or replace function public.create_llink_company_for_current_user(
  company_name text,
  contact_name text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_company_id uuid;
  v_email text;
begin
  if v_user_id is null then
    raise exception 'ログインが必要です。';
  end if;

  if exists (
    select 1 from public.ll_staff_roles r
    where r.user_id = v_user_id and r.status = 'active'
  ) then
    raise exception '既に L-LINK の会社が登録されています。';
  end if;

  if company_name is null or btrim(company_name) = '' then
    raise exception '会社名を入力してください。';
  end if;

  select u.email into v_email from auth.users u where u.id = v_user_id;

  insert into public.stores (name, email, plan_code, status)
  values (btrim(company_name), v_email, 'free', 'active')
  returning id into v_company_id;

  insert into public.store_members (store_id, user_id, role, display_name, email, status)
  values (
    v_company_id,
    v_user_id,
    'owner',
    nullif(btrim(contact_name), ''),
    v_email,
    'active'
  );

  insert into public.ll_staff_roles (company_id, user_id, role, status)
  values (v_company_id, v_user_id, 'owner', 'active');

  insert into public.ll_subscriptions (company_id, plan, status)
  values (v_company_id, 'free', 'active');

  perform public.seed_llink_default_friend_schema(v_company_id);

  return v_company_id;
end;
$$;

-- 既存会社への backfill
do $$
declare
  v_company record;
begin
  for v_company in
    select distinct r.company_id
    from public.ll_staff_roles r
    where r.status = 'active'
  loop
    perform public.seed_llink_default_friend_schema(v_company.company_id);
  end loop;
end;
$$;

alter table public.ll_friend_info_folders enable row level security;
alter table public.ll_friend_info_fields enable row level security;
alter table public.ll_friend_info_values enable row level security;

drop policy if exists ll_friend_info_folders_select_company on public.ll_friend_info_folders;
create policy ll_friend_info_folders_select_company
  on public.ll_friend_info_folders
  for select
  using (company_id in (select public.ll_current_user_company_ids()));

drop policy if exists ll_friend_info_fields_select_company on public.ll_friend_info_fields;
create policy ll_friend_info_fields_select_company
  on public.ll_friend_info_fields
  for select
  using (company_id in (select public.ll_current_user_company_ids()));

drop policy if exists ll_friend_info_values_select_company on public.ll_friend_info_values;
create policy ll_friend_info_values_select_company
  on public.ll_friend_info_values
  for select
  using (company_id in (select public.ll_current_user_company_ids()));

grant select on table public.ll_friend_info_folders to authenticated;
grant select on table public.ll_friend_info_fields to authenticated;
grant select on table public.ll_friend_info_values to authenticated;

grant select, insert, update, delete on table public.ll_friend_info_folders to service_role;
grant select, insert, update, delete on table public.ll_friend_info_fields to service_role;
grant select, insert, update, delete on table public.ll_friend_info_values to service_role;

grant execute on function public.seed_llink_default_friend_schema(uuid) to service_role;
