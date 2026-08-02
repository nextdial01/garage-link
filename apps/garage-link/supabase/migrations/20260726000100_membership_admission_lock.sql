-- GARAGE LINK G1-A: membership admission lock
-- memberships を認証・認可の唯一の正本とし、store_members は互換投影に限定する。
-- 既存データを memberships へ自動昇格しない。曖昧な正本データは適用前検査で停止する。

create extension if not exists "pgcrypto";

-- DB-005: store authorization eligibility is intentionally narrower than a
-- store lifecycle model. NULL and every unknown status fail closed.
create or replace function public.store_is_authorization_eligible(p_status text)
returns boolean
language sql
immutable
parallel safe
set search_path = pg_catalog
as $$
  select coalesce(p_status in ('active', 'trial'), false);
$$;
revoke all on function public.store_is_authorization_eligible(text) from public, anon;
grant execute on function public.store_is_authorization_eligible(text) to authenticated, service_role;

alter table public.memberships add column if not exists invite_token_hash text;
alter table public.memberships add column if not exists invite_expires_at timestamptz;
alter table public.memberships add column if not exists invite_accepted_at timestamptz;
alter table public.memberships add column if not exists invite_cancelled_at timestamptz;
alter table public.memberships add column if not exists disabled_at timestamptz;
alter table public.memberships add column if not exists deleted_at timestamptz;
alter table public.memberships add column if not exists invited_by uuid references auth.users(id) on delete set null;
alter table public.memberships add column if not exists memo text;

-- 正本側の曖昧な行は推測補正せず、migration を停止して人間の確認を要求する。
do $$
declare
  v_legacy_drift_count bigint;
begin
  if exists (
    select 1 from public.memberships
    where role not in ('owner', 'admin', 'implementer', 'staff', 'viewer')
       or status not in ('active', 'invited', 'suspended', 'cancelled', 'inactive')
  ) then
    raise exception 'G1A_PRECHECK: membership role/status に未対応値があります。';
  end if;

  if exists (
    select 1
    from public.memberships m
    left join public.tenants t on t.id = m.tenant_id
    left join public.stores s on s.id = m.store_id
    left join auth.users u on u.id = m.user_id
    where m.status = 'active'
      and m.deleted_at is null
      and (
        m.user_id is null
        or u.id is null
        or m.store_id is null
        or s.id is null
        or s.tenant_id is distinct from m.tenant_id
        or t.status is distinct from 'active'
        or not public.store_is_authorization_eligible(s.status)
        or coalesce(m.invite_accepted_at, m.joined_at) is null
      )
  ) then
    raise exception 'G1A_PRECHECK: active membership のuser/tenant/store/承認状態に不整合があります。';
  end if;

  if exists (
    select 1 from public.memberships
    where status = 'invited'
      and deleted_at is null
      and (
        user_id is not null
        or nullif(lower(btrim(email)), '') is null
        or invite_token_hash is null
        or invite_expires_at is null
      )
  ) then
    raise exception 'G1A_PRECHECK: 既存の招待中membershipに安全なtoken/期限がありません。';
  end if;

  -- DB-006: store_members is a compatibility projection, never an owner
  -- admission requirement. Preserve the drift count for operator evidence,
  -- but evaluate tenant operability from canonical memberships only.
  select count(*) into v_legacy_drift_count
  from public.memberships m
  where m.status = 'active'
    and m.disabled_at is null
    and m.deleted_at is null
    and not exists (
      select 1
      from public.store_members sm
      where sm.user_id = m.user_id
        and sm.store_id = m.store_id
        and sm.role = m.role
        and sm.status = 'active'
    );
  raise notice 'G1A_PRECHECK_LEGACY_DRIFT_COUNT:%', v_legacy_drift_count;

  if exists (
    select 1
    from public.tenants t
    where t.status = 'active'
      and exists (select 1 from public.stores s where s.tenant_id = t.id and public.store_is_authorization_eligible(s.status))
      and not exists (
        select 1
        from public.memberships m
        join public.stores s on s.id = m.store_id and s.tenant_id = m.tenant_id and public.store_is_authorization_eligible(s.status)
        where m.tenant_id = t.id
          and m.role = 'owner'
          and m.status = 'active'
          and m.user_id is not null
          and m.disabled_at is null
          and m.deleted_at is null
          and coalesce(m.invite_accepted_at, m.joined_at) is not null
      )
  ) then
    raise exception 'G1A_PRECHECK: active owner が存在しないtenantがあります。';
  end if;
end;
$$;

alter table public.memberships drop constraint if exists memberships_role_check;
alter table public.memberships
  add constraint memberships_role_check
  check (role in ('owner', 'admin', 'implementer', 'staff', 'viewer'));

alter table public.memberships drop constraint if exists memberships_status_check;
alter table public.memberships
  add constraint memberships_status_check
  check (status in ('active', 'invited', 'suspended', 'cancelled', 'inactive'));

alter table public.memberships drop constraint if exists memberships_active_shape_check;
alter table public.memberships
  add constraint memberships_active_shape_check
  check (
    status <> 'active'
    or (
      user_id is not null
      and store_id is not null
      and disabled_at is null
      and deleted_at is null
      and coalesce(invite_accepted_at, joined_at) is not null
    )
  );

alter table public.memberships drop constraint if exists memberships_invited_shape_check;
alter table public.memberships
  add constraint memberships_invited_shape_check
  check (
    status <> 'invited'
    or (
      user_id is null
      and nullif(lower(btrim(email)), '') is not null
      and invite_token_hash is not null
      and invite_expires_at is not null
      and invite_cancelled_at is null
      and deleted_at is null
    )
  );

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.stores'::regclass
      and conname = 'stores_id_tenant_id_key'
  ) then
    alter table public.stores
      add constraint stores_id_tenant_id_key unique (id, tenant_id);
  end if;
end;
$$;

alter table public.memberships drop constraint if exists memberships_store_tenant_fkey;
alter table public.memberships
  add constraint memberships_store_tenant_fkey
  foreign key (store_id, tenant_id)
  references public.stores(id, tenant_id)
  on delete restrict;

create unique index if not exists memberships_one_active_user_per_tenant
  on public.memberships(tenant_id, user_id)
  where status = 'active' and user_id is not null and deleted_at is null;

create unique index if not exists memberships_one_pending_email_per_tenant
  on public.memberships(tenant_id, lower(btrim(email)))
  where status = 'invited' and deleted_at is null;

create unique index if not exists memberships_invite_token_hash_key
  on public.memberships(invite_token_hash)
  where invite_token_hash is not null;

create index if not exists memberships_active_owner_lookup
  on public.memberships(tenant_id, role, status)
  where role = 'owner' and status = 'active' and disabled_at is null and deleted_at is null;

create index if not exists memberships_active_user_store_lookup
  on public.memberships(user_id, tenant_id, store_id)
  where status = 'active' and disabled_at is null and deleted_at is null;

-- 旧テーブルは正本へ昇格させず、正本と一致しない行を権限に使えない状態へ隔離する。
-- この更新は権限を付与せず、既存の曖昧な権限を失効させるだけである。
update public.store_members sm
set status = 'suspended', updated_at = now()
where coalesce(sm.status, 'active') <> 'suspended'
  and not exists (
    select 1
    from public.memberships m
    join public.stores s on s.id = m.store_id and s.tenant_id = m.tenant_id
    join public.tenants t on t.id = m.tenant_id
    where m.user_id = sm.user_id
      and m.store_id = sm.store_id
      and m.role = sm.role
      and m.status = 'active'
      and m.disabled_at is null
      and m.deleted_at is null
      and coalesce(m.invite_accepted_at, m.joined_at) is not null
      and public.store_is_authorization_eligible(s.status)
      and t.status = 'active'
  );

alter table public.store_members drop constraint if exists store_members_role_check;
alter table public.store_members
  add constraint store_members_role_check
  check (role in ('owner', 'admin', 'implementer', 'staff', 'viewer'));

alter table public.store_members drop constraint if exists store_members_status_check;
alter table public.store_members
  add constraint store_members_status_check
  check (status in ('active', 'invited', 'suspended'));

-- 内部専用。旧行が無い場合は memberships のみを正本として認める。
-- 旧行が同じtenantに存在する場合は、store/role/statusの完全一致を要求する。
create or replace function public.membership_legacy_is_consistent(
  p_tenant_id uuid,
  p_store_id uuid,
  p_user_id uuid,
  p_role text
)
returns boolean
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select not exists (
    select 1
    from public.store_members sm
    join public.stores legacy_store on legacy_store.id = sm.store_id
    where sm.user_id = p_user_id
      and legacy_store.tenant_id = p_tenant_id
      and (
        sm.store_id is distinct from p_store_id
        or sm.role is distinct from p_role
        or sm.status is distinct from 'active'
      )
  );
$$;

revoke all on function public.membership_legacy_is_consistent(uuid, uuid, uuid, text) from public, anon, authenticated;

create or replace function public.current_user_tenant_ids()
returns setof uuid
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select m.tenant_id
  from public.memberships m
  join public.tenants t on t.id = m.tenant_id and t.status = 'active'
  join public.stores s on s.id = m.store_id and s.tenant_id = m.tenant_id and public.store_is_authorization_eligible(s.status)
  join auth.users u on u.id = m.user_id
  where m.user_id = auth.uid()
    and m.status = 'active'
    and m.role in ('owner', 'admin', 'implementer', 'staff', 'viewer')
    and m.disabled_at is null
    and m.deleted_at is null
    and coalesce(m.invite_accepted_at, m.joined_at) is not null
    and public.membership_legacy_is_consistent(m.tenant_id, m.store_id, m.user_id, m.role);
$$;

create or replace function public.current_user_store_ids()
returns setof uuid
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select s.id
  from public.memberships m
  join public.tenants t on t.id = m.tenant_id and t.status = 'active'
  join public.stores assigned_store
    on assigned_store.id = m.store_id
   and assigned_store.tenant_id = m.tenant_id
   and public.store_is_authorization_eligible(assigned_store.status)
  join public.stores s
    on s.tenant_id = m.tenant_id
   and public.store_is_authorization_eligible(s.status)
   and (m.role in ('owner', 'admin') or s.id = m.store_id)
  join auth.users u on u.id = m.user_id
  where m.user_id = auth.uid()
    and m.status = 'active'
    and m.role in ('owner', 'admin', 'implementer', 'staff', 'viewer')
    and m.disabled_at is null
    and m.deleted_at is null
    and coalesce(m.invite_accepted_at, m.joined_at) is not null
    and public.membership_legacy_is_consistent(m.tenant_id, m.store_id, m.user_id, m.role);
$$;

create or replace function public.current_user_role_for_tenant(target_tenant_id uuid)
returns text
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select m.role
  from public.memberships m
  join public.tenants t on t.id = m.tenant_id and t.status = 'active'
  join public.stores s on s.id = m.store_id and s.tenant_id = m.tenant_id and public.store_is_authorization_eligible(s.status)
  join auth.users u on u.id = m.user_id
  where m.user_id = auth.uid()
    and m.tenant_id = target_tenant_id
    and m.status = 'active'
    and m.role in ('owner', 'admin', 'implementer', 'staff', 'viewer')
    and m.disabled_at is null
    and m.deleted_at is null
    and coalesce(m.invite_accepted_at, m.joined_at) is not null
    and public.membership_legacy_is_consistent(m.tenant_id, m.store_id, m.user_id, m.role)
  limit 1;
$$;

revoke all on function public.current_user_tenant_ids() from public, anon;
revoke all on function public.current_user_store_ids() from public, anon;
revoke all on function public.current_user_role_for_tenant(uuid) from public, anon;
grant execute on function public.current_user_tenant_ids() to authenticated;
grant execute on function public.current_user_store_ids() to authenticated;
grant execute on function public.current_user_role_for_tenant(uuid) to authenticated;

-- 直接membership書込みを全面停止し、SELECTと認可済みRPCだけを公開する。
drop policy if exists "memberships_insert_admin" on public.memberships;
drop policy if exists "memberships_update_admin" on public.memberships;
drop policy if exists "memberships_delete_admin" on public.memberships;
drop policy if exists "store_members_insert_member_stores_or_self" on public.store_members;
drop policy if exists "store_members_update_member_stores" on public.store_members;
drop policy if exists "store_members_delete_member_stores" on public.store_members;

revoke insert, update, delete on public.memberships from anon, authenticated;
revoke insert, update, delete on public.store_members from anon, authenticated;
grant select on public.memberships to authenticated;
grant select on public.store_members to authenticated;

drop policy if exists "memberships_select_own" on public.memberships;
create policy "memberships_select_own" on public.memberships
for select to authenticated
using (
  user_id = auth.uid()
  or tenant_id in (select public.current_user_tenant_ids())
);

drop policy if exists "store_members_select_member_stores" on public.store_members;
drop policy if exists "store_members_select_compatibility_only" on public.store_members;
create policy "store_members_select_compatibility_only" on public.store_members
for select to authenticated
using (store_id in (select public.current_user_store_ids()));

-- 互換表にactive行を書けるのは、先に正本へ同一のactive membershipが成立した場合だけ。
create or replace function public.guard_store_members_compatibility()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op in ('INSERT', 'UPDATE') and new.status = 'active' then
    if new.user_id is null or not exists (
      select 1
      from public.memberships m
      join public.stores s on s.id = m.store_id and s.tenant_id = m.tenant_id and public.store_is_authorization_eligible(s.status)
      join public.tenants t on t.id = m.tenant_id and t.status = 'active'
      where m.user_id = new.user_id
        and m.store_id = new.store_id
        and m.role = new.role
        and m.status = 'active'
        and m.disabled_at is null
        and m.deleted_at is null
        and coalesce(m.invite_accepted_at, m.joined_at) is not null
    ) then
      raise exception using errcode = '42501', message = '旧所属表へ権限を作成できません。';
    end if;
  elsif tg_op = 'INSERT' then
    raise exception using errcode = '42501', message = '旧所属表へ新規行を作成できません。';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_store_members_compatibility on public.store_members;
create trigger guard_store_members_compatibility
before insert or update of store_id, user_id, role, status on public.store_members
for each row execute function public.guard_store_members_compatibility();

-- service_role等の直接変更でも最後のownerを失わないDB防壁。
create or replace function public.guard_membership_owner_and_identity()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_other_owner_count bigint;
begin
  if tg_op = 'UPDATE'
     and (new.tenant_id, new.store_id, new.user_id) is distinct from (old.tenant_id, old.store_id, old.user_id)
     and current_user not in ('postgres', 'supabase_admin', 'service_role') then
    raise exception using errcode = '42501', message = 'membershipの所属先は直接変更できません。';
  end if;

  if old.role = 'owner'
     and old.status = 'active'
     and old.disabled_at is null
     and old.deleted_at is null
     and (
       tg_op = 'DELETE'
       or new.role <> 'owner'
       or new.status <> 'active'
       or new.disabled_at is not null
       or new.deleted_at is not null
     ) then
    perform 1 from public.tenants where id = old.tenant_id for update;
    select count(*) into v_other_owner_count
    from public.memberships m
    join public.stores s on s.id = m.store_id and s.tenant_id = m.tenant_id and public.store_is_authorization_eligible(s.status)
    where m.tenant_id = old.tenant_id
      and m.id <> old.id
      and m.role = 'owner'
      and m.status = 'active'
      and m.disabled_at is null
      and m.deleted_at is null
      and coalesce(m.invite_accepted_at, m.joined_at) is not null
      and public.membership_legacy_is_consistent(m.tenant_id, m.store_id, m.user_id, m.role);
    if v_other_owner_count = 0 then
      raise exception using errcode = '23514', message = '最後のownerは変更できません。';
    end if;
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists guard_membership_owner_and_identity on public.memberships;
create trigger guard_membership_owner_and_identity
before update or delete on public.memberships
for each row execute function public.guard_membership_owner_and_identity();

create or replace function public.membership_plan_limit_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_limit integer := 1;
  v_count bigint;
begin
  if new.status not in ('active', 'invited') or new.deleted_at is not null then
    return new;
  end if;
  perform 1 from public.tenants where id = new.tenant_id for update;
  select cs.included_staff_count + cs.extra_staff_count
    into v_limit
  from public.company_subscriptions cs
  where cs.tenant_id = new.tenant_id and cs.status = 'active'
  order by cs.updated_at desc nulls last
  limit 1;
  v_limit := coalesce(v_limit, 1);
  select count(*) into v_count
  from public.memberships m
  where m.tenant_id = new.tenant_id
    and m.id is distinct from new.id
    and m.status in ('active', 'invited')
    and m.deleted_at is null;
  if v_count >= v_limit then
    raise exception using errcode = 'P0001', message = '契約のスタッフ上限に達しています。';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_membership_plan_limit on public.memberships;
create trigger guard_membership_plan_limit
before insert or update of status, deleted_at on public.memberships
for each row execute function public.membership_plan_limit_guard();

create or replace function public.invite_membership(
  p_tenant_id uuid,
  p_store_id uuid,
  p_email text,
  p_role text,
  p_display_name text default null,
  p_memo text default null
)
returns table (membership_id uuid, invite_token text, expires_at timestamptz)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_actor_role text;
  v_email text := lower(btrim(p_email));
  v_token text;
  v_membership_id uuid;
  v_existing public.memberships%rowtype;
  v_expires_at timestamptz := now() + interval '7 days';
begin
  if v_actor is null then
    raise exception using errcode = '28000', message = 'ログインが必要です。';
  end if;
  if v_email = '' or p_role not in ('owner', 'admin', 'implementer', 'staff', 'viewer') then
    raise exception using errcode = '22023', message = '招待内容が不正です。';
  end if;

  perform 1 from public.tenants t where t.id = p_tenant_id and t.status = 'active' for update;
  if not found then
    raise exception using errcode = '42501', message = '対象tenantを操作できません。';
  end if;
  if not exists (
    select 1 from public.stores s
    where s.id = p_store_id and s.tenant_id = p_tenant_id and public.store_is_authorization_eligible(s.status)
  ) then
    raise exception using errcode = '42501', message = '対象店舗を操作できません。';
  end if;

  v_actor_role := public.current_user_role_for_tenant(p_tenant_id);
  if v_actor_role is null or v_actor_role not in ('owner', 'admin') then
    raise exception using errcode = '42501', message = 'メンバーを招待する権限がありません。';
  end if;
  if v_actor_role = 'admin' and p_role not in ('staff', 'viewer') then
    raise exception using errcode = '42501', message = '指定したroleを招待できません。';
  end if;
  if exists (select 1 from auth.users u where u.id = v_actor and lower(u.email) = v_email) then
    raise exception using errcode = '42501', message = '自分自身を招待できません。';
  end if;
  if exists (
    select 1
    from public.memberships m
    join auth.users u on u.id = m.user_id
    where m.tenant_id = p_tenant_id
      and lower(u.email) = v_email
      and m.status = 'active'
      and m.deleted_at is null
  ) then
    raise exception using errcode = '23505', message = '既に有効なmembershipがあります。';
  end if;

  select m.* into v_existing
  from public.memberships m
  where m.tenant_id = p_tenant_id
    and lower(btrim(m.email)) = v_email
    and m.status = 'invited'
    and m.deleted_at is null
  for update;

  if found then
    if v_existing.store_id is distinct from p_store_id or v_existing.role is distinct from p_role then
      raise exception using errcode = '23505', message = '同じメールアドレスの招待が既に存在します。';
    end if;
    return query select v_existing.id, null::text, v_existing.invite_expires_at;
    return;
  end if;

  v_token := gen_random_uuid()::text || gen_random_uuid()::text;
  insert into public.memberships (
    tenant_id, store_id, user_id, email, role, status, display_name, memo,
    invited_at, invited_by, invite_token_hash, invite_expires_at, created_by, updated_by
  ) values (
    p_tenant_id, p_store_id, null, v_email, p_role, 'invited', nullif(btrim(p_display_name), ''),
    nullif(btrim(p_memo), ''), now(), v_actor, encode(digest(v_token, 'sha256'), 'hex'),
    v_expires_at, v_actor, v_actor
  ) returning id into v_membership_id;

  return query select v_membership_id, v_token, v_expires_at;
end;
$$;

create or replace function public.reissue_membership_invite(p_membership_id uuid)
returns table (membership_id uuid, invite_token text, expires_at timestamptz)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_actor_role text;
  v_tenant_id uuid;
  v_target public.memberships%rowtype;
  v_token text;
  v_expires_at timestamptz := now() + interval '7 days';
begin
  if v_actor is null then raise exception using errcode = '28000', message = 'ログインが必要です。'; end if;
  select tenant_id into v_tenant_id from public.memberships where id = p_membership_id;
  if v_tenant_id is null then raise exception using errcode = 'P0002', message = '招待が見つかりません。'; end if;
  perform 1 from public.tenants where id = v_tenant_id and status = 'active' for update;
  select * into v_target from public.memberships where id = p_membership_id for update;
  if not found or v_target.status not in ('invited', 'cancelled') or v_target.deleted_at is not null then
    raise exception using errcode = 'P0002', message = '再招待できるmembershipが見つかりません。';
  end if;
  v_actor_role := public.current_user_role_for_tenant(v_target.tenant_id);
  if v_actor_role = 'admin' and v_target.role in ('staff', 'viewer') then null;
  elsif v_actor_role = 'owner' then null;
  else raise exception using errcode = '42501', message = '再招待する権限がありません。';
  end if;
  if not exists (
    select 1 from public.stores s
    where s.id = v_target.store_id and s.tenant_id = v_target.tenant_id and public.store_is_authorization_eligible(s.status)
  ) then
    raise exception using errcode = '42501', message = '招待先を利用できません。';
  end if;
  v_token := gen_random_uuid()::text || gen_random_uuid()::text;
  update public.memberships
  set status = 'invited',
      invited_at = now(),
      invited_by = v_actor,
      invite_token_hash = encode(digest(v_token, 'sha256'), 'hex'),
      invite_expires_at = v_expires_at,
      invite_cancelled_at = null,
      updated_by = v_actor
  where id = v_target.id;
  return query select v_target.id, v_token, v_expires_at;
end;
$$;

create or replace function public.accept_membership_invite(
  p_membership_id uuid,
  p_invite_token text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_actor_email text;
  v_tenant_id uuid;
  v_membership public.memberships%rowtype;
begin
  if v_actor is null then
    raise exception using errcode = '28000', message = 'ログインが必要です。';
  end if;
  select lower(u.email) into v_actor_email from auth.users u where u.id = v_actor;
  select tenant_id into v_tenant_id from public.memberships where id = p_membership_id;
  if v_tenant_id is null then
    raise exception using errcode = 'P0002', message = '招待が見つかりません。';
  end if;
  perform 1 from public.tenants where id = v_tenant_id for update;
  select * into v_membership from public.memberships where id = p_membership_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = '招待が見つかりません。';
  end if;
  if v_membership.invite_token_hash is distinct from encode(digest(coalesce(p_invite_token, ''), 'sha256'), 'hex') then
    raise exception using errcode = '42501', message = '招待を承認できません。';
  end if;
  if v_membership.status = 'active' and v_membership.user_id = v_actor then
    return jsonb_build_object('ok', true, 'membership_id', v_membership.id, 'already_accepted', true);
  end if;
  if v_membership.status = 'cancelled' or v_membership.invite_cancelled_at is not null then
    raise exception using errcode = 'P0002', message = '招待は取消済みです。';
  end if;
  if v_membership.status <> 'invited' or v_membership.invite_expires_at <= now() then
    raise exception using errcode = 'P0002', message = '招待の有効期限が切れています。';
  end if;
  if v_actor_email is null or v_actor_email <> lower(btrim(v_membership.email)) then
    raise exception using errcode = '42501', message = '招待対象本人だけが承認できます。';
  end if;
  if not exists (
    select 1 from public.stores s join public.tenants t on t.id = s.tenant_id
    where s.id = v_membership.store_id
      and s.tenant_id = v_membership.tenant_id
      and public.store_is_authorization_eligible(s.status)
      and t.status = 'active'
  ) then
    raise exception using errcode = '42501', message = '招待先を利用できません。';
  end if;
  if exists (
    select 1 from public.memberships m
    where m.tenant_id = v_membership.tenant_id
      and m.user_id = v_actor
      and m.status = 'active'
      and m.deleted_at is null
      and m.id <> v_membership.id
  ) then
    raise exception using errcode = '23505', message = '既に有効なmembershipがあります。';
  end if;

  update public.memberships
  set user_id = v_actor,
      status = 'active',
      joined_at = coalesce(joined_at, now()),
      invite_accepted_at = now(),
      disabled_at = null,
      updated_by = v_actor
  where id = v_membership.id;

  update public.store_members sm
  set status = 'suspended', updated_at = now()
  from public.stores s
  where sm.store_id = s.id
    and sm.user_id = v_actor
    and s.tenant_id = v_membership.tenant_id
    and sm.store_id <> v_membership.store_id;

  insert into public.store_members (store_id, user_id, email, role, status, display_name, joined_at)
  values (
    v_membership.store_id, v_actor, v_actor_email, v_membership.role, 'active',
    v_membership.display_name, now()
  )
  on conflict (store_id, user_id) do update
  set email = excluded.email,
      role = excluded.role,
      status = 'active',
      display_name = excluded.display_name,
      joined_at = coalesce(public.store_members.joined_at, excluded.joined_at),
      updated_at = now();

  return jsonb_build_object('ok', true, 'membership_id', v_membership.id, 'already_accepted', false);
end;
$$;

create or replace function public.cancel_membership_invite(p_membership_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_actor_role text;
  v_tenant_id uuid;
  v_target public.memberships%rowtype;
begin
  if v_actor is null then raise exception using errcode = '28000', message = 'ログインが必要です。'; end if;
  select tenant_id into v_tenant_id from public.memberships where id = p_membership_id;
  if v_tenant_id is null then raise exception using errcode = 'P0002', message = '有効な招待が見つかりません。'; end if;
  perform 1 from public.tenants where id = v_tenant_id and status = 'active' for update;
  select * into v_target from public.memberships where id = p_membership_id for update;
  if not found or v_target.status <> 'invited' then
    raise exception using errcode = 'P0002', message = '有効な招待が見つかりません。';
  end if;
  v_actor_role := public.current_user_role_for_tenant(v_target.tenant_id);
  if v_actor_role = 'admin' and v_target.role in ('staff', 'viewer') then null;
  elsif v_actor_role = 'owner' then null;
  else raise exception using errcode = '42501', message = '招待を取消す権限がありません。';
  end if;
  update public.memberships
  set status = 'cancelled', invite_cancelled_at = now(), updated_by = v_actor
  where id = v_target.id;
  return jsonb_build_object('ok', true, 'membership_id', v_target.id);
end;
$$;

create or replace function public.change_membership_role(p_membership_id uuid, p_role text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_actor_role text;
  v_tenant_id uuid;
  v_target public.memberships%rowtype;
begin
  if v_actor is null then raise exception using errcode = '28000', message = 'ログインが必要です。'; end if;
  if p_role not in ('owner', 'admin', 'implementer', 'staff', 'viewer') then
    raise exception using errcode = '22023', message = 'roleが不正です。';
  end if;
  select tenant_id into v_tenant_id from public.memberships where id = p_membership_id;
  if v_tenant_id is null then raise exception using errcode = 'P0002', message = '有効なmembershipが見つかりません。'; end if;
  perform 1 from public.tenants where id = v_tenant_id and status = 'active' for update;
  select * into v_target from public.memberships where id = p_membership_id for update;
  if not found or v_target.status <> 'active' or v_target.disabled_at is not null or v_target.deleted_at is not null then
    raise exception using errcode = 'P0002', message = '有効なmembershipが見つかりません。';
  end if;
  v_actor_role := public.current_user_role_for_tenant(v_target.tenant_id);
  if v_actor_role = 'owner' then null;
  elsif v_actor_role = 'admin'
    and v_target.role in ('staff', 'viewer')
    and p_role in ('staff', 'viewer') then null;
  else
    raise exception using errcode = '42501', message = 'roleを変更する権限がありません。';
  end if;
  if v_target.user_id = v_actor and v_actor_role <> 'owner' and p_role <> v_target.role then
    raise exception using errcode = '42501', message = '自分自身のroleを変更できません。';
  end if;
  update public.memberships set role = p_role, updated_by = v_actor where id = v_target.id;
  update public.store_members
  set role = p_role, status = 'active', updated_at = now()
  where store_id = v_target.store_id and user_id = v_target.user_id;
  return jsonb_build_object('ok', true, 'membership_id', v_target.id, 'role', p_role);
end;
$$;

create or replace function public.deactivate_membership(p_membership_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_actor_role text;
  v_tenant_id uuid;
  v_target public.memberships%rowtype;
begin
  if v_actor is null then raise exception using errcode = '28000', message = 'ログインが必要です。'; end if;
  select tenant_id into v_tenant_id from public.memberships where id = p_membership_id;
  if v_tenant_id is null then raise exception using errcode = 'P0002', message = '有効なmembershipが見つかりません。'; end if;
  perform 1 from public.tenants where id = v_tenant_id and status = 'active' for update;
  select * into v_target from public.memberships where id = p_membership_id for update;
  if not found or v_target.status <> 'active' or v_target.disabled_at is not null or v_target.deleted_at is not null then
    raise exception using errcode = 'P0002', message = '有効なmembershipが見つかりません。';
  end if;
  v_actor_role := public.current_user_role_for_tenant(v_target.tenant_id);
  if v_actor_role = 'owner' then null;
  elsif v_actor_role = 'admin' and v_target.role in ('staff', 'viewer') then null;
  else raise exception using errcode = '42501', message = 'membershipを無効化する権限がありません。';
  end if;
  update public.memberships
  set status = 'inactive', disabled_at = now(), updated_by = v_actor
  where id = v_target.id;
  update public.store_members
  set status = 'suspended', updated_at = now()
  where store_id = v_target.store_id and user_id = v_target.user_id;
  return jsonb_build_object('ok', true, 'membership_id', v_target.id);
end;
$$;

revoke all on function public.invite_membership(uuid, uuid, text, text, text, text) from public, anon;
revoke all on function public.accept_membership_invite(uuid, text) from public, anon;
revoke all on function public.reissue_membership_invite(uuid) from public, anon;
revoke all on function public.cancel_membership_invite(uuid) from public, anon;
revoke all on function public.change_membership_role(uuid, text) from public, anon;
revoke all on function public.deactivate_membership(uuid) from public, anon;
grant execute on function public.invite_membership(uuid, uuid, text, text, text, text) to authenticated;
grant execute on function public.accept_membership_invite(uuid, text) to authenticated;
grant execute on function public.reissue_membership_invite(uuid) to authenticated;
grant execute on function public.cancel_membership_invite(uuid) to authenticated;
grant execute on function public.change_membership_role(uuid, text) to authenticated;
grant execute on function public.deactivate_membership(uuid) to authenticated;

-- signupは新tenantのowner membershipを先に作り、旧表には互換投影だけを作る。
create or replace function public.create_store_for_current_user(store_name text, owner_display_name text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_tenant_id uuid;
  v_store_id uuid;
  v_email text;
begin
  if v_user_id is null then raise exception using errcode = '28000', message = 'ログインが必要です。'; end if;
  if exists (select 1 from public.memberships m where m.user_id = v_user_id and m.deleted_at is null) then
    raise exception using errcode = '23505', message = '既に所属が登録されています。';
  end if;
  if store_name is null or btrim(store_name) = '' then
    raise exception using errcode = '22023', message = '店舗名を入力してください。';
  end if;
  select lower(u.email) into v_email from auth.users u where u.id = v_user_id;
  insert into public.tenants(name, status, plan_code, created_by, updated_by)
  values (btrim(store_name), 'active', 'free', v_user_id, v_user_id)
  returning id into v_tenant_id;
  insert into public.stores(name, company_name, email, plan_code, status, tenant_id, created_by, updated_by)
  values (btrim(store_name), btrim(store_name), v_email, 'free', 'active', v_tenant_id, v_user_id, v_user_id)
  returning id into v_store_id;
  insert into public.memberships(
    tenant_id, store_id, user_id, email, role, status, display_name,
    joined_at, invite_accepted_at, created_by, updated_by
  ) values (
    v_tenant_id, v_store_id, v_user_id, v_email, 'owner', 'active',
    nullif(btrim(owner_display_name), ''), now(), now(), v_user_id, v_user_id
  );
  insert into public.store_members(store_id, user_id, role, display_name, email, status, joined_at)
  values (v_store_id, v_user_id, 'owner', nullif(btrim(owner_display_name), ''), v_email, 'active', now());
  insert into public.company_subscriptions(
    company_id, tenant_id, plan, status, included_staff_count, extra_staff_count,
    included_store_count, extra_store_count, storage_limit_mb, extra_storage_gb,
    current_inventory_limit, l_link_integration_enabled
  ) values (v_store_id, v_tenant_id, 'free', 'active', 1, 0, 1, 0, 500, 0, 5, false);
  return v_store_id;
end;
$$;

revoke all on function public.create_store_for_current_user(text, text) from public, anon;
grant execute on function public.create_store_for_current_user(text, text) to authenticated;

create or replace function public.list_accessible_garage_stores()
returns table (id uuid, name text, company_name text, tenant_id uuid, is_current boolean)
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  with current_store as (
    select m.store_id
    from public.memberships m
    where m.user_id = auth.uid()
      and m.status = 'active'
      and m.disabled_at is null
      and m.deleted_at is null
      and m.tenant_id in (select public.current_user_tenant_ids())
    limit 1
  )
  select s.id, s.name, s.company_name, s.tenant_id, s.id = cs.store_id
  from public.stores s
  left join current_store cs on true
  where s.id in (select public.current_user_store_ids())
  order by (s.id = cs.store_id) desc, s.name asc;
$$;

create or replace function public.switch_active_garage_store(p_store_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_membership public.memberships%rowtype;
begin
  if auth.uid() is null or p_store_id not in (select public.current_user_store_ids()) then
    raise exception using errcode = '42501', message = '切替できる店舗ではありません。';
  end if;
  select * into v_membership
  from public.memberships
  where user_id = auth.uid() and status = 'active' and deleted_at is null
  for update;
  if not found then raise exception using errcode = '42501', message = '所属情報が見つかりません。'; end if;
  if not exists (select 1 from public.stores where id = p_store_id and tenant_id = v_membership.tenant_id and public.store_is_authorization_eligible(status)) then
    raise exception using errcode = '42501', message = '切替できる店舗ではありません。';
  end if;
  update public.memberships set store_id = p_store_id, updated_by = auth.uid() where id = v_membership.id;
  update public.store_members set store_id = p_store_id, updated_at = now()
  where user_id = auth.uid() and store_id = v_membership.store_id;
  return jsonb_build_object('ok', true, 'store_id', p_store_id);
end;
$$;

revoke all on function public.list_accessible_garage_stores() from public, anon;
revoke all on function public.switch_active_garage_store(uuid) from public, anon;
grant execute on function public.list_accessible_garage_stores() to authenticated;
grant execute on function public.switch_active_garage_store(uuid) to authenticated;

notify pgrst, 'reload schema';
