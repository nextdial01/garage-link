-- 040 配信候補イベント生成（Phase 4: 点検/納車後フォロー/口コミ/長期未接触）
--
-- 設計方針: 035 inspection reminders を踏襲。
--   - 冪等: idempotency_key = store:customer:vehicle:event_type:reference_date:offset、unique制約で二重作成防止。
--   - スコープ: company_id(stores.tenant_id)/store_id/customer_id を厳格に保持。
--   - マスタスイッチ: inspection_reminder_settings.enabled を流用（店舗単位ON/OFF）。
--   - 除外: 顧客削除済み / delivery_permission != 'allowed'（配信停止）/ line_friend_status != 'linked'（LINE未連携）/ 顧客なし。
--   - 直接LINE送信は一切行わない（候補生成のみ。送信はL-LINK側）。
--   - 車検(inspection_reminder)は035が担当。買替(repurchase)は条件未確定のため本関数では生成しない。
--   - reference date は inspection_expiry_date 列を「判定基準日」として再利用（種別ごとに意味が異なる）。
--
-- 影響: 新規関数1のみ。テーブル/RLS/既存035関数は不変。

create or replace function public.generate_followup_candidate_events(
  p_store_id uuid default null,
  p_today    date default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date := coalesce(p_today, (now() at time zone 'Asia/Tokyo')::date);
  v_count integer := 0;
  v_n     integer;
begin
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
$$;

grant execute on function public.generate_followup_candidate_events(uuid, date) to authenticated;

-- 確認用:
-- select public.generate_followup_candidate_events('<store_uuid>', current_date);
-- select event_type, count(*) from public.inspection_reminder_events group by 1 order by 1;
--
-- ロールバック:
-- drop function if exists public.generate_followup_candidate_events(uuid, date);
