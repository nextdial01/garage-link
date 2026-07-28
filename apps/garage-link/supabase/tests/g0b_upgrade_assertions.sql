do $$
declare
  v_claims integer;
begin
  if not exists (
    select 1 from public.memberships
    where user_id='54000000-0000-0000-0000-000000000001'
      and status='active' and coalesce(invite_accepted_at, joined_at) is not null
  ) then raise exception 'G0B_UPGRADE_MEMBERSHIP_NOT_PRESERVED'; end if;

  if not exists (
    select 1 from public.vehicles v join public.deals d on d.vehicle_id=v.id
    where v.id='54300000-0000-0000-0000-000000000001'
      and v.status='売約済み' and d.status='成約'
  ) then raise exception 'G0B_UPGRADE_SALE_NOT_PRESERVED'; end if;

  select count(*) into v_claims from public.vehicle_sale_claims
  where vehicle_id='54300000-0000-0000-0000-000000000001' and status='active';
  if v_claims <> 1 then raise exception 'G0B_UPGRADE_BACKFILL_EXPECTED_ONE_CLAIM: %', v_claims; end if;

  if not exists (
    select 1 from public.invoices
    where id='54500000-0000-0000-0000-000000000001'
      and invoice_no='G0B-UPGRADE-INV-001' and issue_status='issued'
      and total_amount=1000 and paid_amount=0 and unpaid_amount=1000
  ) then raise exception 'G0B_G4A_INVOICE_NOT_PRESERVED'; end if;

  if exists (
    select 1 from public.invoice_payment_ledger
    where invoice_id='54500000-0000-0000-0000-000000000001'
  ) then raise exception 'G0B_G4A_PAYMENT_LEDGER_WAS_GUESSED'; end if;

  if not exists (
    select 1
    from public.membership_store_assignments msa
    join public.memberships m on m.id=msa.membership_id and m.tenant_id=msa.tenant_id
    where m.user_id='54000000-0000-0000-0000-000000000001'
      and msa.store_id=m.store_id and msa.deleted_at is null
  ) then raise exception 'G0B_G1D_DETERMINISTIC_ASSIGNMENT_BACKFILL_MISSING'; end if;

  if exists (
    select 1 from public.user_active_store_preferences
    where user_id='54000000-0000-0000-0000-000000000001'
  ) then raise exception 'G0B_G1D_PREFERENCE_WAS_GUESSED'; end if;
end;
$$;
