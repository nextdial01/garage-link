-- Fix garage_effective_billing_state for Free-tier tenants (no Stripe subscription).
-- stripe_status is NULL for any tenant that has never checked out with Stripe (Free plan).
-- The prior CASE expression had no branch for NULL and fell through every WHEN as
-- NULL/false, landing on the catch-all ELSE 'reconciliation_required'. That put every
-- fresh Free-tier signup into the billing-restricted state, which the app middleware
-- redirects to /settings/billing, which in turn bounces incomplete-onboarding tenants
-- back to /onboarding, producing an infinite redirect loop and blocking the Free tier
-- entirely.

create or replace function public.garage_effective_billing_state(
  p_stripe_status text,
  p_billing_state text,
  p_grace_ends_at timestamptz,
  p_cancel_at_period_end boolean,
  p_current_period_end timestamptz,
  p_cancelled_at timestamptz,
  p_restoration_state text,
  p_now timestamptz default clock_timestamp()
) returns text
language sql
stable
set search_path = public, pg_temp
as $$
  select case
    when p_stripe_status is null and p_billing_state = 'active' then 'active'
    when p_stripe_status is null then 'reconciliation_required'
    when p_stripe_status not in ('incomplete', 'incomplete_expired', 'trialing', 'active', 'past_due', 'unpaid', 'paused', 'canceled') then 'reconciliation_required'
    when p_restoration_state in ('pending', 'failed') then 'reconciliation_required'
    when p_stripe_status = 'canceled' or p_cancelled_at is not null then 'canceled'
    when p_stripe_status = 'past_due' and p_grace_ends_at is not null and p_grace_ends_at > p_now then 'grace_period'
    when p_stripe_status = 'past_due' then 'restricted'
    when p_stripe_status = 'incomplete' then 'initial_payment_pending'
    when p_stripe_status in ('incomplete_expired', 'unpaid') then 'unpaid'
    when p_stripe_status = 'paused' then 'restricted'
    when p_cancel_at_period_end and (p_current_period_end is null or p_current_period_end <= p_now) then 'canceled'
    when p_cancel_at_period_end then 'cancellation_scheduled'
    when p_stripe_status in ('active', 'trialing') then 'active'
    else 'reconciliation_required'
  end
$$;
revoke all on function public.garage_effective_billing_state(text,text,timestamptz,boolean,timestamptz,timestamptz,text,timestamptz)
  from public, anon, authenticated;
grant execute on function public.garage_effective_billing_state(text,text,timestamptz,boolean,timestamptz,timestamptz,text,timestamptz)
  to service_role, authenticated;
