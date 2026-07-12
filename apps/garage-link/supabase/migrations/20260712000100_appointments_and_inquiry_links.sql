-- Deployable migration promotion of supabase/schema/045_appointments_and_inquiry_links.sql.

-- 045 予約実績と問い合わせの車両・商談紐付け

alter table public.line_form_responses
  add column if not exists vehicle_id uuid references public.vehicles(id) on delete set null,
  add column if not exists deal_id uuid references public.deals(id) on delete set null;

create index if not exists line_form_responses_vehicle_id_idx on public.line_form_responses(vehicle_id);
create index if not exists line_form_responses_deal_id_idx on public.line_form_responses(deal_id);

create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  vehicle_id uuid references public.vehicles(id) on delete set null,
  deal_id uuid references public.deals(id) on delete set null,
  appointment_type text not null default '来店予約',
  scheduled_at timestamptz not null,
  status text not null default '予約済み',
  assigned_user_name text,
  note text,
  no_show_reason text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint appointments_type_check check (appointment_type in ('来店予約', '試乗予約', '商談予約', '整備予約')),
  constraint appointments_status_check check (status in ('予約済み', '確認済み', '完了', 'キャンセル', '無断キャンセル'))
);

create index if not exists appointments_store_scheduled_idx on public.appointments(store_id, scheduled_at);
create index if not exists appointments_customer_idx on public.appointments(customer_id);
create index if not exists appointments_vehicle_idx on public.appointments(vehicle_id);

drop trigger if exists set_appointments_updated_at on public.appointments;
create trigger set_appointments_updated_at before update on public.appointments for each row execute function public.set_updated_at();

alter table public.appointments enable row level security;
drop policy if exists "appointments_select_own_store" on public.appointments;
create policy "appointments_select_own_store" on public.appointments for select using (store_id in (select public.current_user_store_ids()));
drop policy if exists "appointments_insert_own_store" on public.appointments;
create policy "appointments_insert_own_store" on public.appointments for insert with check (store_id in (select public.current_user_store_ids()));
drop policy if exists "appointments_update_own_store" on public.appointments;
create policy "appointments_update_own_store" on public.appointments for update using (store_id in (select public.current_user_store_ids())) with check (store_id in (select public.current_user_store_ids()));
drop policy if exists "appointments_delete_own_store" on public.appointments;
create policy "appointments_delete_own_store" on public.appointments for delete using (store_id in (select public.current_user_store_ids()));
grant select, insert, update, delete on public.appointments to authenticated;
