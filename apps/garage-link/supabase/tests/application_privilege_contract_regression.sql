\set ON_ERROR_STOP on

do $$
declare
  v_count integer;
begin
  select count(*) into v_count
  from information_schema.role_table_grants
  where table_schema='public' and grantee='anon'
    and privilege_type in ('INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN');
  if v_count <> 0 then raise exception 'ANON_EXCESSIVE_RELATION_GRANT:%',v_count; end if;

  select count(*) into v_count
  from information_schema.routine_privileges
  where routine_schema='public' and grantee='PUBLIC';
  if v_count <> 0 then raise exception 'PUBLIC_FUNCTION_EXECUTE:%',v_count; end if;

  select count(*) into v_count
  from pg_class c
  join pg_namespace n on n.oid=c.relnamespace
  cross join lateral aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a
  where n.nspname='public' and c.relkind in ('r','p')
    and not c.relrowsecurity
    and case when a.grantee=0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end in ('anon','authenticated')
    and a.privilege_type in ('SELECT','INSERT','UPDATE','DELETE');
  if v_count <> 0 then raise exception 'DATA_API_GRANT_WITHOUT_RLS:%',v_count; end if;

  select count(*) into v_count
  from pg_default_acl d
  join pg_roles owner on owner.oid=d.defaclrole
  join pg_namespace n on n.oid=d.defaclnamespace
  cross join lateral aclexplode(d.defaclacl) a
  where n.nspname='public' and owner.rolname='postgres'
    and case when a.grantee=0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end in ('PUBLIC','anon','authenticated','service_role');
  if v_count <> 0 then raise exception 'APP_DEFAULT_PRIVILEGE_DEPENDENCY:%',v_count; end if;

  select count(*) into v_count
  from pg_namespace n
  cross join lateral aclexplode(coalesce(n.nspacl, acldefault('n', n.nspowner))) a
  where n.nspname='public' and a.grantee=0 and a.privilege_type in ('USAGE','CREATE');
  if v_count <> 0 then raise exception 'PUBLIC_SCHEMA_PRIVILEGE_PRESENT:%',v_count; end if;

  if not has_table_privilege('anon','public.garage_plan_entitlements','SELECT') then
    raise exception 'ANON_PLAN_READ_MISSING';
  end if;
  if has_table_privilege('anon','public.garage_plan_entitlements','INSERT') then
    raise exception 'ANON_PLAN_WRITE_PRESENT';
  end if;
  if not has_table_privilege('authenticated','public.stores','SELECT') then
    raise exception 'AUTHENTICATED_STORES_SELECT_MISSING';
  end if;
  if has_table_privilege('service_role','public.garage_plan_entitlements','UPDATE') then
    raise exception 'SERVICE_ROLE_PLAN_MUTATION_PRESENT';
  end if;
  if not has_function_privilege('authenticated','public.create_garage_store(text)','EXECUTE') then
    raise exception 'AUTHENTICATED_CREATE_STORE_EXECUTE_MISSING';
  end if;
  if has_function_privilege('anon','public.create_garage_store(text)','EXECUTE') then
    raise exception 'ANON_CREATE_STORE_EXECUTE_PRESENT';
  end if;
  if not pg_has_role('authenticator','anon','MEMBER')
     or not pg_has_role('authenticator','authenticated','MEMBER')
     or not pg_has_role('authenticator','service_role','MEMBER') then
    raise exception 'AUTHENTICATOR_DATA_API_ROLE_INHERITANCE_MISSING';
  end if;
end
$$;

begin;
create function public.batch1d_overload_probe(p_value integer)
returns integer language sql security invoker as $$ select p_value $$;
create function public.batch1d_overload_probe(p_value text)
returns text language sql security invoker as $$ select p_value $$;
revoke all on function public.batch1d_overload_probe(integer) from public,anon,authenticated,service_role;
revoke all on function public.batch1d_overload_probe(text) from public,anon,authenticated,service_role;
grant execute on function public.batch1d_overload_probe(integer) to authenticated;
do $$
begin
  if not has_function_privilege('authenticated','public.batch1d_overload_probe(integer)','EXECUTE') then
    raise exception 'OVERLOAD_INTEGER_GRANT_MISSING';
  end if;
  if has_function_privilege('authenticated','public.batch1d_overload_probe(text)','EXECUTE') then
    raise exception 'OVERLOAD_TEXT_GRANT_LEAKED';
  end if;
end
$$;
rollback;

select 'APPLICATION_PRIVILEGE_CONTRACT_REGRESSION_PASS' as result;
