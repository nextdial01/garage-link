\set ON_ERROR_STOP on
do $$ begin
  if current_database()<>'postgres' or coalesce(current_setting('app.g0b_fixture',true),'')<>'enabled'
  then raise exception 'G4B_DISPOSABLE_DATABASE_REQUIRED'; end if;
end $$;

insert into public.customers(id,store_id,name,customer_type)
values('57000000-0000-0000-0000-000000000001','51100000-0000-0000-0000-000000000001','G4B TEST CUSTOMER','individual')
on conflict(id) do nothing;
insert into public.vehicles(id,store_id,management_no,status)
values
 ('57100000-0000-0000-0000-000000000001','51100000-0000-0000-0000-000000000001','G4B-DELIVERED-1','納車済み'),
 ('57100000-0000-0000-0000-000000000002','51100000-0000-0000-0000-000000000001','G4B-DELIVERED-2','納車済み'),
 ('57100000-0000-0000-0000-000000000003','51100000-0000-0000-0000-000000000001','G4B-DELIVERED-3','納車済み')
on conflict(id) do nothing;
insert into public.deals(id,store_id,customer_id,vehicle_id,title,status)
values
 ('57200000-0000-0000-0000-000000000001','51100000-0000-0000-0000-000000000001','57000000-0000-0000-0000-000000000001','57100000-0000-0000-0000-000000000001','G4B delivered sale','成約'),
 ('57200000-0000-0000-0000-000000000002','51100000-0000-0000-0000-000000000001',null,'57100000-0000-0000-0000-000000000002','G4B process kill correction','成約'),
 ('57200000-0000-0000-0000-000000000003','51100000-0000-0000-0000-000000000001',null,'57100000-0000-0000-0000-000000000003','G4B administrative correction','成約')
on conflict(id) do nothing;
insert into public.vehicle_sale_claims(id,tenant_id,store_id,vehicle_id,deal_id,status,previous_vehicle_status,delivered_at)
values
 ('57300000-0000-0000-0000-000000000001','51000000-0000-0000-0000-000000000001','51100000-0000-0000-0000-000000000001','57100000-0000-0000-0000-000000000001','57200000-0000-0000-0000-000000000001','delivered','在庫中',now()),
 ('57300000-0000-0000-0000-000000000002','51000000-0000-0000-0000-000000000001','51100000-0000-0000-0000-000000000001','57100000-0000-0000-0000-000000000002','57200000-0000-0000-0000-000000000002','delivered','在庫中',now()),
 ('57300000-0000-0000-0000-000000000003','51000000-0000-0000-0000-000000000001','51100000-0000-0000-0000-000000000001','57100000-0000-0000-0000-000000000003','57200000-0000-0000-0000-000000000003','delivered','在庫中',now())
on conflict(id) do nothing;

select set_config('app.g4a_accounting_rpc','on',false);
insert into public.invoices(id,store_id,deal_id,customer_id,vehicle_id,invoice_no,status,issue_status,total_amount,paid_amount,unpaid_amount,issued_at)
values('57400000-0000-0000-0000-000000000001','51100000-0000-0000-0000-000000000001','57200000-0000-0000-0000-000000000001','57000000-0000-0000-0000-000000000001','57100000-0000-0000-0000-000000000001','G4B-INV-1','paid','issued',1000,1000,0,now())
on conflict(id) do nothing;
select set_config('app.g4a_accounting_rpc','',false);
insert into public.invoice_payment_ledger(id,tenant_id,store_id,invoice_id,deal_id,vehicle_id,entry_type,amount,payment_method,idempotency_key,request_fingerprint,actor_user_id,actor_role)
values('57500000-0000-0000-0000-000000000001','51000000-0000-0000-0000-000000000001','51100000-0000-0000-0000-000000000001','57400000-0000-0000-0000-000000000001','57200000-0000-0000-0000-000000000001','57100000-0000-0000-0000-000000000001','payment',1000,'cash','g4b-fixture-payment-0001',repeat('a',64),'50000000-0000-0000-0000-000000000001','owner')
on conflict(id) do nothing;
insert into public.inspection_reminder_events(id,company_id,store_id,customer_id,vehicle_id,inspection_expiry_date,reminder_offset_days,event_type,status,idempotency_key)
values('57600000-0000-0000-0000-000000000001','51000000-0000-0000-0000-000000000001','51100000-0000-0000-0000-000000000001','57000000-0000-0000-0000-000000000001','57100000-0000-0000-0000-000000000001',current_date+30,30,'post_delivery_follow_up','pending','g4b-followup-fixture-0001')
on conflict(id) do nothing;
