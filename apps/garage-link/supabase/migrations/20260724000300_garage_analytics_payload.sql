-- 分析画面の12回の業務データ取得を1回のRPCへ集約する。
-- 未使用の電話番号・メール・LINE user IDは返さず、必要最小限の列に限定する。

create or replace function public.get_garage_analytics_payload()
returns jsonb
language plpgsql
security definer
stable
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_store_id uuid;
begin
  if v_user_id is null then
    raise exception 'ログイン情報を取得できませんでした。';
  end if;

  select sm.store_id into v_store_id
  from public.store_members sm
  where sm.user_id = v_user_id
    and coalesce(sm.status, 'active') in ('active', 'member')
  order by sm.updated_at desc nulls last, sm.created_at asc
  limit 1;

  if v_store_id is null then
    raise exception '所属店舗が見つかりません。';
  end if;

  return jsonb_build_object(
    'vehicles', (select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) from (
      select id, management_no, maker, model_name, base_price, total_price, status, location_name
      from public.vehicles where store_id = v_store_id
    ) r),
    'customers', (select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) from (
      select id, name, line_display_name, line_friend_status, delivery_permission
      from public.customers where store_id = v_store_id
    ) r),
    'deals', (select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) from (
      select id, customer_id, vehicle_id, title, status, probability, source, next_action_at, assigned_user_name
      from public.deals where store_id = v_store_id
    ) r),
    'quotes', (select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) from (
      select id, status, issue_status, total_amount
      from public.quotes where store_id = v_store_id
    ) r),
    'invoices', (select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) from (
      select id, status, issue_status, total_amount, unpaid_amount
      from public.invoices where store_id = v_store_id
    ) r),
    'maintenance_jobs', (select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) from (
      select id, customer_id, vehicle_id, job_no, job_type, status, scheduled_delivery_at, next_inspection_date, assigned_user_name
      from public.maintenance_jobs where store_id = v_store_id
    ) r),
    'line_friends', (select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) from (
      select id, customer_id, line_display_name, friend_status, delivery_permission, tag_names
      from public.line_friends where store_id = v_store_id
    ) r),
    'line_message_logs', (select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) from (
      select id, customer_id, line_display_name, message_type, title, send_status, error_message, sent_at, created_at
      from public.line_message_logs where store_id = v_store_id
    ) r),
    'line_tags', (select coalesce(jsonb_agg(jsonb_build_object('id', id)), '[]'::jsonb)
      from public.line_tags where store_id = v_store_id),
    'line_templates', (select coalesce(jsonb_agg(jsonb_build_object('id', id)), '[]'::jsonb)
      from public.line_templates where store_id = v_store_id),
    'line_steps', (select coalesce(jsonb_agg(jsonb_build_object('id', id)), '[]'::jsonb)
      from public.line_steps where store_id = v_store_id),
    'line_campaigns', (select coalesce(jsonb_agg(jsonb_build_object('id', id)), '[]'::jsonb)
      from public.line_campaigns where store_id = v_store_id)
  );
end;
$$;

revoke all on function public.get_garage_analytics_payload() from public;
grant execute on function public.get_garage_analytics_payload() to authenticated;
