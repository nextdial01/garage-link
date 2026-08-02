-- GARAGE LINK: fix a second live incident found while auditing the first
-- (20260802000200), then harden every legacy ll_*-based RLS policy from
-- `public` to `authenticated` so anon no longer needs EXECUTE on either
-- function.
--
-- 20260731000300's blanket `revoke all privileges on all routines` also
-- revoked EXECUTE on public.ll_has_company_role(uuid, text[]) - another
-- leftover L-LINK-monorepo-era function, not tracked in this repo's
-- schema/migrations. It is currently referenced (`TO public`) by
-- ll_store_members_insert_admin_or_self (INSERT/WITH CHECK) and
-- ll_store_members_update_admin (UPDATE) on GARAGE LINK's own store_members
-- table, and ll_store_members_delete_owner (DELETE). Since a permissive
-- policy that errors fails the whole statement, adding/removing/changing a
-- store member's role has been broken in production since 20260731000300,
-- the same failure class as the already-fixed SELECT-side incident. Restore
-- EXECUTE first so this is not left broken any longer than necessary.
do $$
begin
  if to_regprocedure('public.ll_has_company_role(uuid,text[])') is not null then
    execute 'grant execute on function public.ll_has_company_role(uuid,text[]) to authenticated';
  end if;
end
$$;

-- Comprehensive audit (read-only, against the live database) found these are
-- the only two functions referenced by any policy in the public schema that
-- were still missing an authenticated EXECUTE grant. Narrow every policy
-- referencing either of them from `public` to `authenticated`: both
-- functions are SECURITY DEFINER and filter their internal queries by
-- `user_id = auth.uid()`, which is null for anon, so anon has never received
-- real data or been able to satisfy a WITH CHECK through either of them -
-- this narrowing is a pure privilege-scope hardening with no behavior change
-- for real (authenticated) traffic.
do $$
declare
  v_policy record;
begin
  for v_policy in
    select tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and roles = '{public}'
      and (
        qual::text ilike '%ll_current_user_company_ids%'
        or with_check::text ilike '%ll_current_user_company_ids%'
        or qual::text ilike '%ll_has_company_role%'
        or with_check::text ilike '%ll_has_company_role%'
      )
  loop
    execute format('alter policy %I on public.%I to authenticated', v_policy.policyname, v_policy.tablename);
  end loop;
end
$$;

do $$
begin
  if to_regprocedure('public.ll_current_user_company_ids()') is not null then
    execute 'revoke execute on function public.ll_current_user_company_ids() from anon';
  end if;
  if to_regprocedure('public.ll_has_company_role(uuid,text[])') is not null then
    execute 'revoke execute on function public.ll_has_company_role(uuid,text[]) from anon';
  end if;
end
$$;

do $$
begin
  if exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and roles = '{public}'
      and (
        qual::text ilike '%ll_current_user_company_ids%'
        or with_check::text ilike '%ll_current_user_company_ids%'
        or qual::text ilike '%ll_has_company_role%'
        or with_check::text ilike '%ll_has_company_role%'
      )
  ) then raise exception 'LL_LEGACY_POLICY_STILL_PUBLIC'; end if;
end
$$;
