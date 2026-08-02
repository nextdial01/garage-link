-- GENERATED billing state CASE; migration must contain this exact expression.
case
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
  end;
