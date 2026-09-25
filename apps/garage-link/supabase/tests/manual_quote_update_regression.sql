\set ON_ERROR_STOP on
do $$ begin
  if coalesce(current_setting('app.g0b_fixture',true),'') <> 'enabled' then
    raise exception 'DISPOSABLE_DATABASE_REQUIRED';
  end if;
end $$;
begin;
insert into public.quotes(id,store_id,quote_no,title,status,issue_status,total_amount)
values ('59000000-0000-4000-8000-000000000001','51100000-0000-0000-0000-000000000001','MANUAL-QUOTE-TEST','Before','下書き','draft',1000);
set local role authenticated;
select set_config('request.jwt.claim.sub','50000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);
select public.switch_active_garage_store('51000000-0000-0000-0000-000000000001','51100000-0000-0000-0000-000000000001','manual-regression');
update public.quotes set title='After' where id='59000000-0000-4000-8000-000000000001';
do $$ begin
  if (select title from public.quotes where id='59000000-0000-4000-8000-000000000001') is distinct from 'After' then
    raise exception 'QUOTE_EDIT_READBACK_FAILED';
  end if;
end $$;
update public.quotes set status='送付済み' where id='59000000-0000-4000-8000-000000000001';
do $$ begin
  if (select status from public.quotes where id='59000000-0000-4000-8000-000000000001') is distinct from '送付済み' then
    raise exception 'QUOTE_STATUS_READBACK_FAILED';
  end if;
end $$;
insert into public.quote_items(store_id,quote_id,name,amount)
values ('51100000-0000-0000-0000-000000000001','59000000-0000-4000-8000-000000000001','Manual cost',1000);
update public.quote_items set amount=12345 where quote_id='59000000-0000-4000-8000-000000000001';
delete from public.quote_items where quote_id='59000000-0000-4000-8000-000000000001';
-- A sale still freezes its selected quote and items. The internal sale RPC
-- must be able to set the quote to approved before that protection applies.
update public.quotes set deal_id='53100000-0000-0000-0000-000000000001',
  vehicle_id='53000000-0000-0000-0000-000000000001',issue_status='issued'
where id='59000000-0000-4000-8000-000000000001';
do $$ declare r jsonb; begin
  select public.reserve_vehicle_sale('53100000-0000-0000-0000-000000000001','manual-quote-sale-20260925','manual-regression') into r;
  if r->>'code' <> 'RESERVED' then raise exception 'SALE_REGRESSION: %',r; end if;
  if (select status from public.quotes where id='59000000-0000-4000-8000-000000000001') is distinct from 'approved' then
    raise exception 'INTERNAL_QUOTE_UPDATE_FAILED';
  end if;
  begin
    update public.quotes set total_amount=2 where id='59000000-0000-4000-8000-000000000001';
    raise exception 'SALE_QUOTE_PROTECTION_LOST';
  exception when insufficient_privilege then null; end;
  begin
    update public.quotes set status='下書き' where id='59000000-0000-4000-8000-000000000001';
    raise exception 'SALE_QUOTE_STATUS_PROTECTION_LOST';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.quote_items(store_id,quote_id,name,amount)
    values ('51100000-0000-0000-0000-000000000001','59000000-0000-4000-8000-000000000001','Must reject',1);
    raise exception 'SALE_QUOTE_ITEM_PROTECTION_LOST';
  exception when insufficient_privilege then null; end;
end $$;
-- Numeric database storage is unchanged for all requested values.
do $$ declare cost integer; job uuid; saved public.maintenance_jobs%rowtype; begin
  foreach cost in array array[0,1000,12345] loop
    insert into public.maintenance_jobs(store_id,job_no,job_type,parts_amount,labor_amount,estimated_total_amount)
    values('51100000-0000-0000-0000-000000000001','MANUAL-COST-'||cost,'一般整備',cost,5000,5000+cost) returning id into job;
    select * into strict saved from public.maintenance_jobs where id=job;
    if saved.job_type is distinct from '一般整備' or saved.parts_amount is distinct from cost or saved.estimated_total_amount is distinct from 5000+cost then
      raise exception 'MAINTENANCE_INSERT_READBACK_FAILED: %',cost;
    end if;
    update public.maintenance_jobs set work_memo='unrelated edit' where id=job;
    select * into strict saved from public.maintenance_jobs where id=job;
    if saved.job_type is distinct from '一般整備' or saved.parts_amount is distinct from cost then
      raise exception 'MAINTENANCE_EDIT_READBACK_FAILED: %',cost;
    end if;
  end loop;
end $$;
rollback;
select 'MANUAL_QUOTE_EDIT_STATUS_PASS' as result;
