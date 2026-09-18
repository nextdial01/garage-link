-- Read-only bridge for the internal management monitor.
-- The application privilege contract intentionally does not grant service_role
-- direct SELECT on public.tenants. Keep that boundary intact and expose only
-- the active tenant identifiers required to exclude QA fixtures and count
-- registrations.

create or replace function public.garage_monitor_active_tenant_ids()
returns table (tenant_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select t.id
  from public.tenants as t
  where t.status = 'active'
  order by t.id
$$;

revoke all on function public.garage_monitor_active_tenant_ids()
from public, anon, authenticated, service_role;

grant execute on function public.garage_monitor_active_tenant_ids()
to service_role;
