-- Pre-G1 upgrade fixture. Synthetic data only.
do $$
begin
  if coalesce(current_setting('app.g0b_fixture', true), '') <> 'enabled' then
    raise exception 'G0B_UPGRADE_FIXTURE_REQUIRES_EXPLICIT_MARKER';
  end if;
end;
$$;

begin;
set local session_replication_role = replica;

insert into auth.users(id, email) values
  ('54000000-0000-0000-0000-000000000001', 'upgrade-owner@example.invalid')
on conflict (id) do nothing;

insert into public.tenants(id, name, status, plan_code) values
  ('54100000-0000-0000-0000-000000000001', 'G0B Upgrade Tenant', 'active', 'pro')
on conflict (id) do nothing;

insert into public.stores(id, tenant_id, name, status, plan_code) values
  ('54200000-0000-0000-0000-000000000001', '54100000-0000-0000-0000-000000000001', 'G0B Upgrade Store', 'active', 'pro')
on conflict (id) do nothing;

insert into public.memberships(tenant_id, store_id, user_id, email, role, status, joined_at)
values (
  '54100000-0000-0000-0000-000000000001', '54200000-0000-0000-0000-000000000001',
  '54000000-0000-0000-0000-000000000001', 'upgrade-owner@example.invalid', 'owner', 'active', now()
)
on conflict (tenant_id, user_id) do nothing;

insert into public.store_members(store_id, user_id, email, role, status, joined_at)
values (
  '54200000-0000-0000-0000-000000000001', '54000000-0000-0000-0000-000000000001',
  'upgrade-owner@example.invalid', 'staff', 'active', now()
)
on conflict (store_id, user_id) do nothing;

insert into public.vehicles(id, store_id, management_no, status)
values ('54300000-0000-0000-0000-000000000001', '54200000-0000-0000-0000-000000000001', 'G0B-UPGRADE-SOLD', '売約済み')
on conflict (id) do nothing;

insert into public.deals(id, store_id, vehicle_id, title, status)
values (
  '54400000-0000-0000-0000-000000000001', '54200000-0000-0000-0000-000000000001',
  '54300000-0000-0000-0000-000000000001', 'G0B upgrade active sale', '成約'
)
on conflict (id) do nothing;

insert into public.invoices(
  id,store_id,deal_id,vehicle_id,invoice_no,status,issue_status,
  subtotal_amount,tax_amount,discount_amount,trade_in_amount,total_amount,paid_amount,unpaid_amount
) values (
  '54500000-0000-0000-0000-000000000001','54200000-0000-0000-0000-000000000001',
  '54400000-0000-0000-0000-000000000001','54300000-0000-0000-0000-000000000001',
  'G0B-UPGRADE-INV-001','issued','issued',1000,0,0,0,1000,0,1000
)
on conflict (id) do nothing;

set local session_replication_role = origin;
commit;
