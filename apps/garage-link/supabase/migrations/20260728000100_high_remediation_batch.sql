-- GARAGE LINK G7: unresolved High remediation batch
-- Forward-only expand migration. Existing applied migrations are intentionally unchanged.

-- ---------------------------------------------------------------------------
-- AUTH-002 / BILL-001: canonical membership only and serialized tenant quotas.
-- ---------------------------------------------------------------------------
create or replace function public.garage_plan_limit_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_store_id uuid;
  v_tenant_id uuid;
  v_subscription public.company_subscriptions%rowtype;
  v_store_ids uuid[];
  v_count bigint;
  v_limit bigint;
  v_used_bytes bigint;
begin
  if tg_table_name = 'stores' then
    v_store_id := new.id;
    v_tenant_id := new.tenant_id;
  elsif tg_table_name = 'memberships' then
    v_store_id := new.store_id;
    v_tenant_id := new.tenant_id;
  else
    v_store_id := new.store_id;
    v_tenant_id := null;
  end if;

  if v_tenant_id is null then
    select tenant_id into v_tenant_id from public.stores where id = v_store_id;
  end if;
  if v_tenant_id is null then
    raise exception using errcode = '23514', message = 'tenant scope is required';
  end if;

  -- Serializes count-and-create for every resource in one tenant.
  perform pg_advisory_xact_lock(hashtextextended(v_tenant_id::text, 714001));

  select coalesce(array_agg(id), array[]::uuid[]) into v_store_ids
  from public.stores where tenant_id = v_tenant_id;

  select * into v_subscription
  from public.company_subscriptions
  where tenant_id = v_tenant_id and status = 'active'
  order by updated_at desc nulls last limit 1
  for share;
  if not found then
    v_subscription.plan := 'free';
    v_subscription.included_staff_count := 1;
    v_subscription.extra_staff_count := 0;
    v_subscription.included_store_count := 1;
    v_subscription.extra_store_count := 0;
    v_subscription.storage_limit_mb := 500;
    v_subscription.extra_storage_gb := 0;
    v_subscription.current_inventory_limit := 5;
  end if;

  if tg_table_name = 'vehicles' then
    if new.deleted_at is null and coalesce(new.is_archived, false) = false
       and lower(coalesce(new.status, '')) not in ('売却済み','納車済み','sold','delivered','archived','deleted') then
      select count(*) into v_count from public.vehicles v
      where v.store_id = any(v_store_ids) and v.id is distinct from new.id
        and v.deleted_at is null and coalesce(v.is_archived, false) = false
        and lower(coalesce(v.status, '')) not in ('売却済み','納車済み','sold','delivered','archived','deleted');
      if v_count >= v_subscription.current_inventory_limit then
        raise exception using errcode = 'P0001', message = '契約全店舗の在庫登録上限に達しています。';
      end if;
    end if;
  elsif tg_table_name in ('quotes','invoices') and v_subscription.plan in ('free','starter') then
    v_limit := case v_subscription.plan when 'starter' then 20 else 5 end;
    select (select count(*) from public.quotes q where q.store_id=any(v_store_ids) and q.created_at>=date_trunc('month',now()))
         + (select count(*) from public.invoices i where i.store_id=any(v_store_ids) and i.created_at>=date_trunc('month',now()))
      into v_count;
    if v_count >= v_limit then raise exception using errcode='P0001', message='契約全店舗の今月の帳票作成上限に達しています。'; end if;
  elsif tg_table_name = 'uploaded_files' then
    v_limit := (v_subscription.storage_limit_mb + v_subscription.extra_storage_gb*1024)::bigint*1024*1024;
    select coalesce(sum(size_bytes),0) into v_used_bytes from public.uploaded_files where tenant_id=v_tenant_id and deleted_at is null;
    if v_used_bytes + new.size_bytes > v_limit then raise exception using errcode='P0001', message='契約全店舗のストレージ上限に達しています。'; end if;
  elsif tg_table_name = 'memberships' then
    if new.status = 'active' and new.deleted_at is null then
      v_limit := v_subscription.included_staff_count + v_subscription.extra_staff_count;
      select count(distinct m.user_id) into v_count from public.memberships m
      where m.tenant_id=v_tenant_id and m.id is distinct from new.id and m.status='active'
        and m.deleted_at is null and m.disabled_at is null and m.user_id is not null;
      if v_count >= v_limit then raise exception using errcode='P0001', message='契約全店舗のスタッフ上限に達しています。'; end if;
    end if;
  elsif tg_table_name = 'stores' then
    v_limit := v_subscription.included_store_count + v_subscription.extra_store_count;
    select count(*) into v_count from public.stores s where s.tenant_id=v_tenant_id and s.id is distinct from new.id;
    if v_count >= v_limit then raise exception using errcode='P0001', message='契約の店舗上限に達しています。'; end if;
  end if;
  return new;
end;
$$;

drop trigger if exists guard_staff_plan_limit on public.store_members;
drop trigger if exists guard_membership_plan_limit on public.memberships;
create trigger guard_membership_plan_limit before insert or update of status, deleted_at, disabled_at on public.memberships
for each row execute function public.garage_plan_limit_guard();

-- Store creation is limited to create_store_for_current_user/create_garage_store.
-- Remove every legacy permissive INSERT policy so policy OR-composition cannot
-- bypass tenant scope or the serialized plan guard.
revoke insert on public.stores from anon,authenticated;
drop policy if exists "stores_insert_authenticated" on public.stores;
drop policy if exists g1b_stores_insert_admin on public.stores;

-- ---------------------------------------------------------------------------
-- BILL-002: metadata is server-only and path/scope are database constrained.
-- ---------------------------------------------------------------------------
alter table public.uploaded_files alter column tenant_id set not null;
alter table public.uploaded_files drop constraint if exists uploaded_files_path_scope_check;
alter table public.uploaded_files add constraint uploaded_files_path_scope_check check (
  path like ('tenants/' || tenant_id::text || '/stores/' || store_id::text || '/%')
);
revoke insert, update, delete on public.uploaded_files from anon, authenticated;
drop policy if exists g1b_insert_role on public.uploaded_files;
drop policy if exists g1b_update_role on public.uploaded_files;
drop policy if exists "uploaded_files_insert_own_store" on public.uploaded_files;
drop policy if exists "uploaded_files_update_own_store" on public.uploaded_files;

-- ---------------------------------------------------------------------------
-- PII-001: deleted/archived rows are hidden from normal roles at RLS level.
-- Owner/admin retain trash access through the same tenant/store boundary.
-- ---------------------------------------------------------------------------
do $pii$
declare v_table text;
begin
  foreach v_table in array array['customers','deals','vehicles','maintenance_jobs','quotes','invoices','inventory_counts','uploaded_files'] loop
    if to_regclass('public.'||v_table) is null then continue; end if;
    execute format('drop policy if exists g7_soft_delete_visibility on public.%I',v_table);
    if exists(select 1 from pg_attribute where attrelid=to_regclass('public.'||v_table) and attname='is_archived' and not attisdropped) then
      execute format('create policy g7_soft_delete_visibility on public.%I as restrictive for select to authenticated using ((deleted_at is null and coalesce(is_archived,false)=false) or public.current_user_can_admin_store(store_id))',v_table);
    else
      execute format('create policy g7_soft_delete_visibility on public.%I as restrictive for select to authenticated using ((deleted_at is null) or public.current_user_can_admin_store(store_id))',v_table);
    end if;
  end loop;
end;
$pii$;

-- ---------------------------------------------------------------------------
-- SERVICE-001: one atomic, idempotent cancellation restores adjusted parts only.
-- ---------------------------------------------------------------------------
alter table public.repair_part_stock_movements add column if not exists operation_key text;
create unique index if not exists repair_part_stock_movements_operation_uidx
  on public.repair_part_stock_movements(store_id, operation_key, part_id)
  where operation_key is not null;

create or replace function public.guard_maintenance_cancel_transition()
returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
  if new.status='cancelled' and old.status is distinct from 'cancelled'
     and current_setting('garage.maintenance_cancel_rpc',true) is distinct from 'on' then
    raise exception using errcode='42501', message='整備取消は専用処理を使用してください。';
  end if;
  return new;
end $$;
drop trigger if exists guard_maintenance_cancel_transition on public.maintenance_jobs;
create trigger guard_maintenance_cancel_transition before update of status on public.maintenance_jobs
for each row execute function public.guard_maintenance_cancel_transition();

create or replace function public.cancel_maintenance_job(
  p_job_id uuid, p_reason text, p_idempotency_key text
) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_job public.maintenance_jobs%rowtype; v_part record; v_actor uuid:=auth.uid(); v_role text; v_restored int:=0;
begin
  if v_actor is null then raise exception using errcode='28000', message='ログインが必要です。'; end if;
  if nullif(btrim(p_reason),'') is null or nullif(btrim(p_idempotency_key),'') is null then raise exception using errcode='22023', message='理由と操作IDが必要です。'; end if;
  select * into v_job from public.maintenance_jobs where id=p_job_id for update;
  if not found then raise exception using errcode='P0002', message='整備案件が見つかりません。'; end if;
  v_role:=public.current_user_store_role(v_job.store_id);
  if v_role is null or v_role not in ('owner','admin') then raise exception using errcode='42501', message='整備取消の権限がありません。'; end if;
  if v_job.status='cancelled' then return jsonb_build_object('ok',true,'already_cancelled',true,'job_id',p_job_id); end if;
  if v_job.status='delivered' then raise exception using errcode='23514', message='納車済み整備は取消できません。'; end if;
  for v_part in select * from public.maintenance_job_parts where job_id=p_job_id and store_id=v_job.store_id and stock_adjusted=true and part_id is not null for update loop
    update public.repair_parts set stock=stock+v_part.quantity, updated_at=now() where id=v_part.part_id and store_id=v_job.store_id;
    if not found then raise exception using errcode='23503', message='復元対象部品が見つかりません。'; end if;
    insert into public.repair_part_stock_movements(store_id,part_id,delta,source_type,source_id,reason,created_by,operation_key)
      values(v_job.store_id,v_part.part_id,v_part.quantity,'maintenance_job',p_job_id,'整備取消による在庫復元',v_actor,p_idempotency_key);
    update public.maintenance_job_parts set stock_adjusted=false,stock_adjusted_at=now() where id=v_part.id;
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

-- ---------------------------------------------------------------------------
-- INVENTORY-001: atomic snapshot creation and controlled finalization.
-- ---------------------------------------------------------------------------
alter table public.inventory_counts add column if not exists snapshot_at timestamptz;
alter table public.inventory_counts add column if not exists idempotency_key text;
alter table public.inventory_counts drop constraint if exists inventory_counts_status_g7_check;
alter table public.inventory_counts add constraint inventory_counts_status_g7_check check(status in ('draft','in_progress','completed','cancelled'));
create unique index if not exists inventory_counts_store_operation_uidx on public.inventory_counts(store_id,idempotency_key) where idempotency_key is not null;
create unique index if not exists inventory_counts_one_active_store_uidx on public.inventory_counts(store_id) where status='in_progress' and deleted_at is null;
create unique index if not exists inventory_count_items_vehicle_uidx on public.inventory_count_items(inventory_count_id,vehicle_id) where vehicle_id is not null and deleted_at is null;
create unique index if not exists inventory_count_items_part_uidx on public.inventory_count_items(inventory_count_id,part_sku) where part_sku is not null and deleted_at is null;

-- Snapshot identity and quantities are immutable after creation. Operators may
-- only record the observed quantity/check metadata on an existing snapshot row.
create or replace function public.guard_inventory_count_item_snapshot()
returns trigger language plpgsql set search_path=public,pg_temp as $$
declare v_count_status text;
begin
  if tg_op='UPDATE' and (
    new.store_id is distinct from old.store_id or
    new.inventory_count_id is distinct from old.inventory_count_id or
    new.item_type is distinct from old.item_type or
    new.vehicle_id is distinct from old.vehicle_id or
    new.part_sku is distinct from old.part_sku or
    new.system_quantity is distinct from old.system_quantity or
    new.management_no is distinct from old.management_no or
    new.item_name is distinct from old.item_name or
    new.location_name is distinct from old.location_name or
    new.deleted_at is distinct from old.deleted_at or
    new.is_archived is distinct from old.is_archived
  ) then
    raise exception using errcode='42501',message='棚卸しsnapshotの識別子と帳簿数量は変更できません。';
  end if;
  select status into v_count_status from public.inventory_counts where id=new.inventory_count_id;
  if v_count_status is distinct from 'in_progress' then
    raise exception using errcode='42501',message='進行中ではない棚卸しsnapshotは変更できません。';
  end if;
  new.difference_quantity:=case when new.actual_quantity is null then null else new.actual_quantity-new.system_quantity end;
  new.check_status:=case when new.actual_quantity is null then 'unchecked' else 'checked' end;
  new.checked_at:=case when new.actual_quantity is null then null else coalesce(new.checked_at,clock_timestamp()) end;
  return new;
end $$;
drop trigger if exists guard_inventory_count_item_snapshot on public.inventory_count_items;
create trigger guard_inventory_count_item_snapshot before insert or update on public.inventory_count_items
for each row execute function public.guard_inventory_count_item_snapshot();

-- Snapshot rows can only be created by create_inventory_count. Soft-delete and
-- direct DELETE would change the population being counted, so both are denied.
revoke insert,delete on public.inventory_counts from authenticated;
revoke insert,delete on public.inventory_count_items from authenticated;
drop policy if exists g1b_insert_role on public.inventory_counts;
drop policy if exists g1b_delete_role on public.inventory_counts;
drop policy if exists g1b_insert_role on public.inventory_count_items;
drop policy if exists g1b_delete_role on public.inventory_count_items;
drop policy if exists "inventory_counts_insert_own_store" on public.inventory_counts;
drop policy if exists "inventory_counts_delete_own_store" on public.inventory_counts;
drop policy if exists "inventory_count_items_insert_own_store" on public.inventory_count_items;
drop policy if exists "inventory_count_items_delete_own_store" on public.inventory_count_items;
-- Keep table privileges for stable PostgREST denial semantics; with no
-- INSERT/DELETE policy, RLS still rejects every authenticated row.
grant insert,delete on public.inventory_counts to authenticated;
grant insert,delete on public.inventory_count_items to authenticated;

create or replace function public.guard_inventory_terminal_transition()
returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
  if new.status in ('completed','cancelled') and old.status is distinct from new.status
     and current_setting('garage.inventory_rpc',true) is distinct from 'on' then
    raise exception using errcode='42501', message='棚卸しの確定・取消は専用処理を使用してください。';
  end if;
  return new;
end $$;
drop trigger if exists guard_inventory_terminal_transition on public.inventory_counts;
create trigger guard_inventory_terminal_transition before update of status on public.inventory_counts
for each row execute function public.guard_inventory_terminal_transition();

create or replace function public.create_inventory_count(
  p_store_id uuid,p_count jsonb,p_items jsonb,p_idempotency_key text
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_actor uuid:=auth.uid(); v_role text; v_id uuid; v_item jsonb; v_system numeric;
begin
  if v_actor is null then raise exception using errcode='28000',message='ログインが必要です。'; end if;
  v_role:=public.current_user_store_role(p_store_id);
  if v_role is null or v_role not in ('owner','admin','staff') then raise exception using errcode='42501',message='棚卸しを作成する権限がありません。'; end if;
  if nullif(btrim(p_idempotency_key),'') is null or nullif(btrim(p_count->>'count_no'),'') is null or nullif(btrim(p_count->>'name'),'') is null then raise exception using errcode='22023',message='棚卸し番号・名称・操作IDが必要です。'; end if;
  select id into v_id from public.inventory_counts where store_id=p_store_id and idempotency_key=p_idempotency_key;
  if found then return jsonb_build_object('ok',true,'inventory_count_id',v_id,'already_created',true); end if;
  insert into public.inventory_counts(store_id,count_no,name,count_type,count_category,status,scheduled_date,target_inventory,target_vehicle_statuses,target_part_categories,target_condition_memo,target_locations,shelf_area,location_memo,check_method,device_type,barcode_usage,unread_handling,approval_status,internal_memo,caution_note,snapshot_at,started_at,idempotency_key,difference_count,unchecked_count,adjustment_target_count)
  values(p_store_id,btrim(p_count->>'count_no'),btrim(p_count->>'name'),coalesce(p_count->>'count_type','vehicle'),coalesce(p_count->>'count_category','regular'),'in_progress',nullif(p_count->>'scheduled_date','')::date,coalesce(p_count->>'target_inventory','vehicles'),coalesce(array(select jsonb_array_elements_text(coalesce(p_count->'target_vehicle_statuses','[]'::jsonb))),array[]::text[]),coalesce(array(select jsonb_array_elements_text(coalesce(p_count->'target_part_categories','[]'::jsonb))),array[]::text[]),nullif(p_count->>'target_condition_memo',''),coalesce(array(select jsonb_array_elements_text(coalesce(p_count->'target_locations','[]'::jsonb))),array[]::text[]),nullif(p_count->>'shelf_area',''),nullif(p_count->>'location_memo',''),coalesce(p_count->>'check_method','visual'),coalesce(p_count->>'device_type','none'),coalesce(p_count->>'barcode_usage','none'),coalesce(p_count->>'unread_handling','keep_unchecked'),'not_requested',nullif(p_count->>'internal_memo',''),nullif(p_count->>'caution_note',''),clock_timestamp(),clock_timestamp(),p_idempotency_key,0,0,0) returning id into v_id;
  for v_item in select value from jsonb_array_elements(coalesce(p_items,'[]'::jsonb)) loop
    if nullif(v_item->>'vehicle_id','') is not null then
      select 1 into v_system from public.vehicles where id=(v_item->>'vehicle_id')::uuid and store_id=p_store_id and deleted_at is null and coalesce(is_archived,false)=false;
      if not found then raise exception using errcode='23503',message='棚卸し対象車両が店舗scopeにありません。'; end if;
    elsif nullif(v_item->>'part_sku','') is not null then
      select stock into v_system from public.repair_parts where store_id=p_store_id and part_no=v_item->>'part_sku' and deleted_at is null;
      if not found then raise exception using errcode='23503',message='棚卸し対象部品が店舗scopeにありません。'; end if;
    else
      raise exception using errcode='22023',message='車両または部品識別子が必要です。';
    end if;
    insert into public.inventory_count_items(store_id,inventory_count_id,item_type,vehicle_id,part_sku,management_no,item_name,location_name,system_quantity,actual_quantity,difference_quantity,check_status,memo)
    values(p_store_id,v_id,coalesce(v_item->>'item_type','vehicle'),nullif(v_item->>'vehicle_id','')::uuid,nullif(v_item->>'part_sku',''),nullif(v_item->>'management_no',''),nullif(v_item->>'item_name',''),nullif(v_item->>'location_name',''),v_system,nullif(v_item->>'actual_quantity','')::numeric,case when nullif(v_item->>'actual_quantity','') is null then null else nullif(v_item->>'actual_quantity','')::numeric-v_system end,case when nullif(v_item->>'actual_quantity','') is null then 'unchecked' else 'checked' end,nullif(v_item->>'memo',''));
  end loop;
  update public.inventory_counts c set unchecked_count=(select count(*) from public.inventory_count_items i where i.inventory_count_id=c.id and i.check_status='unchecked' and i.deleted_at is null),difference_count=(select count(*) from public.inventory_count_items i where i.inventory_count_id=c.id and coalesce(i.difference_quantity,0)<>0 and i.deleted_at is null),adjustment_target_count=(select count(*) from public.inventory_count_items i where i.inventory_count_id=c.id and coalesce(i.difference_quantity,0)<>0 and i.deleted_at is null) where c.id=v_id;
  insert into public.audit_logs(store_id,user_id,user_role,action,target_type,target_id,metadata) values(p_store_id,v_actor,v_role,'create','inventory_count',v_id,jsonb_build_object('snapshot_at',clock_timestamp(),'operation_key_hash',encode(extensions.digest(p_idempotency_key,'sha256'),'hex')));
  return jsonb_build_object('ok',true,'inventory_count_id',v_id,'already_created',false);
exception when unique_violation then
  select id into v_id from public.inventory_counts where store_id=p_store_id and idempotency_key=p_idempotency_key;
  if v_id is not null then return jsonb_build_object('ok',true,'inventory_count_id',v_id,'already_created',true); end if;
  raise;
end $$;

create or replace function public.finalize_inventory_count(p_inventory_count_id uuid,p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_count public.inventory_counts%rowtype; v_role text; v_unchecked bigint; v_diff bigint;
begin
  select * into v_count from public.inventory_counts where id=p_inventory_count_id for update;
  if not found then raise exception using errcode='P0002',message='棚卸しが見つかりません。'; end if;
  v_role:=public.current_user_store_role(v_count.store_id);
  if v_role is null or v_role not in ('owner','admin') then raise exception using errcode='42501',message='棚卸しを確定する権限がありません。'; end if;
  if v_count.status='completed' then return jsonb_build_object('ok',true,'already_completed',true,'inventory_count_id',v_count.id); end if;
  if v_count.status<>'in_progress' then raise exception using errcode='23514',message='確定できない棚卸し状態です。'; end if;
  select count(*) filter(where check_status='unchecked' or actual_quantity is null),count(*) filter(where coalesce(difference_quantity,0)<>0) into v_unchecked,v_diff from public.inventory_count_items where inventory_count_id=v_count.id and deleted_at is null;
  if v_unchecked>0 then raise exception using errcode='23514',message='未確認明細が残っています。'; end if;
  perform set_config('garage.inventory_rpc','on',true);
  update public.inventory_counts set status='completed',completed_at=clock_timestamp(),difference_count=v_diff,unchecked_count=0,adjustment_target_count=v_diff,approval_status='approved',approved_at=clock_timestamp() where id=v_count.id;
  insert into public.audit_logs(store_id,user_id,user_role,action,target_type,target_id,metadata) values(v_count.store_id,auth.uid(),v_role,'update','inventory_count',v_count.id,jsonb_build_object('event','completed','difference_count',v_diff,'operation_key_hash',encode(extensions.digest(coalesce(p_idempotency_key,''),'sha256'),'hex')));
  return jsonb_build_object('ok',true,'inventory_count_id',v_count.id,'difference_count',v_diff);
end $$;
revoke all on function public.create_inventory_count(uuid,jsonb,jsonb,text) from public,anon;
revoke all on function public.finalize_inventory_count(uuid,text) from public,anon;
grant execute on function public.create_inventory_count(uuid,jsonb,jsonb,text) to authenticated;
grant execute on function public.finalize_inventory_count(uuid,text) to authenticated;

-- ---------------------------------------------------------------------------
-- STRIPE-001/002: ordered event application and durable reconciliation ledger.
-- ---------------------------------------------------------------------------
alter table public.stripe_webhook_events add column if not exists stripe_created bigint;
alter table public.stripe_webhook_events add column if not exists object_id text;
alter table public.company_subscriptions add column if not exists last_stripe_event_created bigint;
alter table public.company_subscriptions add column if not exists last_stripe_event_id text;
alter table public.plan_change_requests add column if not exists stripe_session_id text;
create unique index if not exists plan_change_requests_stripe_session_uidx
  on public.plan_change_requests(stripe_session_id);

create table if not exists public.billing_sync_operations(
  id uuid primary key default extensions.gen_random_uuid(),tenant_id uuid not null references public.tenants(id) on delete cascade,
  company_id uuid not null,actor_user_id uuid,operation_type text not null,idempotency_key text not null,
  requested_plan text,status text not null check(status in ('started','stripe_applied','completed','reconciliation_required','failed')),
  error_code text,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
  unique(tenant_id,idempotency_key),foreign key(company_id,tenant_id) references public.stores(id,tenant_id)
);
alter table public.billing_sync_operations enable row level security;
revoke all on public.billing_sync_operations from anon,authenticated;
grant all on public.billing_sync_operations to service_role;
drop trigger if exists set_billing_sync_operations_updated_at on public.billing_sync_operations;
create trigger set_billing_sync_operations_updated_at before update on public.billing_sync_operations for each row execute function public.set_updated_at();

create or replace function public.apply_ordered_stripe_subscription_event(
 p_company_id uuid,p_plan text,p_status text,p_customer_id text,p_subscription_id text,p_event_id text,p_event_created bigint
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_tenant uuid; v_row public.company_subscriptions%rowtype; v_staff int; v_stores int; v_storage int; v_inventory int; v_link boolean;
begin
  if current_user not in ('service_role','postgres','supabase_admin') then raise exception using errcode='42501',message='service role required'; end if;
  if p_event_created is null or nullif(p_event_id,'') is null then raise exception using errcode='22023',message='Stripe event version is required'; end if;
  select tenant_id into v_tenant from public.stores where id=p_company_id;
  if v_tenant is null then raise exception using errcode='23503',message='subscription store scope not found'; end if;
  select * into v_row from public.company_subscriptions where tenant_id=v_tenant and status in ('active','trialing','past_due','suspended','cancelled') order by updated_at desc limit 1 for update;
  if found and (v_row.last_stripe_event_created>p_event_created or (v_row.last_stripe_event_created=p_event_created and coalesce(v_row.last_stripe_event_id,'')>=p_event_id)) then
    return jsonb_build_object('ok',true,'applied',false,'reason','superseded');
  end if;
  if p_plan='starter' then v_staff:=1;v_stores:=1;v_storage:=2048;v_inventory:=50;v_link:=false;
  elsif p_plan='standard' then v_staff:=3;v_stores:=1;v_storage:=10240;v_inventory:=200;v_link:=true;
  elsif p_plan='pro' then v_staff:=10;v_stores:=3;v_storage:=51200;v_inventory:=500;v_link:=true;
  else raise exception using errcode='22023',message='invalid plan'; end if;
  if found then
    update public.company_subscriptions set plan=p_plan,status=p_status,included_staff_count=v_staff,included_store_count=v_stores,storage_limit_mb=v_storage,current_inventory_limit=v_inventory,l_link_integration_enabled=v_link,stripe_customer_id=coalesce(p_customer_id,stripe_customer_id),stripe_subscription_id=coalesce(p_subscription_id,stripe_subscription_id),last_stripe_event_created=p_event_created,last_stripe_event_id=p_event_id where id=v_row.id;
  else
    insert into public.company_subscriptions(company_id,tenant_id,plan,status,included_staff_count,included_store_count,storage_limit_mb,current_inventory_limit,l_link_integration_enabled,stripe_customer_id,stripe_subscription_id,last_stripe_event_created,last_stripe_event_id)
    values(p_company_id,v_tenant,p_plan,p_status,v_staff,v_stores,v_storage,v_inventory,v_link,p_customer_id,p_subscription_id,p_event_created,p_event_id);
  end if;
  return jsonb_build_object('ok',true,'applied',true,'tenant_id',v_tenant);
end $$;
revoke all on function public.apply_ordered_stripe_subscription_event(uuid,text,text,text,text,text,bigint) from public,anon,authenticated;
grant execute on function public.apply_ordered_stripe_subscription_event(uuid,text,text,text,text,text,bigint) to service_role;

-- ---------------------------------------------------------------------------
-- AUTH-002: legacy table remains compatibility-read only; no authorization RPC writes it.
-- ---------------------------------------------------------------------------
revoke insert,update,delete on public.store_members from anon,authenticated;

create or replace function public.accept_membership_invite(p_membership_id uuid,p_invite_token text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_actor uuid:=auth.uid();v_email text;v_row public.memberships%rowtype;
begin
  if v_actor is null then raise exception using errcode='28000',message='ログインが必要です。'; end if;
  select lower(email) into v_email from auth.users where id=v_actor;
  select * into v_row from public.memberships where id=p_membership_id for update;
  if not found then raise exception using errcode='P0002',message='招待が見つかりません。'; end if;
  if v_row.invite_token_hash is distinct from encode(extensions.digest(coalesce(p_invite_token,''),'sha256'),'hex') then raise exception using errcode='42501',message='招待を承認できません。'; end if;
  if v_row.status='active' and v_row.user_id=v_actor then return jsonb_build_object('ok',true,'membership_id',v_row.id,'already_accepted',true); end if;
  if v_row.status<>'invited' or v_row.invite_cancelled_at is not null or v_row.invite_expires_at<=now() then raise exception using errcode='P0002',message='招待は無効または期限切れです。'; end if;
  if v_email is null or v_email<>lower(btrim(v_row.email)) then raise exception using errcode='42501',message='招待対象本人だけが承認できます。'; end if;
  if not exists(select 1 from public.stores s join public.tenants t on t.id=s.tenant_id where s.id=v_row.store_id and s.tenant_id=v_row.tenant_id and public.store_is_authorization_eligible(s.status) and t.status='active') then raise exception using errcode='42501',message='招待先を利用できません。'; end if;
  if exists(select 1 from public.memberships m where m.tenant_id=v_row.tenant_id and m.user_id=v_actor and m.status='active' and m.deleted_at is null and m.id<>v_row.id) then raise exception using errcode='23505',message='既に有効なmembershipがあります。'; end if;
  update public.memberships set user_id=v_actor,status='active',joined_at=coalesce(joined_at,now()),invite_accepted_at=now(),disabled_at=null,updated_by=v_actor where id=v_row.id;
  insert into public.membership_store_assignments(membership_id,tenant_id,store_id,created_by,deleted_at)
    values(v_row.id,v_row.tenant_id,v_row.store_id,v_actor,null)
    on conflict(membership_id,store_id) do update set deleted_at=null,updated_at=now();
  return jsonb_build_object('ok',true,'membership_id',v_row.id,'already_accepted',false);
end $$;

create or replace function public.change_membership_role(p_membership_id uuid,p_role text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_actor uuid:=auth.uid();v_actor_role text;v_target public.memberships%rowtype;v_owner_count bigint;
begin
  if v_actor is null then raise exception using errcode='28000',message='ログインが必要です。'; end if;
  if p_role not in ('owner','admin','implementer','staff','viewer') then raise exception using errcode='22023',message='roleが不正です。'; end if;
  select * into v_target from public.memberships where id=p_membership_id for update;
  if not found or v_target.status<>'active' or v_target.disabled_at is not null or v_target.deleted_at is not null then raise exception using errcode='P0002',message='有効なmembershipが見つかりません。'; end if;
  perform 1 from public.tenants where id=v_target.tenant_id for update;
  v_actor_role:=public.current_user_role_for_tenant(v_target.tenant_id);
  if v_actor_role='owner' then null;
  elsif v_actor_role='admin' and v_target.role in ('staff','viewer') and p_role in ('staff','viewer') then null;
  else raise exception using errcode='42501',message='roleを変更する権限がありません。'; end if;
  if v_target.user_id=v_actor and v_actor_role<>'owner' and p_role<>v_target.role then raise exception using errcode='42501',message='自分自身のroleを変更できません。'; end if;
  if v_target.role='owner' and p_role<>'owner' then
    select count(*) into v_owner_count from public.memberships where tenant_id=v_target.tenant_id and role='owner' and status='active' and disabled_at is null and deleted_at is null;
    if v_owner_count<=1 then raise exception using errcode='23514',message='最後のownerは降格できません。'; end if;
  end if;
  update public.memberships set role=p_role,updated_by=v_actor where id=v_target.id;
  return jsonb_build_object('ok',true,'membership_id',v_target.id,'role',p_role);
end $$;

create or replace function public.deactivate_membership(p_membership_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_actor uuid:=auth.uid();v_actor_role text;v_target public.memberships%rowtype;v_owner_count bigint;
begin
  if v_actor is null then raise exception using errcode='28000',message='ログインが必要です。'; end if;
  select * into v_target from public.memberships where id=p_membership_id for update;
  if not found or v_target.status<>'active' or v_target.disabled_at is not null or v_target.deleted_at is not null then raise exception using errcode='P0002',message='有効なmembershipが見つかりません。'; end if;
  perform 1 from public.tenants where id=v_target.tenant_id for update;
  v_actor_role:=public.current_user_role_for_tenant(v_target.tenant_id);
  if v_actor_role='owner' then null;
  elsif v_actor_role='admin' and v_target.role in ('staff','viewer') then null;
  else raise exception using errcode='42501',message='membershipを無効化する権限がありません。'; end if;
  if v_target.role='owner' then
    select count(*) into v_owner_count from public.memberships where tenant_id=v_target.tenant_id and role='owner' and status='active' and disabled_at is null and deleted_at is null;
    if v_owner_count<=1 then raise exception using errcode='23514',message='最後のownerは無効化できません。'; end if;
  end if;
  update public.memberships set status='inactive',disabled_at=now(),updated_by=v_actor where id=v_target.id;
  return jsonb_build_object('ok',true,'membership_id',v_target.id);
end $$;

revoke all on function public.accept_membership_invite(uuid,text) from public,anon;
revoke all on function public.change_membership_role(uuid,text) from public,anon;
revoke all on function public.deactivate_membership(uuid) from public,anon;
grant execute on function public.accept_membership_invite(uuid,text) to authenticated;
grant execute on function public.change_membership_role(uuid,text) to authenticated;
grant execute on function public.deactivate_membership(uuid) to authenticated;

-- Signup writes only canonical membership state. The legacy table is retained
-- as a read-only compatibility artifact and is never populated by new flows.
create or replace function public.create_store_for_current_user(store_name text,owner_display_name text)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_user_id uuid:=auth.uid();v_tenant_id uuid;v_store_id uuid;v_membership_id uuid;v_email text;
begin
  if v_user_id is null then raise exception using errcode='28000',message='ログインが必要です。'; end if;
  if exists(select 1 from public.memberships m where m.user_id=v_user_id and m.deleted_at is null) then raise exception using errcode='23505',message='既に所属が登録されています。'; end if;
  if nullif(btrim(store_name),'') is null then raise exception using errcode='22023',message='店舗名を入力してください。'; end if;
  select lower(email) into v_email from auth.users where id=v_user_id;
  insert into public.tenants(name,status,plan_code,created_by,updated_by) values(btrim(store_name),'active','free',v_user_id,v_user_id) returning id into v_tenant_id;
  insert into public.stores(name,company_name,email,plan_code,status,tenant_id,created_by,updated_by) values(btrim(store_name),btrim(store_name),v_email,'free','active',v_tenant_id,v_user_id,v_user_id) returning id into v_store_id;
  insert into public.memberships(tenant_id,store_id,user_id,email,role,status,display_name,joined_at,invite_accepted_at,created_by,updated_by)
    values(v_tenant_id,v_store_id,v_user_id,v_email,'owner','active',nullif(btrim(owner_display_name),''),now(),now(),v_user_id,v_user_id)
    returning id into v_membership_id;
  insert into public.membership_store_assignments(membership_id,tenant_id,store_id,created_by) values(v_membership_id,v_tenant_id,v_store_id,v_user_id);
  insert into public.company_subscriptions(company_id,tenant_id,plan,status,included_staff_count,extra_staff_count,included_store_count,extra_store_count,storage_limit_mb,extra_storage_gb,current_inventory_limit,l_link_integration_enabled)
    values(v_store_id,v_tenant_id,'free','active',1,0,1,0,500,0,5,false);
  return v_store_id;
end $$;
revoke all on function public.create_store_for_current_user(text,text) from public,anon;
grant execute on function public.create_store_for_current_user(text,text) to authenticated;

-- No EXECUTE is granted to anon. Existing G1-A invite/role RPC grants remain least privilege.
