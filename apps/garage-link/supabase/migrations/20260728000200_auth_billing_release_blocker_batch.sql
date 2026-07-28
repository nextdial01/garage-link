-- GARAGE LINK release blocker batch: AUTH-004 / BILL-003 / CRON-001.
-- Forward-only expand migration. No business rows are backfilled or deleted.

begin;

-- Supabase production exposes auth.jwt(), while the isolated PostgreSQL
-- regression harness deliberately does not. Read the same request claim from
-- PostgreSQL settings so the service-only contract is portable and testable.
create or replace function public.garage_request_jwt_role()
returns text
language plpgsql
stable
set search_path = ''
as $$
declare
  v_role text;
  v_claims jsonb;
begin
  v_role := nullif(current_setting('request.jwt.claim.role', true), '');
  if v_role is not null then return v_role; end if;
  begin
    v_claims := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  exception when others then
    return '';
  end;
  return coalesce(v_claims ->> 'role', '');
end;
$$;

revoke all on function public.garage_request_jwt_role()
  from public, anon, authenticated, service_role;
alter function public.garage_request_jwt_role() owner to postgres;

-- Resolve the authenticated administrator through canonical membership data
-- before an OTP challenge exists. This is not an authentication bypass: only
-- the server-held service identity can call it and it never creates a session.
create or replace function public.admin_email_otp_bootstrap_context(
  p_user_id uuid,
  p_session_id uuid
)
returns jsonb
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  v_contexts jsonb;
  v_count integer;
begin
  if public.garage_request_jwt_role() <> 'service_role'
     and session_user not in ('postgres', 'supabase_admin') then
    raise insufficient_privilege using message = 'service role required';
  end if;
  if p_user_id is null or p_session_id is null then return null; end if;

  select
    count(*)::integer,
    jsonb_agg(
      jsonb_build_object(
        'user_id', m.user_id,
        'email', lower(u.email),
        'tenant_id', m.tenant_id,
        'store_id', s.id,
        'role', m.role
      )
      order by m.tenant_id, s.id
    )
  into v_count, v_contexts
  from public.memberships m
  join auth.users u on u.id = m.user_id
  join public.tenants t on t.id = m.tenant_id and t.status = 'active'
  join public.stores s
    on s.id = m.store_id
   and s.tenant_id = m.tenant_id
   and public.store_is_authorization_eligible(s.status)
  left join public.membership_store_assignments msa
    on msa.membership_id = m.id
   and msa.tenant_id = m.tenant_id
   and msa.store_id = s.id
   and msa.deleted_at is null
  where m.user_id = p_user_id
    and m.status = 'active'
    and m.role in ('owner', 'admin', 'implementer')
    and m.disabled_at is null
    and m.deleted_at is null
    and coalesce(m.invite_accepted_at, m.joined_at) is not null
    and (m.role in ('owner', 'admin') or msa.id is not null);

  -- Ambiguous multi-tenant/store identities are denied instead of guessed.
  if v_count <> 1 then return null; end if;
  return v_contexts -> 0;
end;
$$;

revoke all on function public.admin_email_otp_bootstrap_context(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.admin_email_otp_bootstrap_context(uuid, uuid)
  to service_role;
alter function public.admin_email_otp_bootstrap_context(uuid, uuid) owner to postgres;

-- Resolve a Preview QA administrator from canonical membership data only.
-- The application supplies the authenticated Auth user/session; this function
-- independently validates the QA marker, tenant, store, role and assignment.
create or replace function public.release_qa_admin_bootstrap_context(
  p_user_id uuid,
  p_session_id uuid,
  p_environment text
)
returns jsonb
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  v_contexts jsonb;
  v_count integer;
begin
  if public.garage_request_jwt_role() <> 'service_role'
     and session_user not in ('postgres', 'supabase_admin') then
    raise insufficient_privilege using message = 'service role required';
  end if;
  if p_user_id is null or p_session_id is null or p_environment <> 'preview' then
    return null;
  end if;

  select
    count(*)::integer,
    jsonb_agg(
      jsonb_build_object(
        'user_id', m.user_id,
        'email', lower(u.email),
        'tenant_id', m.tenant_id,
        'store_id', s.id,
        'role', m.role
      )
      order by m.tenant_id, s.id
    )
  into v_count, v_contexts
  from public.memberships m
  join auth.users u
    on u.id = m.user_id
  join public.tenants t
    on t.id = m.tenant_id
   and t.status = 'active'
  join public.stores s
    on s.id = m.store_id
   and s.tenant_id = m.tenant_id
   and public.store_is_authorization_eligible(s.status)
  left join public.membership_store_assignments msa
    on msa.membership_id = m.id
   and msa.tenant_id = m.tenant_id
   and msa.store_id = s.id
   and msa.deleted_at is null
  where m.user_id = p_user_id
    and m.status = 'active'
    and m.role in ('owner', 'admin', 'implementer')
    and m.disabled_at is null
    and m.deleted_at is null
    and coalesce(m.invite_accepted_at, m.joined_at) is not null
    and (m.role in ('owner', 'admin') or msa.id is not null)
    and lower(coalesce(u.email, '')) ~ '@[^@]+\.invalid$'
    and coalesce(u.raw_user_meta_data ->> 'purpose', '') = 'release-preview-fixture'
    and t.name like '[RELEASE QA]%'
    and s.name like '[RELEASE QA]%';

  -- Ambiguous multi-tenant/store QA identities are denied instead of guessed.
  if v_count <> 1 then
    return null;
  end if;
  return v_contexts -> 0;
end;
$$;

revoke all on function public.release_qa_admin_bootstrap_context(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.release_qa_admin_bootstrap_context(uuid, uuid, text)
  to service_role;
alter function public.release_qa_admin_bootstrap_context(uuid, uuid, text) owner to postgres;

-- Revoke every trusted session and consume every outstanding challenge for one
-- canonical user. Repeated calls are safe.
create or replace function public.revoke_admin_trusted_sessions_for_user(
  p_user_id uuid,
  p_reason text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if p_user_id is null then return 0; end if;
  update public.admin_trusted_sessions
     set revoked_at = coalesce(revoked_at, now()),
         last_used_at = now()
   where user_id = p_user_id
     and revoked_at is null;
  get diagnostics v_count = row_count;

  update public.admin_email_otp_challenges
     set consumed_at = coalesce(consumed_at, now())
   where user_id = p_user_id
     and consumed_at is null;

  -- p_reason is deliberately not persisted: role/scope invalidation must not
  -- introduce a log surface for PII, OTPs or secrets.
  perform p_reason;
  return v_count;
end;
$$;

revoke all on function public.revoke_admin_trusted_sessions_for_user(uuid, text)
  from public, anon, authenticated;
grant execute on function public.revoke_admin_trusted_sessions_for_user(uuid, text)
  to service_role;
alter function public.revoke_admin_trusted_sessions_for_user(uuid, text) owner to postgres;

create or replace function public.invalidate_admin_trusted_sessions_from_membership()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old_user uuid;
  v_new_user uuid;
begin
  if tg_op <> 'INSERT' then v_old_user := old.user_id; end if;
  if tg_op <> 'DELETE' then v_new_user := new.user_id; end if;

  if tg_op = 'DELETE'
     or old.user_id is distinct from new.user_id
     or old.role is distinct from new.role
     or old.status is distinct from new.status
     or old.tenant_id is distinct from new.tenant_id
     or old.store_id is distinct from new.store_id
     or old.disabled_at is distinct from new.disabled_at
     or old.deleted_at is distinct from new.deleted_at then
    perform public.revoke_admin_trusted_sessions_for_user(v_old_user, 'membership_scope_changed');
    if v_new_user is distinct from v_old_user then
      perform public.revoke_admin_trusted_sessions_for_user(v_new_user, 'membership_scope_changed');
    end if;
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists invalidate_admin_trusted_sessions_from_membership on public.memberships;
create trigger invalidate_admin_trusted_sessions_from_membership
after update of user_id, role, status, tenant_id, store_id, disabled_at, deleted_at
or delete on public.memberships
for each row execute function public.invalidate_admin_trusted_sessions_from_membership();

create or replace function public.invalidate_admin_trusted_sessions_from_assignment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_membership_id uuid;
  v_user_id uuid;
begin
  foreach v_membership_id in array array[
    case when tg_op <> 'INSERT' then old.membership_id else null end,
    case when tg_op <> 'DELETE' then new.membership_id else null end
  ] loop
    if v_membership_id is null then continue; end if;
    select m.user_id into v_user_id
      from public.memberships m
     where m.id = v_membership_id;
    perform public.revoke_admin_trusted_sessions_for_user(v_user_id, 'store_assignment_changed');
  end loop;
  return coalesce(new, old);
end;
$$;

drop trigger if exists invalidate_admin_trusted_sessions_from_assignment
  on public.membership_store_assignments;
create trigger invalidate_admin_trusted_sessions_from_assignment
after insert or update of membership_id, tenant_id, store_id, deleted_at
or delete on public.membership_store_assignments
for each row execute function public.invalidate_admin_trusted_sessions_from_assignment();

create or replace function public.invalidate_admin_trusted_sessions_from_store()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
begin
  if old.status is not distinct from new.status
     and old.tenant_id is not distinct from new.tenant_id then
    return new;
  end if;

  for v_user_id in
    select distinct m.user_id
      from public.memberships m
      left join public.membership_store_assignments msa
        on msa.membership_id = m.id
       and msa.deleted_at is null
     where m.user_id is not null
       and (
         m.store_id in (old.id, new.id)
         or msa.store_id in (old.id, new.id)
         or m.tenant_id in (old.tenant_id, new.tenant_id)
       )
  loop
    perform public.revoke_admin_trusted_sessions_for_user(v_user_id, 'store_scope_changed');
  end loop;
  return new;
end;
$$;

drop trigger if exists invalidate_admin_trusted_sessions_from_store on public.stores;
create trigger invalidate_admin_trusted_sessions_from_store
after update of status, tenant_id on public.stores
for each row execute function public.invalidate_admin_trusted_sessions_from_store();

revoke all on function public.invalidate_admin_trusted_sessions_from_membership()
  from public, anon, authenticated;
revoke all on function public.invalidate_admin_trusted_sessions_from_assignment()
  from public, anon, authenticated;
revoke all on function public.invalidate_admin_trusted_sessions_from_store()
  from public, anon, authenticated;
alter function public.invalidate_admin_trusted_sessions_from_membership() owner to postgres;
alter function public.invalidate_admin_trusted_sessions_from_assignment() owner to postgres;
alter function public.invalidate_admin_trusted_sessions_from_store() owner to postgres;

-- BILL-003: the service identity has no direct stores SELECT grant. Resolve one
-- store scope through a narrow, fail-closed function instead.
create or replace function public.service_resolve_garage_store_scope(
  p_store_id uuid
)
returns table(store_id uuid, tenant_id uuid, store_status text)
language plpgsql
security definer
stable
set search_path = ''
as $$
begin
  if public.garage_request_jwt_role() <> 'service_role'
     and session_user not in ('postgres', 'supabase_admin') then
    raise insufficient_privilege using message = 'service role required';
  end if;
  return query
  select s.id, s.tenant_id, s.status
    from public.stores s
    join public.tenants t on t.id = s.tenant_id and t.status = 'active'
   where s.id = p_store_id
     and s.tenant_id is not null
     and public.store_is_authorization_eligible(s.status);
end;
$$;

create or replace function public.service_list_eligible_garage_stores()
returns table(store_id uuid, tenant_id uuid, store_status text)
language plpgsql
security definer
stable
set search_path = ''
as $$
begin
  if public.garage_request_jwt_role() <> 'service_role'
     and session_user not in ('postgres', 'supabase_admin') then
    raise insufficient_privilege using message = 'service role required';
  end if;
  return query
  select s.id, s.tenant_id, s.status
    from public.stores s
    join public.tenants t on t.id = s.tenant_id and t.status = 'active'
   where s.tenant_id is not null
     and public.store_is_authorization_eligible(s.status)
   order by s.tenant_id, s.id;
end;
$$;

revoke all on function public.service_resolve_garage_store_scope(uuid)
  from public, anon, authenticated;
revoke all on function public.service_list_eligible_garage_stores()
  from public, anon, authenticated;
grant execute on function public.service_resolve_garage_store_scope(uuid)
  to service_role;
grant execute on function public.service_list_eligible_garage_stores()
  to service_role;
alter function public.service_resolve_garage_store_scope(uuid) owner to postgres;
alter function public.service_list_eligible_garage_stores() owner to postgres;

notify pgrst, 'reload schema';

commit;
