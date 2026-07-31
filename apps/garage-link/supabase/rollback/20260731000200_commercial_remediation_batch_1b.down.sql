-- Security-preserving rollback for Batch 1B. Refuse if new lifecycle state is in use.
do $$
begin
  if exists (
    select 1 from public.company_subscriptions
    where restoration_state <> 'none' or snapshot_observed_at is not null
  ) then
    raise exception 'Batch 1B rollback refused: authoritative snapshots/restoration state exist';
  end if;
  if exists (
    select 1 from public.stripe_webhook_events
    where status in ('retry_scheduled', 'dead_letter') or lease_owner is not null
  ) then
    raise exception 'Batch 1B rollback refused: webhook retry state exists';
  end if;
  if exists (
    select 1 from public.billing_sync_operations where lease_owner is not null
  ) then
    raise exception 'Batch 1B rollback refused: billing operation lease exists';
  end if;
end $$;

drop function if exists public.apply_garage_subscription_snapshot_v3(uuid,text,text,text,text,text,timestamptz,timestamptz,boolean,timestamptz,text,integer,integer,integer,text);
drop function if exists public.claim_garage_billing_operations(text,integer,integer);
drop function if exists public.garage_commercial_e2e_quota_probe(text);
drop function if exists public.claim_garage_webhook_retry(text,integer,integer,text);
drop function if exists public.begin_garage_billing_operation(uuid,uuid,uuid,text,text,text,jsonb,text);
drop function if exists public.release_garage_subscription_lease(text,text);
drop function if exists public.claim_garage_subscription_lease(text,text,integer);

drop table if exists public.garage_subscription_leases;

drop index if exists public.billing_sync_operations_one_open_mutation_uidx;
create unique index if not exists billing_sync_operations_one_open_checkout_uidx
  on public.billing_sync_operations(tenant_id)
  where operation_type = 'checkout'
    and status in ('started', 'stripe_applied', 'reconciliation_required', 'retry_scheduled');

alter table public.stripe_webhook_events
  drop constraint if exists stripe_webhook_events_status_check;
alter table public.stripe_webhook_events
  add constraint stripe_webhook_events_status_check
  check (status in ('processing', 'completed', 'failed'));
alter table public.stripe_webhook_events
  drop column if exists lease_owner,
  drop column if exists lease_expires_at,
  drop column if exists last_attempt_at;

alter table public.billing_sync_operations
  drop column if exists stripe_request_id,
  drop column if exists lease_owner,
  drop column if exists lease_expires_at,
  drop column if exists started_at,
  drop column if exists completed_at,
  drop column if exists target_plan,
  drop column if exists target_options;

-- The synchronous effective-state function, entitlement contract table and
-- snapshot columns are intentionally retained: removing them would weaken the
-- fail-closed access guard. Reapply is idempotent.
