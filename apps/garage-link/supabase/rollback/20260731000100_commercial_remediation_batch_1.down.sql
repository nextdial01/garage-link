-- Security-preserving rollback. Refuse while non-active commercial states exist.
do $$
begin
  if exists (
    select 1 from public.company_subscriptions
    where billing_state not in ('active', 'cancellation_scheduled')
  ) then
    raise exception 'ROLLBACK_BLOCKED_ACTIVE_COMMERCIAL_STATE';
  end if;
end;
$$;

drop trigger if exists a00_billing_access_vehicle on public.vehicles;
drop trigger if exists a00_billing_access_quote on public.quotes;
drop trigger if exists a00_billing_access_invoice on public.invoices;
drop trigger if exists a00_billing_access_storage on public.uploaded_files;
drop trigger if exists a00_billing_access_staff on public.store_members;
drop trigger if exists a00_billing_access_membership on public.memberships;
drop trigger if exists a00_billing_access_store on public.stores;
drop index if exists public.billing_sync_operations_one_open_checkout_uidx;
drop function if exists public.garage_billing_access_guard();
revoke all on function public.apply_garage_subscription_event_v2(
  uuid,text,text,text,text,text,text,bigint,timestamptz,boolean,timestamptz,text,integer,integer,integer
) from public, anon, authenticated, service_role;
drop function if exists public.apply_garage_subscription_event_v2(
  uuid,text,text,text,text,text,text,bigint,timestamptz,boolean,timestamptz,text,integer,integer,integer
);

-- Columns are retained intentionally so rollback cannot discard billing audit state.
alter table public.company_subscriptions
  drop constraint if exists company_subscriptions_billing_state_check;
alter table public.billing_sync_operations
  drop constraint if exists billing_sync_operations_status_check;
alter table public.billing_sync_operations
  add constraint billing_sync_operations_status_check check (
    status in ('started','stripe_applied','completed','reconciliation_required','failed')
  );
