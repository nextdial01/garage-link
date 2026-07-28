-- G0/G1-A isolated database fixture.
-- 実行先を garage_g0* またはG0-B ledger付きの公式Supabase使い捨てDBに限定し、
-- 実メール・実顧客データは含めない。

do $$
begin
  if current_database() not like 'garage_g0%'
     and coalesce(current_setting('app.g0b_fixture', true), '') <> 'enabled' then
    raise exception 'G0 fixtureはgarage_g0*またはG0-B ledger付き使い捨てDB以外では実行できません。';
  end if;
end;
$$;

begin;
set local session_replication_role = replica;

insert into auth.users(id, email) values
  ('50000000-0000-0000-0000-000000000001', 'owner-a@example.invalid'),
  ('50000000-0000-0000-0000-000000000002', 'admin-a@example.invalid'),
  ('50000000-0000-0000-0000-000000000003', 'implementer-a@example.invalid'),
  ('50000000-0000-0000-0000-000000000004', 'staff-a@example.invalid'),
  ('50000000-0000-0000-0000-000000000005', 'viewer-a@example.invalid'),
  ('50000000-0000-0000-0000-000000000006', 'inactive-a@example.invalid'),
  ('50000000-0000-0000-0000-000000000007', 'unassigned-a@example.invalid'),
  ('50000000-0000-0000-0000-000000000008', 'owner-b@example.invalid'),
  ('50000000-0000-0000-0000-000000000009', 'admin-b@example.invalid'),
  ('50000000-0000-0000-0000-000000000010', 'staff-b@example.invalid'),
  ('50000000-0000-0000-0000-000000000011', 'membership-only@example.invalid'),
  ('50000000-0000-0000-0000-000000000012', 'legacy-only@example.invalid'),
  ('50000000-0000-0000-0000-000000000013', 'role-mismatch@example.invalid'),
  ('50000000-0000-0000-0000-000000000014', 'status-mismatch@example.invalid'),
  ('50000000-0000-0000-0000-000000000015', 'deleted-membership@example.invalid')
on conflict (id) do nothing;

insert into public.tenants(id, name, status, plan_code) values
  ('51000000-0000-0000-0000-000000000001', 'G0 Tenant A', 'active', 'pro'),
  ('52000000-0000-0000-0000-000000000001', 'G0 Tenant B', 'active', 'pro')
on conflict (id) do nothing;

insert into public.stores(id, tenant_id, name, status, plan_code) values
  ('51100000-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000001', 'G0 Store A1', 'active', 'pro'),
  ('51100000-0000-0000-0000-000000000002', '51000000-0000-0000-0000-000000000001', 'G0 Store A2', 'active', 'pro'),
  ('52100000-0000-0000-0000-000000000001', '52000000-0000-0000-0000-000000000001', 'G0 Store B1', 'active', 'pro')
on conflict (id) do nothing;

insert into public.company_subscriptions(
  company_id, tenant_id, plan, status, included_staff_count, included_store_count,
  current_inventory_limit
) values
  ('51100000-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000001', 'pro', 'active', 100, 10, 100),
  ('52100000-0000-0000-0000-000000000001', '52000000-0000-0000-0000-000000000001', 'pro', 'active', 100, 10, 100)
on conflict do nothing;

insert into public.memberships(
  tenant_id, store_id, user_id, email, role, status, joined_at, invite_accepted_at
) values
  ('51000000-0000-0000-0000-000000000001', '51100000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', 'owner-a@example.invalid', 'owner', 'active', now(), now()),
  ('51000000-0000-0000-0000-000000000001', '51100000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000002', 'admin-a@example.invalid', 'admin', 'active', now(), now()),
  ('51000000-0000-0000-0000-000000000001', '51100000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000003', 'implementer-a@example.invalid', 'implementer', 'active', now(), now()),
  ('51000000-0000-0000-0000-000000000001', '51100000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000004', 'staff-a@example.invalid', 'staff', 'active', now(), now()),
  ('51000000-0000-0000-0000-000000000001', '51100000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000005', 'viewer-a@example.invalid', 'viewer', 'active', now(), now()),
  ('51000000-0000-0000-0000-000000000001', '51100000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000006', 'inactive-a@example.invalid', 'staff', 'inactive', now(), now()),
  ('52000000-0000-0000-0000-000000000001', '52100000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000008', 'owner-b@example.invalid', 'owner', 'active', now(), now()),
  ('52000000-0000-0000-0000-000000000001', '52100000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000009', 'admin-b@example.invalid', 'admin', 'active', now(), now()),
  ('52000000-0000-0000-0000-000000000001', '52100000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000010', 'staff-b@example.invalid', 'staff', 'active', now(), now()),
  ('51000000-0000-0000-0000-000000000001', '51100000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000011', 'membership-only@example.invalid', 'staff', 'active', now(), now()),
  ('51000000-0000-0000-0000-000000000001', '51100000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000013', 'role-mismatch@example.invalid', 'staff', 'active', now(), now()),
  ('51000000-0000-0000-0000-000000000001', '51100000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000014', 'status-mismatch@example.invalid', 'staff', 'inactive', now(), now()),
  ('51000000-0000-0000-0000-000000000001', '51100000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000015', 'deleted-membership@example.invalid', 'staff', 'inactive', now(), now())
on conflict (tenant_id, user_id) do nothing;

update public.memberships
set deleted_at = now()
where user_id = '50000000-0000-0000-0000-000000000015';

insert into public.memberships(
  tenant_id, store_id, email, role, status, invited_at, invited_by,
  invite_token_hash, invite_expires_at
) values
  ('51000000-0000-0000-0000-000000000001', '51100000-0000-0000-0000-000000000001', 'pending@example.invalid', 'viewer', 'invited', now(), '50000000-0000-0000-0000-000000000001', encode(digest('pending-token', 'sha256'), 'hex'), now() + interval '7 days'),
  ('51000000-0000-0000-0000-000000000001', '51100000-0000-0000-0000-000000000001', 'cancelled@example.invalid', 'staff', 'cancelled', now(), '50000000-0000-0000-0000-000000000001', encode(digest('cancelled-token', 'sha256'), 'hex'), now() + interval '7 days')
on conflict do nothing;

insert into public.store_members(store_id, user_id, email, role, status, joined_at) values
  ('51100000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', 'owner-a@example.invalid', 'owner', 'active', now()),
  ('51100000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000002', 'admin-a@example.invalid', 'admin', 'active', now()),
  ('51100000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000003', 'implementer-a@example.invalid', 'implementer', 'active', now()),
  ('51100000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000004', 'staff-a@example.invalid', 'staff', 'active', now()),
  ('51100000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000005', 'viewer-a@example.invalid', 'viewer', 'active', now()),
  ('52100000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000008', 'owner-b@example.invalid', 'owner', 'active', now()),
  ('52100000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000009', 'admin-b@example.invalid', 'admin', 'active', now()),
  ('52100000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000010', 'staff-b@example.invalid', 'staff', 'active', now()),
  ('51100000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000012', 'legacy-only@example.invalid', 'owner', 'active', now()),
  ('51100000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000013', 'role-mismatch@example.invalid', 'owner', 'active', now()),
  ('51100000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000014', 'status-mismatch@example.invalid', 'staff', 'active', now())
on conflict (store_id, user_id) do nothing;

set local session_replication_role = origin;
commit;

-- tenant/store不一致はfixtureとして残さず、複合FKが拒否することを確認する。
do $$
begin
  begin
    insert into public.memberships(
      tenant_id, store_id, user_id, email, role, status, joined_at, invite_accepted_at
    ) values (
      '51000000-0000-0000-0000-000000000001',
      '52100000-0000-0000-0000-000000000001',
      '50000000-0000-0000-0000-000000000007',
      'unassigned-a@example.invalid', 'owner', 'active', now(), now()
    );
    raise exception 'tenant/store不一致が拒否されませんでした。';
  exception when foreign_key_violation then
    raise notice 'PASS: tenant/store不一致は複合FKで拒否されました。';
  end;
end;
$$;
