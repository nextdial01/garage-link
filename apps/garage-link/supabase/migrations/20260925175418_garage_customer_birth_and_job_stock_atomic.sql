begin;
-- Existing NULL rows remain readable; only a subsequent save requires completion.
create or replace function public.guard_customer_birth_date() returns trigger
language plpgsql set search_path=public,pg_temp as $$ begin
 if new.birth_date is null or new.birth_date>current_date then
  raise exception '有効な生年月日を入力してください' using errcode='22023';
 end if;
 return new;
end $$;
create trigger customers_birth_date_required before insert or update on public.customers
for each row execute function public.guard_customer_birth_date();

create or replace function public.guard_job_part_stock_state() returns trigger
language plpgsql set search_path=public,pg_temp as $$ begin
 if tg_op='DELETE' then
  if old.stock_adjusted then raise exception '在庫を返却してから部品を削除してください' using errcode='42501'; end if;
  return old;
 end if;
 if tg_op='UPDATE' and old.stock_adjusted and (new.quantity is distinct from old.quantity or new.part_id is distinct from old.part_id or new.store_id is distinct from old.store_id or new.job_id is distinct from old.job_id) then
  raise exception '在庫確定済み部品は返却してから変更してください' using errcode='42501';
 end if;
 if (tg_op='INSERT' and (new.stock_adjusted or new.stock_adjusted_at is not null)) or
    (tg_op='UPDATE' and (new.stock_adjusted is distinct from old.stock_adjusted or new.stock_adjusted_at is distinct from old.stock_adjusted_at)) then
  if current_user<>'postgres' or current_setting('app.job_part_stock_rpc',true) is distinct from 'on' then
   raise exception '在庫状態は専用操作から変更してください' using errcode='42501';
  end if;
 end if;
 return new;
end $$;
create trigger maintenance_job_parts_stock_guard before insert or update or delete on public.maintenance_job_parts
for each row execute function public.guard_job_part_stock_state();

create or replace function public.set_maintenance_part_stock(p_store_id uuid,p_job_part_id uuid,p_confirm boolean)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_row public.maintenance_job_parts%rowtype; v_result jsonb; v_old_flag text;
begin
 if p_confirm is null or not public.current_user_can_admin_store(p_store_id) then raise exception 'stock_forbidden' using errcode='42501'; end if;
 select * into v_row from public.maintenance_job_parts where id=p_job_part_id and store_id=p_store_id for update;
 if not found then raise exception 'job_part_not_found' using errcode='42501'; end if;
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
commit;
notify pgrst,'reload schema';
