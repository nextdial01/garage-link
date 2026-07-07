-- L-LINK 契約・Stripe・サインアップ RPC

create table if not exists public.ll_subscriptions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  plan text not null default 'free',
  status text not null default 'active',
  stripe_customer_id text,
  stripe_subscription_id text,
  cancelled_at timestamptz,
  data_delete_scheduled_at timestamptz,
  data_deleted_at timestamptz,
  started_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ll_subscriptions_plan_check check (plan in ('free', 'basic', 'auto')),
  constraint ll_subscriptions_status_check check (status in ('active', 'trialing', 'past_due', 'cancelled', 'suspended'))
);

comment on table public.ll_subscriptions is 'L-LINK 契約プラン。company_id は stores.id';

create unique index if not exists idx_ll_subscriptions_company_active
  on public.ll_subscriptions(company_id)
  where status in ('active', 'trialing', 'past_due');

create index if not exists idx_ll_subscriptions_company_id on public.ll_subscriptions(company_id);
create index if not exists idx_ll_subscriptions_stripe_customer
  on public.ll_subscriptions(stripe_customer_id)
  where stripe_customer_id is not null;
create index if not exists idx_ll_subscriptions_stripe_subscription
  on public.ll_subscriptions(stripe_subscription_id)
  where stripe_subscription_id is not null;

alter table public.stores add column if not exists l_link_onboarding_completed_at timestamptz;

comment on column public.stores.l_link_onboarding_completed_at is 'L-LINK 初回オンボーディング完了日時';

create or replace function public.get_ll_subscription(p_company_id uuid)
returns public.ll_subscriptions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_subscription public.ll_subscriptions%rowtype;
begin
  select *
    into v_subscription
    from public.ll_subscriptions ls
   where ls.company_id = p_company_id
     and ls.status in ('active', 'trialing', 'past_due')
   order by ls.updated_at desc
   limit 1;

  if found then
    return v_subscription;
  end if;

  select *
    into v_subscription
    from public.ll_subscriptions ls
   where ls.company_id = p_company_id
   order by ls.updated_at desc
   limit 1;

  return v_subscription;
end;
$$;

create or replace function public.ensure_ll_subscription(p_company_id uuid)
returns public.ll_subscriptions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_subscription public.ll_subscriptions%rowtype;
begin
  v_subscription := public.get_ll_subscription(p_company_id);

  if v_subscription.id is not null then
    return v_subscription;
  end if;

  insert into public.ll_subscriptions (company_id, plan, status)
  values (p_company_id, 'free', 'active')
  returning * into v_subscription;

  return v_subscription;
end;
$$;

create or replace function public.mark_ll_subscription_cancelled(p_company_id uuid)
returns public.ll_subscriptions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_subscription public.ll_subscriptions%rowtype;
begin
  update public.ll_subscriptions ls
     set status = 'cancelled',
         cancelled_at = coalesce(ls.cancelled_at, now()),
         data_delete_scheduled_at = coalesce(ls.data_delete_scheduled_at, now() + interval '1 year'),
         updated_at = now()
   where ls.company_id = p_company_id
     and ls.status in ('active', 'trialing', 'past_due')
  returning * into v_subscription;

  if not found then
    select * into v_subscription from public.ll_subscriptions ls where ls.company_id = p_company_id order by ls.updated_at desc limit 1;
  end if;

  return v_subscription;
end;
$$;

create or replace function public.reactivate_ll_subscription(p_company_id uuid)
returns public.ll_subscriptions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_subscription public.ll_subscriptions%rowtype;
begin
  update public.ll_subscriptions ls
     set cancelled_at = null,
         data_delete_scheduled_at = null,
         data_deleted_at = null,
         updated_at = now()
   where ls.company_id = p_company_id
  returning * into v_subscription;

  return v_subscription;
end;
$$;

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

  return v_company_id;
end;
$$;

alter table public.ll_subscriptions enable row level security;

drop policy if exists ll_subscriptions_select_company on public.ll_subscriptions;
create policy ll_subscriptions_select_company
  on public.ll_subscriptions
  for select
  using (company_id in (select public.ll_current_user_company_ids()));

grant select on table public.ll_subscriptions to authenticated;
grant all on table public.ll_subscriptions to service_role;

grant execute on function public.get_ll_subscription(uuid) to authenticated, service_role;
grant execute on function public.ensure_ll_subscription(uuid) to authenticated, service_role;
grant execute on function public.mark_ll_subscription_cancelled(uuid) to service_role;
grant execute on function public.reactivate_ll_subscription(uuid) to service_role;
grant execute on function public.create_llink_company_for_current_user(text, text) to authenticated;

create or replace function public.complete_llink_onboarding()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_company_id uuid;
begin
  if v_user_id is null then
    raise exception 'ログインが必要です。';
  end if;

  select r.company_id
    into v_company_id
    from public.ll_staff_roles r
   where r.user_id = v_user_id
     and r.status = 'active'
   order by r.created_at asc
   limit 1;

  if v_company_id is null then
    raise exception '会社情報が見つかりません。';
  end if;

  update public.stores
     set l_link_onboarding_completed_at = coalesce(l_link_onboarding_completed_at, now()),
         updated_at = now()
   where id = v_company_id;
end;
$$;

grant execute on function public.complete_llink_onboarding() to authenticated;
