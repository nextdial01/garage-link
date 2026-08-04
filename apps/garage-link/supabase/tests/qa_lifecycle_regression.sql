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
select public.qa_lifecycle_transition('61000000-0000-4000-8000-000000000001','DB_CLEANED','AUTH_CLEANED','teardown');
select public.qa_lifecycle_transition('61000000-0000-4000-8000-000000000001','AUTH_CLEANED','ARTIFACT_CLEANED','verify-clean');
select public.qa_lifecycle_verify_clean('61000000-0000-4000-8000-000000000001',true);
select public.qa_lifecycle_finalize('61000000-0000-4000-8000-000000000001');
do $$ begin if (public.qa_lifecycle_status('61000000-0000-4000-8000-000000000001')->>'state')<>'COMPLETE' then raise exception 'RUN_NOT_COMPLETE';end if;if exists(select 1 from qa_internal.fixtures where run_id='61000000-0000-4000-8000-000000000001') then raise exception 'REGISTRY_FIXTURE_RESIDUAL';end if;end $$;

rollback;
