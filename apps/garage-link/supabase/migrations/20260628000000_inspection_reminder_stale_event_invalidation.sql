-- Invalidate stale pending inspection_reminder events before generating new ones.
--
-- Problem: inspection_reminder_events.idempotency_key includes inspection_expiry_date.
-- When a vehicle's inspection_expiry_date is corrected after a pending reminder event
-- was already generated, the next run computes a NEW idempotency_key for the new date.
-- The OLD pending event (snapshotting the stale date) is never invalidated and remains
-- a live candidate returned by the L-LINK delivery-candidates S2S endpoint.
--
-- Fix: public.generate_inspection_reminder_events(p_store_id, p_today) now marks
-- affected pending inspection_reminder events as status='skipped' (with a descriptive
-- error_detail) immediately before generating new events, inside the same
-- SECURITY DEFINER function call/transaction, so invalidation and generation stay
-- atomic. Only rows with event_type='inspection_reminder' and status='pending' are
-- ever touched; completed/processing/failed/skipped rows and other event_types are
-- never modified. The idempotency-key format, unique constraint, ON CONFLICT DO
-- NOTHING behavior, offset matching, and exclusion rules are unchanged.
--
-- Scope: this migration only replaces generate_inspection_reminder_events(uuid, date).
-- No table/RLS/grant/S2S/HMAC/cron changes.
-- Rollback: see comment at the end of this file.

create or replace function public.generate_inspection_reminder_events(
  p_store_id uuid default null,
  p_today date default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date := coalesce(p_today, (now() at time zone 'Asia/Tokyo')::date);
  v_count integer;
begin
  -- ------------------------------------------------------------------------------
  -- 0. 既存 pending イベントの失効判定（新規生成の直前・同一トランザクション内で実行）
  --    車検満了日の訂正や車両の削除/アーカイブ/満了日クリアにより、生成時点のスナップショットと
  --    現況が一致しなくなった pending の inspection_reminder イベントのみを 'skipped' にする。
  --    completed / processing / failed / skipped の行、他 event_type の行は対象外。
  --    冪等性キー（store_id:vehicle_id:inspection_expiry_date:offset_days）や既存の生成ロジックには
  --    一切手を入れない。無効化は生成と同一トランザクションで完結させ、アトミック性を保つ。
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
  --     on delete set null により null になったケース）。
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
  where customer_id is not null  -- 顧客に紐づく車両のみ
  on conflict (idempotency_key) do nothing;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

grant execute on function public.generate_inspection_reminder_events(uuid, date) to authenticated;

-- 確認用:
-- select public.generate_inspection_reminder_events(); -- 全店舗を当日基準で生成（失効処理も同時実行）
-- select status, error_detail, count(*) from public.inspection_reminder_events
--   where event_type = 'inspection_reminder' group by 1, 2 order by 1, 2;

-- ================================================================
-- rollback（必要時に手動実行。035の元の関数定義で置き換える）:
-- 供給元: apps/garage-link/supabase/schema/035_inspection_reminders.sql の
-- generate_inspection_reminder_events 定義から、本migrationで追加した
-- "0. 既存 pending イベントの失効判定" ブロック（0a/0b の2つの update 文）のみを
-- 削除した内容で create or replace function を再実行してください。
-- テーブル定義・RLS・権限・他関数には影響しません。
-- ================================================================
