-- G1-B security-preserving rollback
-- 通常のdown migrationのように旧policyを復活させるとviewer writeが再発するため、
-- owner/adminだけの最小policyへ縮退する。helper/RPC wrapperは安全境界として保持する。

do $g1b_rollback$
declare
  v_table text;
  v_policy record;
  v_store_tables text[] := array[
    'accounting_export_settings','appointments','audit_logs','customers','data_export_logs','data_import_logs',
    'deals','inventory_count_items','inventory_counts','invoice_items','invoices','inspection_reminder_settings',
    'inspection_reminder_timings','line_auto_replies','line_campaign_targets','line_campaigns','line_form_questions',
    'line_forms','line_message_drafts','line_rich_menus','line_routes','line_settings','line_step_messages','line_steps',
    'line_tags','line_templates','maintenance_job_parts','maintenance_jobs','payment_items','quote_items','quotes',
    'repair_part_stock_movements','repair_parts','trade_in_vehicles','uploaded_files',
    'vehicle_listing_statuses','vehicles'
  ];
begin
  foreach v_table in array v_store_tables loop
    if to_regclass('public.' || v_table) is null then continue; end if;
    for v_policy in
      select polname from pg_policy
      where polrelid = to_regclass('public.' || v_table)
        and polcmd in ('a', 'w', 'd', '*')
    loop
      execute format('drop policy if exists %I on public.%I', v_policy.polname, v_table);
    end loop;
    execute format('grant select, insert, update, delete on public.%I to authenticated', v_table);
    execute format('revoke insert, update, delete on public.%I from anon', v_table);
    execute format('create policy g1b_rollback_insert_admin on public.%I for insert to authenticated with check (public.current_user_can_admin_store(store_id))', v_table);
    execute format('create policy g1b_rollback_update_admin on public.%I for update to authenticated using (public.current_user_can_admin_store(store_id)) with check (public.current_user_can_admin_store(store_id))', v_table);
    execute format('create policy g1b_rollback_delete_admin on public.%I for delete to authenticated using (public.current_user_can_admin_store(store_id))', v_table);
  end loop;
end;
$g1b_rollback$;

drop policy if exists g1b_append_role on public.security_events;
create policy g1b_rollback_append_admin on public.security_events
  for insert to authenticated
  with check (public.current_user_role_for_tenant(tenant_id) in ('owner', 'admin'));

-- service-only / legacy writeはrollback後も復活させない。
do $g1b_rollback$
declare
  v_table text;
begin
  foreach v_table in array array[
    'admin_access_credentials','admin_email_otp_challenges','admin_trusted_sessions','auth_login_attempts',
    'company_subscriptions','delivery_overage_logs','delivery_usage_logs','inspection_reminder_events',
    'line_delivery_logs','line_form_responses','line_friends','line_link_inbound_nonces','line_message_logs',
    'line_test_delivery_logs','line_webhook_events','ll_friend_info_fields','ll_friend_info_folders',
    'll_friend_info_values','ll_subscriptions','plan_change_requests','stripe_webhook_events','tenant_features',
    'tenant_subscriptions','memberships','store_members'
  ] loop
    if to_regclass('public.' || v_table) is not null then
      execute format('revoke insert, update, delete on public.%I from anon, authenticated', v_table);
    end if;
  end loop;
end;
$g1b_rollback$;

-- RPCもowner/adminまたはservice_roleのG1-B wrapperを保持する。
revoke execute on function public.complete_plan_change_request(uuid) from public, anon, authenticated;
revoke execute on function public.mark_company_subscription_cancelled(uuid) from public, anon, authenticated;
revoke execute on function public.reactivate_company_subscription(uuid) from public, anon, authenticated;
revoke execute on function public.purge_expired_store_data() from public, anon, authenticated;

do $g1b_rollback$
begin
  if to_regprocedure('public.create_llink_company_for_current_user(text,text)') is not null then
    revoke all on function public.create_llink_company_for_current_user(text, text) from public, anon, authenticated;
  end if;
  if to_regprocedure('public.ensure_ll_subscription(uuid)') is not null then
    revoke all on function public.ensure_ll_subscription(uuid) from public, anon, authenticated;
  end if;
  if to_regprocedure('public.mark_ll_subscription_cancelled(uuid)') is not null then
    revoke all on function public.mark_ll_subscription_cancelled(uuid) from public, anon, authenticated;
  end if;
  if to_regprocedure('public.reactivate_ll_subscription(uuid)') is not null then
    revoke all on function public.reactivate_ll_subscription(uuid) from public, anon, authenticated;
  end if;
end;
$g1b_rollback$;
