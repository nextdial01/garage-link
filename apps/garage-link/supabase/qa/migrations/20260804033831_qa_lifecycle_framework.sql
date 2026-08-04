-- GARAGE LINK staging QA lifecycle framework.
-- The registry lives outside exposed schemas. Public wrappers are callable only
-- by service_role and re-check the JWT role inside every SECURITY DEFINER body.

begin;

create schema if not exists qa_internal authorization postgres;
revoke all on schema qa_internal from public, anon, authenticated, service_role;

create table qa_internal.runs (
  run_id uuid primary key,
  product text not null check (product = 'garage-link'),
  environment text not null check (environment = 'staging'),
  project_ref text not null check (project_ref = 'gaytoojzwqkpuvfofeql'),
  purpose text not null check (char_length(purpose) between 1 and 160),
  source_sha text not null check (source_sha ~ '^[0-9a-f]{40}$'),
  deployment_id text not null check (deployment_id ~ '^dpl_[A-Za-z0-9]+$'),
  state text not null default 'CREATED' check (state in (
    'CREATED','PREFLIGHT_RUNNING','PREFLIGHT_READY','PROVISIONING','PROVISIONED',
    'AUTH_READY','TEST_RUNNING','TEST_COMPLETE','TEARDOWN_DRY_RUN','TEARDOWN_READY',
    'TEARING_DOWN','DB_CLEANED','AUTH_CLEANED','STORAGE_CLEANED','ARTIFACTS_CLEANED','VERIFIED_CLEAN',
    'COMPLETE','FAILED_RECOVERABLE','HARD_STOP'
  )),
  last_successful_state text not null default 'CREATED',
  next_action text not null default 'preflight',
  failure_class text check (failure_class is null or failure_class in (
    'CREDENTIAL','AUTHENTICATION','CAPACITY','BROWSER','VERCEL_PROTECTION',
    'FIXTURE_LIFECYCLE','EXECUTION_LIFECYCLE','SECURITY_BOUNDARY'
  )),
  safe_retry_count integer not null default 0 check (safe_retry_count between 0 and 2),
  operator_reference text not null check (operator_reference ~ '^[A-Za-z0-9._:/-]{1,160}$'),
  cleanup_deadline timestamptz not null,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  completed_at timestamptz,
  final_evidence jsonb not null default '{}'::jsonb,
  check (cleanup_deadline > created_at)
);

create table qa_internal.fixtures (
  fixture_id uuid primary key default extensions.gen_random_uuid(),
  run_id uuid not null unique references qa_internal.runs(run_id) on delete cascade,
  tenant_id uuid not null,
  expected_tenant_name text not null,
  store_id uuid not null,
  user_id uuid not null,
  membership_id uuid not null,
  fixture_type text not null check (fixture_type in ('canary','role','boundary','security','ux','release')),
  marker text not null,
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null,
  cleanup_state text not null default 'REGISTERED' check (cleanup_state in (
    'REGISTERED','DRY_RUN_READY','DB_CLEANED','AUTH_CLEANED','STORAGE_CLEANED','ARTIFACTS_CLEANED','VERIFIED_CLEAN'
  )),
  unique (tenant_id),
  check (expires_at > created_at),
  check (expected_tenant_name like marker || '%'),
  check (marker ~ '^\[[A-Z0-9 _-]*QA [0-9]{8}\]$')
);

create table qa_internal.state_events (
  event_id bigint generated always as identity primary key,
  run_id uuid not null references qa_internal.runs(run_id) on delete cascade,
  from_state text,
  to_state text not null,
  failure_class text,
  next_action text not null,
  safe_detail jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default clock_timestamp()
);

create index qa_fixture_run_idx on qa_internal.fixtures(run_id);
create index qa_state_events_run_idx on qa_internal.state_events(run_id, event_id);

revoke all on all tables in schema qa_internal from public, anon, authenticated, service_role;
revoke all on all sequences in schema qa_internal from public, anon, authenticated, service_role;
alter default privileges for role postgres in schema qa_internal revoke all on tables from public, anon, authenticated, service_role;
alter default privileges for role postgres in schema qa_internal revoke all on sequences from public, anon, authenticated, service_role;
alter default privileges for role postgres in schema qa_internal revoke execute on functions from public, anon, authenticated, service_role;

create or replace function qa_internal.assert_operator()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if session_user not in ('postgres', 'supabase_admin')
     and coalesce(public.garage_request_jwt_role(), '') <> 'service_role' then
    raise insufficient_privilege using message = 'QA_OPERATOR_REQUIRED';
  end if;
end;
$$;

revoke all on function qa_internal.assert_operator() from public, anon, authenticated, service_role;

create or replace function qa_internal.transition_allowed(p_from text, p_to text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case p_from
    when 'CREATED' then p_to in ('PREFLIGHT_RUNNING','HARD_STOP')
    when 'PREFLIGHT_RUNNING' then p_to in ('PREFLIGHT_READY','FAILED_RECOVERABLE','HARD_STOP')
    when 'PREFLIGHT_READY' then p_to in ('PROVISIONING','TEARDOWN_DRY_RUN','FAILED_RECOVERABLE','HARD_STOP')
    when 'PROVISIONING' then p_to in ('PROVISIONED','FAILED_RECOVERABLE','HARD_STOP')
    when 'PROVISIONED' then p_to in ('AUTH_READY','FAILED_RECOVERABLE','HARD_STOP')
    when 'AUTH_READY' then p_to in ('TEST_RUNNING','FAILED_RECOVERABLE','HARD_STOP')
    when 'TEST_RUNNING' then p_to in ('TEST_COMPLETE','FAILED_RECOVERABLE','HARD_STOP')
    when 'TEST_COMPLETE' then p_to in ('TEARDOWN_DRY_RUN','FAILED_RECOVERABLE','HARD_STOP')
    when 'TEARDOWN_DRY_RUN' then p_to in ('TEARDOWN_READY','FAILED_RECOVERABLE','HARD_STOP')
    when 'TEARDOWN_READY' then p_to in ('TEARING_DOWN','FAILED_RECOVERABLE','HARD_STOP')
    when 'TEARING_DOWN' then p_to in ('DB_CLEANED','FAILED_RECOVERABLE','HARD_STOP')
    when 'DB_CLEANED' then p_to in ('AUTH_CLEANED','FAILED_RECOVERABLE','HARD_STOP')
    when 'AUTH_CLEANED' then p_to in ('STORAGE_CLEANED','FAILED_RECOVERABLE','HARD_STOP')
    when 'STORAGE_CLEANED' then p_to in ('ARTIFACTS_CLEANED','FAILED_RECOVERABLE','HARD_STOP')
    when 'ARTIFACTS_CLEANED' then p_to in ('VERIFIED_CLEAN','FAILED_RECOVERABLE','HARD_STOP')
    when 'VERIFIED_CLEAN' then p_to in ('COMPLETE','FAILED_RECOVERABLE','HARD_STOP')
    when 'FAILED_RECOVERABLE' then p_to not in ('CREATED','COMPLETE')
    else false
  end;
$$;

revoke all on function qa_internal.transition_allowed(text, text) from public, anon, authenticated, service_role;

create or replace function public.qa_lifecycle_register_run(
  p_run_id uuid,
  p_purpose text,
  p_source_sha text,
  p_deployment_id text,
  p_operator_reference text,
  p_cleanup_deadline timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run qa_internal.runs%rowtype;
begin
  perform qa_internal.assert_operator();
  if p_run_id is null then raise exception 'RUN_ID_REQUIRED'; end if;
  if p_cleanup_deadline > clock_timestamp() + interval '7 days' then
    raise exception 'CLEANUP_DEADLINE_TOO_LONG';
  end if;
  insert into qa_internal.runs(
    run_id, product, environment, project_ref, purpose, source_sha,
    deployment_id, operator_reference, cleanup_deadline
  ) values (
    p_run_id, 'garage-link', 'staging', 'gaytoojzwqkpuvfofeql', btrim(p_purpose),
    p_source_sha, p_deployment_id, p_operator_reference, p_cleanup_deadline
  )
  on conflict (run_id) do nothing;
  select * into strict v_run from qa_internal.runs where run_id = p_run_id;
  if v_run.purpose <> btrim(p_purpose)
     or v_run.source_sha <> p_source_sha
     or v_run.deployment_id <> p_deployment_id then
    raise exception 'RUN_ID_CONTRACT_MISMATCH';
  end if;
  if not exists (select 1 from qa_internal.state_events where run_id = p_run_id) then
    insert into qa_internal.state_events(run_id, from_state, to_state, next_action)
    values (p_run_id, null, 'CREATED', 'preflight');
  end if;
  return jsonb_build_object('run_id', v_run.run_id, 'state', v_run.state, 'next_action', v_run.next_action);
end;
$$;

create or replace function public.qa_lifecycle_transition(
  p_run_id uuid,
  p_expected_state text,
  p_next_state text,
  p_next_action text,
  p_failure_class text default null,
  p_safe_detail jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run qa_internal.runs%rowtype;
  v_last_successful text;
  v_retry integer;
begin
  perform qa_internal.assert_operator();
  if p_run_id is null then raise exception 'RUN_ID_REQUIRED'; end if;
  select * into strict v_run from qa_internal.runs where run_id = p_run_id for update;
  if v_run.state <> p_expected_state then
    if v_run.state = p_next_state then
      return jsonb_build_object('run_id', p_run_id, 'state', v_run.state, 'idempotent', true);
    end if;
    raise exception 'INVALID_STATE_EXPECTED:%:ACTUAL:%', p_expected_state, v_run.state;
  end if;
  if not qa_internal.transition_allowed(v_run.state, p_next_state) then
    raise exception 'INVALID_STATE_TRANSITION:%->%', v_run.state, p_next_state;
  end if;
  if p_next_state in ('FAILED_RECOVERABLE','HARD_STOP') and p_failure_class is null then
    raise exception 'FAILURE_CLASS_REQUIRED';
  end if;
  v_retry := case when p_next_state = 'FAILED_RECOVERABLE' then least(2, v_run.safe_retry_count + 1) else 0 end;
  v_last_successful := case when p_next_state in ('FAILED_RECOVERABLE','HARD_STOP') then v_run.last_successful_state else p_next_state end;
  update qa_internal.runs
     set state = p_next_state,
         last_successful_state = v_last_successful,
         next_action = p_next_action,
         failure_class = p_failure_class,
         safe_retry_count = v_retry,
         updated_at = clock_timestamp(),
         completed_at = case when p_next_state = 'COMPLETE' then clock_timestamp() else completed_at end
   where run_id = p_run_id;
  insert into qa_internal.state_events(run_id, from_state, to_state, failure_class, next_action, safe_detail)
  values (p_run_id, v_run.state, p_next_state, p_failure_class, p_next_action, coalesce(p_safe_detail, '{}'::jsonb));
  return jsonb_build_object('run_id', p_run_id, 'state', p_next_state, 'last_successful_state', v_last_successful, 'next_action', p_next_action, 'safe_retry_count', v_retry);
end;
$$;

create or replace function public.qa_lifecycle_register_fixture(
  p_run_id uuid,
  p_tenant_id uuid,
  p_expected_tenant_name text,
  p_store_id uuid,
  p_user_id uuid,
  p_membership_id uuid,
  p_fixture_type text,
  p_marker text,
  p_expires_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_state text;
  v_fixture qa_internal.fixtures%rowtype;
begin
  perform qa_internal.assert_operator();
  select state into strict v_state from qa_internal.runs where run_id = p_run_id for update;
  if v_state not in ('PREFLIGHT_READY','PROVISIONING','PROVISIONED','TEST_COMPLETE','TEARDOWN_DRY_RUN') then
    raise exception 'FIXTURE_REGISTRATION_STATE_INVALID:%', v_state;
  end if;
  insert into qa_internal.fixtures(
    run_id, tenant_id, expected_tenant_name, store_id, user_id, membership_id,
    fixture_type, marker, expires_at
  ) values (
    p_run_id, p_tenant_id, p_expected_tenant_name, p_store_id, p_user_id,
    p_membership_id, p_fixture_type, p_marker, p_expires_at
  )
  on conflict (run_id) do nothing;
  select * into strict v_fixture from qa_internal.fixtures where run_id = p_run_id;
  if (v_fixture.tenant_id, v_fixture.expected_tenant_name, v_fixture.store_id, v_fixture.user_id, v_fixture.membership_id, v_fixture.marker)
       is distinct from
     (p_tenant_id, p_expected_tenant_name, p_store_id, p_user_id, p_membership_id, p_marker) then
    raise exception 'FIXTURE_CONTRACT_MISMATCH';
  end if;
  return jsonb_build_object('fixture_id', v_fixture.fixture_id, 'cleanup_state', v_fixture.cleanup_state);
end;
$$;

create or replace function qa_internal.teardown_context_matches(
  p_tenant_id uuid,
  p_membership_id uuid,
  p_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from qa_internal.runs r
      join qa_internal.fixtures f on f.run_id = r.run_id
     where r.run_id::text = current_setting('qa.lifecycle_run_id', true)
       and r.environment = 'staging'
       and r.project_ref = 'gaytoojzwqkpuvfofeql'
       and r.state = 'TEARING_DOWN'
       and r.cleanup_deadline > clock_timestamp()
       and f.tenant_id = p_tenant_id
       and f.membership_id = p_membership_id
       and f.user_id = p_user_id
       and f.expires_at > clock_timestamp()
       and exists (
         select 1 from public.tenants t
          where t.id = f.tenant_id
            and t.name = f.expected_tenant_name
            and t.name like f.marker || '%'
       )
  );
$$;

revoke all on function qa_internal.teardown_context_matches(uuid, uuid, uuid) from public, anon, authenticated, service_role;

-- Preserve the normal last-owner guard. The sole exception is a transaction-local
-- context set inside the validated operator teardown transaction and re-proven
-- against the private registry for the exact membership being deleted.
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
    if qa_internal.teardown_context_matches(old.tenant_id, old.id, old.user_id) then
      if tg_op = 'DELETE' then return old; end if;
      return new;
    end if;
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

create or replace function qa_internal.fixture_counts(p_run_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  f qa_internal.fixtures%rowtype;
  r record;
  v_count bigint;
  v_counts jsonb := '{}'::jsonb;
  v_sql text;
begin
  select * into strict f from qa_internal.fixtures where run_id = p_run_id;
  for r in
    select c.table_name,
           bool_or(c.column_name = 'tenant_id') as has_tenant,
           bool_or(c.column_name in ('store_id','company_id','active_store_id')) as has_store,
           bool_or(c.column_name in ('user_id','requested_by','uploaded_by','created_by','updated_by')) as has_user,
           bool_or(c.column_name = 'membership_id') as has_membership
      from information_schema.columns c
      join information_schema.tables t on t.table_schema=c.table_schema and t.table_name=c.table_name and t.table_type='BASE TABLE'
     where c.table_schema='public'
       and c.column_name in ('tenant_id','store_id','company_id','active_store_id','user_id','requested_by','uploaded_by','created_by','updated_by','membership_id')
     group by c.table_name
     order by c.table_name
  loop
    v_sql := format('select count(*) from public.%I where false', r.table_name);
    if r.has_tenant then v_sql := v_sql || format(' or tenant_id::text = %L', f.tenant_id::text); end if;
    if r.has_store then
      if exists(select 1 from information_schema.columns where table_schema='public' and table_name=r.table_name and column_name='store_id') then v_sql := v_sql || format(' or store_id::text = %L', f.store_id::text); end if;
      if exists(select 1 from information_schema.columns where table_schema='public' and table_name=r.table_name and column_name='company_id') then v_sql := v_sql || format(' or company_id::text = %L', f.store_id::text); end if;
      if exists(select 1 from information_schema.columns where table_schema='public' and table_name=r.table_name and column_name='active_store_id') then v_sql := v_sql || format(' or active_store_id::text = %L', f.store_id::text); end if;
    end if;
    if r.has_user then
      if exists(select 1 from information_schema.columns where table_schema='public' and table_name=r.table_name and column_name='user_id') then v_sql := v_sql || format(' or user_id::text = %L', f.user_id::text); end if;
      if exists(select 1 from information_schema.columns where table_schema='public' and table_name=r.table_name and column_name='requested_by') then v_sql := v_sql || format(' or requested_by::text = %L', f.user_id::text); end if;
      if exists(select 1 from information_schema.columns where table_schema='public' and table_name=r.table_name and column_name='uploaded_by') then v_sql := v_sql || format(' or uploaded_by::text = %L', f.user_id::text); end if;
      if exists(select 1 from information_schema.columns where table_schema='public' and table_name=r.table_name and column_name='created_by') then v_sql := v_sql || format(' or created_by::text = %L', f.user_id::text); end if;
      if exists(select 1 from information_schema.columns where table_schema='public' and table_name=r.table_name and column_name='updated_by') then v_sql := v_sql || format(' or updated_by::text = %L', f.user_id::text); end if;
    end if;
    if r.has_membership then v_sql := v_sql || format(' or membership_id::text = %L', f.membership_id::text); end if;
    execute v_sql into v_count;
    if v_count > 0 then v_counts := v_counts || jsonb_build_object(r.table_name, v_count); end if;
  end loop;
  return v_counts;
end;
$$;

revoke all on function qa_internal.fixture_counts(uuid) from public, anon, authenticated, service_role;

create or replace function public.qa_lifecycle_cleanup_readiness()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_private_schema boolean;
  v_trigger boolean;
  v_public_execute integer;
  v_service_execute integer;
begin
  perform qa_internal.assert_operator();
  select not has_schema_privilege('anon','qa_internal','USAGE')
     and not has_schema_privilege('authenticated','qa_internal','USAGE')
    into v_private_schema;
  select exists(
    select 1 from pg_trigger
     where tgrelid='public.memberships'::regclass
       and tgname='guard_membership_owner_and_identity'
       and tgenabled <> 'D'
  ) into v_trigger;
  select count(*) into v_public_execute
    from (values
      ('public.qa_lifecycle_register_run(uuid,text,text,text,text,timestamptz)'::regprocedure),
      ('public.qa_lifecycle_transition(uuid,text,text,text,text,jsonb)'::regprocedure),
      ('public.qa_lifecycle_register_fixture(uuid,uuid,text,uuid,uuid,uuid,text,text,timestamptz)'::regprocedure),
      ('public.qa_lifecycle_teardown(uuid,boolean)'::regprocedure),
      ('public.qa_lifecycle_verify_clean(uuid,boolean)'::regprocedure),
      ('public.qa_lifecycle_finalize(uuid)'::regprocedure),
      ('public.qa_lifecycle_status(uuid)'::regprocedure)
    ) f(oid)
   where has_function_privilege('anon',f.oid,'EXECUTE')
      or has_function_privilege('authenticated',f.oid,'EXECUTE')
      or has_function_privilege('public',f.oid,'EXECUTE');
  select count(*) into v_service_execute
    from (values
      ('public.qa_lifecycle_register_run(uuid,text,text,text,text,timestamptz)'::regprocedure),
      ('public.qa_lifecycle_transition(uuid,text,text,text,text,jsonb)'::regprocedure),
      ('public.qa_lifecycle_register_fixture(uuid,uuid,text,uuid,uuid,uuid,text,text,timestamptz)'::regprocedure),
      ('public.qa_lifecycle_teardown(uuid,boolean)'::regprocedure),
      ('public.qa_lifecycle_verify_clean(uuid,boolean)'::regprocedure),
      ('public.qa_lifecycle_finalize(uuid)'::regprocedure),
      ('public.qa_lifecycle_status(uuid)'::regprocedure)
    ) f(oid)
   where has_function_privilege('service_role',f.oid,'EXECUTE');
  return jsonb_build_object(
    'ready',v_private_schema and v_trigger and v_public_execute=0 and v_service_execute=7,
    'private_schema',v_private_schema,'last_owner_guard_enabled',v_trigger,
    'public_execute_count',v_public_execute,'service_execute_count',v_service_execute,
    'dry_run_supported',true,'auth_hard_delete_path','admin-api'
  );
end;
$$;

create or replace function public.qa_lifecycle_teardown(p_run_id uuid, p_dry_run boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r qa_internal.runs%rowtype;
  f qa_internal.fixtures%rowtype;
  v_counts jsonb;
  v_deleted_memberships integer := 0;
  v_deleted_stores integer := 0;
  v_deleted_tenants integer := 0;
  v_external_blockers jsonb := '[]'::jsonb;
begin
  perform qa_internal.assert_operator();
  select * into strict r from qa_internal.runs where run_id = p_run_id for update;
  select * into strict f from qa_internal.fixtures where run_id = p_run_id for update;
  perform pg_advisory_xact_lock(hashtextextended(p_run_id::text, 0));
  perform 1 from public.tenants where id=f.tenant_id for update;

  if r.cleanup_deadline <= clock_timestamp() or f.expires_at <= clock_timestamp() then raise exception 'QA_RUN_EXPIRED'; end if;
  if not exists(select 1 from public.tenants where id=f.tenant_id and name=f.expected_tenant_name and name like f.marker || '%') then raise exception 'TENANT_ID_NAME_MARKER_MISMATCH'; end if;
  if not exists(select 1 from public.stores where id=f.store_id and tenant_id=f.tenant_id) then raise exception 'STORE_SCOPE_MISMATCH'; end if;
  if not exists(select 1 from public.memberships where id=f.membership_id and tenant_id=f.tenant_id and store_id=f.store_id and user_id=f.user_id) then raise exception 'MEMBERSHIP_SCOPE_MISMATCH'; end if;

  v_counts := qa_internal.fixture_counts(p_run_id);
  if exists(select 1 from public.company_subscriptions where (tenant_id=f.tenant_id or company_id=f.store_id) and (stripe_customer_id is not null or stripe_subscription_id is not null)) then
    v_external_blockers := v_external_blockers || jsonb_build_array('STRIPE_ID_PRESENT');
  end if;
  if exists(select 1 from public.line_link_connections where tenant_id=f.tenant_id or store_id=f.store_id) then
    v_external_blockers := v_external_blockers || jsonb_build_array('LINE_CONNECTION_PRESENT');
  end if;
  if exists(select 1 from public.uploaded_files where tenant_id=f.tenant_id or store_id=f.store_id or uploaded_by=f.user_id) then
    v_external_blockers := v_external_blockers || jsonb_build_array('UPLOADED_FILE_PRESENT');
  end if;

  if p_dry_run then
    if r.state not in ('PREFLIGHT_READY','TEST_COMPLETE','TEARDOWN_DRY_RUN','TEARDOWN_READY') then raise exception 'DRY_RUN_STATE_INVALID:%', r.state; end if;
    update qa_internal.fixtures set cleanup_state='DRY_RUN_READY' where fixture_id=f.fixture_id;
    return jsonb_build_object(
      'dry_run', true,
      'run_id', p_run_id,
      'counts', v_counts,
      'external_blockers', v_external_blockers,
      'deletion_order', jsonb_build_array('session','security_event','membership_assignment','legacy_membership','membership','store','tenant','auth_user','artifact'),
      'ready', jsonb_array_length(v_external_blockers)=0
    );
  end if;

  if r.state <> 'TEARING_DOWN' then raise exception 'TEARDOWN_STATE_INVALID:%', r.state; end if;
  if jsonb_array_length(v_external_blockers) > 0 then raise exception 'EXTERNAL_RESIDUAL_BLOCKS_DB_TEARDOWN:%', v_external_blockers; end if;
  perform set_config('qa.lifecycle_run_id', p_run_id::text, true);

  -- A fixture user may have unrelated relationships. Only rows whose exact
  -- registered tenant/store/membership provenance is known may be touched.
  if exists(select 1 from public.memberships m where m.user_id=f.user_id and m.id<>f.membership_id)
     or exists(select 1 from public.store_members sm where sm.user_id=f.user_id and sm.store_id<>f.store_id)
     or exists(select 1 from public.security_events se where se.user_id=f.user_id and se.tenant_id<>f.tenant_id)
     or exists(select 1 from public.user_active_store_preferences p where p.user_id=f.user_id and (p.tenant_id<>f.tenant_id or p.active_store_id<>f.store_id)) then
    raise exception 'UNREGISTERED_USER_RELATIONSHIP_BLOCKS_TEARDOWN';
  end if;
  -- Auth-owned rows have no tenant provenance in the application registry.
  -- They are deleted only by the Auth hard-delete stage, whose FK cascade is
  -- scoped to the exact fixture user after the out-of-scope relationship gate.
  if to_regclass('public.admin_access_credentials') is not null then
    execute 'delete from public.admin_access_credentials where user_id=$1 and tenant_id=$2' using f.user_id, f.tenant_id;
  end if;
  delete from public.user_active_store_preferences where user_id=f.user_id and tenant_id=f.tenant_id and active_store_id=f.store_id;
  delete from public.membership_store_assignments where membership_id=f.membership_id and tenant_id=f.tenant_id and store_id=f.store_id;
  delete from public.security_events where user_id=f.user_id and tenant_id=f.tenant_id;
  delete from public.store_members where user_id=f.user_id and store_id=f.store_id;
  delete from public.memberships where id=f.membership_id and tenant_id=f.tenant_id and user_id=f.user_id;
  get diagnostics v_deleted_memberships = row_count;
  delete from public.stores where id=f.store_id and tenant_id=f.tenant_id;
  get diagnostics v_deleted_stores = row_count;
  delete from public.tenants where id=f.tenant_id and name=f.expected_tenant_name;
  get diagnostics v_deleted_tenants = row_count;
  if v_deleted_memberships <> 1 or v_deleted_stores <> 1 or v_deleted_tenants <> 1 then raise exception 'ACTUAL_DELETE_COUNT_MISMATCH'; end if;
  update qa_internal.fixtures set cleanup_state='DB_CLEANED' where fixture_id=f.fixture_id;
  update qa_internal.runs set state='DB_CLEANED', last_successful_state='DB_CLEANED', next_action='auth-clean', updated_at=clock_timestamp() where run_id=p_run_id;
  insert into qa_internal.state_events(run_id,from_state,to_state,next_action,safe_detail)
  values(p_run_id,'TEARING_DOWN','DB_CLEANED','auth-clean',jsonb_build_object('memberships',v_deleted_memberships,'stores',v_deleted_stores,'tenants',v_deleted_tenants));
  return jsonb_build_object('dry_run',false,'run_id',p_run_id,'memberships',v_deleted_memberships,'stores',v_deleted_stores,'tenants',v_deleted_tenants);
end;
$$;

create or replace function public.qa_lifecycle_verify_clean(p_run_id uuid, p_finalize boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r qa_internal.runs%rowtype;
  f qa_internal.fixtures%rowtype;
  v_auth_users bigint;
  v_auth_sessions bigint;
  v_db_counts jsonb;
  v_total bigint;
  v_result jsonb;
begin
  perform qa_internal.assert_operator();
  select * into strict r from qa_internal.runs where run_id=p_run_id for update;
  select * into strict f from qa_internal.fixtures where run_id=p_run_id for update;
  v_db_counts := qa_internal.fixture_counts(p_run_id);
  select count(*) into v_auth_users from auth.users where id=f.user_id;
  if to_regclass('auth.sessions') is not null then
    execute 'select count(*) from auth.sessions where user_id=$1' into v_auth_sessions using f.user_id;
  else
    v_auth_sessions := 0;
  end if;
  select coalesce(sum(value::bigint),0) into v_total from jsonb_each_text(v_db_counts);
  v_result := jsonb_build_object(
    'run_id',p_run_id,'db_counts',v_db_counts,'db_total',v_total,
    'auth_users',v_auth_users,'auth_sessions',v_auth_sessions,
    'clean',v_total=0 and v_auth_users=0 and v_auth_sessions=0
  );
  if p_finalize then
    if r.state <> 'ARTIFACTS_CLEANED' then raise exception 'VERIFY_STATE_INVALID:%',r.state; end if;
    if v_total<>0 or v_auth_users<>0 or v_auth_sessions<>0 then raise exception 'ZERO_RESIDUAL_GATE_FAILED:%',v_result; end if;
    update qa_internal.runs set state='VERIFIED_CLEAN',last_successful_state='VERIFIED_CLEAN',next_action='complete',final_evidence=v_result,updated_at=clock_timestamp() where run_id=p_run_id;
    insert into qa_internal.state_events(run_id,from_state,to_state,next_action,safe_detail) values(p_run_id,'ARTIFACTS_CLEANED','VERIFIED_CLEAN','complete',v_result);
    update qa_internal.fixtures set cleanup_state='VERIFIED_CLEAN' where run_id=p_run_id;
  end if;
  return v_result;
end;
$$;

create or replace function public.qa_lifecycle_finalize(p_run_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_count integer;
begin
  perform qa_internal.assert_operator();
  if not exists(select 1 from qa_internal.runs where run_id=p_run_id and state='VERIFIED_CLEAN' and final_evidence->>'clean'='true') then raise exception 'FINALIZE_GATE_FAILED'; end if;
  delete from qa_internal.fixtures where run_id=p_run_id;
  get diagnostics v_count = row_count;
  update qa_internal.runs set state='COMPLETE',last_successful_state='COMPLETE',next_action='none',completed_at=clock_timestamp(),updated_at=clock_timestamp() where run_id=p_run_id;
  insert into qa_internal.state_events(run_id,from_state,to_state,next_action,safe_detail) values(p_run_id,'VERIFIED_CLEAN','COMPLETE','none',jsonb_build_object('registry_fixtures_deleted',v_count));
  return jsonb_build_object('run_id',p_run_id,'state','COMPLETE','registry_fixtures_deleted',v_count);
end;
$$;

create or replace function public.qa_lifecycle_status(p_run_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_result jsonb;
begin
  perform qa_internal.assert_operator();
  select jsonb_build_object(
    'run_id',r.run_id,'product',r.product,'environment',r.environment,'project_ref',r.project_ref,
    'purpose',r.purpose,'source_sha',r.source_sha,'deployment_id',r.deployment_id,
    'state',r.state,'last_successful_state',r.last_successful_state,'next_action',r.next_action,
    'failure_class',r.failure_class,'safe_retry_count',r.safe_retry_count,
    'cleanup_deadline',r.cleanup_deadline,'created_at',r.created_at,'updated_at',r.updated_at,
    'final_evidence',r.final_evidence,
    'fixtures',coalesce((select jsonb_agg(jsonb_build_object(
      'tenant_id',f.tenant_id,'expected_tenant_name',f.expected_tenant_name,'store_id',f.store_id,
      'user_id',f.user_id,'membership_id',f.membership_id,'fixture_type',f.fixture_type,
      'marker',f.marker,'expires_at',f.expires_at,'cleanup_state',f.cleanup_state
    )) from qa_internal.fixtures f where f.run_id=r.run_id),'[]'::jsonb),
    'events',coalesce((select jsonb_agg(jsonb_build_object(
      'event_id',e.event_id,'from_state',e.from_state,'to_state',e.to_state,
      'failure_class',e.failure_class,'next_action',e.next_action,'safe_detail',e.safe_detail,'occurred_at',e.occurred_at
    ) order by e.event_id) from qa_internal.state_events e where e.run_id=r.run_id),'[]'::jsonb)
  ) into v_result from qa_internal.runs r where r.run_id=p_run_id;
  if v_result is null then raise exception 'QA_RUN_NOT_FOUND'; end if;
  return v_result;
end;
$$;

revoke all on function public.qa_lifecycle_register_run(uuid,text,text,text,text,timestamptz) from public, anon, authenticated;
revoke all on function public.qa_lifecycle_transition(uuid,text,text,text,text,jsonb) from public, anon, authenticated;
revoke all on function public.qa_lifecycle_register_fixture(uuid,uuid,text,uuid,uuid,uuid,text,text,timestamptz) from public, anon, authenticated;
revoke all on function public.qa_lifecycle_teardown(uuid,boolean) from public, anon, authenticated;
revoke all on function public.qa_lifecycle_verify_clean(uuid,boolean) from public, anon, authenticated;
revoke all on function public.qa_lifecycle_finalize(uuid) from public, anon, authenticated;
revoke all on function public.qa_lifecycle_status(uuid) from public, anon, authenticated;
revoke all on function public.qa_lifecycle_cleanup_readiness() from public, anon, authenticated;
grant execute on function public.qa_lifecycle_register_run(uuid,text,text,text,text,timestamptz) to service_role;
grant execute on function public.qa_lifecycle_transition(uuid,text,text,text,text,jsonb) to service_role;
grant execute on function public.qa_lifecycle_register_fixture(uuid,uuid,text,uuid,uuid,uuid,text,text,timestamptz) to service_role;
grant execute on function public.qa_lifecycle_teardown(uuid,boolean) to service_role;
grant execute on function public.qa_lifecycle_verify_clean(uuid,boolean) to service_role;
grant execute on function public.qa_lifecycle_finalize(uuid) to service_role;
grant execute on function public.qa_lifecycle_status(uuid) to service_role;
grant execute on function public.qa_lifecycle_cleanup_readiness() to service_role;

alter function public.qa_lifecycle_register_run(uuid,text,text,text,text,timestamptz) owner to postgres;
alter function public.qa_lifecycle_transition(uuid,text,text,text,text,jsonb) owner to postgres;
alter function public.qa_lifecycle_register_fixture(uuid,uuid,text,uuid,uuid,uuid,text,text,timestamptz) owner to postgres;
alter function public.qa_lifecycle_teardown(uuid,boolean) owner to postgres;
alter function public.qa_lifecycle_verify_clean(uuid,boolean) owner to postgres;
alter function public.qa_lifecycle_finalize(uuid) owner to postgres;
alter function public.qa_lifecycle_status(uuid) owner to postgres;
alter function public.qa_lifecycle_cleanup_readiness() owner to postgres;

commit;
