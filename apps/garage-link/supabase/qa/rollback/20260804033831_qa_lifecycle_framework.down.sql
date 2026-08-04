begin;

drop function if exists public.qa_lifecycle_finalize(uuid);
drop function if exists public.qa_lifecycle_verify_clean(uuid, boolean);
drop function if exists public.qa_lifecycle_teardown(uuid, boolean);
drop function if exists public.qa_lifecycle_register_fixture(uuid, uuid, text, uuid, uuid, uuid, text, text, timestamptz);
drop function if exists public.qa_lifecycle_transition(uuid, text, text, text, text, jsonb);
drop function if exists public.qa_lifecycle_register_run(uuid, text, text, text, text, timestamptz);
drop function if exists public.qa_lifecycle_status(uuid);
drop function if exists public.qa_lifecycle_cleanup_readiness();
drop schema if exists qa_internal cascade;

-- Restore the normal last-owner guard without the QA operator exception.
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

commit;
