-- L-LINK acknowledgement of successfully-imported inspection_reminder_events (Phase 1: GARAGE LINK side only).
--
-- Context: POST /api/s2s/line-link/delivery-candidates exposes pending candidates to L-LINK and is
-- read-only (SELECT only; it never mutates inspection_reminder_events). L-LINK does not yet call
-- back to report a successful import — inspection_reminder_events.status stays 'pending' forever
-- and external_reference_id (already reserved in schema/035 for "L-LINK配信下書きID等") stays null.
--
-- This migration adds a new SECURITY DEFINER function only. It does not change the existing
-- pull/import behavior, does not touch S2S/HMAC verification logic, and does not widen any
-- existing grant. inspection_reminder_events remains SELECT-only for service_role at the table
-- level (see 20260625000100_line_link_s2s_service_role_grants.sql) — all writes for
-- acknowledgement must go through this function.
--
-- Design: pending -> completed is the only transition this function performs. Re-acknowledging
-- an already-completed event is idempotent (reports 'already_acknowledged', never errors). Any
-- event_id that does not belong to p_store_id, does not exist, or is not pending/completed
-- (e.g. 'skipped' by the stale-event invalidation logic, or 'failed'/'processing') is reported as
-- 'rejected' without revealing which case applied. Every input entry is processed independently
-- in one batch statement — a mix of valid and invalid event_ids in the same call always returns
-- one outcome per input entry, never an all-or-nothing failure for the whole batch.
--
-- Rollback: see comment at the end of this file.

create or replace function public.acknowledge_inspection_reminder_events(
  p_store_id uuid,
  p_acknowledgements jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  with input as (
    select distinct on (event_id_text) event_id_text, external_reference_id
    from (
      select
        elem->>'event_id' as event_id_text,
        elem->>'external_reference_id' as external_reference_id
      from jsonb_array_elements(coalesce(p_acknowledgements, '[]'::jsonb)) as elem
      where coalesce(elem->>'event_id', '') <> ''
    ) parsed
    order by event_id_text
  ),
  -- pending -> completed for events owned by p_store_id. Never touches any other status.
  updated as (
    update public.inspection_reminder_events e
    set status = 'completed',
        external_reference_id = i.external_reference_id
    from input i
    where e.id::text = i.event_id_text
      and e.store_id = p_store_id
      and e.status = 'pending'
    returning e.id::text as event_id_text
  ),
  -- Idempotent re-acknowledgement: already completed, owned by p_store_id, not touched just now.
  already as (
    select distinct i.event_id_text
    from input i
    join public.inspection_reminder_events e on e.id::text = i.event_id_text
    where e.store_id = p_store_id
      and e.status = 'completed'
      and i.event_id_text not in (select event_id_text from updated)
  ),
  -- Every input entry gets exactly one outcome: acknowledged, already_acknowledged, or rejected
  -- (nonexistent id, wrong store, or a status other than pending/completed all fall through here
  -- with no distinguishing detail — do not reveal whether the event exists or belongs elsewhere).
  outcomes as (
    select
      i.event_id_text,
      case
        when u.event_id_text is not null then 'acknowledged'
        when a.event_id_text is not null then 'already_acknowledged'
        else 'rejected'
      end as outcome
    from input i
    left join updated u on u.event_id_text = i.event_id_text
    left join already a on a.event_id_text = i.event_id_text
  )
  select jsonb_build_object(
    'results', coalesce(
      jsonb_agg(jsonb_build_object('event_id', event_id_text, 'outcome', outcome)),
      '[]'::jsonb
    )
  )
  into v_result
  from outcomes;

  return v_result;
end;
$$;

-- Revoke default PUBLIC access before granting to service_role only.
-- No raw UPDATE grant on inspection_reminder_events is added anywhere — all acknowledgement
-- writes must go through this function.
revoke all on function public.acknowledge_inspection_reminder_events(uuid, jsonb) from public;
grant execute on function public.acknowledge_inspection_reminder_events(uuid, jsonb) to service_role;

-- 確認用:
-- select public.acknowledge_inspection_reminder_events(
--   '<store_uuid>'::uuid,
--   '[{"event_id":"<event_uuid>","external_reference_id":"<ll_broadcast_id>"}]'::jsonb
-- );
-- select id, status, external_reference_id from public.inspection_reminder_events where id = '<event_uuid>';

-- ================================================================
-- rollback（必要時に手動実行）:
-- drop function if exists public.acknowledge_inspection_reminder_events(uuid, jsonb);
-- ※ inspection_reminder_events テーブル定義・RLS・他関数には影響しません。
-- ================================================================
