-- Roll back the application first; restore original function bodies without data mutation.
begin;
DO $rollback_guard$ begin
if md5((select prosrc from pg_proc where oid=to_regprocedure('public.generate_followup_candidate_events_g1b_impl(uuid,date)'))) is distinct from '520e6a0e0cef51188e83319309c5310f' then raise exception 'Rollback source changed: generate_followup_candidate_events_g1b_impl'; end if;
if md5((select prosrc from pg_proc where oid=to_regprocedure('public.generate_inspection_reminder_events_g1b_impl(uuid,date)'))) is distinct from '7264ff4003ecc67487c093adec29947c' then raise exception 'Rollback source changed: generate_inspection_reminder_events_g1b_impl'; end if;
if md5((select prosrc from pg_proc where oid=to_regprocedure('public.generate_followup_candidate_events(uuid,date)'))) is distinct from '830bdc246e37c17329918e3155aabddc' then raise exception 'Rollback source changed: generate_followup_candidate_events'; end if;
if md5((select prosrc from pg_proc where oid=to_regprocedure('public.generate_inspection_reminder_events(uuid,date)'))) is distinct from '141bb956f7402573a99ffc39e7ec419d' then raise exception 'Rollback source changed: generate_inspection_reminder_events'; end if;
if md5((select prosrc from pg_proc where oid=to_regprocedure('public.get_inspection_reminder_eligibility_summary_scoped(uuid)'))) is distinct from '6364a8fdf38f30623841af6b0bcded07' then raise exception 'Rollback source changed: get_inspection_reminder_eligibility_summary_scoped'; end if;
end $rollback_guard$;
CREATE OR REPLACE FUNCTION public.generate_followup_candidate_events_g1b_impl(p_store_id uuid DEFAULT NULL::uuid, p_today date DEFAULT NULL::date)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
 v_today date := coalesce(p_today, (now() at time zone 'Asia/Tokyo')::date);
 v_count integer := 0;
 v_n integer;
 v_caller_id uuid;
 v_caller_role text;
begin
 v_caller_id := auth.uid();
 if v_caller_id is not null then
 if p_store_id is null then
 raise exception 'アクセスが拒否されました。' using errcode = 'insufficient_privilege';
 end if;

 select sm.role into v_caller_role
 from public.store_members sm
 where sm.store_id = p_store_id
 and sm.user_id = v_caller_id
 and sm.role in ('owner', 'admin')
 limit 1;

 if v_caller_role is null then
 -- Generic message: do not reveal whether the store exists or the caller's role.
 raise exception 'アクセスが拒否されました。' using errcode = 'insufficient_privilege';
 end if;
 end if;

 -- 共通: 対象店舗（cfg.enabled）と顧客の配信可否を満たす整備案件/顧客から候補を生成。

 -- 1) 点検案内 periodic_inspection: next_inspection_date の30日前
 with eligible as (
 select st.tenant_id as company_id, mj.store_id, mj.customer_id, mj.vehicle_id,
 mj.next_inspection_date as ref_date, 30 as offset_days,
 c.name as customer_name,
 nullif(trim(coalesce(v.maker,'')||' '||coalesce(v.model_name,'')),'') as vehicle_name,
 v.maker, v.model_name, v.registration_no
 from public.inspection_reminder_settings cfg
 join public.stores st on st.id = cfg.store_id
 join public.maintenance_jobs mj on mj.store_id = cfg.store_id
 join public.customers c on c.id = mj.customer_id
 left join public.vehicles v on v.id = mj.vehicle_id
 where cfg.enabled
 and (p_store_id is null or cfg.store_id = p_store_id)
 and mj.customer_id is not null and mj.deleted_at is null
 and coalesce(mj.status,'') <> 'cancelled'
 and mj.next_inspection_date is not null
 and (mj.next_inspection_date - v_today) = 30
 and c.deleted_at is null
 and coalesce(c.delivery_permission,'') = 'allowed'
 and coalesce(c.line_friend_status,'') = 'linked'
 )
 insert into public.inspection_reminder_events
 (company_id, store_id, customer_id, vehicle_id, inspection_expiry_date, reminder_offset_days,
 event_type, status, idempotency_key, customer_name, vehicle_name, maker, model_name, registration_no)
 select company_id, store_id, customer_id, vehicle_id, ref_date, offset_days,
 'periodic_inspection', 'pending',
 store_id::text||':'||customer_id::text||':'||coalesce(vehicle_id::text,'none')||':periodic_inspection:'||ref_date::text||':'||offset_days::text,
 customer_name, vehicle_name, maker, model_name, registration_no
 from eligible
 on conflict (idempotency_key) do nothing;
 get diagnostics v_n = row_count; v_count := v_count + v_n;

 -- 2) 納車後フォロー post_delivery_follow_up: actual_delivery_date から 30/90/180日後
 with offsets as (select unnest(array[30,90,180]) as d),
 eligible as (
 select st.tenant_id as company_id, mj.store_id, mj.customer_id, mj.vehicle_id,
 mj.actual_delivery_date as ref_date, o.d as offset_days,
 c.name as customer_name,
 nullif(trim(coalesce(v.maker,'')||' '||coalesce(v.model_name,'')),'') as vehicle_name,
 v.maker, v.model_name, v.registration_no
 from public.inspection_reminder_settings cfg
 join public.stores st on st.id = cfg.store_id
 join public.maintenance_jobs mj on mj.store_id = cfg.store_id
 cross join offsets o
 join public.customers c on c.id = mj.customer_id
 left join public.vehicles v on v.id = mj.vehicle_id
 where cfg.enabled
 and (p_store_id is null or cfg.store_id = p_store_id)
 and mj.customer_id is not null and mj.deleted_at is null
 and coalesce(mj.status,'') <> 'cancelled'
 and mj.actual_delivery_date is not null
 and (v_today - mj.actual_delivery_date) = o.d
 and c.deleted_at is null
 and coalesce(c.delivery_permission,'') = 'allowed'
 and coalesce(c.line_friend_status,'') = 'linked'
 )
 insert into public.inspection_reminder_events
 (company_id, store_id, customer_id, vehicle_id, inspection_expiry_date, reminder_offset_days,
 event_type, status, idempotency_key, customer_name, vehicle_name, maker, model_name, registration_no)
 select company_id, store_id, customer_id, vehicle_id, ref_date, offset_days,
 'post_delivery_follow_up', 'pending',
 store_id::text||':'||customer_id::text||':'||coalesce(vehicle_id::text,'none')||':post_delivery_follow_up:'||ref_date::text||':'||offset_days::text,
 customer_name, vehicle_name, maker, model_name, registration_no
 from eligible
 on conflict (idempotency_key) do nothing;
 get diagnostics v_n = row_count; v_count := v_count + v_n;

 -- 3) 口コミ依頼 review_request: actual_delivery_date から7日後
 with eligible as (
 select st.tenant_id as company_id, mj.store_id, mj.customer_id, mj.vehicle_id,
 mj.actual_delivery_date as ref_date, 7 as offset_days, c.name as customer_name,
 nullif(trim(coalesce(v.maker,'')||' '||coalesce(v.model_name,'')),'') as vehicle_name,
 v.maker, v.model_name, v.registration_no
 from public.inspection_reminder_settings cfg
 join public.stores st on st.id = cfg.store_id
 join public.maintenance_jobs mj on mj.store_id = cfg.store_id
 join public.customers c on c.id = mj.customer_id
 left join public.vehicles v on v.id = mj.vehicle_id
 where cfg.enabled
 and (p_store_id is null or cfg.store_id = p_store_id)
 and mj.customer_id is not null and mj.deleted_at is null
 and coalesce(mj.status,'') <> 'cancelled'
 and mj.actual_delivery_date is not null
 and (v_today - mj.actual_delivery_date) = 7
 and c.deleted_at is null
 and coalesce(c.delivery_permission,'') = 'allowed'
 and coalesce(c.line_friend_status,'') = 'linked'
 )
 insert into public.inspection_reminder_events
 (company_id, store_id, customer_id, vehicle_id, inspection_expiry_date, reminder_offset_days,
 event_type, status, idempotency_key, customer_name, vehicle_name, maker, model_name, registration_no)
 select company_id, store_id, customer_id, vehicle_id, ref_date, offset_days,
 'review_request', 'pending',
 store_id::text||':'||customer_id::text||':'||coalesce(vehicle_id::text,'none')||':review_request:'||ref_date::text||':'||offset_days::text,
 customer_name, vehicle_name, maker, model_name, registration_no
 from eligible
 on conflict (idempotency_key) do nothing;
 get diagnostics v_n = row_count; v_count := v_count + v_n;

 -- 4) 長期未接触 long_no_contact: last_contact_at から180日以上経過（顧客単位、車両なし）
 with eligible as (
 select st.tenant_id as company_id, c.store_id, c.id as customer_id,
 c.last_contact_at::date as ref_date, 180 as offset_days, c.name as customer_name
 from public.inspection_reminder_settings cfg
 join public.stores st on st.id = cfg.store_id
 join public.customers c on c.store_id = cfg.store_id
 where cfg.enabled
 and (p_store_id is null or cfg.store_id = p_store_id)
 and c.deleted_at is null
 and c.last_contact_at is not null
 and (v_today - c.last_contact_at::date) >= 180
 and coalesce(c.delivery_permission,'') = 'allowed'
 and coalesce(c.line_friend_status,'') = 'linked'
 )
 insert into public.inspection_reminder_events
 (company_id, store_id, customer_id, vehicle_id, inspection_expiry_date, reminder_offset_days,
 event_type, status, idempotency_key, customer_name)
 select company_id, store_id, customer_id, null, ref_date, offset_days,
 'long_no_contact', 'pending',
 store_id::text||':'||customer_id::text||':none:long_no_contact:'||ref_date::text||':'||offset_days::text,
 customer_name
 from eligible
 on conflict (idempotency_key) do nothing;
 get diagnostics v_n = row_count; v_count := v_count + v_n;

 return v_count;
end;
$function$;

CREATE OR REPLACE FUNCTION public.generate_inspection_reminder_events_g1b_impl(p_store_id uuid DEFAULT NULL::uuid, p_today date DEFAULT NULL::date)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
 v_today date := coalesce(p_today, (now() at time zone 'Asia/Tokyo')::date);
 v_count integer;
 v_caller_id uuid;
 v_caller_role text;
begin
 v_caller_id := auth.uid();
 if v_caller_id is not null then
 if p_store_id is null then
 raise exception 'アクセスが拒否されました。' using errcode = 'insufficient_privilege';
 end if;

 select sm.role into v_caller_role
 from public.store_members sm
 where sm.store_id = p_store_id
 and sm.user_id = v_caller_id
 and sm.role in ('owner', 'admin')
 limit 1;

 if v_caller_role is null then
 -- Generic message: do not reveal whether the store exists or the caller's role.
 raise exception 'アクセスが拒否されました。' using errcode = 'insufficient_privilege';
 end if;
 end if;

 -- ------------------------------------------------------------------------------
 -- 0. 既存 pending イベントの失効判定（新規生成の直前・同一トランザクション内で実行）
 -- 車検満了日の訂正や車両の削除/アーカイブ/満了日クリアにより、生成時点のスナップショットと
 -- 現況が一致しなくなった pending の inspection_reminder イベントのみを 'skipped' にする。
 -- completed / processing / failed / skipped の行、他 event_type の行は対象外。
 -- 冪等性キー（store_id:vehicle_id:inspection_expiry_date:offset_days）や既存の生成ロジックには
 -- 一切手を入れない。無効化は生成と同一トランザクションで完結させ、アトミック性を保つ。
 -- ------------------------------------------------------------------------------

 -- 0a. 車両は存在するが、現況が生成時点のスナップショットと一致しない場合。
 update public.inspection_reminder_events e
 set status = 'skipped',
 error_detail = case
 when v.deleted_at is not null then 'stale: vehicle deleted or missing'
 when coalesce(v.is_archived, false) then 'stale: vehicle archived'
 when v.inspection_expiry_date is null then 'stale: vehicle expiry date cleared'
 else 'stale: vehicle expiry date changed'
 end
 from public.vehicles v
 where v.id = e.vehicle_id
 and v.store_id = e.store_id
 and e.event_type = 'inspection_reminder'
 and e.status = 'pending'
 and (p_store_id is null or e.store_id = p_store_id)
 and (
 v.deleted_at is not null
 or coalesce(v.is_archived, false)
 or v.inspection_expiry_date is null
 or v.inspection_expiry_date <> e.inspection_expiry_date
 );

 -- 0b. 車両が参照先ごと消失している場合（vehicles.id が削除され vehicle_id が
 -- on delete set null により null になったケース）。
 update public.inspection_reminder_events e
 set status = 'skipped',
 error_detail = 'stale: vehicle deleted or missing'
 where e.event_type = 'inspection_reminder'
 and e.status = 'pending'
 and e.vehicle_id is null
 and (p_store_id is null or e.store_id = p_store_id);

 with eligible as (
 select
 st.tenant_id as company_id,
 v.store_id,
 cust.customer_id,
 v.id as vehicle_id,
 v.inspection_expiry_date,
 t.offset_days,
 cust.customer_name,
 nullif(trim(both ' ' from
 coalesce(v.maker, '') || ' ' || coalesce(v.model_name, '') ||
 case when v.management_no is not null then ' (' || v.management_no || ')' else '' end
 ), '') as vehicle_name,
 v.maker,
 v.model_name,
 v.registration_no,
 cust.assigned_user_name
 from public.inspection_reminder_settings cfg
 join public.stores st on st.id = cfg.store_id
 join public.inspection_reminder_timings t on t.store_id = cfg.store_id and t.enabled
 join public.vehicles v on v.store_id = cfg.store_id
 -- 顧客紐付け: deals / maintenance_jobs のうち最新の顧客を採用
 join lateral (
 select customer_id, customer_name, assigned_user_name
 from (
 select d.customer_id, c.name as customer_name, d.assigned_user_name, d.created_at
 from public.deals d
 join public.customers c on c.id = d.customer_id
 where d.vehicle_id = v.id and d.store_id = v.store_id
 and d.customer_id is not null and d.deleted_at is null and c.deleted_at is null
 union all
 select mj.customer_id, c.name, mj.assigned_user_name, mj.created_at
 from public.maintenance_jobs mj
 join public.customers c on c.id = mj.customer_id
 where mj.vehicle_id = v.id and mj.store_id = v.store_id
 and mj.customer_id is not null and c.deleted_at is null
 ) src
 order by created_at desc nulls last
 limit 1
 ) cust on true
 where cfg.enabled
 and (p_store_id is null or cfg.store_id = p_store_id)
 and v.inspection_expiry_date is not null
 and v.deleted_at is null
 and coalesce(v.is_archived, false) = false
 and (not cfg.exclude_sold or coalesce(v.status, '') not in ('売約済み', 'sold'))
 and (not cfg.exclude_scrapped or coalesce(v.status, '') not in ('廃車', 'scrapped'))
 and (v.inspection_expiry_date - v_today) = t.offset_days
 and (
 not cfg.exclude_reserved_or_in_service
 or not exists (
 select 1
 from public.maintenance_jobs mj2
 where mj2.vehicle_id = v.id and mj2.store_id = v.store_id
 and coalesce(mj2.status, '') not in ('completed', 'delivered', 'cancelled')
 and (mj2.job_type = '車検' or mj2.scheduled_in_at is not null or mj2.actual_in_date is not null)
 )
 )
 )
 insert into public.inspection_reminder_events (
 company_id, store_id, customer_id, vehicle_id, inspection_expiry_date,
 reminder_offset_days, event_type, status, idempotency_key,
 customer_name, vehicle_name, maker, model_name, registration_no, assigned_user_name
 )
 select
 company_id, store_id, customer_id, vehicle_id, inspection_expiry_date,
 offset_days, 'inspection_reminder', 'pending',
 store_id::text || ':' || vehicle_id::text || ':' || inspection_expiry_date::text || ':' || offset_days::text,
 customer_name, vehicle_name, maker, model_name, registration_no, assigned_user_name
 from eligible
 where customer_id is not null -- 顧客に紐づく車両のみ
 on conflict (idempotency_key) do nothing;

 get diagnostics v_count = row_count;
 return v_count;
end;
$function$;

CREATE OR REPLACE FUNCTION public.generate_followup_candidate_events(p_store_id uuid, p_today date DEFAULT CURRENT_DATE)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
 if auth.role() <> 'service_role' and not public.current_user_can_admin_store(p_store_id) then
 raise exception using errcode = '42501', message = '候補を生成する権限がありません。';
 end if;
 return public.generate_followup_candidate_events_g1b_impl(p_store_id, p_today);
end;
$function$;

CREATE OR REPLACE FUNCTION public.generate_inspection_reminder_events(p_store_id uuid DEFAULT NULL::uuid, p_today date DEFAULT CURRENT_DATE)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
 if auth.role() <> 'service_role' and (p_store_id is null or not public.current_user_can_admin_store(p_store_id)) then
 raise exception using errcode = '42501', message = '候補を生成する権限がありません。';
 end if;
 return public.generate_inspection_reminder_events_g1b_impl(p_store_id, p_today);
end;
$function$;

drop function if exists public.get_inspection_reminder_eligibility_summary_scoped(uuid);
commit;
