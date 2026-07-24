-- ダッシュボードに必要な業務データを1回のRPCで返し、ブラウザからの通信回数を抑える。
-- 店舗IDは引数で受け取らず、ログインユーザーの所属からDB側で確定する。

create or replace function public.get_garage_dashboard_payload()
returns jsonb
language plpgsql
security definer
stable
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_store_id uuid;
  v_role text;
begin
  if v_user_id is null then
    raise exception 'ログイン情報を取得できませんでした。';
  end if;

  select sm.store_id, coalesce(sm.role, 'viewer')
    into v_store_id, v_role
  from public.store_members sm
  where sm.user_id = v_user_id
    and coalesce(sm.status, 'active') in ('active', 'member')
  order by sm.updated_at desc nulls last, sm.created_at asc
  limit 1;

  if v_store_id is null then
    raise exception '所属店舗が見つかりません。';
  end if;

  return jsonb_build_object(
    'vehicles', (
      select coalesce(jsonb_agg(to_jsonb(row_data) order by row_data.created_at desc), '[]'::jsonb)
      from (
        select
          vehicle.id,
          vehicle.management_no,
          vehicle.maker,
          vehicle.model_name,
          vehicle.status,
          vehicle.location_name,
          vehicle.total_price,
          vehicle.listing_price,
          vehicle.purchase_price,
          vehicle.direct_cost_special,
          vehicle.direct_cost_accessories,
          vehicle.direct_cost_agency,
          vehicle.direct_cost_legal,
          vehicle.purchase_date,
          vehicle.sale_price,
          vehicle.sold_date,
          vehicle.market_value,
          vehicle.market_source,
          vehicle.market_checked_at,
          vehicle.created_at,
          vehicle.is_archived,
          vehicle.deleted_at
        from public.vehicles vehicle
        where vehicle.store_id = v_store_id
      ) row_data
    ),
    'deals', (
      select coalesce(jsonb_agg(to_jsonb(row_data) order by row_data.created_at desc), '[]'::jsonb)
      from (
        select
          deal.id,
          deal.deal_no,
          deal.title,
          deal.status,
          deal.assigned_user_name,
          deal.next_action_at,
          deal.created_at,
          deal.vehicle_id
        from public.deals deal
        where deal.store_id = v_store_id
      ) row_data
    ),
    'invoices', case when v_role in ('owner', 'admin') then (
      select coalesce(
        jsonb_agg(to_jsonb(row_data) - '_sort_created_at' order by row_data._sort_created_at desc),
        '[]'::jsonb
      )
      from (
        select
          invoice.id,
          invoice.vehicle_id,
          invoice.issue_date,
          invoice.issue_status,
          invoice.total_amount,
          invoice.created_at as _sort_created_at
        from public.invoices invoice
        where invoice.store_id = v_store_id
      ) row_data
    ) else '[]'::jsonb end,
    'maintenance_jobs', (
      select coalesce(jsonb_agg(to_jsonb(row_data) order by row_data.scheduled_delivery_at asc), '[]'::jsonb)
      from (
        select
          job.id,
          job.reception_no,
          job.vehicle_id,
          job.job_type,
          job.status,
          job.scheduled_delivery_at,
          job.assigned_user_name
        from public.maintenance_jobs job
        where job.store_id = v_store_id
      ) row_data
    ),
    'appointments', (
      select coalesce(jsonb_agg(to_jsonb(row_data) order by row_data.scheduled_at asc), '[]'::jsonb)
      from (
        select
          appointment.id,
          appointment.customer_id,
          appointment.vehicle_id,
          appointment.appointment_type,
          appointment.scheduled_at,
          appointment.status,
          appointment.assigned_user_name
        from public.appointments appointment
        where appointment.store_id = v_store_id
      ) row_data
    ),
    'inquiries', (
      select coalesce(jsonb_agg(to_jsonb(row_data) order by row_data.submitted_at desc), '[]'::jsonb)
      from (
        select
          inquiry.id,
          inquiry.customer_id,
          inquiry.deal_id,
          inquiry.answers,
          inquiry.submitted_at,
          inquiry.source_route,
          inquiry.response_status,
          inquiry.assigned_user_name,
          inquiry.next_action_at
        from public.line_form_responses inquiry
        where inquiry.store_id = v_store_id
      ) row_data
    ),
    'customers', (
      select coalesce(jsonb_agg(to_jsonb(row_data)), '[]'::jsonb)
      from (
        select customer.id, customer.name, customer.next_action_date
        from public.customers customer
        where customer.store_id = v_store_id
      ) row_data
    ),
    'listing_statuses', (
      select coalesce(jsonb_agg(to_jsonb(row_data)), '[]'::jsonb)
      from (
        select listing.vehicle_id, listing.channel, listing.status
        from public.vehicle_listing_statuses listing
        where listing.store_id = v_store_id
      ) row_data
    ),
    'store_info', (
      select jsonb_build_object(
        'long_stay_threshold_days', store.long_stay_threshold_days,
        'management_target_gross_profit_yen',
          case when v_role in ('owner', 'admin') then store.management_target_gross_profit_yen else null end,
        'l_link_onboarding_completed_at', store.l_link_onboarding_completed_at,
        'sales_recognition_basis',
          case when v_role in ('owner', 'admin') then store.sales_recognition_basis else null end,
        'purchase_recognition_basis',
          case when v_role in ('owner', 'admin') then store.purchase_recognition_basis else null end,
        'business_type', store.business_type
      )
      from public.stores store
      where store.id = v_store_id
    )
  );
end;
$$;

revoke all on function public.get_garage_dashboard_payload() from public;
grant execute on function public.get_garage_dashboard_payload() to authenticated;
