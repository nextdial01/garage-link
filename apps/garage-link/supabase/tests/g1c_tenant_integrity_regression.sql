\set ON_ERROR_STOP on

-- G1-C runs only after the deterministic G1-A fixture in an isolated G0-B database.
begin;
insert into public.customers(id,store_id,name) values
  ('61000000-0000-0000-0000-000000000001','51100000-0000-0000-0000-000000000001','G1C Customer A'),
  ('62000000-0000-0000-0000-000000000001','52100000-0000-0000-0000-000000000001','G1C Customer B')
on conflict (id) do nothing;
insert into public.vehicles(id,store_id,management_no,status) values
  ('61100000-0000-0000-0000-000000000001','51100000-0000-0000-0000-000000000001','G1C-A','in_stock'),
  ('62100000-0000-0000-0000-000000000001','52100000-0000-0000-0000-000000000001','G1C-B','in_stock')
on conflict (id) do nothing;
insert into public.line_forms(id,store_id,name) values
  ('61200000-0000-0000-0000-000000000001','51100000-0000-0000-0000-000000000001','G1C Form A'),
  ('62200000-0000-0000-0000-000000000001','52100000-0000-0000-0000-000000000001','G1C Form B')
on conflict (id) do nothing;
commit;

do $$
begin
  if not public.assert_service_tenant_store_context(
    '51000000-0000-0000-0000-000000000001','51100000-0000-0000-0000-000000000001'
  ) then raise exception 'correct service context rejected'; end if;
  if public.assert_service_tenant_store_context(
    '52000000-0000-0000-0000-000000000001','51100000-0000-0000-0000-000000000001'
  ) then raise exception 'cross-tenant service context accepted'; end if;

  begin
    insert into public.deals(store_id,title,customer_id,vehicle_id)
    values ('51100000-0000-0000-0000-000000000001','cross scope',
      '62000000-0000-0000-0000-000000000001','62100000-0000-0000-0000-000000000001');
    raise exception 'cross-store deal accepted';
  exception when foreign_key_violation then null;
  end;

  begin
    insert into public.line_form_responses(store_id,form_id,answers)
    values ('51100000-0000-0000-0000-000000000001',
      '62200000-0000-0000-0000-000000000001','{}'::jsonb);
    raise exception 'cross-store inquiry accepted';
  exception when foreign_key_violation then null;
  end;

  begin
    update public.customers set store_id='52100000-0000-0000-0000-000000000001'
    where id='61000000-0000-0000-0000-000000000001';
    raise exception 'scope mutation accepted';
  exception when insufficient_privilege then
    if sqlerrm <> 'G1C_SCOPE_IMMUTABLE' then raise; end if;
  end;

  begin
    insert into public.line_link_connections(tenant_id,store_id,key_id,status)
    values ('52000000-0000-0000-0000-000000000001',
      '51100000-0000-0000-0000-000000000001','wrong-scope','active');
    raise exception 'cross-tenant L-LINK credential accepted';
  exception when foreign_key_violation then null;
  end;
end;
$$;

insert into public.line_link_connections(tenant_id,store_id,key_id,status)
values ('51000000-0000-0000-0000-000000000001',
  '51100000-0000-0000-0000-000000000001','g1c-a1','active')
on conflict (key_id) do nothing;

do $$
declare
  v_count bigint;
begin
  select count(*) into v_count
  from pg_constraint
  where connamespace='public'::regnamespace and conname like '%\_store\_fk' escape '\';
  if v_count < 60 then raise exception 'G1C_COMPOSITE_FK_COUNT: %',v_count; end if;

  select count(*) into v_count
  from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and t.tgname='g1c_scope_immutable' and not t.tgisinternal;
  if v_count < 55 then raise exception 'G1C_IMMUTABLE_GUARD_COUNT: %',v_count; end if;

  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.prosecdef
      and not coalesce(array_to_string(p.proconfig,','),'') like '%search_path=%'
  ) then raise exception 'G1C_SECURITY_DEFINER_SEARCH_PATH'; end if;

  if exists (
    select 1 from information_schema.role_table_grants
    where table_schema='public' and table_name='line_link_connections'
      and grantee in ('anon','authenticated') and privilege_type in ('SELECT','INSERT','UPDATE','DELETE')
  ) then raise exception 'G1C_LLINK_CONNECTION_CLIENT_ACCESS'; end if;
end;
$$;

select 'G1C_TENANT_INTEGRITY_REGRESSION_PASS' as result;
