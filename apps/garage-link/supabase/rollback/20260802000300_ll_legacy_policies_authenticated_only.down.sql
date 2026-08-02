-- Symmetric revert: re-grant anon EXECUTE and widen every ll_current_user_company_ids()/
-- ll_has_company_role()-based policy back to `public`. Safe only because all matched
-- policies were uniformly `public` beforehand (verified at authoring time) - this does
-- not distinguish a policy that was intentionally narrowed for an unrelated reason after
-- this migration ran. Does not revoke authenticated's EXECUTE on either function -
-- ll_store_members_insert_admin_or_self/update_admin/delete_owner on GARAGE LINK's own
-- store_members table depend on ll_has_company_role, and rolling that back would
-- reintroduce the 2026-08-02 incident this migration fixed.
do $$
begin
  if to_regprocedure('public.ll_current_user_company_ids()') is not null then
    execute 'grant execute on function public.ll_current_user_company_ids() to anon';
  end if;
  if to_regprocedure('public.ll_has_company_role(uuid,text[])') is not null then
    execute 'grant execute on function public.ll_has_company_role(uuid,text[]) to anon';
  end if;
end
$$;

do $$
declare
  v_policy record;
begin
  for v_policy in
    select tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and roles = '{authenticated}'
      and (
        qual::text ilike '%ll_current_user_company_ids%'
        or with_check::text ilike '%ll_current_user_company_ids%'
        or qual::text ilike '%ll_has_company_role%'
        or with_check::text ilike '%ll_has_company_role%'
      )
  loop
    execute format('alter policy %I on public.%I to public', v_policy.policyname, v_policy.tablename);
  end loop;
end
$$;
