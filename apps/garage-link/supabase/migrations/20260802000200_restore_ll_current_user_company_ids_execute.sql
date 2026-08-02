-- GARAGE LINK production incident (2026-08-02): 20260731000300's blanket
-- `revoke all privileges on all routines in schema public` also revoked EXECUTE on
-- public.ll_current_user_company_ids(), a leftover function from the former L-LINK
-- monorepo era (excluded from this repo's tracked schema/migrations, see
-- supabase/baseline/048_garage_link_integration_columns.sql's comment). Two RLS
-- policies still live on production's actual stores/store_members tables -
-- ll_stores_select_member and ll_store_members_select_member, both `for public` -
-- call this function in their USING clause. Postgres does not skip a permissive
-- policy that errors; it fails the whole query. Every authenticated/anon read of
-- stores or store_members (i.e. nearly every page in the app) broke in production
-- until this was restored via emergency forward-fix, applied directly and verified
-- before this migration file was written to formalize it.
--
-- Guarded like 20260731000300's tenant_subscriptions grant: this function does not
-- exist in a from-scratch fresh baseline build (the migrations that created it are
-- excluded from supabase/baseline/manifest.json), only in production's real
-- incremental history, so an unconditional grant would break `pnpm test:db:fresh`.
do $$
begin
  if to_regprocedure('public.ll_current_user_company_ids()') is not null then
    execute 'grant execute on function public.ll_current_user_company_ids() to anon, authenticated';
  end if;
end
$$;
