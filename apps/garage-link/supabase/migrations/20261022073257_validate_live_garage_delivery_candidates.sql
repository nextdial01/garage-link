-- Read-only dispatch validation; this does not change candidate generation.
-- The caller must verify canonical tenant/store authority and the feature gate.
-- Service raw table privileges stay unchanged. This service-only bounded definer
-- derives eligibility after checking canonical scope, signed key and contract.
-- No source job PK exists on legacy events, so job checks prove a current tuple.
begin;
CREATE FUNCTION public.validate_garage_delivery_candidates(
 p_company_id uuid, p_store_id uuid, p_event_ids uuid[], p_key_id text
) RETURNS TABLE(event_id uuid, eligible boolean, reason text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
 IF p_company_id IS NULL OR p_store_id IS NULL OR p_event_ids IS NULL
    OR cardinality(p_event_ids) > 200 OR cardinality(p_event_ids) = 0
    OR array_position(p_event_ids,NULL) IS NOT NULL THEN
  RAISE EXCEPTION 'invalid_validation_request' USING ERRCODE='22023';
 END IF;
 -- Do not rely on API-only scope checks at this privileged DB boundary.
 IF public.assert_service_tenant_store_context(p_company_id,p_store_id) IS NOT TRUE
    OR NOT EXISTS (SELECT 1 FROM public.stores s
      WHERE s.id=p_store_id AND s.tenant_id=p_company_id AND s.status='active')
    OR p_key_id IS NULL
    OR NOT EXISTS (SELECT 1 FROM public.line_link_connections lc
      WHERE lc.key_id=p_key_id AND lc.tenant_id=p_company_id
        AND lc.store_id=p_store_id AND lc.status='active')
    OR NOT (SELECT count(*)=1 AND coalesce(bool_and(cs.l_link_integration_enabled),false)
      FROM public.company_subscriptions cs WHERE cs.tenant_id=p_company_id AND cs.status='active') THEN
  RAISE EXCEPTION 'validation_scope_unavailable' USING ERRCODE='42501';
 END IF;
 RETURN QUERY
 WITH requested AS (SELECT DISTINCT unnest(p_event_ids) AS id),
 inspected AS (
 SELECT r.id,
 CASE
 WHEN e.id IS NULL THEN 'unavailable'
 WHEN coalesce(e.status,'') NOT IN ('pending','completed') THEN 'event_unavailable'
 WHEN coalesce(e.event_type,'') NOT IN ('inspection_reminder','periodic_inspection','post_delivery_follow_up','review_request','long_no_contact') THEN 'unsupported_type'
 WHEN c.id IS NULL OR c.deleted_at IS NOT NULL THEN 'customer_unavailable'
 WHEN coalesce(c.delivery_permission,'') NOT IN ('allowed','許可')
   OR coalesce(c.line_friend_status,'') NOT IN ('linked','友だち') THEN 'consent_unavailable'
 WHEN e.inspection_expiry_date IS NULL OR e.reminder_offset_days IS NULL THEN 'invalid_snapshot'
 WHEN e.event_type='inspection_reminder' THEN
  CASE WHEN v.id IS NULL OR v.deleted_at IS NOT NULL OR coalesce(v.is_archived,false)
          OR v.inspection_expiry_date IS DISTINCT FROM e.inspection_expiry_date THEN 'source_changed'
       WHEN coalesce(latest.snapshot_customer_is_latest,false) IS NOT TRUE THEN 'customer_relation_changed'
       -- Missing current settings is unknown; do not silently treat conditional exclusions as off.
       WHEN cfg.store_id IS NULL OR cfg.exclude_sold IS NULL OR cfg.exclude_scrapped IS NULL OR cfg.exclude_reserved_or_in_service IS NULL THEN 'settings_unavailable'
       WHEN cfg.exclude_sold AND coalesce(v.status,'') IN ('売約済み','sold') THEN 'source_changed'
       WHEN cfg.exclude_scrapped AND coalesce(v.status,'') IN ('廃車','scrapped') THEN 'source_changed'
       WHEN cfg.exclude_reserved_or_in_service AND EXISTS (
        SELECT 1 FROM public.maintenance_jobs mj2
        WHERE mj2.store_id=e.store_id AND mj2.vehicle_id=v.id AND mj2.deleted_at IS NULL
        AND coalesce(mj2.status,'') NOT IN ('completed','delivered','cancelled')
        AND (mj2.job_type='車検' OR mj2.scheduled_in_at IS NOT NULL OR mj2.actual_in_date IS NOT NULL)
       ) THEN 'source_changed'
       ELSE 'eligible' END
 WHEN e.event_type='long_no_contact' THEN
  CASE WHEN e.vehicle_id IS NOT NULL OR e.reminder_offset_days<>180
        OR c.last_contact_at IS NULL
        OR (c.last_contact_at AT TIME ZONE 'Asia/Tokyo')::date IS DISTINCT FROM e.inspection_expiry_date
       THEN 'source_changed' ELSE 'eligible' END
 WHEN NOT (
   (e.event_type='periodic_inspection' AND e.reminder_offset_days=30)
   OR (e.event_type='post_delivery_follow_up' AND e.reminder_offset_days IN (30,90,180))
   OR (e.event_type='review_request' AND e.reminder_offset_days=7)
 ) THEN 'invalid_snapshot'
 WHEN EXISTS (
  SELECT 1 FROM public.maintenance_jobs mj
  WHERE mj.store_id=e.store_id AND mj.customer_id=e.customer_id
   AND mj.vehicle_id IS NOT DISTINCT FROM e.vehicle_id
   AND mj.deleted_at IS NULL AND coalesce(mj.status,'')<>'cancelled'
   AND CASE WHEN e.event_type='periodic_inspection'
       THEN mj.next_inspection_date ELSE mj.actual_delivery_date END = e.inspection_expiry_date
 ) THEN 'eligible'
 ELSE 'source_changed' END AS verdict
 FROM requested r
 LEFT JOIN public.inspection_reminder_events e ON e.id=r.id
  AND e.store_id=p_store_id AND e.company_id=p_company_id
 LEFT JOIN public.customers c ON c.id=e.customer_id AND c.store_id=p_store_id
 LEFT JOIN public.vehicles v ON v.id=e.vehicle_id AND v.store_id=p_store_id
 LEFT JOIN public.inspection_reminder_settings cfg ON cfg.store_id=p_store_id
 LEFT JOIN LATERAL (
  -- Generator ORDER BY created_at DESC NULLS LAST. All-null dates remain a tied set.
  WITH relations AS (
   SELECT d.customer_id,d.created_at FROM public.deals d
   JOIN public.customers dc ON dc.id=d.customer_id AND dc.store_id=d.store_id AND dc.deleted_at IS NULL
   WHERE d.store_id=p_store_id AND d.vehicle_id=e.vehicle_id AND d.deleted_at IS NULL
   UNION ALL
   SELECT mj.customer_id,mj.created_at FROM public.maintenance_jobs mj
   JOIN public.customers mc ON mc.id=mj.customer_id AND mc.store_id=mj.store_id AND mc.deleted_at IS NULL
   WHERE mj.store_id=p_store_id AND mj.vehicle_id=e.vehicle_id AND mj.deleted_at IS NULL
  ), newest AS (SELECT created_at FROM relations ORDER BY created_at DESC NULLS LAST LIMIT 1)
  SELECT bool_or(x.customer_id=e.customer_id) AS snapshot_customer_is_latest
  FROM relations x JOIN newest n ON x.created_at IS NOT DISTINCT FROM n.created_at
 ) latest ON e.event_type='inspection_reminder'
 )
 SELECT i.id, i.verdict='eligible', i.verdict FROM inspected i;
END;
$$;

ALTER FUNCTION public.validate_garage_delivery_candidates(uuid,uuid,uuid[],text) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.validate_garage_delivery_candidates(uuid,uuid,uuid[],text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.validate_garage_delivery_candidates(uuid,uuid,uuid[],text) TO service_role;
commit;
