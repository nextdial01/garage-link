-- Stripe billing columns for GARAGE LINK subscriptions

alter table public.company_subscriptions
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_subscription_id text;

create index if not exists idx_company_subscriptions_stripe_customer
  on public.company_subscriptions(stripe_customer_id)
  where stripe_customer_id is not null;

create index if not exists idx_company_subscriptions_stripe_subscription
  on public.company_subscriptions(stripe_subscription_id)
  where stripe_subscription_id is not null;

comment on column public.company_subscriptions.stripe_customer_id is 'Stripe Customer ID (cus_...)';
comment on column public.company_subscriptions.stripe_subscription_id is 'Stripe Subscription ID (sub_...)';
