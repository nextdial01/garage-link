\set ON_ERROR_STOP on

begin;
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '50000000-0000-0000-0000-000000000001', true);

do $$
declare
  v_membership_id uuid;
  v_token text;
  v_result jsonb;
begin
  select membership_id, invite_token
    into v_membership_id, v_token
    from public.invite_membership(
      '51000000-0000-0000-0000-000000000001',
      '51100000-0000-0000-0000-000000000001',
      'unassigned-a@example.invalid',
      'viewer',
      'G0-B invite',
      null
    );

  if v_membership_id is null or v_token is null then
    raise exception 'G0B_INVITE_RESULT_MISSING';
  end if;

  perform set_config('request.jwt.claim.sub', '50000000-0000-0000-0000-000000000007', true);
  select public.accept_membership_invite(v_membership_id, v_token) into v_result;
  if not coalesce((v_result->>'ok')::boolean, false) then
    raise exception 'G0B_INVITE_ACCEPT_FAILED';
  end if;
end;
$$;

rollback;

do $$
declare
  v_count integer;
begin
  select count(*) into v_count
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.prokind = 'f'
    and p.oid in (
      'public.invite_membership(uuid,uuid,text,text,text,text)'::regprocedure,
      'public.reissue_membership_invite(uuid)'::regprocedure,
      'public.accept_membership_invite(uuid,text)'::regprocedure,
      'public.reserve_vehicle_sale(uuid,text,text)'::regprocedure,
      'public.cancel_vehicle_sale(uuid,text,text)'::regprocedure,
      'public.complete_vehicle_delivery(uuid,text,text)'::regprocedure
    )
    and position('digest(' in replace(pg_get_functiondef(p.oid), 'extensions.digest(', '')) > 0;
  if v_count <> 0 then raise exception 'G0B_UNQUALIFIED_DIGEST_REMAINS: %', v_count; end if;
end;
$$;

select 'G0B_EXTENSION_COMPATIBILITY_PASS' as result;
