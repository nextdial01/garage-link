\set ON_ERROR_STOP on

do $$ begin
  if current_database() not like 'garage_g0%' and coalesce(current_setting('app.g0b_fixture',true),'')<>'enabled' then
    raise exception 'G4A_DISPOSABLE_DATABASE_REQUIRED';
  end if;
end $$;

-- Stable invoice fixture. The surrounding transaction leaves shared fixtures unchanged.
begin;
insert into public.invoices(id,store_id,deal_id,vehicle_id,invoice_no,status,issue_status,total_amount,paid_amount,unpaid_amount)
values('54000000-0000-0000-0000-000000000001','51100000-0000-0000-0000-000000000001','53100000-0000-0000-0000-000000000001','53000000-0000-0000-0000-000000000001','G4A-INV-1','draft','draft',100000,0,100000);
insert into public.invoice_items(id,store_id,invoice_id,item_order,name,amount)
values('54100000-0000-0000-0000-000000000001','51100000-0000-0000-0000-000000000001','54000000-0000-0000-0000-000000000001',1,'車両代',100000);

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','50000000-0000-0000-0000-000000000001',true);
do $$ declare r jsonb; p uuid;
begin
  begin
    insert into public.invoices(store_id,invoice_no,status,issue_status,total_amount,paid_amount,unpaid_amount)
      values('51100000-0000-0000-0000-000000000001','G4A-DIRECT-ISSUED','issued','issued',1,0,1);
    raise exception 'direct issued invoice created';
  exception when insufficient_privilege then null; end;
  select public.issue_garage_invoice('54000000-0000-0000-0000-000000000001','g4a-issue-owner-0001','g4a-test') into r;
  if r->>'code'<>'ISSUED' then raise exception 'issue failed: %',r; end if;
  begin update public.invoices set total_amount=1 where id='54000000-0000-0000-0000-000000000001'; raise exception 'issued invoice changed';
  exception when insufficient_privilege then null; end;
  begin update public.invoice_items set amount=1 where invoice_id='54000000-0000-0000-0000-000000000001'; raise exception 'issued item changed';
  exception when insufficient_privilege then null; end;

  select public.record_garage_payment('54000000-0000-0000-0000-000000000001',40000,'bank','g4a-payment-owner-0001','g4a-test') into r;
  if r->>'code'<>'PAYMENT_RECORDED' then raise exception 'payment failed: %',r; end if; p:=(r->>'paymentId')::uuid;
  select public.record_garage_payment('54000000-0000-0000-0000-000000000001',40000,'bank','g4a-payment-owner-0001','retry') into r;
  if r->>'code'<>'PAYMENT_RECORDED' then raise exception 'payment retry failed: %',r; end if;
  select public.record_garage_payment('54000000-0000-0000-0000-000000000001',50000,'bank','g4a-payment-owner-0001','different') into r;
  if r->>'code'<>'IDEMPOTENCY_CONFLICT' then raise exception 'different payload accepted: %',r; end if;
  if (select count(*) from public.invoice_payment_ledger where invoice_id='54000000-0000-0000-0000-000000000001' and entry_type='payment')<>1 then raise exception 'payment duplicated'; end if;
  if (select status from public.invoices where id='54000000-0000-0000-0000-000000000001')<>'partially_paid' then raise exception 'partial status mismatch'; end if;

  select public.record_garage_payment_reversal(p,20000,'reversal','入力訂正','g4a-reversal-owner-0001','g4a-test') into r;
  if r->>'code'<>'REVERSAL_RECORDED' then raise exception 'reversal failed: %',r; end if;
  select public.record_garage_payment_reversal(p,30000,'refund','過剰返金テスト','g4a-refund-owner-0001','g4a-test') into r;
  if r->>'code'<>'REFUND_EXCEEDS_PAYMENT' then raise exception 'excess refund accepted: %',r; end if;
  begin update public.invoice_payment_ledger set amount=1 where id=p; raise exception 'ledger update succeeded';
  exception when insufficient_privilege then null; end;
  begin delete from public.invoice_payment_ledger where id=p; raise exception 'ledger delete succeeded';
  exception when insufficient_privilege then null; end;
  select public.void_garage_invoice('54000000-0000-0000-0000-000000000001','通常取消不可','g4a-void-paid-0001','g4a-test') into r;
  if r->>'code'<>'PAYMENT_EXISTS' then raise exception 'paid invoice voided: %',r; end if;
end $$;
rollback;

-- Role boundaries.
begin;
select set_config('app.g4a_accounting_rpc','on',true);
insert into public.invoices(id,store_id,invoice_no,status,issue_status,total_amount,paid_amount,unpaid_amount)
values('54000000-0000-0000-0000-000000000002','51100000-0000-0000-0000-000000000001','G4A-INV-ROLE','issued','issued',1000,0,1000);
select set_config('app.g4a_accounting_rpc','',true);
do $$ declare uid uuid; expected text; r jsonb;
begin
  for uid,expected in select * from (values
    ('50000000-0000-0000-0000-000000000003'::uuid,'ROLE_FORBIDDEN'),
    ('50000000-0000-0000-0000-000000000005'::uuid,'ROLE_FORBIDDEN'),
    ('50000000-0000-0000-0000-000000000006'::uuid,'SCOPE_FORBIDDEN'),
    ('50000000-0000-0000-0000-000000000008'::uuid,'SCOPE_FORBIDDEN')
  ) x(uid,expected) loop
    perform set_config('request.jwt.claim.role','authenticated',true); perform set_config('request.jwt.claim.sub',uid::text,true);
    select public.record_garage_payment('54000000-0000-0000-0000-000000000002',1,'cash','g4a-denied-'||replace(uid::text,'-',''),null) into r;
    if r->>'code'<>expected then raise exception 'role % expected %, got %',uid,expected,r; end if;
  end loop;
end $$;
rollback;

select 'G4A_ACCOUNTING_REGRESSION_PASS' result;
