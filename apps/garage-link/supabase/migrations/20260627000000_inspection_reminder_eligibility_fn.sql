-- Read-only diagnostic function: inspection reminder eligibility summary for a single store.
--
-- Authorization model (defence-in-depth):
--   Layer 1 – API route: checks session + owner/admin role before calling this function.
--   Layer 2 – THIS FUNCTION: re-checks auth.uid() + store_members before reading any tenant data.
--             A direct Supabase RPC call with a different store UUID will be rejected here
--             even if the API route is bypassed.
--
-- Design invariants:
--   - SECURITY DEFINER to query vehicles/deals/maintenance_jobs across RLS.
--   - STABLE: no side effects, no INSERT/UPDATE/DELETE.
--   - search_path locks out pg_temp hijacking (pg_temp at end = temp objects visible but cannot shadow public).
--   - Returns only aggregate counts. No PII (no names, contact details, VINs, licence plates).

create or replace function public.get_inspection_reminder_eligibility_summary(
  p_store_id uuid
)
returns jsonb
language plpgsql
security definer
stable
set search_path = public, pg_temp
as $$
declare
  v_caller_id             uuid;
  v_caller_role           text;
  v_today                 date     := (now() at time zone 'Asia/Tokyo')::date;
  v_cfg_enabled           boolean  := false;
  v_exclude_sold          boolean  := true;
  v_exclude_scrapped      boolean  := true;
  v_exclude_reserved      boolean  := true;
  v_require_customer_link boolean  := true;
  v_enabled_offsets       integer[];
  v_max_offset            integer  := 0;
  v_result                jsonb;
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
  from public.store_members sm
  where sm.store_id = p_store_id
    and sm.user_id  = v_caller_id
    and sm.role     in ('owner', 'admin')
  limit 1;

  if v_caller_role is null then
    -- Generic message: do not reveal whether the store exists or the caller's role.
    raise exception 'アクセスが拒否されました。' using errcode = 'insufficient_privilege';
  end if;

  -- ── Settings ────────────────────────────────────────────────────────────────────────────
  -- Mirror exactly the cfg reads in generate_inspection_reminder_events.
  -- If no settings row exists yet, defaults mirror the schema DEFAULT values.
  select
    coalesce(cfg.enabled,                          false),
    coalesce(cfg.exclude_sold,                     true),
    coalesce(cfg.exclude_scrapped,                 true),
    coalesce(cfg.exclude_reserved_or_in_service,   true),
    coalesce(cfg.require_customer_link,            true)
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
      coalesce(v.status, '')               as status,
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
      and (not v_exclude_sold   or vb.status not in ('売約済み', 'sold'))
      -- Scrapped exclusion (conditional on cfg)
      and (not v_exclude_scrapped or vb.status not in ('廃車', 'scrapped'))
      -- Reserved / in-service exclusion (conditional on cfg)
      and (
        not v_exclude_reserved
        or not exists (
          select 1 from public.maintenance_jobs mj2
          where mj2.vehicle_id = vb.id
            and mj2.store_id   = p_store_id
            and coalesce(mj2.status, '') not in ('completed', 'delivered', 'cancelled')
            and (mj2.job_type = '車検' or mj2.scheduled_in_at is not null or mj2.actual_in_date is not null)
        )
      )
      -- Customer link requirement (conditional on cfg — mirrors lateral INNER JOIN + customer_id is not null)
      and (
        not v_require_customer_link
        or exists (
          select 1 from public.deals d
          join public.customers c on c.id = d.customer_id
          where d.vehicle_id  = vb.id
            and d.store_id    = p_store_id
            and d.customer_id is not null
            and d.deleted_at  is null
            and c.deleted_at  is null
          union all
          select 1 from public.maintenance_jobs mj
          join public.customers c on c.id = mj.customer_id
          where mj.vehicle_id  = vb.id
            and mj.store_id    = p_store_id
            and mj.customer_id is not null
            and c.deleted_at   is null
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
  -- ── Event counts by status ────────────────────────────────────────────────────────────
  event_counts as (
    select e.status, count(*)::integer as cnt
    from public.inspection_reminder_events e
    where e.store_id = p_store_id
    group by e.status
  )
  select jsonb_build_object(
    -- Evaluation context
    'today',        v_today,
    'cfg_enabled',  v_cfg_enabled,
    'enabled_offsets', v_enabled_offsets,

    'vehicles', jsonb_build_object(
      -- Total active vehicles in this store (denominator for context).
      'total',             (select count(*) from vehicles_base),
      -- No expiry date: cron always skips; operators need to enter it.
      'no_expiry_date',    (select count(*) from vehicles_base where inspection_expiry_date is null),
      -- Coming due within the outermost window (potential future candidates).
      'in_window',         (select count(*) from vehicles_in_window),

      -- IMPORTANT: Two distinct counts for "today" — make labels unambiguous in the UI.
      --
      -- match_vehicle_conditions_today:
      --   Vehicles that satisfy every vehicle-condition today (same filters as the cron job
      --   except cfg.enabled). Does NOT subtract existing events. Shows vehicle-side readiness.
      'match_vehicle_conditions_today',   (select count(*) from vehicles_match_conditions_today),
      --
      -- new_events_creatable_today:
      --   Subset of match_vehicle_conditions_today where no idempotency-key collision exists.
      --   This is what the cron job would actually INSERT (when cfg.enabled = true).
      'new_events_creatable_today',       (select count(*) from vehicles_new_event_creatable),

      -- Breakdown: why in-window vehicles are excluded (applies cfg flags for parity).
      -- Zero when the corresponding cfg.exclude_* flag is false.
      'excluded_sold',      (
        select count(*) from vehicles_in_window vw
        where v_exclude_sold and vw.status in ('売約済み', 'sold')
      ),
      'excluded_scrapped',  (
        select count(*) from vehicles_in_window vw
        where v_exclude_scrapped and vw.status in ('廃車', 'scrapped')
      ),
      'excluded_reserved',  (
        select count(*) from vehicles_in_window vw
        where v_exclude_reserved and exists (
          select 1 from public.maintenance_jobs mj
          where mj.vehicle_id = vw.id
            and mj.store_id   = p_store_id
            and coalesce(mj.status, '') not in ('completed', 'delivered', 'cancelled')
            and (mj.job_type = '車検' or mj.scheduled_in_at is not null or mj.actual_in_date is not null)
        )
      ),
      -- In-window vehicles with no qualifying customer link.
      -- Always informational (require_customer_link is currently always true in the schema).
      'no_customer_link',   (
        select count(*) from vehicles_in_window vw
        where not exists (
          select 1 from public.deals d
          join public.customers c on c.id = d.customer_id
          where d.vehicle_id  = vw.id
            and d.store_id    = p_store_id
            and d.customer_id is not null
            and d.deleted_at  is null
            and c.deleted_at  is null
          union all
          select 1 from public.maintenance_jobs mj
          join public.customers c on c.id = mj.customer_id
          where mj.vehicle_id  = vw.id
            and mj.store_id    = p_store_id
            and mj.customer_id is not null
            and c.deleted_at   is null
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
$$;

-- Revoke default PUBLIC access before granting to authenticated only.
revoke all on function public.get_inspection_reminder_eligibility_summary(uuid) from public;
grant execute on function public.get_inspection_reminder_eligibility_summary(uuid) to authenticated;
