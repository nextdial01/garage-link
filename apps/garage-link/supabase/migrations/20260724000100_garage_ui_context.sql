-- 管理画面の共通表示情報とメニューバッジを1回のRPCで返す。
-- ブラウザで7テーブルを全件取得する処理を廃止し、転送量と通信回数を抑える。

create or replace function public.get_garage_ui_context()
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
  v_display_name text;
  v_store public.stores%rowtype;
  v_stores jsonb := '[]'::jsonb;
  v_today date := (now() at time zone 'Asia/Tokyo')::date;
  v_counts jsonb;
begin
  if v_user_id is null then
    raise exception 'ログイン情報を取得できませんでした。';
  end if;

  select sm.store_id, coalesce(sm.role, 'viewer'), coalesce(sm.display_name, '')
    into v_store_id, v_role, v_display_name
  from public.store_members sm
  where sm.user_id = v_user_id
    and coalesce(sm.status, 'active') in ('active', 'member')
  order by sm.updated_at desc nulls last, sm.created_at asc
  limit 1;

  if v_store_id is null then
    return jsonb_build_object(
      'store_id', '',
      'store_label', '店舗未登録',
      'role', 'viewer',
      'display_name', '',
      'long_stay_threshold_days', 90,
      'onboarding_completed', false,
      'primary_navigation_tabs', null,
      'stores', '[]'::jsonb,
      'counts', '{}'::jsonb
    );
  end if;

  select * into v_store from public.stores where id = v_store_id;

  select coalesce(jsonb_agg(to_jsonb(store_row)), '[]'::jsonb)
    into v_stores
  from public.list_accessible_garage_stores() store_row;

  select jsonb_build_object(
    'vehicle_attention', (
      select count(*)
      from public.vehicles vehicle
      where vehicle.store_id = v_store_id
        and vehicle.deleted_at is null
        and coalesce(vehicle.is_archived, false) = false
        and (
          vehicle.market_value is null
          or nullif(trim(vehicle.market_source), '') is null
          or vehicle.market_checked_at is null
          or v_today - coalesce(vehicle.purchase_date, vehicle.created_at::date) > coalesce(v_store.long_stay_threshold_days, 90)
          or exists (
            select 1 from public.vehicle_listing_statuses listing
            where listing.store_id = v_store_id
              and listing.vehicle_id = vehicle.id
              and (
                listing.status = 'エラー'
                or (vehicle.status in ('売約済み', '納車済み') and listing.status = '掲載中')
              )
          )
        )
    ),
    'deals_today', (
      select count(*) from public.deals deal
      where deal.store_id = v_store_id
        and deal.deleted_at is null
        and coalesce(deal.is_archived, false) = false
        and deal.next_action_at::date = v_today
        and coalesce(deal.status, '') not in ('成約', '失注')
    ),
    'deals_overdue', (
      select count(*) from public.deals deal
      where deal.store_id = v_store_id
        and deal.deleted_at is null
        and coalesce(deal.is_archived, false) = false
        and deal.next_action_at::date < v_today
        and coalesce(deal.status, '') not in ('成約', '失注')
    ),
    'customers_today', (
      select count(*) from public.customers customer
      where customer.store_id = v_store_id
        and customer.deleted_at is null
        and coalesce(customer.is_archived, false) = false
        and customer.next_action_date = v_today
        and coalesce(customer.customer_status, '') <> '対応不要'
    ),
    'customers_overdue', (
      select count(*) from public.customers customer
      where customer.store_id = v_store_id
        and customer.deleted_at is null
        and coalesce(customer.is_archived, false) = false
        and customer.next_action_date < v_today
        and coalesce(customer.customer_status, '') <> '対応不要'
    ),
    'appointments_today', (
      select count(*) from public.appointments appointment
      where appointment.store_id = v_store_id
        and (appointment.scheduled_at at time zone 'Asia/Tokyo')::date = v_today
        and appointment.status in ('予約済み', '確認済み')
    ),
    'appointments_open', (
      select count(*) from public.appointments appointment
      where appointment.store_id = v_store_id
        and appointment.status in ('予約済み', '確認済み')
    ),
    'maintenance_today', (
      select count(*) from public.maintenance_jobs job
      where job.store_id = v_store_id
        and job.scheduled_delivery_at::date = v_today
        and coalesce(job.status, '') not in ('completed', 'delivered', '完了', '納車済み')
    ),
    'maintenance_overdue', (
      select count(*) from public.maintenance_jobs job
      where job.store_id = v_store_id
        and job.scheduled_delivery_at::date < v_today
        and coalesce(job.status, '') not in ('completed', 'delivered', '完了', '納車済み')
    ),
    'inquiry_pending', (
      select count(*) from public.line_form_responses inquiry
      where inquiry.store_id = v_store_id
        and inquiry.response_status <> 'completed'
    )
  ) into v_counts;

  return jsonb_build_object(
    'store_id', v_store_id,
    'store_label', coalesce(nullif(trim(v_store.name), ''), '店舗'),
    'role', v_role,
    'display_name', v_display_name,
    'long_stay_threshold_days', coalesce(v_store.long_stay_threshold_days, 90),
    'onboarding_completed', v_store.onboarding_completed_at is not null,
    'primary_navigation_tabs', v_store.primary_navigation_tabs,
    'stores', v_stores,
    'counts', v_counts
  );
end;
$$;

revoke all on function public.get_garage_ui_context() from public;
grant execute on function public.get_garage_ui_context() to authenticated;

create index if not exists vehicles_store_active_idx
  on public.vehicles(store_id, purchase_date)
  where deleted_at is null and coalesce(is_archived, false) = false;
create index if not exists deals_store_next_action_active_idx
  on public.deals(store_id, next_action_at)
  where deleted_at is null and coalesce(is_archived, false) = false;
create index if not exists customers_store_next_action_active_idx
  on public.customers(store_id, next_action_date)
  where deleted_at is null and coalesce(is_archived, false) = false;
create index if not exists maintenance_store_delivery_idx
  on public.maintenance_jobs(store_id, scheduled_delivery_at);
