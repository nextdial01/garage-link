begin;
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','50000000-0000-0000-0000-000000000001',true);
do $$ declare v_result jsonb; v_job uuid; v_customer uuid; v_vehicle uuid; v_customers bigint; v_vehicles bigint; v_jobs bigint;
 v_c jsonb:='{"name":"Inline test","birth_date":"1980-01-01","postal_code":"5500001","address":"Synthetic address"}';
 v_v jsonb:='{"vin":"SYNTHETIC-TEST-VIN","maker":"Legacy Maker","model_name":"Test model","liability_insurance_expiry_date":"2027-01-31"}';
begin
 v_result:=public.save_maintenance_with_links('51100000-0000-0000-0000-000000000001','{"job_no":"INLINE-SUCCESS","tax_display_mode":"excluded","work_details":[{"description":"Oil, check","quantity":1.5,"unit_price":1000,"amount":1500,"tax_rate":0.1}],"work_details_version":1}',v_c,v_v);
 v_job:=(v_result->>'job_id')::uuid; v_customer:=(v_result->>'customer_id')::uuid; v_vehicle:=(v_result->>'vehicle_id')::uuid;
 if not exists(select 1 from public.maintenance_jobs where id=v_job and customer_id=v_customer and vehicle_id=v_vehicle and status='received' and work_details->0->>'description'='Oil, check') then raise exception 'inline link/default failed'; end if;
 if not exists(select 1 from public.customers where id=v_customer and birth_date='1980-01-01') then raise exception 'inline customer missing'; end if;
 if not exists(select 1 from public.vehicles where id=v_vehicle and liability_insurance_expiry_date='2027-01-31') then raise exception 'inline vehicle missing'; end if;
 perform public.save_maintenance_with_links('51100000-0000-0000-0000-000000000001','{"work_memo":"Updated","discount_input_amount":110}',null,null,v_job);
 if not exists(select 1 from public.maintenance_jobs where id=v_job and customer_id=v_customer and vehicle_id=v_vehicle and work_memo='Updated' and discount_input_amount=110) then raise exception 'partial update failed'; end if;
 select count(*) into v_customers from public.customers; select count(*) into v_vehicles from public.vehicles; select count(*) into v_jobs from public.maintenance_jobs;
 begin
  perform public.save_maintenance_with_links('51100000-0000-0000-0000-000000000001','{"job_no":"INLINE-SUCCESS"}',v_c,v_v);
  raise exception 'duplicate was accepted';
 exception when unique_violation then null; end;
 if (select count(*) from public.customers)<>v_customers or (select count(*) from public.vehicles)<>v_vehicles or (select count(*) from public.maintenance_jobs)<>v_jobs then raise exception 'orphan after final job failure'; end if;
 begin perform public.save_maintenance_with_links('51100000-0000-0000-0000-000000000001','{"job_no":"NO-BIRTH"}','{"name":"No birthday"}',null); raise exception 'missing birth accepted'; exception when invalid_parameter_value then null; end;
 begin perform public.save_maintenance_with_links('51100000-0000-0000-0000-000000000001','{"job_no":"BAD-KEY","store_id":"51100000-0000-0000-0000-000000000002"}',null,null); raise exception 'scope key accepted'; exception when invalid_parameter_value then null; end;
 begin perform public.save_maintenance_with_links('51100000-0000-0000-0000-000000000001','{"job_no":"BAD-WORK","work_details":[{"description":"","quantity":1}]}',null,null); raise exception 'bad work accepted'; exception when invalid_parameter_value then null; end;
 begin perform public.save_maintenance_with_links('51100000-0000-0000-0000-000000000001','{"job_no":"BAD-MAKER"}',v_c,v_v||'{"maker":"Other store maker"}'); raise exception 'unregistered maker accepted'; exception when invalid_parameter_value then null; end;
 if (select count(*) from public.customers)<>v_customers then raise exception 'orphan after maker failure'; end if;
end $$;
select set_config('request.jwt.claim.sub','50000000-0000-0000-0000-000000000008',true);
do $$ begin
 begin perform public.save_maintenance_with_links('51100000-0000-0000-0000-000000000001','{"job_no":"OTHER-TENANT"}',null,null); raise exception 'other tenant write'; exception when insufficient_privilege then null; end;
 begin perform public.save_maintenance_with_links('52100000-0000-0000-0000-000000000001','{"job_no":"OTHER-LINK","customer_id":"93000000-0000-0000-0000-000000000001"}',null,null); raise exception 'other tenant link'; exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub','50000000-0000-0000-0000-000000000005',true);
do $$ begin
 begin perform public.save_maintenance_with_links('51100000-0000-0000-0000-000000000001','{"job_no":"VIEWER"}',null,null); raise exception 'viewer write'; exception when insufficient_privilege then null; end;
end $$;
rollback;
select 'OVERHAUL_INLINE_ATOMIC_PASS' result;
