begin;
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','50000000-0000-0000-0000-000000000001',true);
do $$ declare v_before jsonb; v_after jsonb; v_id uuid; begin
 select to_jsonb(c) into v_before from public.customers c where id='93000000-0000-0000-0000-000000000001';
 if v_before is null or v_before->>'birth_date' is not null then raise exception 'legacy NULL fixture missing'; end if;
 begin insert into public.customers(store_id,name) values('51100000-0000-0000-0000-000000000001','No birthday'); raise exception 'NULL insert accepted'; exception when invalid_parameter_value then null; end;
 begin update public.customers set name='business edit' where id='93000000-0000-0000-0000-000000000001'; raise exception 'NULL edit accepted'; exception when invalid_parameter_value then null; end;
 begin update public.customers set deleted_at=now(),deleted_by='test',is_archived=true,name='mixed edit' where id='93000000-0000-0000-0000-000000000001'; raise exception 'mixed archive accepted'; exception when invalid_parameter_value then null; end;
 begin update public.customers set is_archived=true where id='93000000-0000-0000-0000-000000000001'; raise exception 'incomplete archive accepted'; exception when invalid_parameter_value then null; end;
 update public.customers set deleted_at=now(),deleted_by='synthetic',is_archived=true where id='93000000-0000-0000-0000-000000000001';
 if not exists(select 1 from public.customers where id='93000000-0000-0000-0000-000000000001' and deleted_at is not null and is_archived and birth_date is null) then raise exception 'archive failed'; end if;
 begin update public.customers set deleted_at=null,deleted_by=null,is_archived=false,phone='00000000' where id='93000000-0000-0000-0000-000000000001'; raise exception 'mixed restore accepted'; exception when invalid_parameter_value then null; end;
 update public.customers set deleted_at=null,deleted_by=null,is_archived=false where id='93000000-0000-0000-0000-000000000001';
 select to_jsonb(c) into v_after from public.customers c where id='93000000-0000-0000-0000-000000000001';
 if (v_after-array['deleted_at','deleted_by','is_archived','updated_at']) is distinct from (v_before-array['deleted_at','deleted_by','is_archived','updated_at']) then raise exception 'profile changed'; end if;
 if v_after->>'deleted_at' is not null or (v_after->>'is_archived')::boolean then raise exception 'restore failed'; end if;
 begin update public.customers set updated_at=now() where id='93000000-0000-0000-0000-000000000001'; raise exception 'no transition bypass accepted'; exception when invalid_parameter_value then null; end;
 begin update public.customers set birth_date=current_date+1 where id='93000000-0000-0000-0000-000000000001'; raise exception 'future DOB accepted'; exception when invalid_parameter_value then null; end;
 insert into public.customers(store_id,name,birth_date) values('51100000-0000-0000-0000-000000000001','Valid birthday','1990-01-01') returning id into v_id;
 begin update public.customers set birth_date=null,deleted_at=now(),deleted_by='test',is_archived=true where id=v_id; raise exception 'DOB clearing via archive accepted'; exception when invalid_parameter_value then null; end;
 update public.customers set name='valid edited' where id=v_id;
end $$;
select set_config('request.jwt.claim.sub','50000000-0000-0000-0000-000000000008',true);
do $$ declare v_count integer; begin
 update public.customers set deleted_at=now(),deleted_by='cross-store',is_archived=true where id='93000000-0000-0000-0000-000000000001';
 get diagnostics v_count=row_count;
 if v_count<>0 then raise exception 'other-store archive permitted'; end if;
end $$;
select set_config('request.jwt.claim.sub','50000000-0000-0000-0000-000000000005',true);
do $$ declare v_count integer; begin
 begin
  update public.customers set deleted_at=now(),deleted_by='viewer',is_archived=true where id='93000000-0000-0000-0000-000000000001';
  get diagnostics v_count=row_count;
  if v_count<>0 then raise exception 'viewer archive permitted'; end if;
 exception when insufficient_privilege then null; end;
end $$;
rollback;
select 'OVERHAUL_BIRTH_LIFECYCLE_PASS' result;
