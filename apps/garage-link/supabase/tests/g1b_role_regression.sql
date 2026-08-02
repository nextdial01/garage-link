\set ON_ERROR_STOP on

-- G1-B dynamic role regression. Run only against the disposable G0 fixture DB.
begin;
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '50000000-0000-0000-0000-000000000005', true);

do $$
declare
  v_table text;
  v_count bigint;
begin
  foreach v_table in array array[
    'vehicles','customers','deals','quotes','invoices','maintenance_jobs','inventory_counts'
  ] loop
    execute format('update public.%I set store_id = store_id', v_table);
    get diagnostics v_count = row_count;
    if v_count <> 0 then raise exception 'viewer UPDATE unexpectedly affected % rows in %', v_count, v_table; end if;

    execute format('delete from public.%I', v_table);
    get diagnostics v_count = row_count;
    if v_count <> 0 then raise exception 'viewer DELETE unexpectedly affected % rows in %', v_count, v_table; end if;
  end loop;

  begin
    insert into public.vehicles(store_id, status)
    values ('51100000-0000-0000-0000-000000000001', 'in_stock');
    raise exception 'viewer INSERT unexpectedly succeeded for vehicles';
  exception when insufficient_privilege then null;
  end;

  begin
    perform public.adjust_repair_part_stock(
      '00000000-0000-0000-0000-000000000001',
      '51100000-0000-0000-0000-000000000001',
      1
    );
    raise exception 'viewer mutation RPC unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;

  begin
    perform public.switch_active_garage_store('51100000-0000-0000-0000-000000000001');
    raise exception 'viewer store mutation RPC unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;
end;
$$;
rollback;

-- inactive membership cannot see or mutate rows.
begin;
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '50000000-0000-0000-0000-000000000006', true);
do $$
declare v_count bigint;
begin
  if exists (select 1 from public.current_user_store_ids()) then
    raise exception 'inactive membership received a store scope';
  end if;
  update public.vehicles set store_id = store_id;
  get diagnostics v_count = row_count;
  if v_count <> 0 then raise exception 'inactive membership updated % vehicle rows', v_count; end if;
end;
$$;
rollback;

-- old-only membership cannot see or mutate rows.
begin;
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '50000000-0000-0000-0000-000000000012', true);
do $$
declare v_count bigint;
begin
  if exists (select 1 from public.current_user_store_ids()) then
    raise exception 'old-only membership received a store scope';
  end if;
  update public.vehicles set store_id = store_id;
  get diagnostics v_count = row_count;
  if v_count <> 0 then raise exception 'old-only membership updated % vehicle rows', v_count; end if;
end;
$$;
rollback;

-- staff: normal create/update succeeds, destructive DELETE is denied.
begin;
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '50000000-0000-0000-0000-000000000004', true);
do $$
declare
  v_id uuid;
  v_count bigint;
begin
  insert into public.vehicles(store_id, management_no, status)
  values ('51100000-0000-0000-0000-000000000001', 'G1B-STAFF-TEMP', 'in_stock')
  returning id into v_id;
  update public.vehicles set description = 'g1b staff update' where id = v_id;
  get diagnostics v_count = row_count;
  if v_count <> 1 then raise exception 'staff normal UPDATE failed'; end if;
  delete from public.vehicles where id = v_id;
  get diagnostics v_count = row_count;
  if v_count <> 0 then raise exception 'staff destructive DELETE unexpectedly succeeded'; end if;
end;
$$;
rollback;

-- implementer: explicit LINE content capability succeeds; vehicle write remains denied.
begin;
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '50000000-0000-0000-0000-000000000003', true);
do $$
declare
  v_id uuid;
  v_count bigint;
begin
  insert into public.line_tags(store_id, name)
  values ('51100000-0000-0000-0000-000000000001', 'G1B-IMPLEMENTER-TEMP')
  returning id into v_id;
  delete from public.line_tags where id = v_id;
  get diagnostics v_count = row_count;
  if v_count <> 1 then raise exception 'implementer explicit LINE operation failed'; end if;
  update public.vehicles set store_id = store_id;
  get diagnostics v_count = row_count;
  if v_count <> 0 then raise exception 'implementer vehicle UPDATE unexpectedly succeeded'; end if;
end;
$$;
rollback;

-- admin: normal store create/delete succeeds and other tenant remains unavailable.
begin;
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '50000000-0000-0000-0000-000000000002', true);
do $$
declare
  v_id uuid;
  v_count bigint;
begin
  insert into public.vehicles(store_id, management_no, status)
  values ('51100000-0000-0000-0000-000000000001', 'G1B-ADMIN-TEMP', 'in_stock')
  returning id into v_id;
  delete from public.vehicles where id = v_id;
  get diagnostics v_count = row_count;
  if v_count <> 1 then raise exception 'admin normal DELETE failed'; end if;
  update public.vehicles set store_id = store_id
  where store_id = '52100000-0000-0000-0000-000000000001';
  get diagnostics v_count = row_count;
  if v_count <> 0 then raise exception 'admin crossed tenant boundary'; end if;
end;
$$;
rollback;

-- owner: normal store work remains available, other tenant remains unavailable.
begin;
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '50000000-0000-0000-0000-000000000001', true);
do $$
declare
  v_id uuid;
  v_count bigint;
begin
  insert into public.vehicles(store_id, management_no, status)
  values ('51100000-0000-0000-0000-000000000001', 'G1B-OWNER-TEMP', 'in_stock')
  returning id into v_id;
  delete from public.vehicles where id = v_id;
  get diagnostics v_count = row_count;
  if v_count <> 1 then raise exception 'owner normal DELETE failed'; end if;
  update public.vehicles set store_id = store_id
  where store_id = '52100000-0000-0000-0000-000000000001';
  get diagnostics v_count = row_count;
  if v_count <> 0 then raise exception 'owner crossed tenant boundary'; end if;
end;
$$;
rollback;

select 'G1B_ROLE_REGRESSION_PASS' as result;
