-- Staging-only, run-bound GARAGE LINK fixture for L-LINK integration acceptance.
-- This is QA-lane DDL; never apply through the production migration path.
begin;

create table qa_internal.line_link_integration_runs (
  run_id uuid primary key references qa_internal.runs(run_id) on delete cascade,
  tenant_id uuid not null,
  store_id uuid not null,
  key_id text not null check (key_id ~ '^[a-z0-9_-]{1,32}$'),
  subscription_id uuid not null,
  connection_id uuid not null,
  event_ids uuid[] not null check (cardinality(event_ids)=2),
  marker text not null,
  state text not null default 'PROVISIONED' check (state in ('PROVISIONED','CLEANED')),
  provisioned_at timestamptz not null default clock_timestamp(),
  cleaned_at timestamptz,
  check (event_ids[1]<>event_ids[2]),
  check (marker='[GARAGE LINK QA '||left(replace(run_id::text,'-',''),12)||']')
);
revoke all on table qa_internal.line_link_integration_runs from public,anon,authenticated,service_role;
alter default privileges for role postgres in schema qa_internal
  revoke all on tables from public,anon,authenticated,service_role;

create or replace function public.qa_l_link_integration_provision(p_run_id uuid,p_key_id text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  r qa_internal.runs%rowtype;
  f qa_internal.fixtures%rowtype;
  i qa_internal.line_link_integration_runs%rowtype;
  s public.company_subscriptions%rowtype;
  v_marker text;
  v_events uuid[];
  v_connection_id uuid;
begin
  perform qa_internal.assert_operator();
  select * into strict r from qa_internal.runs where run_id=p_run_id for update;
  select * into strict f from qa_internal.fixtures where run_id=p_run_id for update;
  perform pg_advisory_xact_lock(hashtextextended(p_run_id::text,0));
  if p_key_id is null or p_key_id !~ '^[a-z0-9_-]{1,32}$'
     or r.product<>'garage-link' or r.environment<>'staging'
     or r.project_ref<>'gaytoojzwqkpuvfofeql'
     or r.purpose<>'garage-link-l-link-integration-acceptance'
     or r.state<>'PROVISIONED' or f.fixture_type<>'canary'
     or r.cleanup_deadline<=clock_timestamp() or f.expires_at<=clock_timestamp() then
    raise exception 'L_LINK_INTEGRATION_RUN_CONTRACT_INVALID';
  end if;
  if exists(select 1 from qa_internal.line_link_integration_runs where run_id=p_run_id) then
    select * into strict i from qa_internal.line_link_integration_runs where run_id=p_run_id;
    if i.tenant_id<>f.tenant_id or i.store_id<>f.store_id or i.key_id<>p_key_id or i.state<>'PROVISIONED' then
      raise exception 'L_LINK_INTEGRATION_RUN_CONTRACT_MISMATCH';
    end if;
    return jsonb_build_object('run_id',p_run_id,'state',i.state,'store_id',i.store_id,'event_ids',i.event_ids,'key_id',i.key_id,'idempotent',true);
  end if;
  if not exists(select 1 from public.tenants where id=f.tenant_id and status='active')
     or not exists(select 1 from public.stores where id=f.store_id and tenant_id=f.tenant_id and status='active') then
    raise exception 'L_LINK_INTEGRATION_FIXTURE_SCOPE_MISMATCH';
  end if;
  select * into strict s from public.company_subscriptions
   where company_id=f.store_id and tenant_id=f.tenant_id and status='active' for update;
  if s.l_link_integration_enabled or s.stripe_customer_id is not null or s.stripe_subscription_id is not null then
    raise exception 'L_LINK_INTEGRATION_ENTITLEMENT_NOT_CLEAN';
  end if;
  if exists(select 1 from public.line_link_connections where store_id=f.store_id or key_id=p_key_id)
     or exists(select 1 from public.inspection_reminder_events where store_id=f.store_id)
     or exists(select 1 from public.line_link_inbound_nonces where store_id=f.store_id) then
    raise exception 'L_LINK_INTEGRATION_STORE_HAS_RESIDUAL_DATA';
  end if;

  v_marker:='[GARAGE LINK QA '||left(replace(p_run_id::text,'-',''),12)||']';
  v_events:=array[gen_random_uuid(),gen_random_uuid()];
  insert into qa_internal.line_link_integration_runs(run_id,tenant_id,store_id,key_id,subscription_id,connection_id,event_ids,marker)
  values(p_run_id,f.tenant_id,f.store_id,p_key_id,s.id,gen_random_uuid(),v_events,v_marker);
  update public.company_subscriptions set l_link_integration_enabled=true
   where id=s.id and company_id=f.store_id and tenant_id=f.tenant_id and status='active'
     and l_link_integration_enabled=false and stripe_customer_id is null and stripe_subscription_id is null;
  if not found then raise exception 'L_LINK_INTEGRATION_ENTITLEMENT_UPDATE_MISMATCH'; end if;
  insert into public.line_link_connections(id,tenant_id,store_id,key_id,status)
  values((select connection_id from qa_internal.line_link_integration_runs where run_id=p_run_id),f.tenant_id,f.store_id,p_key_id,'active');
  insert into public.inspection_reminder_events(
    id,company_id,store_id,inspection_expiry_date,reminder_offset_days,event_type,status,
    idempotency_key,customer_name,vehicle_name,assigned_user_name,created_by
  ) values
    (v_events[1],f.tenant_id,f.store_id,current_date+30,30,'inspection_reminder','pending',
      'qa-garage-link:'||p_run_id::text||':1',v_marker||' Customer 1',v_marker||' Vehicle 1','QA Integration',f.user_id),
    (v_events[2],f.tenant_id,f.store_id,current_date+60,60,'inspection_reminder','pending',
      'qa-garage-link:'||p_run_id::text||':2',v_marker||' Customer 2',v_marker||' Vehicle 2','QA Integration',f.user_id);
  return jsonb_build_object('run_id',p_run_id,'state','PROVISIONED','store_id',f.store_id,'event_ids',v_events,'key_id',p_key_id);
end;
$$;

create or replace function public.qa_l_link_integration_reset_event(p_run_id uuid,p_event_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  i qa_internal.line_link_integration_runs%rowtype;
  v_status text;
begin
  perform qa_internal.assert_operator();
  select * into strict i from qa_internal.line_link_integration_runs where run_id=p_run_id for update;
  perform pg_advisory_xact_lock(hashtextextended(p_run_id::text,0));
  if i.state<>'PROVISIONED' or not (p_event_id=any(i.event_ids)) then
    raise exception 'L_LINK_INTEGRATION_EVENT_NOT_REGISTERED';
  end if;
  select status into strict v_status from public.inspection_reminder_events
   where id=p_event_id and store_id=i.store_id and company_id=i.tenant_id
     and idempotency_key in ('qa-garage-link:'||p_run_id::text||':1','qa-garage-link:'||p_run_id::text||':2')
     and customer_name like i.marker||'%' for update;
  if v_status='pending' then return jsonb_build_object('run_id',p_run_id,'event_id',p_event_id,'state','pending','idempotent',true); end if;
  if v_status<>'completed' or not exists(
    select 1 from public.inspection_reminder_events where id=p_event_id and store_id=i.store_id
      and company_id=i.tenant_id and external_reference_id is not null
  ) then raise exception 'L_LINK_INTEGRATION_EVENT_NOT_ACKNOWLEDGED'; end if;
  update public.inspection_reminder_events set status='pending',external_reference_id=null,error_detail=null
   where id=p_event_id and store_id=i.store_id and company_id=i.tenant_id and status='completed';
  if not found then raise exception 'L_LINK_INTEGRATION_EVENT_RESET_MISMATCH'; end if;
  return jsonb_build_object('run_id',p_run_id,'event_id',p_event_id,'state','pending','reset',true);
end;
$$;

create or replace function public.qa_l_link_integration_dry_run(p_run_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
  i qa_internal.line_link_integration_runs%rowtype;
  v_events bigint; v_connections bigint; v_unknown_events bigint; v_unknown_connections bigint;
  v_nonces bigint; v_unknown_nonces bigint; v_entitlement bigint; v_unsafe bigint;
begin
  perform qa_internal.assert_operator();
  select * into strict i from qa_internal.line_link_integration_runs where run_id=p_run_id;
  if i.state<>'PROVISIONED' then raise exception 'L_LINK_INTEGRATION_NOT_PROVISIONED'; end if;
  select count(*) into v_events from public.inspection_reminder_events e
   where e.id=any(i.event_ids) and e.store_id=i.store_id and e.company_id=i.tenant_id
     and e.idempotency_key in ('qa-garage-link:'||p_run_id::text||':1','qa-garage-link:'||p_run_id::text||':2')
     and e.customer_name like i.marker||'%' and e.status in ('pending','completed');
  select count(*) into v_connections from public.line_link_connections c
   where c.id=i.connection_id and c.tenant_id=i.tenant_id and c.store_id=i.store_id and c.key_id=i.key_id and c.status='active';
  select count(*) into v_unknown_events from public.inspection_reminder_events e
   where e.store_id=i.store_id and not (e.id=any(i.event_ids));
  select count(*) into v_unknown_connections from public.line_link_connections c
   where c.store_id=i.store_id and c.id<>i.connection_id;
  select count(*) into v_nonces from public.line_link_inbound_nonces n
   where n.store_id=i.store_id and n.tenant_id=i.tenant_id and n.key_id=i.key_id;
  select count(*) into v_unknown_nonces from public.line_link_inbound_nonces n
   where n.store_id=i.store_id and not (n.tenant_id=i.tenant_id and n.key_id=i.key_id);
  select count(*) into v_entitlement from public.company_subscriptions s
   where s.id=i.subscription_id and s.company_id=i.store_id and s.tenant_id=i.tenant_id
     and s.status='active' and s.l_link_integration_enabled and s.stripe_customer_id is null and s.stripe_subscription_id is null;
  select count(*) into v_unsafe from public.company_subscriptions s
   where s.company_id=i.store_id and (s.id<>i.subscription_id or s.stripe_customer_id is not null or s.stripe_subscription_id is not null);
  v_unsafe:=v_unsafe+v_unknown_events+v_unknown_connections+v_unknown_nonces;
  return jsonb_build_object('run_id',p_run_id,'ready',v_events=2 and v_connections=1 and v_entitlement=1 and v_unsafe=0,
    'event_rows',v_events,'connection_rows',v_connections,'nonce_rows',v_nonces,'entitlement_rows',v_entitlement,
    'unknown_event_rows',v_unknown_events,'unknown_connection_rows',v_unknown_connections,
    'unknown_nonce_rows',v_unknown_nonces,'unsafe_rows',v_unsafe);
end;
$$;

create or replace function public.qa_l_link_integration_cleanup(p_run_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  i qa_internal.line_link_integration_runs%rowtype;
  v_preflight jsonb; v_events integer; v_connections integer; v_nonces integer;
begin
  perform qa_internal.assert_operator();
  select * into strict i from qa_internal.line_link_integration_runs where run_id=p_run_id for update;
  perform pg_advisory_xact_lock(hashtextextended(p_run_id::text,0));
  if i.state='CLEANED' then return public.qa_l_link_integration_verify_clean(p_run_id)||jsonb_build_object('idempotent',true); end if;
  v_preflight:=public.qa_l_link_integration_dry_run(p_run_id);
  if coalesce((v_preflight->>'ready')::boolean,false) is not true then raise exception 'L_LINK_INTEGRATION_DRY_RUN_BLOCKED'; end if;
  delete from public.line_link_inbound_nonces where store_id=i.store_id and tenant_id=i.tenant_id and key_id=i.key_id;
  get diagnostics v_nonces=row_count;
  delete from public.inspection_reminder_events where id=any(i.event_ids) and store_id=i.store_id and company_id=i.tenant_id
    and idempotency_key in ('qa-garage-link:'||p_run_id::text||':1','qa-garage-link:'||p_run_id::text||':2')
    and customer_name like i.marker||'%';
  get diagnostics v_events=row_count;
  delete from public.line_link_connections where id=i.connection_id and tenant_id=i.tenant_id and store_id=i.store_id and key_id=i.key_id;
  get diagnostics v_connections=row_count;
  update public.company_subscriptions set l_link_integration_enabled=false
   where id=i.subscription_id and company_id=i.store_id and tenant_id=i.tenant_id
     and status='active' and l_link_integration_enabled and stripe_customer_id is null and stripe_subscription_id is null;
  if not found or v_events<>2 or v_connections<>1 then raise exception 'L_LINK_INTEGRATION_EXACT_CLEANUP_MISMATCH'; end if;
  update qa_internal.line_link_integration_runs set state='CLEANED',cleaned_at=clock_timestamp() where run_id=p_run_id;
  return jsonb_build_object('run_id',p_run_id,'cleaned',true,'events_deleted',v_events,'connections_deleted',v_connections,'nonces_deleted',v_nonces);
end;
$$;

create or replace function public.qa_l_link_integration_verify_clean(p_run_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
  i qa_internal.line_link_integration_runs%rowtype;
  f qa_internal.fixtures%rowtype;
  v_events bigint; v_connections bigint; v_nonces bigint; v_entitlement bigint;
  v_unknown_events bigint; v_unknown_connections bigint; v_residual bigint;
begin
  perform qa_internal.assert_operator();
  select * into i from qa_internal.line_link_integration_runs where run_id=p_run_id;
  if not found then
    select * into strict f from qa_internal.fixtures where run_id=p_run_id;
    select count(*) into v_events from public.inspection_reminder_events where store_id=f.store_id;
    select count(*) into v_connections from public.line_link_connections where store_id=f.store_id;
    select count(*) into v_nonces from public.line_link_inbound_nonces where store_id=f.store_id;
    select count(*) into v_entitlement from public.company_subscriptions where company_id=f.store_id and l_link_integration_enabled;
    v_residual:=v_events+v_connections+v_nonces+v_entitlement;
    return jsonb_build_object('run_id',p_run_id,'clean',v_residual=0,'state','NOT_PROVISIONED',
      'event_rows',v_events,'connection_rows',v_connections,'nonce_rows',v_nonces,
      'enabled_entitlement_rows',v_entitlement,'unknown_event_rows',0,'unknown_connection_rows',0,'residual_rows',v_residual);
  end if;
  select count(*) into v_events from public.inspection_reminder_events where id=any(i.event_ids) and store_id=i.store_id;
  select count(*) into v_connections from public.line_link_connections where id=i.connection_id and store_id=i.store_id;
  select count(*) into v_nonces from public.line_link_inbound_nonces where store_id=i.store_id;
  select count(*) into v_entitlement from public.company_subscriptions where id=i.subscription_id and company_id=i.store_id and l_link_integration_enabled;
  select count(*) into v_unknown_events from public.inspection_reminder_events where store_id=i.store_id;
  select count(*) into v_unknown_connections from public.line_link_connections where store_id=i.store_id;
  v_residual:=v_events+v_connections+v_nonces+v_entitlement+v_unknown_events+v_unknown_connections;
  return jsonb_build_object('run_id',p_run_id,'clean',i.state='CLEANED' and v_residual=0,'state',i.state,'event_rows',v_events,'connection_rows',v_connections,
    'nonce_rows',v_nonces,'enabled_entitlement_rows',v_entitlement,'unknown_event_rows',v_unknown_events,
    'unknown_connection_rows',v_unknown_connections,'residual_rows',v_residual);
end;
$$;

revoke all on function public.qa_l_link_integration_provision(uuid,text) from public,anon,authenticated;
revoke all on function public.qa_l_link_integration_reset_event(uuid,uuid) from public,anon,authenticated;
revoke all on function public.qa_l_link_integration_dry_run(uuid) from public,anon,authenticated;
revoke all on function public.qa_l_link_integration_cleanup(uuid) from public,anon,authenticated;
revoke all on function public.qa_l_link_integration_verify_clean(uuid) from public,anon,authenticated;
grant execute on function public.qa_l_link_integration_provision(uuid,text) to service_role;
grant execute on function public.qa_l_link_integration_reset_event(uuid,uuid) to service_role;
grant execute on function public.qa_l_link_integration_dry_run(uuid) to service_role;
grant execute on function public.qa_l_link_integration_cleanup(uuid) to service_role;
grant execute on function public.qa_l_link_integration_verify_clean(uuid) to service_role;
alter function public.qa_l_link_integration_provision(uuid,text) owner to postgres;
alter function public.qa_l_link_integration_reset_event(uuid,uuid) owner to postgres;
alter function public.qa_l_link_integration_dry_run(uuid) owner to postgres;
alter function public.qa_l_link_integration_cleanup(uuid) owner to postgres;
alter function public.qa_l_link_integration_verify_clean(uuid) owner to postgres;

-- The readiness RPC is a closed list: all callable lifecycle functions must be
-- service_role-only and none may be callable by public/anon/authenticated.
create or replace function public.qa_lifecycle_cleanup_readiness()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_private_schema boolean; v_trigger boolean; v_public_execute integer; v_service_execute integer;
begin
  perform qa_internal.assert_operator();
  select not has_schema_privilege('anon','qa_internal','USAGE') and not has_schema_privilege('authenticated','qa_internal','USAGE') into v_private_schema;
  select exists(select 1 from pg_trigger where tgrelid='public.memberships'::regclass and tgname='guard_membership_owner_and_identity' and tgenabled<>'D') into v_trigger;
  select count(*) into v_public_execute from (values
    ('public.qa_lifecycle_register_run(uuid,text,text,text,text,timestamptz)'::regprocedure),('public.qa_lifecycle_transition(uuid,text,text,text,text,jsonb)'::regprocedure),('public.qa_lifecycle_register_fixture(uuid,uuid,text,uuid,uuid,uuid,text,text,timestamptz)'::regprocedure),('public.qa_lifecycle_teardown(uuid,boolean)'::regprocedure),('public.qa_lifecycle_verify_clean(uuid,boolean)'::regprocedure),('public.qa_lifecycle_finalize(uuid)'::regprocedure),('public.qa_lifecycle_status(uuid)'::regprocedure),('public.qa_lifecycle_abort_clean(uuid,text)'::regprocedure),('public.qa_lifecycle_record_evidence(uuid,text,jsonb)'::regprocedure),('public.qa_lifecycle_advance_cleanup(uuid,text,text,text)'::regprocedure),('public.qa_lifecycle_record_auth_evidence(uuid,uuid)'::regprocedure),('public.qa_lifecycle_record_verified_evidence(uuid,text,jsonb)'::regprocedure),('public.qa_lifecycle_record_public_marker_evidence(uuid)'::regprocedure),('public.qa_lifecycle_cta_matrix(uuid,text,jsonb)'::regprocedure),('public.qa_lifecycle_reclaim_expired_release_fixture(uuid)'::regprocedure),('public.qa_lifecycle_adopt_primary_unmarked_release_fixture(uuid,uuid,text,uuid,uuid,uuid,text,timestamptz)'::regprocedure),
    ('public.qa_l_link_integration_provision(uuid,text)'::regprocedure),('public.qa_l_link_integration_reset_event(uuid,uuid)'::regprocedure),('public.qa_l_link_integration_dry_run(uuid)'::regprocedure),('public.qa_l_link_integration_cleanup(uuid)'::regprocedure),('public.qa_l_link_integration_verify_clean(uuid)'::regprocedure)
  ) f(oid) where has_function_privilege('anon',f.oid,'EXECUTE') or has_function_privilege('authenticated',f.oid,'EXECUTE') or has_function_privilege('public',f.oid,'EXECUTE');
  select count(*) into v_service_execute from (values
    ('public.qa_lifecycle_register_run(uuid,text,text,text,text,timestamptz)'::regprocedure),('public.qa_lifecycle_transition(uuid,text,text,text,text,jsonb)'::regprocedure),('public.qa_lifecycle_register_fixture(uuid,uuid,text,uuid,uuid,uuid,text,text,timestamptz)'::regprocedure),('public.qa_lifecycle_teardown(uuid,boolean)'::regprocedure),('public.qa_lifecycle_verify_clean(uuid,boolean)'::regprocedure),('public.qa_lifecycle_finalize(uuid)'::regprocedure),('public.qa_lifecycle_status(uuid)'::regprocedure),('public.qa_lifecycle_abort_clean(uuid,text)'::regprocedure),('public.qa_lifecycle_record_evidence(uuid,text,jsonb)'::regprocedure),('public.qa_lifecycle_advance_cleanup(uuid,text,text,text)'::regprocedure),('public.qa_lifecycle_record_auth_evidence(uuid,uuid)'::regprocedure),('public.qa_lifecycle_record_verified_evidence(uuid,text,jsonb)'::regprocedure),('public.qa_lifecycle_record_public_marker_evidence(uuid)'::regprocedure),('public.qa_lifecycle_cta_matrix(uuid,text,jsonb)'::regprocedure),('public.qa_lifecycle_reclaim_expired_release_fixture(uuid)'::regprocedure),('public.qa_lifecycle_adopt_primary_unmarked_release_fixture(uuid,uuid,text,uuid,uuid,uuid,text,timestamptz)'::regprocedure),
    ('public.qa_l_link_integration_provision(uuid,text)'::regprocedure),('public.qa_l_link_integration_reset_event(uuid,uuid)'::regprocedure),('public.qa_l_link_integration_dry_run(uuid)'::regprocedure),('public.qa_l_link_integration_cleanup(uuid)'::regprocedure),('public.qa_l_link_integration_verify_clean(uuid)'::regprocedure)
  ) f(oid) where has_function_privilege('service_role',f.oid,'EXECUTE');
  return jsonb_build_object('ready',v_private_schema and v_trigger and v_public_execute=0 and v_service_execute=21,
    'private_schema',v_private_schema,'last_owner_guard_enabled',v_trigger,'public_execute_count',v_public_execute,
    'service_execute_count',v_service_execute,'dry_run_supported',true,'auth_hard_delete_path','admin-api',
    'cta_matrix','registry_bound','expired_release_recovery','service_role_only',
    'primary_unmarked_actual_email_adoption','service_role_only','line_link_integration_lifecycle','service_role_only');
end;
$$;
revoke all on function public.qa_lifecycle_cleanup_readiness() from public,anon,authenticated;
grant execute on function public.qa_lifecycle_cleanup_readiness() to service_role;
alter function public.qa_lifecycle_cleanup_readiness() owner to postgres;

notify pgrst,'reload schema';
commit;
