-- security definer RPC が company_subscriptions にアクセスできるよう所有者を明示

alter table if exists public.company_subscriptions owner to postgres;

do $$
begin
  if exists (
    select 1
    from pg_proc
    where proname = 'get_company_subscription'
      and pg_function_is_visible(oid)
  ) then
    execute 'alter function public.get_company_subscription(uuid) owner to postgres';
  end if;

  if exists (
    select 1
    from pg_proc
    where proname = 'ensure_company_subscription'
      and pg_function_is_visible(oid)
  ) then
    execute 'alter function public.ensure_company_subscription(uuid) owner to postgres';
  end if;
end $$;

grant all on table public.company_subscriptions to service_role;
