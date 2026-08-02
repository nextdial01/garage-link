\set ON_ERROR_STOP on
do $$ begin
  if current_database()<>'postgres' or coalesce(current_setting('app.g0b_fixture',true),'')<>'enabled'
  then raise exception 'G4B_DISPOSABLE_DATABASE_REQUIRED'; end if;
end $$;

begin;
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);

do $$ declare r jsonb; cid uuid; original_invoice jsonb; original_claim jsonb; original_deal jsonb; payment_id uuid:='57500000-0000-0000-0000-000000000001';
begin
  select to_jsonb(i) into original_invoice from public.invoices i where id='57400000-0000-0000-0000-000000000001';
  select to_jsonb(c) into original_claim from public.vehicle_sale_claims c where id='57300000-0000-0000-0000-000000000001';
  select to_jsonb(d) into original_deal from public.deals d where id='57200000-0000-0000-0000-000000000001';

  perform set_config('request.jwt.claim.sub','50000000-0000-0000-0000-000000000005',true);
  select public.create_sale_correction_case('57300000-0000-0000-0000-000000000001','customer_return','viewer拒否',500,'57400000-0000-0000-0000-000000000001','g4b-viewer-denied-0001',null) into r;
  if r->>'code'<>'ROLE_FORBIDDEN' then raise exception 'viewer accepted: %',r; end if;
  perform set_config('request.jwt.claim.sub','50000000-0000-0000-0000-000000000006',true);
  select public.create_sale_correction_case('57300000-0000-0000-0000-000000000001','customer_return','inactive拒否',500,'57400000-0000-0000-0000-000000000001','g4b-inactive-denied-0001',null) into r;
  if r->>'code'<>'SCOPE_FORBIDDEN' then raise exception 'inactive accepted: %',r; end if;

  perform set_config('request.jwt.claim.sub','50000000-0000-0000-0000-000000000004',true);
  select public.create_sale_correction_case('57300000-0000-0000-0000-000000000001','customer_return','顧客返品の申請',500,'57400000-0000-0000-0000-000000000001','g4b-create-staff-0001','g4b-regression') into r;
  if r->>'code'<>'CREATED' then raise exception 'staff create failed: %',r; end if; cid:=(r->>'caseId')::uuid;
  select public.create_sale_correction_case('57300000-0000-0000-0000-000000000001','customer_return','顧客返品の申請',500,'57400000-0000-0000-0000-000000000001','g4b-create-staff-0001','retry') into r;
  if r->>'code'<>'CREATED' or (r->>'caseId')::uuid<>cid then raise exception 'create retry diverged: %',r; end if;
  select public.transition_sale_correction_case(cid,'approve',null,500,'restock','g4b-staff-approve-0001',null) into r;
  if r->>'code'<>'ROLE_FORBIDDEN' then raise exception 'staff approved: %',r; end if;

  perform set_config('request.jwt.claim.sub','50000000-0000-0000-0000-000000000001',true);
  select public.transition_sale_correction_case(cid,'approve',null,500,'restock','g4b-skip-review-0001',null) into r;
  if r->>'code'<>'INVALID_STATUS' then raise exception 'status skipped: %',r; end if;
  select public.transition_sale_correction_case(cid,'begin_review',null,null,null,'g4b-review-owner-0001',null) into r;
  if r->>'status'<>'under_review' then raise exception 'review failed: %',r; end if;
  select public.transition_sale_correction_case(cid,'approve',null,500,'restock','g4b-approve-owner-0001',null) into r;
  if r->>'status'<>'approved' then raise exception 'approve failed: %',r; end if;
  if (select status from public.vehicles where id='57100000-0000-0000-0000-000000000001')<>'納車済み' then raise exception 'approval restocked vehicle'; end if;
  if (select status from public.inspection_reminder_events where id='57600000-0000-0000-0000-000000000001')<>'skipped' then raise exception 'followup not suppressed'; end if;
  select public.transition_sale_correction_case(cid,'start_processing',null,null,null,'g4b-processing-owner-0001',null) into r;
  if r->>'status'<>'processing' then raise exception 'processing failed: %',r; end if;
  select public.confirm_sale_correction_restock(cid,'g4b-restock-too-early-0001',null) into r;
  if r->>'code'<>'SUBPROCESS_INCOMPLETE' then raise exception 'early restock accepted: %',r; end if;
  select public.record_sale_correction_refund(cid,payment_id,500,'返品case承認返金','g4b-refund-owner-0001',null) into r;
  if r->>'code'<>'REFUND_RECORDED' then raise exception 'refund failed: %',r; end if;
  select public.record_sale_correction_refund(cid,payment_id,500,'返品case承認返金','g4b-refund-owner-0001','retry') into r;
  if r->>'code'<>'REFUND_RECORDED' then raise exception 'refund retry failed: %',r; end if;
  select public.record_sale_correction_refund(cid,payment_id,1,'超過返金拒否','g4b-refund-excess-0001',null) into r;
  if r->>'code'<>'REFUND_EXCEEDS_PAYMENT' then raise exception 'excess refund accepted: %',r; end if;
  select public.complete_sale_correction_inspection(cid,'返却車両を検品済み','g4b-inspection-owner-0001',null) into r;
  if r->>'code'<>'INSPECTION_COMPLETED' then raise exception 'inspection failed: %',r; end if;
  select public.resolve_sale_correction_ownership(cid,'returned','顧客から返却確認済み','g4b-ownership-owner-0001',null) into r;
  if r->>'code'<>'OWNERSHIP_RESOLVED' then raise exception 'ownership failed: %',r; end if;
  select public.resolve_sale_correction_external_procedure(cid,'completed','名義等の外部手続き確認済み','g4b-external-owner-0001',null) into r;
  if r->>'code'<>'EXTERNAL_PROCEDURE_RECORDED' then raise exception 'external procedure failed: %',r; end if;
  select public.confirm_sale_correction_restock(cid,'g4b-restock-owner-0001',null) into r;
  if r->>'code'<>'RESTOCKED' then raise exception 'restock failed: %',r; end if;
  select public.transition_sale_correction_case(cid,'complete',null,null,null,'g4b-complete-owner-0001',null) into r;
  if r->>'status'<>'completed' then raise exception 'complete failed: %',r; end if;

  if (select count(*) from public.sale_correction_refunds where case_id=cid)<>1 then raise exception 'refund duplicated'; end if;
  if (select count(*) from public.customer_vehicle_ownership_history where case_id=cid)<>3 then raise exception 'ownership history missing'; end if;
  if (select status from public.vehicle_sale_claims where id='57300000-0000-0000-0000-000000000001')<>'delivered'
     or (select status from public.deals where id='57200000-0000-0000-0000-000000000001')<>'成約'
     or (select status from public.invoices where id='57400000-0000-0000-0000-000000000001')<>'paid'
  then raise exception 'original history changed'; end if;
  if (select count(*) from public.invoice_payment_ledger where id=payment_id and entry_type='payment' and amount=1000)<>1 then raise exception 'original payment changed'; end if;
  if (select status from public.vehicles where id='57100000-0000-0000-0000-000000000001')<>'在庫中' then raise exception 'restock missing'; end if;
  begin update public.sale_correction_cases set reason='直接変更' where id=cid; raise exception 'direct case update succeeded'; exception when insufficient_privilege then null; end;

  perform set_config('request.jwt.claim.sub','50000000-0000-0000-0000-000000000002',true);
  select public.create_sale_correction_case('57300000-0000-0000-0000-000000000003','administrative_correction','事務訂正case',0,null,'g4b-admin-create-0001',null) into r;
  if r->>'code'<>'CREATED' then raise exception 'admin create failed: %',r; end if;
  cid:=(r->>'caseId')::uuid;
  select public.transition_sale_correction_case(cid,'begin_review',null,null,null,'g4b-admin-review-0001',null) into r;
  select public.transition_sale_correction_case(cid,'reject','契約履歴を維持して却下',null,null,'g4b-admin-reject-0001',null) into r;
  if r->>'status'<>'rejected' then raise exception 'admin reject failed: %',r; end if;
end $$;
rollback;

select 'G4B_DELIVERED_SALE_CORRECTION_REGRESSION_PASS' result;
