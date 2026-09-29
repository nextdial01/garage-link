begin;
do $$ begin
 if (select maker from public.vehicles where id='91000000-0000-0000-0000-000000000001')<>'Legacy Maker' then raise exception 'maker lost'; end if;
 if (select category from public.repair_parts where id='92000000-0000-0000-0000-000000000001')<>'Legacy Category' then raise exception 'category lost'; end if;
 if (select birth_date from public.customers where id='93000000-0000-0000-0000-000000000001') is not null then raise exception 'birthday changed'; end if;
 if (select work_items from public.maintenance_jobs where id='94000000-0000-0000-0000-000000000001')<>array['Name, with comma'] then raise exception 'work lost'; end if;
 if exists(select 1 from public.quotes where id='95000000-0000-0000-0000-000000000001' and tax_display_mode is not null) then raise exception 'legacy snapshot overwritten'; end if;
 if (select count(*) from public.store_master_entries where store_id='51100000-0000-0000-0000-000000000001')<>2 then raise exception 'master seed mismatch'; end if;
 if exists(select 1 from public.store_master_entries where store_id='51100000-0000-0000-0000-000000000002') then raise exception 'empty store was seeded'; end if;
end $$;
update public.vehicles set liability_insurance_expiry_date='2027-01-31' where id='91000000-0000-0000-0000-000000000001';
update public.stores set tax_display_mode='excluded' where id='51100000-0000-0000-0000-000000000001';
update public.maintenance_jobs set work_details='[{"description":"Work, with comma","quantity":1.5,"unit_price":1000,"amount":1500,"tax_rate":0.1,"tax_category":"taxable","unit":"hour","note":"snapshot"}]',work_details_version=1 where id='94000000-0000-0000-0000-000000000001';
do $$ begin
 if (select liability_insurance_expiry_date from public.vehicles where id='91000000-0000-0000-0000-000000000001')<>'2027-01-31'::date then raise exception 'liability date lost'; end if;
 if (select work_details->0->>'description' from public.maintenance_jobs where id='94000000-0000-0000-0000-000000000001')<>'Work, with comma' then raise exception 'work comma lost'; end if;
 if exists(select 1 from public.quotes where id='95000000-0000-0000-0000-000000000001' and tax_display_mode is not null) then raise exception 'store mode mutated legacy snapshot'; end if;
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub','50000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);
insert into public.store_master_entries(store_id,kind,label) values('51100000-0000-0000-0000-000000000001','unit','本');
update public.store_master_entries set label='個',is_active=false,sort_order=3 where label='本';
do $$ declare v json; begin
 v:=public.adjust_repair_part_stock_decimal('92000000-0000-0000-0000-000000000001','51100000-0000-0000-0000-000000000001',-1.5);
 if (v->>'new_stock')::numeric<>8.5 then raise exception 'decimal decrement failed'; end if;
 v:=public.adjust_repair_part_stock('92000000-0000-0000-0000-000000000001','51100000-0000-0000-0000-000000000001',1);
 if (v->>'new_stock')::numeric<>9.5 then raise exception 'integer compatibility rounded stock'; end if;
 v:=public.adjust_repair_part_stock_decimal('92000000-0000-0000-0000-000000000001','51100000-0000-0000-0000-000000000001',0.5);
 if (v->>'new_stock')::numeric<>10 then raise exception 'decimal return failed'; end if;
 begin update public.store_master_entries set store_id='51100000-0000-0000-0000-000000000002' where label='個'; raise exception 'scope mutation accepted'; exception when insufficient_privilege then null; end;
 begin delete from public.store_master_entries where label='個'; raise exception 'delete accepted'; exception when insufficient_privilege then null; end;
end $$;
insert into public.invoice_items(store_id,invoice_id,item_order,item_type,name,part_id,quantity,unit_price,amount)
 values('51100000-0000-0000-0000-000000000001','96000000-0000-0000-0000-000000000001',1,'part','Decimal','92000000-0000-0000-0000-000000000001',1.5,1000,1500);
select public.confirm_invoice_part_stock('96000000-0000-0000-0000-000000000001','51100000-0000-0000-0000-000000000001');
select public.confirm_invoice_part_stock('96000000-0000-0000-0000-000000000001','51100000-0000-0000-0000-000000000001');
do $$ begin if (select stock from public.repair_parts where id='92000000-0000-0000-0000-000000000001')<>8.5 then raise exception 'invoice stock/idempotency failed'; end if; end $$;
select public.cancel_invoice_part_stock('96000000-0000-0000-0000-000000000001','51100000-0000-0000-0000-000000000001');
select public.cancel_invoice_part_stock('96000000-0000-0000-0000-000000000001','51100000-0000-0000-0000-000000000001');
do $$ begin if (select stock from public.repair_parts where id='92000000-0000-0000-0000-000000000001')<>10 then raise exception 'invoice return/idempotency failed'; end if; end $$;
select set_config('request.jwt.claim.sub','50000000-0000-0000-0000-000000000004',true);
do $$ begin
 if (select count(*) from public.store_master_entries)<>3 then raise exception 'staff read failed'; end if;
 begin insert into public.store_master_entries(store_id,kind,label) values('51100000-0000-0000-0000-000000000001','unit','bad'); raise exception 'staff write accepted'; exception when insufficient_privilege then null; end;
 begin perform public.adjust_repair_part_stock_decimal('92000000-0000-0000-0000-000000000001','51100000-0000-0000-0000-000000000001',-0.5); raise exception 'staff stock accepted'; exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub','50000000-0000-0000-0000-000000000008',true);
do $$ begin
 if exists(select 1 from public.store_master_entries where store_id='51100000-0000-0000-0000-000000000001') then raise exception 'other tenant read'; end if;
 begin insert into public.store_master_entries(store_id,kind,label) values('51100000-0000-0000-0000-000000000001','unit','bad'); raise exception 'other tenant write'; exception when insufficient_privilege then null; end;
end $$;
reset role;
select set_config('app.g4a_accounting_rpc','on',true);
update public.invoices set issue_status='issued',tax_display_mode='included' where id='96000000-0000-0000-0000-000000000001';
select set_config('app.g4a_accounting_rpc','off',true);
do $$ begin
 begin update public.invoices set tax_display_mode='excluded' where id='96000000-0000-0000-0000-000000000001'; raise exception 'issued snapshot editable'; exception when insufficient_privilege then null; end;
end $$;
rollback;
select 'OVERHAUL_BUSINESS_CONTRACT_PASS' result;
