begin;

-- Repair a Staging-only QA schema drift where the lifecycle framework
-- functions remained but their private evidence table was absent.
create table if not exists qa_internal.evidence (
  evidence_id bigint generated always as identity primary key,
  run_id uuid not null references qa_internal.runs(run_id) on delete cascade,
  evidence_kind text not null check (
    evidence_kind in ('AUTH', 'STORAGE', 'ARTIFACT', 'BYPASS', 'PUBLIC_MARKER')
  ),
  source_sha text not null,
  deployment_id text not null,
  actor text not null check (char_length(actor) between 1 and 160),
  observed_at timestamptz not null default clock_timestamp(),
  detail jsonb not null default '{}'::jsonb,
  unique (run_id, evidence_kind)
);

alter table qa_internal.evidence owner to postgres;
revoke all on table qa_internal.evidence from public, anon, authenticated, service_role;
revoke all on sequence qa_internal.evidence_evidence_id_seq from public, anon, authenticated, service_role;

notify pgrst, 'reload schema';
commit;
