begin;

-- Align the installed Staging-only lifecycle state machine with the canonical
-- QA framework without reopening any application or Production privilege.
alter table qa_internal.runs
  add column if not exists retry_ledger jsonb not null default '{}'::jsonb;

alter table qa_internal.runs drop constraint if exists runs_state_check;
alter table qa_internal.runs add constraint runs_state_check check (state in (
  'CREATED','PREFLIGHT_RUNNING','PREFLIGHT_READY','PROVISIONING','PROVISIONED',
  'AUTH_READY','TEST_RUNNING','TEST_COMPLETE','TEARDOWN_DRY_RUN','TEARDOWN_READY',
  'TEARING_DOWN','DB_CLEANED','AUTH_CLEANED','STORAGE_CLEANED','ARTIFACTS_CLEANED',
  'VERIFIED_CLEAN','COMPLETE','ABORTED_CLEAN','FAILED_RECOVERABLE','HARD_STOP'
));

alter table qa_internal.fixtures drop constraint if exists fixtures_cleanup_state_check;
alter table qa_internal.fixtures add constraint fixtures_cleanup_state_check check (cleanup_state in (
  'REGISTERED','DRY_RUN_READY','DB_CLEANED','AUTH_CLEANED','STORAGE_CLEANED',
  'ARTIFACTS_CLEANED','VERIFIED_CLEAN'
));

create or replace function qa_internal.transition_allowed(p_from text, p_to text)
returns boolean language sql immutable set search_path = '' as $$
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
    when 'FAILED_RECOVERABLE' then p_to not in ('CREATED','COMPLETE','ABORTED_CLEAN')
    else false
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
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_run qa_internal.runs%rowtype;
  v_last_successful text;
  v_retry integer;
  v_retry_key text;
  v_ledger jsonb;
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
  if p_next_state in ('DB_CLEANED','AUTH_CLEANED','STORAGE_CLEANED','ARTIFACTS_CLEANED','VERIFIED_CLEAN') then
    raise exception 'DEDICATED_EVIDENCE_PATH_REQUIRED';
  end if;
  v_retry_key := coalesce(p_next_action,'unknown') || ':' || coalesce(p_failure_class,'unknown') || ':' || coalesce(v_run.last_successful_state,'unknown');
  if p_next_state = 'FAILED_RECOVERABLE' and coalesce((v_run.retry_ledger->>v_retry_key)::integer,0) >= 2 then
    raise exception 'SAFE_RETRY_CEILING_EXCEEDED';
  end if;
  v_ledger := v_run.retry_ledger;
  if p_next_state = 'FAILED_RECOVERABLE' then
    v_ledger := jsonb_set(v_ledger,array[v_retry_key],to_jsonb(coalesce((v_ledger->>v_retry_key)::integer,0)+1),true);
  end if;
  v_retry := case when p_next_state = 'FAILED_RECOVERABLE' then coalesce((v_ledger->>v_retry_key)::integer,0) else v_run.safe_retry_count end;
  v_last_successful := case when p_next_state in ('FAILED_RECOVERABLE','HARD_STOP') then v_run.last_successful_state else p_next_state end;
  update qa_internal.runs
     set state = p_next_state,
         last_successful_state = v_last_successful,
         next_action = p_next_action,
         failure_class = p_failure_class,
         safe_retry_count = v_retry,
         retry_ledger = v_ledger,
         updated_at = clock_timestamp(),
         completed_at = case when p_next_state = 'COMPLETE' then clock_timestamp() else completed_at end
   where run_id = p_run_id;
  insert into qa_internal.state_events(run_id, from_state, to_state, failure_class, next_action, safe_detail)
  values (p_run_id, v_run.state, p_next_state, p_failure_class, p_next_action, coalesce(p_safe_detail, '{}'::jsonb));
  return jsonb_build_object('run_id', p_run_id, 'state', p_next_state, 'last_successful_state', v_last_successful, 'next_action', p_next_action, 'safe_retry_count', v_retry);
end;
$$;

create or replace function public.qa_lifecycle_abort_clean(p_run_id uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_run qa_internal.runs%rowtype;
begin
  perform qa_internal.assert_operator();
  select * into strict v_run from qa_internal.runs where run_id=p_run_id for update;
  if v_run.state not in ('CREATED','PREFLIGHT_RUNNING','PREFLIGHT_READY','PROVISIONING') then raise exception 'ABORT_STATE_INVALID:%',v_run.state; end if;
  if exists(select 1 from qa_internal.fixtures where run_id=p_run_id) then raise exception 'ABORT_FIXTURE_PRESENT'; end if;
  update qa_internal.runs set state='ABORTED_CLEAN',last_successful_state='ABORTED_CLEAN',next_action='none',final_evidence=jsonb_build_object('clean',true,'terminal','ABORTED_CLEAN','reason',p_reason),updated_at=clock_timestamp(),completed_at=clock_timestamp() where run_id=p_run_id;
  insert into qa_internal.state_events(run_id,from_state,to_state,next_action,safe_detail) values(p_run_id,v_run.state,'ABORTED_CLEAN','none',jsonb_build_object('reason',p_reason,'terminal',true));
  return jsonb_build_object('run_id',p_run_id,'state','ABORTED_CLEAN');
end;
$$;

create or replace function public.qa_lifecycle_record_evidence(p_run_id uuid, p_evidence_kind text, p_detail jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r qa_internal.runs%rowtype;
begin
  perform qa_internal.assert_operator();
  select * into strict r from qa_internal.runs where run_id=p_run_id for update;
  raise exception 'CALLER_SUPPLIED_EVIDENCE_FORBIDDEN';
end;
$$;

create or replace function public.qa_lifecycle_verify_clean(p_run_id uuid, p_finalize boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
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
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_count integer; v_evidence_count integer;
begin
  perform qa_internal.assert_operator();
  if not exists(select 1 from qa_internal.runs where run_id=p_run_id and state='VERIFIED_CLEAN' and final_evidence->>'clean'='true') then raise exception 'FINALIZE_GATE_FAILED'; end if;
  select count(*) into v_evidence_count from qa_internal.evidence e join qa_internal.runs r using(run_id) where e.run_id=p_run_id and e.evidence_kind in ('AUTH','STORAGE','ARTIFACT','BYPASS','PUBLIC_MARKER') and e.source_sha=r.source_sha and e.deployment_id=r.deployment_id and e.observed_at>=r.created_at and coalesce((e.detail->>'residual_count')::bigint,0)=0;
  if v_evidence_count <> 5 then raise exception 'FINALIZE_EVIDENCE_GATE_FAILED:%',v_evidence_count; end if;
  delete from qa_internal.fixtures where run_id=p_run_id;
  get diagnostics v_count = row_count;
  update qa_internal.runs set state='COMPLETE',last_successful_state='COMPLETE',next_action='none',completed_at=clock_timestamp(),updated_at=clock_timestamp() where run_id=p_run_id;
  insert into qa_internal.state_events(run_id,from_state,to_state,next_action,safe_detail) values(p_run_id,'VERIFIED_CLEAN','COMPLETE','none',jsonb_build_object('registry_fixtures_deleted',v_count));
  return jsonb_build_object('run_id',p_run_id,'state','COMPLETE','registry_fixtures_deleted',v_count,'evidence_count',v_evidence_count);
end;
$$;

revoke all on function qa_internal.transition_allowed(text,text) from public, anon, authenticated, service_role;
revoke all on function public.qa_lifecycle_transition(uuid,text,text,text,text,jsonb) from public, anon, authenticated;
revoke all on function public.qa_lifecycle_abort_clean(uuid,text) from public, anon, authenticated;
revoke all on function public.qa_lifecycle_record_evidence(uuid,text,jsonb) from public, anon, authenticated;
revoke all on function public.qa_lifecycle_verify_clean(uuid,boolean) from public, anon, authenticated;
revoke all on function public.qa_lifecycle_finalize(uuid) from public, anon, authenticated;
grant execute on function public.qa_lifecycle_transition(uuid,text,text,text,text,jsonb) to service_role;
grant execute on function public.qa_lifecycle_abort_clean(uuid,text) to service_role;
grant execute on function public.qa_lifecycle_record_evidence(uuid,text,jsonb) to service_role;
grant execute on function public.qa_lifecycle_verify_clean(uuid,boolean) to service_role;
grant execute on function public.qa_lifecycle_finalize(uuid) to service_role;
alter function qa_internal.transition_allowed(text,text) owner to postgres;
alter function public.qa_lifecycle_transition(uuid,text,text,text,text,jsonb) owner to postgres;
alter function public.qa_lifecycle_abort_clean(uuid,text) owner to postgres;
alter function public.qa_lifecycle_record_evidence(uuid,text,jsonb) owner to postgres;
alter function public.qa_lifecycle_verify_clean(uuid,boolean) owner to postgres;
alter function public.qa_lifecycle_finalize(uuid) owner to postgres;

notify pgrst, 'reload schema';
commit;
