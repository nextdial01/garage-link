-- Stripe webhook events are claimed before processing so retries cannot apply
-- the same billing change twice. Only the service role may access this table.

create table if not exists public.stripe_webhook_events (
  id uuid primary key default gen_random_uuid(),
  stripe_event_id text not null unique,
  event_type text not null,
  status text not null default 'processing'
    check (status in ('processing', 'completed', 'failed')),
  error_message text,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_stripe_webhook_events_status_updated
  on public.stripe_webhook_events(status, updated_at);

alter table public.stripe_webhook_events enable row level security;

revoke all on table public.stripe_webhook_events from anon, authenticated;
grant all on table public.stripe_webhook_events to service_role;

drop trigger if exists set_stripe_webhook_events_updated_at on public.stripe_webhook_events;
create trigger set_stripe_webhook_events_updated_at
  before update on public.stripe_webhook_events
  for each row execute function public.set_updated_at();

comment on table public.stripe_webhook_events is
  'Stripe webhook idempotency records. Event payloads and payment details are not stored.';
