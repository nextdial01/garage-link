-- GARAGE LINK baseline-only compatibility overlay.
--
-- The former monorepo migration 20260706160000_ll_subscriptions_stripe.sql
-- cannot be replayed in this repository because it depends on L-LINK-only
-- objects (ll_current_user_company_ids / ll_staff_roles). GARAGE LINK still
-- owns and uses this store integration timestamp, so the approved fresh
-- baseline declares only that GARAGE LINK column. Existing/remote databases
-- already receive it from their historical upgrade path.

alter table public.stores
  add column if not exists l_link_onboarding_completed_at timestamptz;

comment on column public.stores.l_link_onboarding_completed_at is
  'L-LINK連携が初回成立した日時。GARAGE LINK側の接続状態表示に使用する。';
