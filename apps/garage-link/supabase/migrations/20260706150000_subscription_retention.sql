-- 解約後データ保有（1年）・再契約のみ（Free 復活なし）

alter table public.company_subscriptions
  add column if not exists cancelled_at timestamptz,
  add column if not exists data_delete_scheduled_at timestamptz,
  add column if not exists data_deleted_at timestamptz;

comment on column public.company_subscriptions.cancelled_at is '有料契約終了日時（解約確定）';
comment on column public.company_subscriptions.data_delete_scheduled_at is '店舗データ削除予定日時（解約日+1年）';
comment on column public.company_subscriptions.data_deleted_at is '店舗データ削除完了日時';

create index if not exists idx_company_subscriptions_data_delete_scheduled
  on public.company_subscriptions(data_delete_scheduled_at)
  where data_deleted_at is null and status = 'cancelled';

create or replace function public.mark_company_subscription_cancelled(p_company_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_subscription public.company_subscriptions%rowtype;
begin
  update public.company_subscriptions cs
     set status = 'cancelled',
         cancelled_at = coalesce(cs.cancelled_at, now()),
         data_delete_scheduled_at = coalesce(cs.data_delete_scheduled_at, now() + interval '1 year'),
         stripe_subscription_id = null,
         updated_at = now()
   where cs.company_id = p_company_id
     and cs.status <> 'cancelled'
   returning * into v_subscription;

  if not found then
    select *
      into v_subscription
      from public.company_subscriptions cs
     where cs.company_id = p_company_id
       and cs.status = 'cancelled'
     order by cs.updated_at desc
     limit 1;
  end if;

  if not found then
    raise exception '契約情報が見つかりません。';
  end if;

  return to_jsonb(v_subscription);
end;
$$;

create or replace function public.reactivate_company_subscription(p_company_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_subscription public.company_subscriptions%rowtype;
begin
  update public.company_subscriptions cs
     set cancelled_at = null,
         data_delete_scheduled_at = null,
         data_deleted_at = null,
         updated_at = now()
   where cs.company_id = p_company_id
   returning * into v_subscription;

  if not found then
    raise exception '契約情報が見つかりません。';
  end if;

  return to_jsonb(v_subscription);
end;
$$;

create or replace function public.get_member_contract_access()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_store_id uuid;
  v_subscription public.company_subscriptions%rowtype;
begin
  if v_user_id is null then
    return jsonb_build_object('state', 'anonymous');
  end if;

  select sm.store_id
    into v_store_id
    from public.store_members sm
   where sm.user_id = v_user_id
   order by sm.created_at asc
   limit 1;

  if v_store_id is null then
    return jsonb_build_object('state', 'no_store');
  end if;

  select *
    into v_subscription
    from public.company_subscriptions cs
   where cs.company_id = v_store_id
   order by case when cs.status = 'active' then 0 when cs.status = 'cancelled' then 1 else 2 end,
            cs.updated_at desc
   limit 1;

  if not found then
    return jsonb_build_object('state', 'active', 'store_id', v_store_id, 'plan', 'free');
  end if;

  if v_subscription.status = 'cancelled'
     and v_subscription.data_delete_scheduled_at is not null
     and v_subscription.data_deleted_at is null then
    return jsonb_build_object(
      'state', 'cancelled_retention',
      'store_id', v_store_id,
      'plan', v_subscription.plan,
      'cancelled_at', v_subscription.cancelled_at,
      'data_delete_scheduled_at', v_subscription.data_delete_scheduled_at
    );
  end if;

  return jsonb_build_object(
    'state', 'active',
    'store_id', v_store_id,
    'plan', v_subscription.plan,
    'status', v_subscription.status
  );
end;
$$;

create or replace function public.purge_expired_store_data()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row record;
  v_purged uuid[] := '{}';
begin
  for v_row in
    select cs.company_id
      from public.company_subscriptions cs
     where cs.status = 'cancelled'
       and cs.data_delete_scheduled_at is not null
       and cs.data_delete_scheduled_at <= now()
       and cs.data_deleted_at is null
  loop
    update public.company_subscriptions
       set data_deleted_at = now(),
           updated_at = now()
     where company_id = v_row.company_id
       and data_deleted_at is null;

    delete from public.stores
     where id = v_row.company_id;

    v_purged := array_append(v_purged, v_row.company_id);
  end loop;

  return jsonb_build_object(
    'purged_count', coalesce(array_length(v_purged, 1), 0),
    'purged_store_ids', to_jsonb(v_purged)
  );
end;
$$;

create or replace function public.ensure_company_subscription(p_company_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_subscription public.company_subscriptions%rowtype;
begin
  if v_user_id is null then
    raise exception 'ログインが必要です。';
  end if;

  if not exists (
    select 1
    from public.store_members sm
    where sm.user_id = v_user_id
      and sm.store_id = p_company_id
  ) then
    raise exception '所属店舗が見つかりません。';
  end if;

  select *
    into v_subscription
    from public.company_subscriptions cs
   where cs.company_id = p_company_id
     and cs.status = 'active'
   limit 1;

  if found then
    return to_jsonb(v_subscription);
  end if;

  select *
    into v_subscription
    from public.company_subscriptions cs
   where cs.company_id = p_company_id
     and cs.status = 'cancelled'
     and cs.data_deleted_at is null
   order by cs.updated_at desc
   limit 1;

  if found then
    return to_jsonb(v_subscription);
  end if;

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
    p_company_id,
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
  )
  returning * into v_subscription;

  return to_jsonb(v_subscription);
end;
$$;

grant execute on function public.mark_company_subscription_cancelled(uuid) to service_role;
grant execute on function public.reactivate_company_subscription(uuid) to service_role;
grant execute on function public.purge_expired_store_data() to service_role;
grant execute on function public.get_member_contract_access() to authenticated;
