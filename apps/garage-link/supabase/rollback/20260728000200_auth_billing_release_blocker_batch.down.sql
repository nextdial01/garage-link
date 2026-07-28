-- Security-preserving feature-stop rollback.
-- Keep session invalidation triggers and data intact. Disable only the new
-- bootstrap/billing/automation entry points until a forward fix is applied.
begin;
revoke all on function public.admin_email_otp_bootstrap_context(uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.release_qa_admin_bootstrap_context(uuid, uuid, text)
  from public, anon, authenticated, service_role;
revoke all on function public.service_resolve_garage_store_scope(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.service_list_eligible_garage_stores()
  from public, anon, authenticated, service_role;
commit;
