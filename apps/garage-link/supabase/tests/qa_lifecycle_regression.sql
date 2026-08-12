\set ON_ERROR_STOP on
begin;

do $$
begin
  if current_database()<>'postgres' or coalesce(current_setting('app.g0b_fixture',true),'')<>'enabled' then
    raise exception 'QA_LIFECYCLE_DISPOSABLE_DATABASE_REQUIRED';
  end if;
  if has_schema_privilege('anon','qa_internal','USAGE') or has_schema_privilege('authenticated','qa_internal','USAGE') then raise exception 'QA_REGISTRY_SCHEMA_EXPOSED'; end if;
  if has_function_privilege('anon','public.qa_lifecycle_teardown(uuid,boolean)','EXECUTE') or has_function_privilege('authenticated','public.qa_lifecycle_teardown(uuid,boolean)','EXECUTE') then raise exception 'QA_TEARDOWN_PUBLICLY_EXECUTABLE'; end if;
end $$;

select public.qa_lifecycle_register_run('61000000-0000-4000-8000-000000000001','local lifecycle regression','76cdc9656e9805d2ac61f961ff59b0a199475b3d','dpl_LocalLifecycle','test:qa-lifecycle',now()+interval '1 day');
do $$ begin
  begin perform public.qa_lifecycle_record_evidence('61000000-0000-4000-8000-000000000001','STORAGE','{"run_id":"61000000-0000-4000-8000-000000000001","residual_count":0}'::jsonb); raise exception 'CALLER_ZERO_ACCEPTED'; exception when raise_exception then if sqlerrm='CALLER_ZERO_ACCEPTED' then raise; end if; end;
end $$;
select public.qa_lifecycle_transition('61000000-0000-4000-8000-000000000001','CREATED','PREFLIGHT_RUNNING','preflight');
select public.qa_lifecycle_transition('61000000-0000-4000-8000-000000000001','PREFLIGHT_RUNNING','PREFLIGHT_READY','provision');
select public.qa_lifecycle_transition('61000000-0000-4000-8000-000000000001','PREFLIGHT_READY','PROVISIONING','provision');

insert into auth.users(id,email,raw_app_meta_data) values('61000000-0000-4000-8000-000000000010','qa.lifecycle.local@example.invalid','{"purpose":"qa-lifecycle-canary","run_id":"61000000-0000-4000-8000-000000000001"}'::jsonb);
select public.qa_lifecycle_register_fixture(
  '61000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-000000000020','[CANARY QA 20260804] Lifecycle Tenant',
  '61000000-0000-4000-8000-000000000030','61000000-0000-4000-8000-000000000010','61000000-0000-4000-8000-000000000040',
  'canary','[CANARY QA 20260804]',now()+interval '1 day');
select public.qa_lifecycle_provision_canary('61000000-0000-4000-8000-000000000001');
do $$ begin
  begin perform public.qa_lifecycle_record_auth_evidence('61000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-000000000010'); raise exception 'AUTH_RESIDUAL_ACCEPTED'; exception when raise_exception then if sqlerrm='AUTH_RESIDUAL_ACCEPTED' then raise; end if; end;
  begin perform public.qa_lifecycle_record_verified_evidence('61000000-0000-4000-8000-000000000001','STORAGE','{"run_id":"61000000-0000-4000-8000-000000000001","source_sha":"wrong","deployment_id":"dpl_LocalLifecycle","residual_count":0,"proof_sha":"x","observed_at":"2099-01-01T00:00:00Z"}'::jsonb); raise exception 'SOURCE_MISMATCH_ACCEPTED'; exception when raise_exception then if sqlerrm='SOURCE_MISMATCH_ACCEPTED' then raise; end if; end;
  begin perform public.qa_lifecycle_record_verified_evidence('61000000-0000-4000-8000-000000000001','STORAGE','{"run_id":"61000000-0000-4000-8000-000000000001","source_sha":"76cdc9656e9805d2ac61f961ff59b0a199475b3d","deployment_id":"dpl_LocalLifecycle","residual_count":1,"proof_sha":"x","observed_at":"2099-01-01T00:00:00Z"}'::jsonb); raise exception 'STORAGE_RESIDUAL_ACCEPTED'; exception when raise_exception then if sqlerrm='STORAGE_RESIDUAL_ACCEPTED' then raise; end if; end;
end $$;

do $$ begin
  begin delete from public.memberships where id='61000000-0000-4000-8000-000000000040'; raise exception 'NORMAL_LAST_OWNER_GUARD_BYPASSED';
  exception when check_violation then if sqlerrm not like '%最後のowner%' then raise; end if; end;
  begin perform public.qa_lifecycle_register_fixture('61000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-000000000020','Mismatch','61000000-0000-4000-8000-000000000030','61000000-0000-4000-8000-000000000010','61000000-0000-4000-8000-000000000040','canary','[CANARY QA 20260804]',now()+interval '1 day');raise exception 'NAME_MARKER_MISMATCH_ACCEPTED';exception when check_violation or raise_exception then if sqlerrm='NAME_MARKER_MISMATCH_ACCEPTED' then raise; end if;end;
end $$;

select public.qa_lifecycle_transition('61000000-0000-4000-8000-000000000001','PROVISIONING','PROVISIONED','auth');
do $$ begin if public.release_qa_admin_bootstrap_context('61000000-0000-4000-8000-000000000010','61000000-0000-4000-8000-000000000050','preview')->>'tenant_id'<>'61000000-0000-4000-8000-000000000020' then raise exception 'CANARY_PREVIEW_AUTH_FAILED';end if;end $$;
select public.qa_lifecycle_transition('61000000-0000-4000-8000-000000000001','PROVISIONED','AUTH_READY','run');
select public.qa_lifecycle_transition('61000000-0000-4000-8000-000000000001','AUTH_READY','TEST_RUNNING','run');
select public.qa_lifecycle_transition('61000000-0000-4000-8000-000000000001','TEST_RUNNING','TEST_COMPLETE','teardown-dry-run');
select public.qa_lifecycle_transition('61000000-0000-4000-8000-000000000001','TEST_COMPLETE','TEARDOWN_DRY_RUN','teardown-dry-run');
do $$ declare v jsonb;begin v:=public.qa_lifecycle_teardown('61000000-0000-4000-8000-000000000001',true);if v->>'ready'<>'true' or (v->'counts'->>'tenants')::int<>1 then raise exception 'DRY_RUN_CONTRACT_FAILED:%',v;end if;end $$;
select public.qa_lifecycle_transition('61000000-0000-4000-8000-000000000001','TEARDOWN_DRY_RUN','TEARDOWN_READY','teardown');
select public.qa_lifecycle_transition('61000000-0000-4000-8000-000000000001','TEARDOWN_READY','TEARING_DOWN','teardown');
select public.qa_lifecycle_teardown('61000000-0000-4000-8000-000000000001',false);
do $$ begin if exists(select 1 from public.tenants where id='61000000-0000-4000-8000-000000000020') or exists(select 1 from public.stores where id='61000000-0000-4000-8000-000000000030') or exists(select 1 from public.memberships where id='61000000-0000-4000-8000-000000000040') then raise exception 'DB_RESIDUAL_REMAINS';end if;end $$;
delete from auth.users where id='61000000-0000-4000-8000-000000000010';
select public.qa_lifecycle_record_auth_evidence('61000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-000000000010');
select public.qa_lifecycle_advance_cleanup('61000000-0000-4000-8000-000000000001','DB_CLEANED','AUTH_CLEANED','storage-clean');
select public.qa_lifecycle_record_verified_evidence('61000000-0000-4000-8000-000000000001','STORAGE',jsonb_build_object('run_id','61000000-0000-4000-8000-000000000001','source_sha','76cdc9656e9805d2ac61f961ff59b0a199475b3d','deployment_id','dpl_LocalLifecycle','actor','test','residual_count',0,'proof_sha','test-proof','observed_at',clock_timestamp()));
select public.qa_lifecycle_advance_cleanup('61000000-0000-4000-8000-000000000001','AUTH_CLEANED','STORAGE_CLEANED','artifact-clean');
select public.qa_lifecycle_record_verified_evidence('61000000-0000-4000-8000-000000000001','ARTIFACT',jsonb_build_object('run_id','61000000-0000-4000-8000-000000000001','source_sha','76cdc9656e9805d2ac61f961ff59b0a199475b3d','deployment_id','dpl_LocalLifecycle','actor','test','residual_count',0,'proof_sha','test-proof','observed_at',clock_timestamp()));
select public.qa_lifecycle_record_verified_evidence('61000000-0000-4000-8000-000000000001','BYPASS',jsonb_build_object('run_id','61000000-0000-4000-8000-000000000001','source_sha','76cdc9656e9805d2ac61f961ff59b0a199475b3d','deployment_id','dpl_LocalLifecycle','actor','test','residual_count',0,'proof_sha','test-proof','observed_at',clock_timestamp()));
select public.qa_lifecycle_record_public_marker_evidence('61000000-0000-4000-8000-000000000001');
select public.qa_lifecycle_advance_cleanup('61000000-0000-4000-8000-000000000001','STORAGE_CLEANED','ARTIFACTS_CLEANED','verify-clean');
select public.qa_lifecycle_verify_clean('61000000-0000-4000-8000-000000000001',true);
select public.qa_lifecycle_finalize('61000000-0000-4000-8000-000000000001');
do $$ begin if (public.qa_lifecycle_status('61000000-0000-4000-8000-000000000001')->>'state')<>'COMPLETE' then raise exception 'RUN_NOT_COMPLETE';end if;if exists(select 1 from qa_internal.fixtures where run_id='61000000-0000-4000-8000-000000000001') then raise exception 'REGISTRY_FIXTURE_RESIDUAL';end if;end $$;
do $$ begin begin perform public.qa_lifecycle_finalize('61000000-0000-4000-8000-000000000002'); raise exception 'MISSING_EVIDENCE_FINALIZE_ACCEPTED'; exception when raise_exception then if sqlerrm='MISSING_EVIDENCE_FINALIZE_ACCEPTED' then raise; end if; end; end $$;

select public.qa_lifecycle_register_run('61000000-0000-4000-8000-000000000002','retry regression','76cdc9656e9805d2ac61f961ff59b0a199475b3d','dpl_LocalRetry','test:retry',now()+interval '1 day');
select public.qa_lifecycle_transition('61000000-0000-4000-8000-000000000002','CREATED','PREFLIGHT_RUNNING','preflight');
select public.qa_lifecycle_transition('61000000-0000-4000-8000-000000000002','PREFLIGHT_RUNNING','FAILED_RECOVERABLE','preflight','EXECUTION_LIFECYCLE');
select public.qa_lifecycle_transition('61000000-0000-4000-8000-000000000002','FAILED_RECOVERABLE','PREFLIGHT_RUNNING','preflight');
select public.qa_lifecycle_transition('61000000-0000-4000-8000-000000000002','PREFLIGHT_RUNNING','FAILED_RECOVERABLE','preflight','EXECUTION_LIFECYCLE');
select public.qa_lifecycle_transition('61000000-0000-4000-8000-000000000002','FAILED_RECOVERABLE','PREFLIGHT_RUNNING','preflight');
do $$ begin begin perform public.qa_lifecycle_transition('61000000-0000-4000-8000-000000000002','PREFLIGHT_RUNNING','FAILED_RECOVERABLE','preflight','EXECUTION_LIFECYCLE'); raise exception 'THIRD_RETRY_ACCEPTED'; exception when raise_exception then if sqlerrm='THIRD_RETRY_ACCEPTED' then raise; end if; end; end $$;
select public.qa_lifecycle_register_run('61000000-0000-4000-8000-000000000003','abort regression','76cdc9656e9805d2ac61f961ff59b0a199475b3d','dpl_LocalAbort','test:abort',now()+interval '1 day');
select public.qa_lifecycle_abort_clean('61000000-0000-4000-8000-000000000003','negative-test');
do $$ begin begin perform public.qa_lifecycle_transition('61000000-0000-4000-8000-000000000003','ABORTED_CLEAN','CREATED','preflight'); raise exception 'ABORT_RESUME_ACCEPTED'; exception when raise_exception then if sqlerrm='ABORT_RESUME_ACCEPTED' then raise; end if; end; end $$;

-- CTA account-state matrix: every comparison fixture is registry-bound,
-- service-role-only, reset without disabling the owner trigger, and read back
-- to zero before its synthetic Auth users are hard-deleted.
do $$
begin
  if has_function_privilege('anon','public.qa_lifecycle_cta_matrix(uuid,text,jsonb)','EXECUTE') or has_function_privilege('authenticated','public.qa_lifecycle_cta_matrix(uuid,text,jsonb)','EXECUTE') then raise exception 'CTA_MATRIX_PUBLIC_EXECUTE'; end if;
  if has_function_privilege('anon','public.qa_lifecycle_reclaim_expired_release_fixture(uuid)','EXECUTE') or has_function_privilege('authenticated','public.qa_lifecycle_reclaim_expired_release_fixture(uuid)','EXECUTE') then raise exception 'EXPIRED_RELEASE_RECOVERY_PUBLIC_EXECUTE'; end if;
  if (public.qa_lifecycle_cleanup_readiness()->>'ready')<>'true' or (public.qa_lifecycle_cleanup_readiness()->>'service_execute_count')::integer<>15 or (public.qa_lifecycle_cleanup_readiness()->>'expired_release_recovery')<>'service_role_only' then raise exception 'CTA_MATRIX_READINESS_FAILED'; end if;
end $$;

-- An expired, exact registry-bound release fixture is renewed only through the
-- service-role lifecycle recovery function. The normal owner guard remains in
-- place; this test merely proves the formal recovery can hand the fixture back
-- to standard adoption/teardown without a raw delete or privilege widening.
select public.qa_lifecycle_register_run('65000000-0000-4000-8000-000000000001','release-critical-acquisition','76cdc9656e9805d2ac61f961ff59b0a199475b3d','dpl_LocalExpired','test:expired-recovery',now()+interval '1 day');
select public.qa_lifecycle_transition('65000000-0000-4000-8000-000000000001','CREATED','PREFLIGHT_RUNNING','preflight');
select public.qa_lifecycle_transition('65000000-0000-4000-8000-000000000001','PREFLIGHT_RUNNING','PREFLIGHT_READY','signup-lifecycle-registered');
select public.qa_lifecycle_transition('65000000-0000-4000-8000-000000000001','PREFLIGHT_READY','PROVISIONING','adopt-signup-fixture');
insert into auth.users(id,email,raw_app_meta_data) values('65000000-0000-4000-8000-000000000010','qa.expired.release@example.invalid','{"release_qa_run_id":"65000000-0000-4000-8000-000000000001"}'::jsonb);
insert into public.tenants(id,name,status,plan_code,created_by,updated_by) values('65000000-0000-4000-8000-000000000020','[RELEASE QA 20260812] Expired Tenant','active','free','65000000-0000-4000-8000-000000000010','65000000-0000-4000-8000-000000000010');
insert into public.stores(id,name,company_name,email,status,plan_code,tenant_id,created_by,updated_by,onboarding_completed_at) values('65000000-0000-4000-8000-000000000030','[RELEASE QA 20260812] Expired Store','Expired QA','qa.expired.release@example.invalid','active','free','65000000-0000-4000-8000-000000000020','65000000-0000-4000-8000-000000000010','65000000-0000-4000-8000-000000000010',clock_timestamp());
insert into public.memberships(id,tenant_id,store_id,user_id,email,role,status,joined_at,invite_accepted_at,created_by,updated_by) values('65000000-0000-4000-8000-000000000040','65000000-0000-4000-8000-000000000020','65000000-0000-4000-8000-000000000030','65000000-0000-4000-8000-000000000010','qa.expired.release@example.invalid','owner','active',clock_timestamp(),clock_timestamp(),'65000000-0000-4000-8000-000000000010','65000000-0000-4000-8000-000000000010');
select public.qa_lifecycle_register_fixture('65000000-0000-4000-8000-000000000001','65000000-0000-4000-8000-000000000020','[RELEASE QA 20260812] Expired Tenant','65000000-0000-4000-8000-000000000030','65000000-0000-4000-8000-000000000010','65000000-0000-4000-8000-000000000040','release','[RELEASE QA 20260812]',now()+interval '1 day');
update qa_internal.runs set created_at=clock_timestamp()-interval '3 days',cleanup_deadline=clock_timestamp()-interval '1 hour' where run_id='65000000-0000-4000-8000-000000000001';
update qa_internal.fixtures set created_at=clock_timestamp()-interval '3 days',expires_at=clock_timestamp()-interval '1 hour' where run_id='65000000-0000-4000-8000-000000000001';
do $$ declare v jsonb; begin
  v:=public.qa_lifecycle_reclaim_expired_release_fixture('65000000-0000-4000-8000-000000000001');
  if v->>'reclaimed'<>'true' or v->>'state'<>'PROVISIONING' then raise exception 'EXPIRED_RELEASE_RECOVERY_FAILED'; end if;
  if (select cleanup_deadline>clock_timestamp() from qa_internal.runs where run_id='65000000-0000-4000-8000-000000000001') is not true or (select expires_at>clock_timestamp() from qa_internal.fixtures where run_id='65000000-0000-4000-8000-000000000001') is not true then raise exception 'EXPIRED_RELEASE_RECOVERY_DATES_INVALID'; end if;
end $$;

select public.qa_lifecycle_register_run('63000000-0000-4000-8000-000000000001','cta matrix regression','76cdc9656e9805d2ac61f961ff59b0a199475b3d','dpl_LocalMatrix','test:cta-matrix',now()+interval '1 day');
select public.qa_lifecycle_transition('63000000-0000-4000-8000-000000000001','CREATED','PREFLIGHT_RUNNING','preflight');
select public.qa_lifecycle_transition('63000000-0000-4000-8000-000000000001','PREFLIGHT_RUNNING','PREFLIGHT_READY','provision');
select public.qa_lifecycle_transition('63000000-0000-4000-8000-000000000001','PREFLIGHT_READY','PROVISIONING','provision');
insert into auth.users(id,email,raw_app_meta_data) values('63000000-0000-4000-8000-000000000010','qa.lifecycle.matrix.primary@example.invalid','{"purpose":"qa-lifecycle-canary","run_id":"63000000-0000-4000-8000-000000000001"}'::jsonb);
select public.qa_lifecycle_register_fixture('63000000-0000-4000-8000-000000000001','63000000-0000-4000-8000-000000000020','[RELEASE QA 20260812] Matrix Primary Tenant','63000000-0000-4000-8000-000000000030','63000000-0000-4000-8000-000000000010','63000000-0000-4000-8000-000000000040','canary','[RELEASE QA 20260812]',now()+interval '1 day');
select public.qa_lifecycle_provision_canary('63000000-0000-4000-8000-000000000001');
select public.qa_lifecycle_transition('63000000-0000-4000-8000-000000000001','PROVISIONING','PROVISIONED','auth');
select public.qa_lifecycle_transition('63000000-0000-4000-8000-000000000001','PROVISIONED','AUTH_READY','run');
select public.qa_lifecycle_transition('63000000-0000-4000-8000-000000000001','AUTH_READY','TEST_RUNNING','run');
insert into auth.users(id,email,raw_app_meta_data) values
  ('64000000-0000-4000-8000-000000000001','qa.cta.matrix.1@example.invalid','{"purpose":"release-cta-matrix","release_qa_cta_matrix_run_id":"63000000-0000-4000-8000-000000000001"}'::jsonb),
  ('64000000-0000-4000-8000-000000000002','qa.cta.matrix.2@example.invalid','{"purpose":"release-cta-matrix","release_qa_cta_matrix_run_id":"63000000-0000-4000-8000-000000000001"}'::jsonb),
  ('64000000-0000-4000-8000-000000000003','qa.cta.matrix.3@example.invalid','{"purpose":"release-cta-matrix","release_qa_cta_matrix_run_id":"63000000-0000-4000-8000-000000000001"}'::jsonb),
  ('64000000-0000-4000-8000-000000000004','qa.cta.matrix.4@example.invalid','{"purpose":"release-cta-matrix","release_qa_cta_matrix_run_id":"63000000-0000-4000-8000-000000000001"}'::jsonb),
  ('64000000-0000-4000-8000-000000000005','qa.cta.matrix.5@example.invalid','{"purpose":"release-cta-matrix","release_qa_cta_matrix_run_id":"63000000-0000-4000-8000-000000000001"}'::jsonb),
  ('64000000-0000-4000-8000-000000000006','qa.cta.matrix.6@example.invalid','{"purpose":"release-cta-matrix","release_qa_cta_matrix_run_id":"63000000-0000-4000-8000-000000000001"}'::jsonb),
  ('64000000-0000-4000-8000-000000000007','qa.cta.matrix.7@example.invalid','{"purpose":"release-cta-matrix","release_qa_cta_matrix_run_id":"63000000-0000-4000-8000-000000000001"}'::jsonb);
do $$
declare v jsonb; ids jsonb;
begin
  v:=public.qa_lifecycle_cta_matrix('63000000-0000-4000-8000-000000000001','provision',jsonb_build_object(
    'active_owner',jsonb_build_object('subject_user_id','64000000-0000-4000-8000-000000000001'),
    'active_non_owner',jsonb_build_object('subject_user_id','64000000-0000-4000-8000-000000000002','support_user_id','64000000-0000-4000-8000-000000000007'),
    'selection_required',jsonb_build_object('subject_user_id','64000000-0000-4000-8000-000000000003'),
    'onboarding_incomplete',jsonb_build_object('subject_user_id','64000000-0000-4000-8000-000000000004'),
    'contract_restricted',jsonb_build_object('subject_user_id','64000000-0000-4000-8000-000000000005'),
    'admin_security_unverified',jsonb_build_object('subject_user_id','64000000-0000-4000-8000-000000000006')
  ));
  if v->>'state'<>'PROVISIONED' or (v->>'fixture_count')::integer<>6 or (select count(*) from qa_internal.cta_matrix_fixtures where run_id='63000000-0000-4000-8000-000000000001')<>6 then raise exception 'CTA_MATRIX_PROVISION_CONTRACT'; end if;
  if not exists(
    select 1
    from qa_internal.cta_matrix_fixtures f
    join public.company_subscriptions s on s.tenant_id=f.tenant_id and s.company_id=f.primary_store_id
    where f.run_id='63000000-0000-4000-8000-000000000001'
      and f.state='active_non_owner'
      and s.plan='standard'
      and s.status='active'
      and s.included_staff_count=3
  ) then raise exception 'CTA_MATRIX_NON_OWNER_PLAN_CONTRACT'; end if;
  if not exists(
    select 1
    from qa_internal.cta_matrix_fixtures f
    join public.company_subscriptions s on s.tenant_id=f.tenant_id and s.company_id=f.primary_store_id
    where f.run_id='63000000-0000-4000-8000-000000000001'
      and f.state='selection_required'
      and s.plan='pro'
      and s.status='active'
      and s.included_store_count=3
  ) then raise exception 'CTA_MATRIX_SELECTION_PLAN_CONTRACT'; end if;
  begin
    delete from public.memberships where id=(select subject_membership_id from qa_internal.cta_matrix_fixtures where run_id='63000000-0000-4000-8000-000000000001' and state='active_owner');
    raise exception 'CTA_MATRIX_DIRECT_OWNER_DELETE_ACCEPTED';
  exception when others then if sqlerrm='CTA_MATRIX_DIRECT_OWNER_DELETE_ACCEPTED' then raise; end if; end;
  v:=public.qa_lifecycle_cta_matrix('63000000-0000-4000-8000-000000000001','reset','{}'::jsonb);
  ids:=v->'auth_user_ids';
  if v->>'state'<>'DB_CLEANED' or jsonb_array_length(ids)<>7 or exists(select 1 from qa_internal.cta_matrix_fixtures where run_id='63000000-0000-4000-8000-000000000001') then raise exception 'CTA_MATRIX_RESET_CONTRACT'; end if;
  delete from auth.users where id in (select value::uuid from jsonb_array_elements_text(ids));
  v:=public.qa_lifecycle_cta_matrix('63000000-0000-4000-8000-000000000001','verify_clean',jsonb_build_object('auth_user_ids',ids));
  if v->>'clean'<>'true' then raise exception 'CTA_MATRIX_VERIFY_CLEAN_FAILED'; end if;
end $$;

-- Owner Preview contract regression: synthetic-only, service_role-only, and reset-safe.
do $$ declare v jsonb; t uuid; s uuid; m uuid; begin
  if has_function_privilege('anon','public.qa_owner_preview_ensure_fixture(text,text,text,text,uuid)','EXECUTE') or has_function_privilege('authenticated','public.qa_owner_preview_ensure_fixture(text,text,text,text,uuid)','EXECUTE') then raise exception 'OWNER_PREVIEW_PUBLIC_EXECUTE'; end if;
  insert into auth.users(id,email,raw_user_meta_data) values('62000000-0000-4000-8000-000000000010','owner.preview.qa@example.invalid','{"purpose":"owner-preview","marker":"[OWNER PREVIEW QA 20260804]"}'::jsonb);
  v:=public.qa_owner_preview_ensure_fixture('preview','gaytoojzwqkpuvfofeql','owner-preview','[OWNER PREVIEW QA 20260804]','62000000-0000-4000-8000-000000000010');
  t:=(v->>'tenant_id')::uuid; s:=(v->>'store_id')::uuid; m:=(v->>'membership_id')::uuid;
  if v->>'user_id'<>'62000000-0000-4000-8000-000000000010' or v->>'purpose'<>'owner-preview' or v->>'marker'<>'[OWNER PREVIEW QA 20260804]' then raise exception 'OWNER_PREVIEW_ENSURE_CONTRACT'; end if;
  if (public.qa_owner_preview_status('preview','gaytoojzwqkpuvfofeql','owner-preview','[OWNER PREVIEW QA 20260804]')->>'tenant_id') is null then raise exception 'OWNER_PREVIEW_STATUS_CONTRACT'; end if;
  insert into public.admin_trusted_sessions(user_id,session_id,device_token_hash,expires_at) values('62000000-0000-4000-8000-000000000010','62000000-0000-4000-8000-000000000011','qa-owner-preview-hash',now()+interval '1 day');
  insert into public.admin_email_otp_challenges(user_id,session_id,email_hash,code_hash,expires_at) values('62000000-0000-4000-8000-000000000010','62000000-0000-4000-8000-000000000011','qa-owner-preview-email-hash','qa-owner-preview-code',now()+interval '1 day');
  begin delete from public.memberships where id=m; raise exception 'OWNER_PREVIEW_DIRECT_DELETE_ACCEPTED'; exception when others then if sqlerrm='OWNER_PREVIEW_DIRECT_DELETE_ACCEPTED' then raise; end if; end;
  begin perform public.qa_owner_preview_ensure_fixture('preview','wmlpuzuskfiwdipluglz','owner-preview','[OWNER PREVIEW QA 20260804]','62000000-0000-4000-8000-000000000010'); raise exception 'OWNER_PREVIEW_PRODUCTION_ACCEPTED'; exception when raise_exception then if sqlerrm='OWNER_PREVIEW_PRODUCTION_ACCEPTED' then raise; end if; end;
  begin perform public.qa_owner_preview_ensure_fixture('production','gaytoojzwqkpuvfofeql','owner-preview','[OWNER PREVIEW QA 20260804]','62000000-0000-4000-8000-000000000010'); raise exception 'OWNER_PREVIEW_ENVIRONMENT_ACCEPTED'; exception when raise_exception then if sqlerrm='OWNER_PREVIEW_ENVIRONMENT_ACCEPTED' then raise; end if; end;
  v:=public.qa_owner_preview_reset_fixture('preview','gaytoojzwqkpuvfofeql','owner-preview','[OWNER PREVIEW QA 20260804]');
  if v->>'reset'<>'true' then raise exception 'OWNER_PREVIEW_RESET_FAILED'; end if;
  v:=public.qa_owner_preview_reset_fixture('preview','gaytoojzwqkpuvfofeql','owner-preview','[OWNER PREVIEW QA 20260804]');
  if v->>'reset'<>'false' then raise exception 'OWNER_PREVIEW_RESET_NOT_IDEMPOTENT'; end if;
  if exists(select 1 from qa_internal.owner_preview_fixtures where purpose='owner-preview') or exists(select 1 from public.company_subscriptions where tenant_id=t and company_id=s) or exists(select 1 from public.membership_store_assignments where membership_id=m and tenant_id=t and store_id=s) or exists(select 1 from public.memberships where id=m and tenant_id=t and store_id=s and user_id='62000000-0000-4000-8000-000000000010') or exists(select 1 from public.stores where id=s and tenant_id=t) or exists(select 1 from public.tenants where id=t) or exists(select 1 from public.admin_trusted_sessions where user_id='62000000-0000-4000-8000-000000000010') or exists(select 1 from public.admin_email_otp_challenges where user_id='62000000-0000-4000-8000-000000000010') then raise exception 'OWNER_PREVIEW_RESIDUAL'; end if;
  if not exists(select 1 from pg_trigger where tgname='guard_membership_owner_and_identity' and tgrelid='public.memberships'::regclass and tgenabled='O') then raise exception 'OWNER_PREVIEW_TRIGGER_NOT_ENABLED'; end if;
  if position('drop trigger' in lower(pg_get_functiondef('public.qa_owner_preview_reset_fixture(text,text,text,text)'::regprocedure)))>0 then raise exception 'OWNER_PREVIEW_DROP_TRIGGER_PRESENT'; end if;
  delete from auth.users where id='62000000-0000-4000-8000-000000000010';
end $$;

rollback;
