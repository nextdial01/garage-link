-- JST contact-day boundaries and live maintenance relations; existing authorization and ACLs preserved.
begin;
do $guard$
begin
 if (select md5(prosrc) from pg_proc where oid=to_regprocedure('public.generate_followup_candidate_events_g1b_impl(uuid,date)')) is distinct from '520e6a0e0cef51188e83319309c5310f' then raise exception 'garage_candidate_definition_changed:generate_followup_candidate_events_g1b_impl'; end if;
 if (select md5(prosrc) from pg_proc where oid=to_regprocedure('public.generate_inspection_reminder_events_g1b_impl(uuid,date)')) is distinct from '7264ff4003ecc67487c093adec29947c' then raise exception 'garage_candidate_definition_changed:generate_inspection_reminder_events_g1b_impl'; end if;
 if (select md5(prosrc) from pg_proc where oid=to_regprocedure('public.get_inspection_reminder_eligibility_summary_scoped(uuid)')) is distinct from '6364a8fdf38f30623841af6b0bcded07' then raise exception 'garage_candidate_definition_changed:get_inspection_reminder_eligibility_summary_scoped'; end if;
end;
$guard$;

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
 join public.customers c on c.id = mj.customer_id and c.store_id = mj.store_id
 left join public.vehicles v on v.id = mj.vehicle_id
 where cfg.enabled
 and (p_store_id is null or cfg.store_id = p_store_id)
 and mj.customer_id is not null and mj.deleted_at is null
 and coalesce(mj.status,'') <> 'cancelled'
 and mj.next_inspection_date is not null
 and (mj.next_inspection_date - v_today) = 30
 and c.deleted_at is null
 and coalesce(c.delivery_permission,'') in ('allowed', '許可')
 and coalesce(c.line_friend_status,'') in ('linked', '友だち')
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
 join public.customers c on c.id = mj.customer_id and c.store_id = mj.store_id
 left join public.vehicles v on v.id = mj.vehicle_id
 where cfg.enabled
 and (p_store_id is null or cfg.store_id = p_store_id)
 and mj.customer_id is not null and mj.deleted_at is null
 and coalesce(mj.status,'') <> 'cancelled'
 and mj.actual_delivery_date is not null
 and (v_today - mj.actual_delivery_date) = o.d
 and c.deleted_at is null
 and coalesce(c.delivery_permission,'') in ('allowed', '許可')
 and coalesce(c.line_friend_status,'') in ('linked', '友だち')
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
 join public.customers c on c.id = mj.customer_id and c.store_id = mj.store_id
 left join public.vehicles v on v.id = mj.vehicle_id
 where cfg.enabled
 and (p_store_id is null or cfg.store_id = p_store_id)
 and mj.customer_id is not null and mj.deleted_at is null
 and coalesce(mj.status,'') <> 'cancelled'
 and mj.actual_delivery_date is not null
 and (v_today - mj.actual_delivery_date) = 7
 and c.deleted_at is null
 and coalesce(c.delivery_permission,'') in ('allowed', '許可')
 and coalesce(c.line_friend_status,'') in ('linked', '友だち')
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
 (c.last_contact_at at time zone 'Asia/Tokyo')::date as ref_date, 180 as offset_days, c.name as customer_name
 from public.inspection_reminder_settings cfg
 join public.stores st on st.id = cfg.store_id
 join public.customers c on c.store_id = cfg.store_id
 where cfg.enabled
 and (p_store_id is null or cfg.store_id = p_store_id)
 and c.deleted_at is null
 and c.last_contact_at is not null
 and (v_today - (c.last_contact_at at time zone 'Asia/Tokyo')::date) >= 180
 and coalesce(c.delivery_permission,'') in ('allowed', '許可')
 and coalesce(c.line_friend_status,'') in ('linked', '友だち')
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
 join public.customers c on c.id = d.customer_id and c.store_id = d.store_id
 where d.vehicle_id = v.id and d.store_id = v.store_id
 and d.customer_id is not null and d.deleted_at is null and c.deleted_at is null
 union all
 select mj.customer_id, c.name, mj.assigned_user_name, mj.created_at
 from public.maintenance_jobs mj
 join public.customers c on c.id = mj.customer_id and c.store_id = mj.store_id
 where mj.vehicle_id = v.id and mj.store_id = v.store_id
 and mj.customer_id is not null and mj.deleted_at is null and c.deleted_at is null
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
 and mj2.deleted_at is null
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

CREATE OR REPLACE FUNCTION public.get_inspection_reminder_eligibility_summary_scoped(p_store_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY INVOKER
 SET search_path TO ''
AS $function$
declare
 v_caller_id uuid;
 v_caller_role text;
 v_today date := (now() at time zone 'Asia/Tokyo')::date;
 v_cfg_enabled boolean := false;
 v_exclude_sold boolean := true;
 v_exclude_scrapped boolean := true;
 v_exclude_reserved boolean := true;
 v_require_customer_link boolean := true;
 v_enabled_offsets integer[];
 v_max_offset integer := 0;
 v_result jsonb;
begin
 -- ── Authorization (Layer 2) ────────────────────────────────────────────────────────────
 -- auth.uid() returns the caller's JWT user ID even inside SECURITY DEFINER.
 -- Re-check here so a direct RPC call with an arbitrary p_store_id is rejected
 -- regardless of whether the API route was invoked.
 v_caller_id := auth.uid();
 if v_caller_id is null then
 raise exception 'アクセスが拒否されました。' using errcode = 'insufficient_privilege';
 end if;

 select sm.role into v_caller_role
 from public.current_user_active_store_membership sm
 where sm.store_id = p_store_id
 and sm.user_id = v_caller_id
 and sm.status = 'active'
 and sm.role in ('owner', 'admin')
 limit 1;

 if v_caller_role is null then
 -- Generic message: do not reveal whether the store exists or the caller's role.
 raise exception 'アクセスが拒否されました。' using errcode = 'insufficient_privilege';
 end if;

 -- ── Settings ────────────────────────────────────────────────────────────────────────────
 -- Mirror exactly the cfg reads in generate_inspection_reminder_events.
 -- If no settings row exists yet, defaults mirror the schema DEFAULT values.
 select
 coalesce(cfg.enabled, false),
 coalesce(cfg.exclude_sold, true),
 coalesce(cfg.exclude_scrapped, true),
 coalesce(cfg.exclude_reserved_or_in_service, true),
 coalesce(cfg.require_customer_link, true)
 into v_cfg_enabled, v_exclude_sold, v_exclude_scrapped, v_exclude_reserved, v_require_customer_link
 from public.inspection_reminder_settings cfg
 where cfg.store_id = p_store_id;

 -- Enabled reminder timings for the store — same source as generate_inspection_reminder_events.
 select
 array_agg(t.offset_days order by t.offset_days),
 coalesce(max(t.offset_days), 0)
 into v_enabled_offsets, v_max_offset
 from public.inspection_reminder_timings t
 where t.store_id = p_store_id
 and t.enabled = true;

 v_enabled_offsets := coalesce(v_enabled_offsets, '{}');

 with
 -- ── Base: all active (non-deleted, non-archived) vehicles for this store ──────────────
 vehicles_base as (
 select
 v.id,
 v.inspection_expiry_date,
 coalesce(v.status, '') as status,
 (v.inspection_expiry_date - v_today) as days_until_expiry
 from public.vehicles v
 where v.store_id = p_store_id
 and v.deleted_at is null
 and coalesce(v.is_archived, false) = false
 ),
 -- ── In-window: expiry within the outermost configured timing ─────────────────────────
 -- "The vehicle is coming due within the next max_offset days."
 vehicles_in_window as (
 select vb.id, vb.status
 from vehicles_base vb
 where vb.inspection_expiry_date is not null
 and vb.days_until_expiry between 0 and v_max_offset
 ),
 -- ── Eligible today (vehicle conditions only) ─────────────────────────────────────────
 -- Expiry - today = one of the enabled offset_days. Does NOT yet check existing events.
 -- Apply exclusion rules exactly as generate_inspection_reminder_events does,
 -- gated by cfg flags so parity is exact.
 vehicles_match_conditions_today as (
 select vb.id, vb.inspection_expiry_date, vb.days_until_expiry
 from vehicles_base vb
 where vb.inspection_expiry_date is not null
 and vb.days_until_expiry = any(v_enabled_offsets)
 -- Sold exclusion (conditional on cfg — mirrors: not cfg.exclude_sold or ... not in (...sold))
 and (not v_exclude_sold or vb.status not in ('売約済み', 'sold'))
 -- Scrapped exclusion (conditional on cfg)
 and (not v_exclude_scrapped or vb.status not in ('廃車', 'scrapped'))
 -- Reserved / in-service exclusion (conditional on cfg)
 and (
 not v_exclude_reserved
 or not exists (
 select 1 from public.maintenance_jobs mj2
 where mj2.vehicle_id = vb.id
 and mj2.deleted_at is null
 and mj2.store_id = p_store_id
 and coalesce(mj2.status, '') not in ('completed', 'delivered', 'cancelled')
 and (mj2.job_type = '車検' or mj2.scheduled_in_at is not null or mj2.actual_in_date is not null)
 )
 )
 -- Generator always requires a live customer in this store, even for legacy false config.
 and (
 exists (
 select 1 from public.deals d
 join public.customers c on c.id = d.customer_id and c.store_id = d.store_id
 where d.vehicle_id = vb.id
 and d.store_id = p_store_id
 and d.customer_id is not null
 and d.deleted_at is null
 and c.deleted_at is null
 union all
 select 1 from public.maintenance_jobs mj
 join public.customers c on c.id = mj.customer_id and c.store_id = mj.store_id
 where mj.vehicle_id = vb.id
 and mj.store_id = p_store_id
 and mj.customer_id is not null
 and mj.deleted_at is null
 and c.deleted_at is null
 )
 )
 ),
 -- ── New events creatable today ────────────────────────────────────────────────────────
 -- Vehicles matching conditions AND no existing event with the same idempotency key.
 -- Idempotency key: store_id:vehicle_id:inspection_expiry_date:offset_days
 -- Mirrors: ON CONFLICT (idempotency_key) DO NOTHING in generate_inspection_reminder_events.
 vehicles_new_event_creatable as (
 select m.id
 from vehicles_match_conditions_today m
 where not exists (
 select 1 from public.inspection_reminder_events e
 where e.idempotency_key =
 p_store_id::text || ':' || m.id::text || ':' ||
 m.inspection_expiry_date::text || ':' || m.days_until_expiry::text
 )
 ),
 -- ── Event counts by status (車検案内のみ) ─────────────────────────────────────────────
 -- event_type を限定しないと、040 (generate_followup_candidate_events) が生成する
 -- periodic_inspection 等の件数が車検案内の集計に混ざってしまうため明示的に絞る。
 event_counts as (
 select e.status, count(*)::integer as cnt
 from public.inspection_reminder_events e
 where e.store_id = p_store_id
 and e.event_type = 'inspection_reminder'
 group by e.status
 )
 select jsonb_build_object(
 -- Evaluation context
 'today', v_today,
 'cfg_enabled', v_cfg_enabled,
 'enabled_offsets', v_enabled_offsets,

 'vehicles', jsonb_build_object(
 -- Total active vehicles in this store (denominator for context).
 'total', (select count(*) from vehicles_base),
 -- No expiry date: cron always skips; operators need to enter it.
 'no_expiry_date', (select count(*) from vehicles_base where inspection_expiry_date is null),
 -- Coming due within the outermost window (potential future candidates).
 'in_window', (select count(*) from vehicles_in_window),

 -- IMPORTANT: Two distinct counts for "today" — make labels unambiguous in the UI.
 --
 -- match_vehicle_conditions_today:
 -- Vehicles that satisfy every vehicle-condition today (same filters as the cron job
 -- except cfg.enabled). Does NOT subtract existing events. Shows vehicle-side readiness.
 'match_vehicle_conditions_today', (select count(*) from vehicles_match_conditions_today),
 --
 -- new_events_creatable_today:
 -- Subset of match_vehicle_conditions_today where no idempotency-key collision exists.
 -- This is what the cron job would actually INSERT (when cfg.enabled = true).
 'new_events_creatable_today', (select count(*) from vehicles_new_event_creatable),

 -- Breakdown: why in-window vehicles are excluded (applies cfg flags for parity).
 -- Zero when the corresponding cfg.exclude_* flag is false.
 'excluded_sold', (
 select count(*) from vehicles_in_window vw
 where v_exclude_sold and vw.status in ('売約済み', 'sold')
 ),
 'excluded_scrapped', (
 select count(*) from vehicles_in_window vw
 where v_exclude_scrapped and vw.status in ('廃車', 'scrapped')
 ),
 'excluded_reserved', (
 select count(*) from vehicles_in_window vw
 where v_exclude_reserved and exists (
 select 1 from public.maintenance_jobs mj
 where mj.vehicle_id = vw.id
 and mj.store_id = p_store_id
 and mj.deleted_at is null
 and coalesce(mj.status, '') not in ('completed', 'delivered', 'cancelled')
 and (mj.job_type = '車検' or mj.scheduled_in_at is not null or mj.actual_in_date is not null)
 )
 ),
 -- In-window vehicles with no qualifying customer link.
 -- Always informational (require_customer_link is currently always true in the schema).
 'no_customer_link', (
 select count(*) from vehicles_in_window vw
 where not exists (
 select 1 from public.deals d
 join public.customers c on c.id = d.customer_id and c.store_id = d.store_id
 where d.vehicle_id = vw.id
 and d.store_id = p_store_id
 and d.customer_id is not null
 and d.deleted_at is null
 and c.deleted_at is null
 union all
 select 1 from public.maintenance_jobs mj
 join public.customers c on c.id = mj.customer_id and c.store_id = mj.store_id
 where mj.vehicle_id = vw.id
 and mj.store_id = p_store_id
 and mj.customer_id is not null
 and mj.deleted_at is null
 and c.deleted_at is null
 )
 )
 ),

 'events_by_status', (
 select coalesce(jsonb_object_agg(status, cnt), '{}'::jsonb)
 from event_counts
 )
 ) into v_result;

 return v_result;
end;
$function$;
commit;
