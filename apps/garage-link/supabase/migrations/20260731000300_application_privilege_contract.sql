-- GARAGE LINK Commercial Remediation Batch 1D
-- Provider-independent application privilege contract.
-- Generated from the reviewed explicit Batch 1C application contract.

revoke all privileges on all tables in schema public from public, anon, authenticated, service_role;
revoke all privileges on all sequences in schema public from public, anon, authenticated, service_role;
revoke all privileges on all routines in schema public from public, anon, authenticated, service_role;

alter default privileges for role postgres in schema public revoke all privileges on tables from public, anon, authenticated, service_role;
alter default privileges for role postgres in schema public revoke all privileges on sequences from public, anon, authenticated, service_role;
alter default privileges for role postgres in schema public revoke all privileges on functions from public, anon, authenticated, service_role;

revoke create, usage on schema public from public, anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;
grant anon, authenticated, service_role to authenticator;

grant DELETE, INSERT, SELECT, UPDATE on table public."accounting_export_settings" to authenticated;
grant DELETE, INSERT, SELECT, UPDATE on table public."admin_email_otp_challenges" to service_role;
grant DELETE, INSERT, SELECT, UPDATE on table public."admin_trusted_sessions" to service_role;
grant DELETE, INSERT, SELECT, UPDATE on table public."appointments" to authenticated;
grant INSERT, SELECT on table public."audit_logs" to authenticated;
grant DELETE, INSERT, SELECT, UPDATE on table public."auth_login_attempts" to service_role;
grant DELETE, INSERT, SELECT, UPDATE on table public."billing_sync_operations" to service_role;
grant SELECT on table public."company_subscriptions" to authenticated;
grant DELETE, INSERT, SELECT, UPDATE on table public."company_subscriptions" to service_role;
grant SELECT on table public."customer_vehicle_ownership_history" to authenticated;
grant DELETE, INSERT, SELECT, UPDATE on table public."customers" to authenticated;
grant INSERT, SELECT on table public."data_export_logs" to authenticated;
grant INSERT, SELECT on table public."data_import_logs" to authenticated;
grant DELETE, INSERT, SELECT, UPDATE on table public."deals" to authenticated;
grant INSERT, SELECT on table public."delivery_overage_logs" to authenticated;
grant INSERT, SELECT on table public."delivery_usage_logs" to authenticated;
grant SELECT on table public."garage_plan_entitlements" to anon;
grant SELECT on table public."garage_plan_entitlements" to authenticated;
grant SELECT on table public."garage_plan_entitlements" to service_role;
grant DELETE, INSERT, SELECT, UPDATE on table public."garage_subscription_leases" to service_role;
grant SELECT on table public."inspection_reminder_events" to authenticated;
grant SELECT on table public."inspection_reminder_events" to service_role;
grant DELETE, INSERT, SELECT, UPDATE on table public."inspection_reminder_settings" to authenticated;
grant DELETE, INSERT, SELECT, UPDATE on table public."inspection_reminder_timings" to authenticated;
grant DELETE, INSERT, SELECT, UPDATE on table public."inventory_count_items" to authenticated;
grant DELETE, INSERT, SELECT, UPDATE on table public."inventory_counts" to authenticated;
grant DELETE, INSERT, SELECT, UPDATE on table public."invoice_items" to authenticated;
grant SELECT on table public."invoice_payment_ledger" to authenticated;
grant DELETE, INSERT, SELECT, UPDATE on table public."invoices" to authenticated;
grant DELETE, INSERT, SELECT, UPDATE on table public."line_auto_replies" to authenticated;
grant DELETE, INSERT, SELECT, UPDATE on table public."line_campaign_targets" to authenticated;
grant DELETE, INSERT, SELECT, UPDATE on table public."line_campaigns" to authenticated;
grant INSERT, SELECT on table public."line_delivery_logs" to authenticated;
grant DELETE, INSERT, SELECT, UPDATE on table public."line_form_questions" to authenticated;
grant SELECT, UPDATE on table public."line_form_responses" to authenticated;
grant INSERT, SELECT on table public."line_form_responses" to service_role;
grant DELETE, INSERT, SELECT, UPDATE on table public."line_forms" to authenticated;
grant SELECT on table public."line_friends" to authenticated;
grant SELECT on table public."line_link_connections" to service_role;
grant DELETE, INSERT, SELECT on table public."line_link_inbound_nonces" to service_role;
grant DELETE, INSERT, SELECT, UPDATE on table public."line_message_drafts" to authenticated;
grant INSERT, SELECT on table public."line_message_logs" to authenticated;
grant DELETE, INSERT, SELECT, UPDATE on table public."line_rich_menus" to authenticated;
grant DELETE, INSERT, SELECT, UPDATE on table public."line_routes" to authenticated;
grant DELETE, INSERT, SELECT, UPDATE on table public."line_settings" to authenticated;
grant DELETE, INSERT, SELECT, UPDATE on table public."line_step_messages" to authenticated;
grant DELETE, INSERT, SELECT, UPDATE on table public."line_steps" to authenticated;
grant DELETE, INSERT, SELECT, UPDATE on table public."line_tags" to authenticated;
grant DELETE, INSERT, SELECT, UPDATE on table public."line_templates" to authenticated;
grant INSERT, SELECT on table public."line_test_delivery_logs" to authenticated;
grant SELECT on table public."line_webhook_events" to authenticated;
grant DELETE, INSERT, SELECT, UPDATE on table public."maintenance_job_parts" to authenticated;
grant DELETE, INSERT, SELECT, UPDATE on table public."maintenance_jobs" to authenticated;
grant SELECT on table public."membership_store_assignments" to authenticated;
grant SELECT on table public."memberships" to authenticated;
grant INSERT, SELECT on table public."payment_items" to authenticated;
grant SELECT on table public."plan_change_requests" to authenticated;
grant DELETE, INSERT, SELECT, UPDATE on table public."quote_items" to authenticated;
grant DELETE, INSERT, SELECT, UPDATE on table public."quotes" to authenticated;
grant INSERT, SELECT on table public."repair_part_stock_movements" to authenticated;
grant DELETE, INSERT, SELECT, UPDATE on table public."repair_parts" to authenticated;
grant SELECT on table public."sale_correction_cases" to authenticated;
grant SELECT on table public."sale_correction_events" to authenticated;
grant SELECT on table public."sale_correction_refunds" to authenticated;
grant INSERT, SELECT on table public."security_events" to authenticated;
grant SELECT on table public."store_members" to authenticated;
grant DELETE, SELECT, UPDATE on table public."stores" to authenticated;
grant DELETE, INSERT, SELECT, UPDATE on table public."stripe_webhook_events" to service_role;
grant SELECT on table public."tenant_features" to authenticated;
-- tenant_subscriptions belongs to the LINE-only plan billing schema
-- (schema/029_line_plan_billing.sql) and is not part of GARAGE LINK's own
-- commercial billing (company_subscriptions). It exists in a from-scratch
-- fresh baseline build but was never created in the production database's
-- actual incremental history, so this grant must not be unconditional -
-- match the existence-guard pattern already used for optional relations
-- elsewhere in this codebase (see 20260726000200_role_aware_business_write_lock.sql).
do $$
begin
  if to_regclass('public.tenant_subscriptions') is not null then
    execute 'grant SELECT on table public.tenant_subscriptions to authenticated';
  end if;
end
$$;
grant SELECT, UPDATE on table public."tenants" to authenticated;
grant DELETE, INSERT, SELECT, UPDATE on table public."trade_in_vehicles" to authenticated;
grant SELECT on table public."uploaded_files" to authenticated;
grant SELECT on table public."user_active_store_preferences" to authenticated;
grant DELETE, INSERT, SELECT, UPDATE on table public."vehicle_listing_statuses" to authenticated;
grant SELECT on table public."vehicle_sale_claims" to authenticated;
grant SELECT on table public."vehicle_sale_operations" to authenticated;
grant DELETE, INSERT, SELECT, UPDATE on table public."vehicles" to authenticated;
grant SELECT on table public."current_user_active_store_membership" to authenticated;

grant execute on function public.accept_membership_invite(p_membership_id uuid, p_invite_token text) to authenticated;
grant execute on function public.acknowledge_inspection_reminder_events(p_store_id uuid, p_acknowledgements jsonb) to service_role;
grant execute on function public.adjust_repair_part_stock(p_part_id uuid, p_store_id uuid, p_delta integer) to authenticated;
grant execute on function public.admin_email_otp_bootstrap_context(p_user_id uuid, p_session_id uuid) to service_role;
grant execute on function public.apply_garage_subscription_event_v2(p_company_id uuid, p_plan text, p_stripe_status text, p_billing_state text, p_customer_id text, p_subscription_id text, p_event_id text, p_event_created bigint, p_grace_ends_at timestamp with time zone, p_cancel_at_period_end boolean, p_current_period_end timestamp with time zone, p_invoice_id text, p_extra_staff_count integer, p_extra_store_count integer, p_extra_storage_gb integer) to service_role;
grant execute on function public.apply_garage_subscription_snapshot_v3(p_company_id uuid, p_plan text, p_stripe_status text, p_customer_id text, p_subscription_id text, p_source_event_id text, p_snapshot_observed_at timestamp with time zone, p_grace_ends_at timestamp with time zone, p_cancel_at_period_end boolean, p_current_period_end timestamp with time zone, p_invoice_id text, p_extra_staff_count integer, p_extra_store_count integer, p_extra_storage_gb integer, p_restoration_state text) to service_role;
grant execute on function public.apply_ordered_stripe_subscription_event(p_company_id uuid, p_plan text, p_status text, p_customer_id text, p_subscription_id text, p_event_id text, p_event_created bigint) to service_role;
grant execute on function public.assert_service_tenant_store_context(p_tenant_id uuid, p_store_id uuid) to service_role;
grant execute on function public.begin_garage_billing_operation(p_tenant_id uuid, p_company_id uuid, p_actor_user_id uuid, p_operation_type text, p_idempotency_key text, p_target_plan text, p_target_options jsonb, p_stripe_subscription_id text) to service_role;
grant execute on function public.cancel_invoice_part_stock(p_invoice_id uuid, p_store_id uuid) to authenticated;
grant execute on function public.cancel_maintenance_job(p_job_id uuid, p_reason text, p_idempotency_key text) to authenticated;
grant execute on function public.cancel_membership_invite(p_membership_id uuid) to authenticated;
grant execute on function public.cancel_vehicle_sale(p_deal_id uuid, p_idempotency_key text, p_correlation_id text) to authenticated;
grant execute on function public.change_membership_role(p_membership_id uuid, p_role text) to authenticated;
grant execute on function public.claim_garage_billing_operations(p_worker_id text, p_lease_seconds integer, p_limit integer) to service_role;
grant execute on function public.claim_garage_subscription_lease(p_subscription_id text, p_lease_owner text, p_lease_seconds integer) to service_role;
grant execute on function public.claim_garage_webhook_retry(p_worker_id text, p_lease_seconds integer, p_limit integer, p_event_id text) to service_role;
grant execute on function public.cleanup_line_link_inbound_nonces() to service_role;
grant execute on function public.clear_login_failures(p_identity_hash text) to service_role;
grant execute on function public.complete_plan_change_request(p_request_id uuid) to service_role;
grant execute on function public.complete_sale_correction_inspection(p_case_id uuid, p_note text, p_idempotency_key text, p_correlation_id text) to authenticated;
grant execute on function public.complete_vehicle_delivery(p_deal_id uuid, p_idempotency_key text, p_correlation_id text) to authenticated;
grant execute on function public.confirm_invoice_part_stock(p_invoice_id uuid, p_store_id uuid) to authenticated;
grant execute on function public.confirm_sale_correction_restock(p_case_id uuid, p_idempotency_key text, p_correlation_id text) to authenticated;
grant execute on function public.create_admin_email_otp_challenge(p_user_id uuid, p_session_id uuid, p_email_hash text, p_code_hash text) to service_role;
grant execute on function public.create_garage_store(p_name text) to authenticated;
grant execute on function public.create_inventory_count(p_store_id uuid, p_count jsonb, p_items jsonb, p_idempotency_key text) to authenticated;
grant execute on function public.create_sale_correction_case(p_sale_claim_id uuid, p_case_type text, p_reason text, p_requested_refund_amount integer, p_invoice_id uuid, p_idempotency_key text, p_correlation_id text) to authenticated;
grant execute on function public.create_store_for_current_user(store_name text, owner_display_name text) to authenticated;
grant execute on function public.current_user_accessible_store_ids() to authenticated;
grant execute on function public.current_user_active_store_id() to authenticated;
grant execute on function public.current_user_can_access_store(p_store_id uuid) to authenticated;
grant execute on function public.current_user_can_admin_store(p_store_id uuid) to authenticated;
grant execute on function public.current_user_can_append_store(p_store_id uuid) to authenticated;
grant execute on function public.current_user_can_implement_store(p_store_id uuid) to authenticated;
grant execute on function public.current_user_can_write_store(p_store_id uuid) to authenticated;
grant execute on function public.current_user_role_for_tenant(target_tenant_id uuid) to authenticated;
grant execute on function public.current_user_store_ids() to authenticated;
grant execute on function public.current_user_store_role(p_store_id uuid) to authenticated;
grant execute on function public.current_user_tenant_ids() to authenticated;
grant execute on function public.deactivate_membership(p_membership_id uuid) to authenticated;
grant execute on function public.enforce_administrator_aal2() to anon, authenticated, service_role;
grant execute on function public.enforce_administrator_email_otp() to anon, authenticated, service_role;
grant execute on function public.ensure_company_subscription(p_company_id uuid) to authenticated, service_role;
grant execute on function public.finalize_inventory_count(p_inventory_count_id uuid, p_idempotency_key text) to authenticated;
grant execute on function public.garage_effective_billing_state(p_stripe_status text, p_billing_state text, p_grace_ends_at timestamp with time zone, p_cancel_at_period_end boolean, p_current_period_end timestamp with time zone, p_cancelled_at timestamp with time zone, p_restoration_state text, p_now timestamp with time zone) to authenticated, service_role;
grant execute on function public.generate_followup_candidate_events(p_store_id uuid, p_today date) to authenticated, service_role;
grant execute on function public.generate_inspection_reminder_events(p_store_id uuid, p_today date) to authenticated, service_role;
grant execute on function public.get_company_subscription(p_company_id uuid) to authenticated;
grant execute on function public.get_garage_analytics_payload() to authenticated;
grant execute on function public.get_garage_analytics_payload_v2() to authenticated;
grant execute on function public.get_garage_dashboard_payload() to authenticated;
grant execute on function public.get_garage_dashboard_payload_v2() to authenticated;
grant execute on function public.get_garage_plan_usage(p_store_id uuid) to authenticated;
grant execute on function public.get_garage_ui_context() to authenticated;
grant execute on function public.get_garage_ui_context_v2() to authenticated;
grant execute on function public.get_inspection_reminder_eligibility_summary(p_store_id uuid) to authenticated;
grant execute on function public.get_login_lock(p_identity_hash text) to service_role;
grant execute on function public.get_member_contract_access() to authenticated;
grant execute on function public.has_tenant_feature(target_tenant_id uuid, target_feature_code text) to authenticated;
grant execute on function public.inventory_dashboard_metrics(p_store_id uuid) to authenticated;
grant execute on function public.invite_membership(p_tenant_id uuid, p_store_id uuid, p_email text, p_role text, p_display_name text, p_memo text) to authenticated;
grant execute on function public.issue_garage_invoice(p_invoice_id uuid, p_idempotency_key text, p_correlation_id text) to authenticated;
grant execute on function public.list_accessible_garage_stores() to authenticated;
grant execute on function public.mark_company_subscription_cancelled(p_company_id uuid) to service_role;
grant execute on function public.purge_expired_store_data_for_tenant(p_tenant_id uuid) to service_role;
grant execute on function public.reactivate_company_subscription(p_company_id uuid) to service_role;
grant execute on function public.record_garage_payment(p_invoice_id uuid, p_amount integer, p_payment_method text, p_idempotency_key text, p_correlation_id text) to authenticated;
grant execute on function public.record_garage_payment_reversal(p_payment_id uuid, p_amount integer, p_operation text, p_reason text, p_idempotency_key text, p_correlation_id text) to authenticated;
grant execute on function public.record_login_failure(p_identity_hash text) to service_role;
grant execute on function public.record_sale_correction_refund(p_case_id uuid, p_payment_id uuid, p_amount integer, p_reason text, p_idempotency_key text, p_correlation_id text) to authenticated;
grant execute on function public.reissue_membership_invite(p_membership_id uuid) to authenticated;
grant execute on function public.release_garage_subscription_lease(p_subscription_id text, p_lease_owner text) to service_role;
grant execute on function public.release_qa_admin_bootstrap_context(p_user_id uuid, p_session_id uuid, p_environment text) to service_role;
grant execute on function public.reserve_vehicle_sale(p_deal_id uuid, p_idempotency_key text, p_correlation_id text) to authenticated;
grant execute on function public.resolve_sale_correction_external_procedure(p_case_id uuid, p_external_status text, p_reason text, p_idempotency_key text, p_correlation_id text) to authenticated;
grant execute on function public.resolve_sale_correction_ownership(p_case_id uuid, p_ownership_status text, p_reason text, p_idempotency_key text, p_correlation_id text) to authenticated;
grant execute on function public.revoke_admin_trusted_sessions_for_user(p_user_id uuid, p_reason text) to service_role;
grant execute on function public.service_list_eligible_garage_stores() to service_role;
grant execute on function public.service_resolve_garage_store_scope(p_store_id uuid) to service_role;
grant execute on function public.set_membership_store_assignment(p_membership_id uuid, p_store_id uuid, p_enabled boolean, p_correlation_id text) to authenticated;
grant execute on function public.store_is_authorization_eligible(p_status text) to authenticated, service_role;
grant execute on function public.switch_active_garage_store(p_tenant_id uuid, p_store_id uuid, p_correlation_id text) to authenticated;
grant execute on function public.transition_sale_correction_case(p_case_id uuid, p_action text, p_reason text, p_approved_refund_amount integer, p_restock_decision text, p_idempotency_key text, p_correlation_id text) to authenticated;
grant execute on function public.verify_admin_email_otp_challenge(p_user_id uuid, p_session_id uuid, p_code_hash text, p_device_token_hash text) to service_role;
grant execute on function public.void_garage_invoice(p_invoice_id uuid, p_reason text, p_idempotency_key text, p_correlation_id text) to authenticated;

do $$
begin
  if exists (
    select 1 from information_schema.role_table_grants
    where table_schema='public' and grantee='anon'
      and privilege_type in ('INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN')
  ) then raise exception 'BATCH1D_ANON_EXCESSIVE_RELATION_GRANT'; end if;
  if exists (
    select 1 from information_schema.routine_privileges
    where routine_schema='public' and grantee='PUBLIC'
  ) then raise exception 'BATCH1D_PUBLIC_FUNCTION_EXECUTE'; end if;
end
$$;
