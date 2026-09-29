-- Preserve all previous values while allowing shared display conversion precision.
begin;
alter table public.vehicles
 alter column purchase_price type numeric,
 alter column base_price type numeric,
 alter column direct_cost_special type numeric,
 alter column direct_cost_accessories type numeric,
 alter column direct_cost_agency type numeric;
alter table public.repair_parts alter column unit_price type numeric, alter column last_purchase_price type numeric;
alter table public.maintenance_job_parts alter column unit_price type numeric, alter column cost_price type numeric;
-- Optional mobile fields may not exist in the separately frozen legacy baseline lane.
do $$ declare v_name text; begin
 foreach v_name in array array['direct_cost_other','direct_cost_repair'] loop
  if exists(select 1 from information_schema.columns where table_schema='public' and table_name='vehicles' and column_name=v_name) then
   execute format('alter table public.vehicles alter column %I type numeric',v_name);
  end if;
 end loop;
end $$;
create or replace function public.set_maintenance_part_stock(p_store_id uuid,p_job_part_id uuid,p_confirm boolean)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_job_id uuid; v_job_status text; v_row public.maintenance_job_parts%rowtype; v_result jsonb; v_old_flag text;
begin
 if p_confirm is null or not public.current_user_can_admin_store(p_store_id) then raise exception 'stock_forbidden' using errcode='42501'; end if;
 -- Always lock the job before its rows, matching cancellation lock order.
 select job_id into v_job_id from public.maintenance_job_parts where id=p_job_part_id and store_id=p_store_id;
 if not found then raise exception 'job_part_not_found' using errcode='42501'; end if;
 select status into v_job_status from public.maintenance_jobs where id=v_job_id and store_id=p_store_id and deleted_at is null for update;
 if not found or (p_confirm and v_job_status='cancelled') then raise exception 'job_stock_locked' using errcode='42501'; end if;
 select * into v_row from public.maintenance_job_parts where id=p_job_part_id and store_id=p_store_id for update;
 if not found or v_row.job_id<>v_job_id then raise exception 'job_part_not_found' using errcode='42501'; end if;
 if not exists(select 1 from public.maintenance_jobs where id=v_row.job_id and store_id=p_store_id and deleted_at is null)
 or v_row.part_id is null or not exists(select 1 from public.repair_parts where id=v_row.part_id and store_id=p_store_id and deleted_at is null) then
  raise exception 'job_part_scope' using errcode='23503'; end if;
 if v_row.quantity<=0 or v_row.quantity::text in ('NaN','Infinity','-Infinity') then raise exception 'invalid_quantity' using errcode='22023'; end if;
 if v_row.stock_adjusted=p_confirm then return jsonb_build_object('ok',true,'replayed',true,'stock_adjusted',p_confirm); end if;
 v_result:=public.adjust_repair_part_stock_decimal(v_row.part_id,p_store_id,case when p_confirm then -v_row.quantity else v_row.quantity end);
 if coalesce((v_result->>'ok')::boolean,false)=false then return v_result; end if;
 v_old_flag:=current_setting('app.job_part_stock_rpc',true);
 perform set_config('app.job_part_stock_rpc','on',true);
 update public.maintenance_job_parts set stock_adjusted=p_confirm,stock_adjusted_at=case when p_confirm then now() else null end where id=p_job_part_id;
 perform set_config('app.job_part_stock_rpc',coalesce(v_old_flag,''),true);
 return v_result||jsonb_build_object('stock_adjusted',p_confirm);
end $$;
revoke all on function public.set_maintenance_part_stock(uuid,uuid,boolean) from public,anon;
grant execute on function public.set_maintenance_part_stock(uuid,uuid,boolean) to authenticated;

create or replace function public.cancel_maintenance_job(
  p_job_id uuid, p_reason text, p_idempotency_key text
) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_job public.maintenance_jobs%rowtype; v_part record; v_actor uuid:=auth.uid(); v_role text; v_restored int:=0; v_stock_result jsonb;
begin
  if v_actor is null then raise exception using errcode='28000', message='ログインが必要です。'; end if;
  if nullif(btrim(p_reason),'') is null or nullif(btrim(p_idempotency_key),'') is null then raise exception using errcode='22023', message='理由と操作IDが必要です。'; end if;
  select * into v_job from public.maintenance_jobs where id=p_job_id for update;
  if not found then raise exception using errcode='P0002', message='整備案件が見つかりません。'; end if;
  v_role:=public.current_user_store_role(v_job.store_id);
  if v_role is null or v_role not in ('owner','admin') then raise exception using errcode='42501', message='整備取消の権限がありません。'; end if;
  if v_job.status='cancelled' then return jsonb_build_object('ok',true,'already_cancelled',true,'job_id',p_job_id); end if;
  if v_job.status='delivered' then raise exception using errcode='23514', message='納車済み整備は取消できません。'; end if;
  for v_part in select * from public.maintenance_job_parts where job_id=p_job_id and store_id=v_job.store_id and stock_adjusted=true and part_id is not null order by part_id,id for update loop
    v_stock_result:=public.set_maintenance_part_stock(v_job.store_id,v_part.id,false);
    if (v_stock_result->>'ok')::boolean is distinct from true then raise exception using errcode='23503', message='復元対象部品が見つかりません。'; end if;
    insert into public.repair_part_stock_movements(store_id,part_id,delta,source_type,source_id,reason,created_by,operation_key)
      values(v_job.store_id,v_part.part_id,v_part.quantity,'maintenance_job',p_job_id,'整備取消による在庫復元',v_actor,p_idempotency_key);
    v_restored:=v_restored+1;
  end loop;
  perform set_config('garage.maintenance_cancel_rpc','on',true);
  update public.maintenance_jobs set status='cancelled',cancelled_at=coalesce(cancelled_at,now()) where id=p_job_id;
  insert into public.audit_logs(store_id,user_id,user_role,action,target_type,target_id,metadata)
    values(v_job.store_id,v_actor,v_role,'update','maintenance_job',p_job_id,jsonb_build_object('event','cancelled','reason',left(btrim(p_reason),500),'restored_part_count',v_restored,'operation_key_hash',encode(extensions.digest(p_idempotency_key,'sha256'),'hex')));
  return jsonb_build_object('ok',true,'job_id',p_job_id,'restored_part_count',v_restored);
exception when unique_violation then
  return jsonb_build_object('ok',true,'already_cancelled',true,'job_id',p_job_id);
end $$;
revoke all on function public.cancel_maintenance_job(uuid,text,text) from public,anon;
grant execute on function public.cancel_maintenance_job(uuid,text,text) to authenticated;

commit;
notify pgrst,'reload schema';
