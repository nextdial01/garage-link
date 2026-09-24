\set ON_ERROR_STOP on
begin;
insert into auth.users(id,email) values
  ('71000000-0000-4000-8000-000000000001','mobile-v2-owner@example.invalid'),
  ('71000000-0000-4000-8000-000000000002','mobile-v2-viewer@example.invalid');
insert into public.tenants(id,name,status,plan_code) values
  ('71000000-0000-4000-8000-000000000010','V2 QA tenant','active','free'),
  ('71000000-0000-4000-8000-000000000011','V2 foreign tenant','active','free');
insert into public.stores(id,tenant_id,name,status,plan_code) values
  ('71000000-0000-4000-8000-000000000020','71000000-0000-4000-8000-000000000010','V2 store','active','free'),
  ('71000000-0000-4000-8000-000000000021','71000000-0000-4000-8000-000000000011','Foreign store','active','free');
-- Disposable fixture: allow a second member so the viewer boundary can be tested.
update public.garage_plan_entitlements set staff_limit=2 where plan='free';
insert into public.memberships(tenant_id,store_id,user_id,email,role,status,joined_at,invite_accepted_at) values
  ('71000000-0000-4000-8000-000000000010','71000000-0000-4000-8000-000000000020','71000000-0000-4000-8000-000000000001','mobile-v2-owner@example.invalid','owner','active',now(),now()),
  ('71000000-0000-4000-8000-000000000010','71000000-0000-4000-8000-000000000020','71000000-0000-4000-8000-000000000002','mobile-v2-viewer@example.invalid','viewer','active',now(),now());
insert into public.customers(id,store_id,name,phone) values
  ('71000000-0000-4000-8000-000000000030','71000000-0000-4000-8000-000000000020','V2 customer','09000000000');
insert into public.vehicles(id,store_id,vin,maker,model_name,status,purchase_price,purchase_date,direct_cost_other,direct_cost_repair,market_value)
  values('71000000-0000-4000-8000-000000000040','71000000-0000-4000-8000-000000000020','V2TESTVIN','Toyota','Test','在庫中',100000,current_date,7000,3000,200000);
insert into public.vehicles(id,store_id,vin,maker,model_name,status,purchase_price,purchase_date)
  values('71000000-0000-4000-8000-000000000041','71000000-0000-4000-8000-000000000021','V2FOREIGNVIN','Other','Hidden','在庫中',900000,current_date);
insert into public.deals(id,store_id,customer_id,vehicle_id,title,status)
  values('71000000-0000-4000-8000-000000000050','71000000-0000-4000-8000-000000000020','71000000-0000-4000-8000-000000000030','71000000-0000-4000-8000-000000000040','V2 deal','商談中');
insert into public.maintenance_jobs(id,store_id,customer_id,vehicle_id,job_no,status,request_detail)
  values('71000000-0000-4000-8000-000000000060','71000000-0000-4000-8000-000000000020','71000000-0000-4000-8000-000000000030','71000000-0000-4000-8000-000000000040','V2-JOB-1','received','点検');

set local role service_role;
do $$ declare v_result jsonb; v_quote uuid; begin
  v_quote := public.garage_mobile_create_quote(
    '71000000-0000-4000-8000-000000000020','71000000-0000-4000-8000-000000000001','owner','mobile-v2-quote-1',
    '{"quoteNo":"Q-V2-1","title":"V2見積","customerId":"71000000-0000-4000-8000-000000000030","vehicleId":"71000000-0000-4000-8000-000000000040","dealId":"71000000-0000-4000-8000-000000000050","issueDate":"2026-09-25","subtotalAmount":1000,"taxAmount":100,"totalAmount":1100}'::jsonb,
    '[{"item_order":1,"item_type":"service","name":"点検","quantity":1,"unit_price":1000,"tax_rate":0.1,"tax_amount":100,"amount":1000}]'::jsonb
  );
  if v_quote is null then raise exception 'quote not created'; end if;
  if v_quote <> public.garage_mobile_create_quote(
    '71000000-0000-4000-8000-000000000020','71000000-0000-4000-8000-000000000001','owner','mobile-v2-quote-1',
    '{"quoteNo":"Q-V2-1","title":"V2見積","customerId":"71000000-0000-4000-8000-000000000030","vehicleId":"71000000-0000-4000-8000-000000000040","dealId":"71000000-0000-4000-8000-000000000050","issueDate":"2026-09-25","subtotalAmount":1000,"taxAmount":100,"totalAmount":1100}'::jsonb,
    '[{"item_order":1,"item_type":"service","name":"点検","quantity":1,"unit_price":1000,"tax_rate":0.1,"tax_amount":100,"amount":1000}]'::jsonb
  ) then raise exception 'quote replay created a duplicate'; end if;
  v_result := public.garage_mobile_update_maintenance('71000000-0000-4000-8000-000000000020','71000000-0000-4000-8000-000000000060','71000000-0000-4000-8000-000000000001','owner','mobile-v2-job-1',repeat('a',64),'working',false,null);
  if v_result->>'outcome'<>'updated' then raise exception 'maintenance update failed: %',v_result; end if;
  v_result := public.garage_mobile_update_maintenance('71000000-0000-4000-8000-000000000020','71000000-0000-4000-8000-000000000060','71000000-0000-4000-8000-000000000001','owner','mobile-v2-job-1',repeat('a',64),'working',false,null);
  if v_result->>'outcome'<>'replayed' then raise exception 'maintenance replay failed: %',v_result; end if;
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub','71000000-0000-4000-8000-000000000001',true);
do $$ begin
  insert into public.customers(id,store_id,name,phone) values
    ('71000000-0000-4000-8000-000000000080','71000000-0000-4000-8000-000000000020','V2 created on mobile','09011112222');
  update public.customers set phone='09033334444' where id='71000000-0000-4000-8000-000000000080';
  if (select phone from public.customers where id='71000000-0000-4000-8000-000000000080')<>'09033334444' then raise exception 'customer write/readback failed'; end if;
  insert into public.appointments(id,store_id,customer_id,vehicle_id,deal_id,scheduled_at)
    values('71000000-0000-4000-8000-000000000081','71000000-0000-4000-8000-000000000020','71000000-0000-4000-8000-000000000030','71000000-0000-4000-8000-000000000040','71000000-0000-4000-8000-000000000050',now()+interval '1 day');
  if not exists(select 1 from public.appointments where id='71000000-0000-4000-8000-000000000081') then raise exception 'appointment write/readback failed'; end if;
  insert into public.trade_in_vehicles(id,store_id,deal_id,customer_id,maker,appraisal_amount)
    values('71000000-0000-4000-8000-000000000082','71000000-0000-4000-8000-000000000020','71000000-0000-4000-8000-000000000050','71000000-0000-4000-8000-000000000030','Honda',50000);
  if not exists(select 1 from public.trade_in_vehicles where id='71000000-0000-4000-8000-000000000082') then raise exception 'trade-in write/readback failed'; end if;
  if exists(select 1 from public.vehicles where id='71000000-0000-4000-8000-000000000041') then raise exception 'foreign store vehicle read succeeded'; end if;
  update public.vehicles set purchase_price=1 where id='71000000-0000-4000-8000-000000000041';
  if found then raise exception 'foreign store vehicle update succeeded'; end if;
end $$;
do $$ declare v_quote uuid; v_result jsonb; begin
  v_result := public.inventory_dashboard_metrics('71000000-0000-4000-8000-000000000020')::jsonb;
  if (v_result->>'inventory_total_cost')::numeric<>110000 or (v_result->>'expected_gross_profit')::numeric<>90000 then
    raise exception 'inventory cost metrics mismatch: %',v_result;
  end if;
  v_result := public.inventory_dashboard_metrics('71000000-0000-4000-8000-000000000021')::jsonb;
  if (v_result->>'in_stock_count')::numeric<>0 then raise exception 'foreign store inventory exposed: %',v_result; end if;
  v_quote := (select id from public.quotes where quote_no='Q-V2-1');
  v_result := public.garage_mobile_invoice_from_quote('71000000-0000-4000-8000-000000000020',v_quote,'71000000-0000-4000-8000-000000000070',current_date+7);
  if v_result->>'code'<>'CREATED' then raise exception 'invoice create failed: %',v_result; end if;
  v_result := public.garage_mobile_invoice_from_quote('71000000-0000-4000-8000-000000000020',v_quote,'71000000-0000-4000-8000-000000000070',current_date+7);
  if v_result->>'code'<>'REPLAYED' then raise exception 'invoice replay failed: %',v_result; end if;
  v_result := public.garage_mobile_reserve_sale_with_price('71000000-0000-4000-8000-000000000050',120000,'mobile-v2-sale-1');
  if v_result->>'code'<>'RESERVED' then raise exception 'sale failed: %',v_result; end if;
  if (select sale_price from public.vehicles where id='71000000-0000-4000-8000-000000000040')<>120000 then raise exception 'sale price mismatch'; end if;
  v_result := public.garage_mobile_reserve_sale_with_price('71000000-0000-4000-8000-000000000050',120000,'mobile-v2-sale-1');
  if v_result->>'code'<>'RESERVED' then raise exception 'sale replay failed: %',v_result; end if;
  v_result := public.garage_mobile_reserve_sale_with_price('71000000-0000-4000-8000-000000000050',120000,'mobile-v2-sale-foreign');
  if v_result->>'code' not in ('ALREADY_COMPLETED','ALREADY_RESERVED') then raise exception 'sale idempotency status unexpected: %',v_result; end if;
  v_result := public.issue_garage_invoice('71000000-0000-4000-8000-000000000070','mobile-v2-issue-1',null);
  if v_result->>'code'<>'ISSUED' then raise exception 'invoice issue failed: %',v_result; end if;
  v_result := public.record_garage_payment('71000000-0000-4000-8000-000000000070',500,'現金','mobile-v2-payment-1',null);
  if v_result->>'code'<>'PAYMENT_RECORDED' then raise exception 'payment failed: %',v_result; end if;
  v_result := public.record_garage_payment('71000000-0000-4000-8000-000000000070',500,'現金','mobile-v2-payment-1',null);
  if v_result->>'code'<>'PAYMENT_RECORDED' then raise exception 'payment replay failed: %',v_result; end if;
  if (select unpaid_amount from public.invoices where id='71000000-0000-4000-8000-000000000070')<>600 then raise exception 'payment balance mismatch'; end if;
  v_result := public.record_garage_payment('71000000-0000-4000-8000-000000000070',601,'現金','mobile-v2-payment-over',null);
  if v_result->>'code'<>'OVERPAYMENT' then raise exception 'overpayment accepted: %',v_result; end if;
  v_result := public.cancel_vehicle_sale('71000000-0000-4000-8000-000000000050','mobile-v2-cancel-after-payment',null);
  if v_result->>'code'<>'PAYMENT_EXISTS' then raise exception 'paid sale cancellation accepted: %',v_result; end if;
  v_result := public.complete_vehicle_delivery('71000000-0000-4000-8000-000000000050','mobile-v2-delivery-1',null);
  if v_result->>'code'<>'DELIVERED' then raise exception 'delivery failed: %',v_result; end if;
  if (select status from public.vehicles where id='71000000-0000-4000-8000-000000000040')<>'納車済み' then raise exception 'delivery vehicle state mismatch'; end if;
end $$;

select set_config('request.jwt.claim.sub','71000000-0000-4000-8000-000000000002',true);
do $$ declare v_result jsonb; begin
  v_result := public.garage_mobile_reserve_sale_with_price('71000000-0000-4000-8000-000000000050',120000,'mobile-v2-viewer-1');
  if v_result->>'code' not in ('SCOPE_FORBIDDEN','ROLE_FORBIDDEN') then raise exception 'viewer sale accepted: %',v_result; end if;
  v_result := public.garage_mobile_invoice_from_quote('71000000-0000-4000-8000-000000000020',(select id from public.quotes where quote_no='Q-V2-1'),'71000000-0000-4000-8000-000000000071',current_date+7);
  if v_result->>'code'<>'ROLE_FORBIDDEN' then raise exception 'viewer invoice accepted: %',v_result; end if;
end $$;
rollback;
select 'MOBILE_V2_RUNTIME_CONTRACT_PASS' as result;
