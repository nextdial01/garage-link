-- Restore QA-only evidence helpers missing from this Staging lifecycle installation.
begin;

create or replace function public.qa_lifecycle_record_auth_evidence(p_run_id uuid, p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r qa_internal.runs%rowtype; v_users bigint; v_sessions bigint; v_detail jsonb;
begin
  perform qa_internal.assert_operator(); select * into strict r from qa_internal.runs where run_id=p_run_id for update;
  select count(*) into v_users from auth.users where id=p_user_id;
  if to_regclass('auth.sessions') is not null then execute 'select count(*) from auth.sessions where user_id=$1' into v_sessions using p_user_id; else v_sessions:=0; end if;
  if v_users<>0 or v_sessions<>0 then raise exception 'AUTH_RESIDUAL_BLOCKS_COMPLETE'; end if;
  v_detail:=jsonb_build_object('run_id',p_run_id,'source_sha',r.source_sha,'deployment_id',r.deployment_id,'actor',session_user,'user_id',p_user_id,'auth_users',v_users,'auth_sessions',v_sessions,'observed_at',clock_timestamp());
  insert into qa_internal.evidence(run_id,evidence_kind,source_sha,deployment_id,actor,detail) values(p_run_id,'AUTH',r.source_sha,r.deployment_id,session_user,v_detail) on conflict (run_id,evidence_kind) do update set source_sha=excluded.source_sha,deployment_id=excluded.deployment_id,actor=excluded.actor,observed_at=clock_timestamp(),detail=excluded.detail;
  return v_detail;
end; $$;

create or replace function public.qa_lifecycle_record_verified_evidence(p_run_id uuid, p_evidence_kind text, p_observation jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r qa_internal.runs%rowtype; v_detail jsonb:=coalesce(p_observation,'{}'::jsonb); v_stamp timestamptz;
begin
  perform qa_internal.assert_operator(); select * into strict r from qa_internal.runs where run_id=p_run_id for update;
  if p_evidence_kind not in ('STORAGE','ARTIFACT','BYPASS') then raise exception 'EXTERNAL_EVIDENCE_KIND_INVALID'; end if;
  if v_detail->>'run_id'<>p_run_id::text or v_detail->>'source_sha'<>r.source_sha or v_detail->>'deployment_id'<>r.deployment_id then raise exception 'EVIDENCE_PROVENANCE_MISMATCH'; end if;
  if coalesce((v_detail->>'residual_count')::bigint,1)<>0 or v_detail->>'proof_sha' is null then raise exception 'VERIFIED_ZERO_PROOF_REQUIRED'; end if;
  v_stamp:=nullif(v_detail->>'observed_at','')::timestamptz;
  if v_stamp is null or v_stamp < r.updated_at then raise exception 'STALE_EVIDENCE_REJECTED'; end if;
  insert into qa_internal.evidence(run_id,evidence_kind,source_sha,deployment_id,actor,detail) values(p_run_id,p_evidence_kind,r.source_sha,r.deployment_id,coalesce(v_detail->>'actor',session_user),v_detail) on conflict (run_id,evidence_kind) do update set source_sha=excluded.source_sha,deployment_id=excluded.deployment_id,actor=excluded.actor,observed_at=clock_timestamp(),detail=excluded.detail;
  return v_detail;
end; $$;

create or replace function public.qa_lifecycle_record_public_marker_evidence(p_run_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r qa_internal.runs%rowtype; f qa_internal.fixtures%rowtype; c record; n bigint:=0; q text; v_detail jsonb;
begin
  perform qa_internal.assert_operator(); select * into strict r from qa_internal.runs where run_id=p_run_id for update; select * into strict f from qa_internal.fixtures where run_id=p_run_id;
  for c in select table_name,column_name from information_schema.columns where table_schema='public' and data_type in ('text','character varying','character') loop
    q:=format('select count(*) from public.%I where %I::text = any($1)',c.table_name,c.column_name);
    execute q into n using array[f.tenant_id::text,f.store_id::text,f.membership_id::text,f.user_id::text,f.marker,p_run_id::text];
    if n>0 then raise exception 'PUBLIC_MARKER_RESIDUAL:%:%:%',c.table_name,c.column_name,n; end if;
  end loop;
  v_detail:=jsonb_build_object('run_id',p_run_id,'source_sha',r.source_sha,'deployment_id',r.deployment_id,'actor',session_user,'residual_count',0,'observed_at',clock_timestamp());
  insert into qa_internal.evidence(run_id,evidence_kind,source_sha,deployment_id,actor,detail) values(p_run_id,'PUBLIC_MARKER',r.source_sha,r.deployment_id,session_user,v_detail) on conflict (run_id,evidence_kind) do update set source_sha=excluded.source_sha,deployment_id=excluded.deployment_id,actor=excluded.actor,observed_at=clock_timestamp(),detail=excluded.detail;
  return v_detail;
end; $$;

create or replace function public.qa_lifecycle_advance_cleanup(p_run_id uuid, p_expected_state text, p_next_state text, p_next_action text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r qa_internal.runs%rowtype;
begin
  perform qa_internal.assert_operator();
  select * into strict r from qa_internal.runs where run_id=p_run_id for update;
  if r.state<>p_expected_state or not qa_internal.transition_allowed(r.state,p_next_state) then raise exception 'CLEANUP_TRANSITION_INVALID'; end if;
  if not exists(select 1 from qa_internal.evidence where run_id=p_run_id and evidence_kind = case p_expected_state when 'DB_CLEANED' then 'AUTH' when 'AUTH_CLEANED' then 'STORAGE' when 'STORAGE_CLEANED' then 'ARTIFACT' else 'PUBLIC_MARKER' end) then raise exception 'CLEANUP_EVIDENCE_REQUIRED'; end if;
  update qa_internal.runs set state=p_next_state,last_successful_state=p_next_state,next_action=p_next_action,updated_at=clock_timestamp() where run_id=p_run_id;
  insert into qa_internal.state_events(run_id,from_state,to_state,next_action,safe_detail) values(p_run_id,p_expected_state,p_next_state,p_next_action,jsonb_build_object('dedicated_evidence_path',true));
  return jsonb_build_object('run_id',p_run_id,'state',p_next_state);
end; $$;

revoke all on function public.qa_lifecycle_advance_cleanup(uuid,text,text,text) from public, anon, authenticated;
revoke all on function public.qa_lifecycle_record_auth_evidence(uuid,uuid) from public, anon, authenticated;
revoke all on function public.qa_lifecycle_record_verified_evidence(uuid,text,jsonb) from public, anon, authenticated;
revoke all on function public.qa_lifecycle_record_public_marker_evidence(uuid) from public, anon, authenticated;
grant execute on function public.qa_lifecycle_advance_cleanup(uuid,text,text,text) to service_role;
grant execute on function public.qa_lifecycle_record_auth_evidence(uuid,uuid) to service_role;
grant execute on function public.qa_lifecycle_record_verified_evidence(uuid,text,jsonb) to service_role;
grant execute on function public.qa_lifecycle_record_public_marker_evidence(uuid) to service_role;
alter function public.qa_lifecycle_advance_cleanup(uuid,text,text,text) owner to postgres;
alter function public.qa_lifecycle_record_auth_evidence(uuid,uuid) owner to postgres;
alter function public.qa_lifecycle_record_verified_evidence(uuid,text,jsonb) owner to postgres;
alter function public.qa_lifecycle_record_public_marker_evidence(uuid) owner to postgres;

notify pgrst, 'reload schema';
commit;
