-- Production parity fixture: public.tenant_subscriptions (schema/029_line_plan_billing.sql,
-- the LINE-only plan billing schema, not GARAGE LINK's own company_subscriptions billing)
-- exists in a from-scratch fresh baseline build but was never created in the production
-- database's actual incremental history. Drop it here, immediately before applying
-- 20260731000300 onward, so the upgrade drill reproduces the exact production gap that
-- 20260731000300 must tolerate. Synthetic local fixture only.
do $$
begin
  if coalesce(current_setting('app.g0b_fixture',true),'') <> 'enabled' then
    raise exception 'PRODUCTION_PARITY_FIXTURE_REQUIRES_EXPLICIT_MARKER';
  end if;
end;
$$;

drop table if exists public.tenant_subscriptions cascade;

do $$
begin
  if to_regclass('public.tenant_subscriptions') is not null then
    raise exception 'PRODUCTION_PARITY_FIXTURE_DROP_FAILED: tenant_subscriptions';
  end if;
end;
$$;
