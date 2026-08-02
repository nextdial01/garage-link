-- G0-B: make G1-A/G3 hash calls compatible with the official Supabase
-- PostgreSQL layout, where pgcrypto is installed in the extensions schema.
-- Existing migrations remain immutable; this repair only qualifies the six
-- affected function bodies and preserves their signatures and ACLs.

do $repair$
declare
  v_signature text;
  v_definition text;
begin
  foreach v_signature in array array[
    'public.invite_membership(uuid,uuid,text,text,text,text)',
    'public.reissue_membership_invite(uuid)',
    'public.accept_membership_invite(uuid,text)',
    'public.reserve_vehicle_sale(uuid,text,text)',
    'public.cancel_vehicle_sale(uuid,text,text)',
    'public.complete_vehicle_delivery(uuid,text,text)'
  ] loop
    if to_regprocedure(v_signature) is null then
      raise exception 'G0B_REQUIRED_FUNCTION_MISSING: %', v_signature;
    end if;

    select pg_get_functiondef(to_regprocedure(v_signature))
      into v_definition;

    if position('extensions.digest(' in v_definition) = 0 then
      v_definition := replace(v_definition, 'digest(', 'extensions.digest(');
      if position('extensions.digest(' in v_definition) = 0 then
        raise exception 'G0B_DIGEST_CALL_NOT_FOUND: %', v_signature;
      end if;
      execute v_definition;
    end if;
  end loop;
end;
$repair$;

do $verify$
declare
  v_unqualified integer;
begin
  select count(*)
    into v_unqualified
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
     and position(
       'digest('
       in replace(pg_get_functiondef(p.oid), 'extensions.digest(', '')
     ) > 0;

  if v_unqualified <> 0 then
    raise exception 'G0B_UNQUALIFIED_DIGEST_REMAINS: %', v_unqualified;
  end if;
end;
$verify$;
