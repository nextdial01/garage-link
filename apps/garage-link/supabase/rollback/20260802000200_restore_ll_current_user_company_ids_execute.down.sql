-- Revert the emergency execute grant. Only safe if the legacy ll_stores_select_member /
-- ll_store_members_select_member policies (not tracked in this repo, live-only artifacts
-- from the former L-LINK monorepo era) have since been dropped from the target database -
-- otherwise this reintroduces the 2026-08-02 production incident (see the forward
-- migration's comment). Do not apply to production without first confirming those
-- policies are gone.
do $$
begin
  if to_regprocedure('public.ll_current_user_company_ids()') is not null then
    execute 'revoke execute on function public.ll_current_user_company_ids() from anon, authenticated';
  end if;
end
$$;
