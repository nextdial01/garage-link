-- Deterministic G3 fixture for isolated G0/G0-B databases only.

do $$
begin
  if current_database() not like 'garage_g0%'
     and coalesce(current_setting('app.g0b_fixture', true), '') <> 'enabled' then
    raise exception 'G3 fixture requires garage_g0* or an explicit G0-B fixture session';
  end if;
end;
$$;

insert into public.vehicles (id, store_id, management_no, status)
values (
  '53000000-0000-0000-0000-000000000001',
  '51100000-0000-0000-0000-000000000001',
  'G3-PRE',
  '在庫中'
)
on conflict (id) do update
set store_id = excluded.store_id,
    management_no = excluded.management_no,
    status = excluded.status,
    sold_date = null;

insert into public.deals (id, store_id, vehicle_id, title, status)
values
  ('53100000-0000-0000-0000-000000000001', '51100000-0000-0000-0000-000000000001', '53000000-0000-0000-0000-000000000001', 'G3 pre deal 1', '商談中'),
  ('53100000-0000-0000-0000-000000000002', '51100000-0000-0000-0000-000000000001', '53000000-0000-0000-0000-000000000001', 'G3 pre deal 2', '商談中')
on conflict (id) do update
set store_id = excluded.store_id,
    vehicle_id = excluded.vehicle_id,
    title = excluded.title,
    status = excluded.status;

insert into public.deals (id, store_id, vehicle_id, deal_no, title, status)
select
  ('53300000-0000-0000-0000-' || lpad(worker::text, 12, '0'))::uuid,
  '51100000-0000-0000-0000-000000000001'::uuid,
  '53000000-0000-0000-0000-000000000001'::uuid,
  'G3-W-' || worker,
  'G3 concurrency ' || worker,
  '商談中'
from generate_series(1, 100) as worker
on conflict (id) do update
set store_id = excluded.store_id,
    vehicle_id = excluded.vehicle_id,
    deal_no = excluded.deal_no,
    title = excluded.title,
    status = excluded.status;
