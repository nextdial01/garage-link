\set ON_ERROR_STOP on

-- G3 regression: execute only against the disposable G0 database.
do $$ begin
  if current_database() not like 'garage_g0%'
     and coalesce(current_setting('app.g0b_fixture', true), '') <> 'enabled' then
    raise exception 'G3 tests require garage_g0* or an explicit G0-B fixture session';
  end if;
end $$;

update public.vehicle_sale_claims set status='cancelled', cancelled_at=now()
where vehicle_id='53000000-0000-0000-0000-000000000001' and status='active';
update public.vehicles set status='在庫中', sold_date=null
where id='53000000-0000-0000-0000-000000000001';
update public.deals set status='商談中'
where id in ('53100000-0000-0000-0000-000000000001','53100000-0000-0000-0000-000000000002');
delete from public.vehicle_sale_operations where vehicle_id='53000000-0000-0000-0000-000000000001';
delete from public.vehicle_sale_claims where vehicle_id='53000000-0000-0000-0000-000000000001';

-- Owner: atomic reserve, idempotent retry, direct transition guard and cancel.
begin;
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '50000000-0000-0000-0000-000000000001', true);
do $$
declare v_result jsonb; v_audit_before bigint;
begin
  select count(*) into v_audit_before from public.audit_logs where action='vehicle_sale_reserved' and target_id='53000000-0000-0000-0000-000000000001';
  select public.reserve_vehicle_sale('53100000-0000-0000-0000-000000000001', 'g3-owner-reserve-0001', 'g3-regression') into v_result;
  if not coalesce((v_result->>'ok')::boolean, false) then raise exception 'owner reserve failed: %', v_result; end if;
  if (select status from public.vehicles where id='53000000-0000-0000-0000-000000000001') <> '売約済み' then raise exception 'vehicle status mismatch'; end if;
  if (select status from public.deals where id='53100000-0000-0000-0000-000000000001') <> '成約' then raise exception 'deal status mismatch'; end if;
  if (select count(*) from public.vehicle_sale_claims where vehicle_id='53000000-0000-0000-0000-000000000001' and status='active') <> 1 then raise exception 'active claim mismatch'; end if;
  select public.reserve_vehicle_sale('53100000-0000-0000-0000-000000000001', 'g3-owner-reserve-0001', 'retry') into v_result;
  if not coalesce((v_result->>'ok')::boolean, false) then raise exception 'same-key retry failed'; end if;
  select public.reserve_vehicle_sale('53100000-0000-0000-0000-000000000002', 'g3-owner-reserve-0001', 'different-payload') into v_result;
  if v_result->>'code' <> 'IDEMPOTENCY_CONFLICT' then raise exception 'same-key different request was not rejected: %', v_result; end if;
  select public.reserve_vehicle_sale('53100000-0000-0000-0000-000000000001', 'g3-owner-reserve-0002', 'same-deal-new-key') into v_result;
  if not coalesce((v_result->>'ok')::boolean, false) then raise exception 'same deal retry with new key failed'; end if;
  if (select count(*) from public.audit_logs where action='vehicle_sale_reserved' and target_id='53000000-0000-0000-0000-000000000001') <> v_audit_before + 1 then raise exception 'reserve audit duplicated'; end if;
  begin
    update public.vehicles set status='在庫中' where id='53000000-0000-0000-0000-000000000001';
    raise exception 'direct vehicle transition unexpectedly succeeded';
  exception when raise_exception then
    if sqlerrm <> 'SALE_TRANSITION_REQUIRES_ATOMIC_RPC' then raise; end if;
  end;
  select public.cancel_vehicle_sale('53100000-0000-0000-0000-000000000001', 'g3-owner-cancel-0001', 'g3-regression') into v_result;
  if not coalesce((v_result->>'ok')::boolean, false) then raise exception 'cancel failed: %', v_result; end if;
  if (select status from public.vehicles where id='53000000-0000-0000-0000-000000000001') <> '在庫中' then raise exception 'cancel did not restore vehicle'; end if;
  if (select status from public.deals where id='53100000-0000-0000-0000-000000000001') <> '失注' then raise exception 'cancel did not close deal'; end if;
end $$;
rollback;

-- Staff is an explicitly permitted normal sales role.
begin;
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '50000000-0000-0000-0000-000000000004', true);
do $$ declare v_result jsonb;
begin
  select public.reserve_vehicle_sale('53100000-0000-0000-0000-000000000001', 'g3-staff-reserve-0001', null) into v_result;
  if not (v_result->>'ok')::boolean then raise exception 'staff reserve failed: %', v_result; end if;
end $$;
rollback;

-- G4-A: an issued but unpaid invoice is voided atomically with cancellation.
begin;
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '50000000-0000-0000-0000-000000000001', true);
do $$ declare v_result jsonb;
begin
  select public.reserve_vehicle_sale('53100000-0000-0000-0000-000000000001', 'g3-finance-reserve-0001', null) into v_result;
  insert into public.invoices(store_id, deal_id, invoice_no, status, issue_status, total_amount, paid_amount, unpaid_amount)
    values ('51100000-0000-0000-0000-000000000001','53100000-0000-0000-0000-000000000001','G3-TEMP-INVOICE','draft','draft',100000,0,100000);
  select public.issue_garage_invoice((select id from public.invoices where invoice_no='G3-TEMP-INVOICE'),'g3-finance-issue-0001',null) into v_result;
  if v_result->>'code'<>'ISSUED' then raise exception 'test invoice issue failed: %',v_result; end if;
  select public.cancel_vehicle_sale('53100000-0000-0000-0000-000000000001', 'g3-finance-cancel-0001', null) into v_result;
  if v_result->>'code' <> 'CANCELLED' then raise exception 'unpaid invoiced cancellation failed: %', v_result; end if;
  if (select status from public.invoices where invoice_no='G3-TEMP-INVOICE') <> 'void' then raise exception 'unpaid invoice was not voided'; end if;
end $$;
rollback;

-- Viewer, implementer, inactive, old-only and other-tenant actors are rejected.
do $$
declare v_user uuid; v_expected text; v_result jsonb;
begin
  for v_user, v_expected in
    select * from (values
      ('50000000-0000-0000-0000-000000000005'::uuid, 'ROLE_FORBIDDEN'),
      ('50000000-0000-0000-0000-000000000003'::uuid, 'ROLE_FORBIDDEN'),
      ('50000000-0000-0000-0000-000000000006'::uuid, 'SCOPE_FORBIDDEN'),
      ('50000000-0000-0000-0000-000000000012'::uuid, 'SCOPE_FORBIDDEN'),
      ('50000000-0000-0000-0000-000000000008'::uuid, 'SCOPE_FORBIDDEN')
    ) x(user_id, expected)
  loop
    perform set_config('request.jwt.claim.role', 'authenticated', true);
    perform set_config('request.jwt.claim.sub', v_user::text, true);
    select public.reserve_vehicle_sale('53100000-0000-0000-0000-000000000001', 'g3-denied-' || replace(v_user::text, '-', ''), null) into v_result;
    if v_result->>'code' <> v_expected then raise exception 'actor % expected %, got %', v_user, v_expected, v_result; end if;
  end loop;
end $$;

-- Delivery is atomic and becomes non-cancellable.
begin;
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '50000000-0000-0000-0000-000000000002', true);
do $$ declare v_result jsonb;
begin
  select public.reserve_vehicle_sale('53100000-0000-0000-0000-000000000001', 'g3-admin-reserve-0001', null) into v_result;
  if not (v_result->>'ok')::boolean then raise exception 'admin reserve failed'; end if;
  select public.complete_vehicle_delivery('53100000-0000-0000-0000-000000000001', 'g3-admin-deliver-0001', null) into v_result;
  if v_result->>'code' <> 'DELIVERED' then raise exception 'delivery failed: %', v_result; end if;
  select public.cancel_vehicle_sale('53100000-0000-0000-0000-000000000001', 'g3-admin-cancel-0001', null) into v_result;
  if v_result->>'code' <> 'DELIVERED_CANNOT_CANCEL' then raise exception 'delivered cancellation was not blocked: %', v_result; end if;
end $$;
rollback;

select 'G3_SALE_REGRESSION_PASS' as result;
