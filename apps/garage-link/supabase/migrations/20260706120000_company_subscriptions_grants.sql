-- company_subscriptions 権限修正 + 契約 bootstrap RPC
-- permission denied for table company_subscriptions 対策

grant usage on schema public to authenticated;
grant select, insert, update on public.company_subscriptions to authenticated;
grant select, insert, update on public.plan_change_requests to authenticated;

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

grant execute on function public.ensure_company_subscription(uuid) to authenticated;
