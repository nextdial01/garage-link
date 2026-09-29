begin;
insert into public.membership_store_assignments(membership_id,tenant_id,store_id)
 select id,tenant_id,store_id from public.memberships where user_id is not null and store_id is not null on conflict do nothing;
insert into public.user_active_store_preferences(user_id,tenant_id,active_store_id,correlation_id)
 select user_id,tenant_id,store_id,'overhaul-test' from public.memberships where user_id is not null and store_id is not null on conflict do nothing;

insert into public.vehicles(id,store_id,maker,purchase_price,base_price) values('91000000-0000-0000-0000-000000000001','51100000-0000-0000-0000-000000000001','Legacy Maker',100.12,200.34);
insert into public.repair_parts(id,store_id,name,category,stock,unit_price,last_purchase_price) values('92000000-0000-0000-0000-000000000001','51100000-0000-0000-0000-000000000001','Decimal test','Legacy Category',10,300.56,400.78);
insert into public.customers(id,store_id,name,birth_date) values('93000000-0000-0000-0000-000000000001','51100000-0000-0000-0000-000000000001','Legacy null birthday',null);
insert into public.maintenance_jobs(id,store_id,job_no,work_items) values('94000000-0000-0000-0000-000000000001','51100000-0000-0000-0000-000000000001','OVERHAUL-LEGACY',array['Name, with comma']);
insert into public.quotes(id,store_id,quote_no) values('95000000-0000-0000-0000-000000000001','51100000-0000-0000-0000-000000000001','OVERHAUL-LEGACY');
insert into public.invoices(id,store_id,invoice_no) values('96000000-0000-0000-0000-000000000001','51100000-0000-0000-0000-000000000001','OVERHAUL-LEGACY');
insert into public.quote_items(store_id,quote_id,item_order,item_type,name,quantity,unit_price,amount) values('51100000-0000-0000-0000-000000000001','95000000-0000-0000-0000-000000000001',0,'other','Legacy line',1,100,100);
commit;
