-- GARAGE LINK signup onboarding
-- セルフサインアップ時の店舗作成RPCと初回オンボーディング用カラム

alter table public.stores add column if not exists onboarding_completed_at timestamptz;

comment on column public.stores.onboarding_completed_at is '初回オンボーディングウィザード完了日時。NULLの間は/onboardingへ誘導';

create or replace function public.create_store_for_current_user(
  store_name text,
  owner_display_name text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_store_id uuid;
  v_email text;
begin
  if v_user_id is null then
    raise exception 'ログインが必要です。';
  end if;

  if exists (
    select 1
    from public.store_members sm
    where sm.user_id = v_user_id
  ) then
    raise exception '既に店舗が登録されています。';
  end if;

  if store_name is null or btrim(store_name) = '' then
    raise exception '店舗名を入力してください。';
  end if;

  select u.email
    into v_email
    from auth.users u
   where u.id = v_user_id;

  insert into public.stores (
    name,
    company_name,
    email,
    plan_code,
    status
  )
  values (
    btrim(store_name),
    btrim(store_name),
    v_email,
    'free',
    'active'
  )
  returning id into v_store_id;

  insert into public.store_members (
    store_id,
    user_id,
    role,
    display_name,
    email
  )
  values (
    v_store_id,
    v_user_id,
    'owner',
    nullif(btrim(owner_display_name), ''),
    v_email
  );

  insert into public.company_subscriptions (
    company_id,
    plan,
    status,
    included_staff_count,
    extra_staff_count,
    included_store_count,
    extra_store_count,
    storage_limit_mb,
    extra_storage_gb,
    current_inventory_limit,
    l_link_integration_enabled
  )
  values (
    v_store_id,
    'free',
    'active',
    1,
    0,
    1,
    0,
    500,
    0,
    5,
    false
  );

  return v_store_id;
end;
$$;

grant execute on function public.create_store_for_current_user(text, text) to authenticated;

comment on function public.create_store_for_current_user(text, text) is
  '新規サインアップ直後に店舗・ownerメンバー・Free契約を一括作成する';
