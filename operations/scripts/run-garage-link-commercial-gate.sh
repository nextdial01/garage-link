#!/usr/bin/env bash
set -euo pipefail
set +x

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
APP="$ROOT/apps/garage-link"
GRAPH="$ROOT/operations/commercial/phase-a-checkpoints.json"
POSTGRES_IMAGE=''; POSTGRES_DIGEST=''
AUTH_IMAGE=''; AUTH_DIGEST=''
STORAGE_IMAGE=''; STORAGE_DIGEST=''
PASSWORD='garage-link-local-disposable-db'
RUN_ID="${PPID}-$$"
FRESH="garage-commercial-fresh-$RUN_ID"
UPGRADE="garage-commercial-upgrade-$RUN_ID"
RESTORE="garage-commercial-restore-$RUN_ID"
AUTH_FRESH="garage-commercial-auth-fresh-$RUN_ID"
AUTH_UPGRADE="garage-commercial-auth-upgrade-$RUN_ID"
AUTH_RESTORE="garage-commercial-auth-restore-$RUN_ID"
TEMP_ROOT=''
EVIDENCE=''
BUNDLE=''
CERT_DIR=''
STATE_DIR_ARG=''
STOP_AFTER=''
STATE_BINDING_HASH=''

cleanup() {
  local status=$?
  if [[ $status -ne 0 && -n "$STATE_DIR_ARG" ]]; then
    unset GARAGE_LINK_STAGING_DB_URL PGHOST PGPORT PGDATABASE PGUSER PGPASSWORD PGSSLMODE PGSSLROOTCERT
    return "$status"
  fi
  docker rm -f "$AUTH_FRESH" "$AUTH_UPGRADE" "$AUTH_RESTORE" "$FRESH" "$UPGRADE" "$RESTORE" >/dev/null 2>&1 || true
  unset GARAGE_LINK_STAGING_DB_URL PGHOST PGPORT PGDATABASE PGUSER PGPASSWORD PGSSLMODE PGSSLROOTCERT
  if [[ -n "$TEMP_ROOT" && -d "$TEMP_ROOT" && -z "$STATE_DIR_ARG" && "${GARAGE_LINK_GATE_KEEP_EVIDENCE:-0}" != '1' ]]; then
    rm -rf "$TEMP_ROOT"
  fi
  return "$status"
}
trap cleanup EXIT INT TERM HUP

die() { printf '%s\n' "$1" >&2; exit 2; }
need() { command -v "$1" >/dev/null 2>&1 || die "COMMAND_MISSING:$1"; }

assert_image() {
  local image="$1" digest="$2" repository actual
  repository="${image%:*}"
  actual="$(docker image inspect "$image" --format '{{index .RepoDigests 0}}' 2>/dev/null || true)"
  [[ "$actual" == "$repository@$digest" ]] || die "PROVIDER_IDENTITY_MISMATCH:$image"
}

load_provider_contract() {
  local provider image digest
  while IFS=$'\t' read -r provider image digest; do
    case "$provider" in
      postgres) POSTGRES_IMAGE="$image"; POSTGRES_DIGEST="$digest" ;;
      gotrue) AUTH_IMAGE="$image"; AUTH_DIGEST="$digest" ;;
      storage) STORAGE_IMAGE="$image"; STORAGE_DIGEST="$digest" ;;
      *) die "PROVIDER_CONTRACT_UNKNOWN:$provider" ;;
    esac
  done < <(node - "$GRAPH" <<'NODE'
const fs=require('node:fs');
const graph=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
for(const [provider,identity] of Object.entries(graph.providerIdentities)) process.stdout.write(`${provider}\t${identity.image}\t${identity.digest}\n`);
NODE
)
  [[ -n "$POSTGRES_IMAGE" && -n "$AUTH_IMAGE" && -n "$STORAGE_IMAGE" ]] || die 'PROVIDER_CONTRACT_INCOMPLETE'
}

configure_run_names() {
  RUN_ID="$(printf '%s' "$TEMP_ROOT" | shasum -a 256 | cut -c1-12)"
  FRESH="garage-commercial-fresh-$RUN_ID"
  UPGRADE="garage-commercial-upgrade-$RUN_ID"
  RESTORE="garage-commercial-restore-$RUN_ID"
  AUTH_FRESH="garage-commercial-auth-fresh-$RUN_ID"
  AUTH_UPGRADE="garage-commercial-auth-upgrade-$RUN_ID"
  AUTH_RESTORE="garage-commercial-auth-restore-$RUN_ID"
}

prepare() {
  need docker; need node; need supabase; need openssl; need git; need rg
  [[ -f "$GRAPH" ]] || die 'PHASE_A_GRAPH_MISSING'
  [[ -f "$APP/supabase/baseline/manifest.json" ]] || die 'MIGRATION_MANIFEST_MISSING'
  load_provider_contract
  assert_image "$POSTGRES_IMAGE" "$POSTGRES_DIGEST"
  assert_image "$AUTH_IMAGE" "$AUTH_DIGEST"
  assert_image "$STORAGE_IMAGE" "$STORAGE_DIGEST"
  node "$ROOT/operations/tests/verify-garage-link-commercial-contract.mjs" "$ROOT" >/dev/null
  if [[ -n "$STATE_DIR_ARG" ]]; then
    TEMP_ROOT="$(cd "$(dirname "$STATE_DIR_ARG")" && pwd)/$(basename "$STATE_DIR_ARG")"
    mkdir -p "$TEMP_ROOT"
  else
    TEMP_ROOT="$(mktemp -d "$ROOT/.garage-commercial-gate.XXXXXX")"
  fi
  configure_run_names
  EVIDENCE="$TEMP_ROOT/evidence"
  BUNDLE="$TEMP_ROOT/bundle"
  CERT_DIR="$TEMP_ROOT/cert"
  mkdir -p "$EVIDENCE" "$CERT_DIR"
  if [[ ! -f "$BUNDLE/bundle-manifest.json" ]]; then
    node "$ROOT/operations/scripts/build-garage-link-local-bundle.mjs" "$ROOT" "$BUNDLE" > "$EVIDENCE/bundle.json"
  fi
  initialize_or_verify_state
}

write_state_binding_candidate() {
  local target="$1"
  {
    printf 'HEAD=%s\n' "$(git -C "$ROOT" rev-parse HEAD)"
    printf 'GRAPH=%s\n' "$(shasum -a 256 "$GRAPH" | awk '{print $1}')"
    printf 'RUNNER=%s\n' "$(shasum -a 256 "$ROOT/operations/scripts/run-garage-link-commercial-gate.sh" | awk '{print $1}')"
    printf 'BUNDLE_BUILDER=%s\n' "$(shasum -a 256 "$ROOT/operations/scripts/build-garage-link-local-bundle.mjs" | awk '{print $1}')"
    printf 'BUNDLE_MANIFEST=%s\n' "$(shasum -a 256 "$BUNDLE/bundle-manifest.json" | awk '{print $1}')"
    printf 'PROVIDER_INVENTORY=%s\n' "$(shasum -a 256 "$ROOT/operations/tests/garage-link-provider-blocking-inventory.sql" | awk '{print $1}')"
  } > "$target"
}

initialize_or_verify_state() {
  local binding="$TEMP_ROOT/state-binding" candidate="$TEMP_ROOT/.state-binding.current" secret="$TEMP_ROOT/state-secret"
  write_state_binding_candidate "$candidate"
  if [[ -f "$binding" ]]; then
    [[ -f "$secret" ]] || die 'RESUME_STATE_SECRET_MISSING'
    cmp -s "$binding" "$candidate" || die 'RESUME_STATE_BINDING_MISMATCH'
    rm -f "$candidate"
  else
    if find "$EVIDENCE" -maxdepth 1 -name 'A0[1-7].done' -print -quit | grep -q .; then
      die 'UNBOUND_RESUME_MARKER_REJECTED'
    fi
    mv "$candidate" "$binding"
    (umask 077; openssl rand -hex 32 > "$secret")
  fi
  STATE_BINDING_HASH="$(shasum -a 256 "$binding" | awk '{print $1}')"
}

dry_run() {
  prepare
  node - "$GRAPH" <<'NODE'
const fs=require('node:fs');
const graph=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
if(graph.checkpoints.length!==7) throw new Error('checkpoint cardinality mismatch');
for(const item of graph.checkpoints){
  if(!/^A0[1-7]$/.test(item.id)||!/^checkpoint_[a-z_]+$/.test(item.executor)) throw new Error(`invalid checkpoint ${item.id}`);
}
process.stdout.write('PHASE_A_DRY_RUN_PASS\n');
NODE
}

start_db() {
  local name="$1"
  if [[ ! -f "$CERT_DIR/server.key" ]]; then
    openssl req -x509 -newkey rsa:2048 -nodes -days 1 -subj '/CN=localhost' \
      -keyout "$CERT_DIR/server.key" -out "$CERT_DIR/server.crt" >/dev/null 2>&1
  fi
  docker run --pull=never --name "$name" -e POSTGRES_PASSWORD="$PASSWORD" -p 127.0.0.1::5432 \
    -v "$CERT_DIR:/garage-cert:ro" --entrypoint sh -d "$POSTGRES_IMAGE" -c \
    'cp /garage-cert/server.key /tmp/garage-server.key; cp /garage-cert/server.crt /tmp/garage-server.crt; chown postgres:postgres /tmp/garage-server.key /tmp/garage-server.crt; chmod 600 /tmp/garage-server.key; exec docker-entrypoint.sh postgres -D /etc/postgresql -c ssl=on -c ssl_cert_file=/tmp/garage-server.crt -c ssl_key_file=/tmp/garage-server.key' >/dev/null
  for _ in $(seq 1 180); do
    [[ "$(docker inspect "$name" --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' 2>/dev/null)" == healthy ]] && return
    if [[ "$(docker inspect "$name" --format '{{.State.Running}}' 2>/dev/null || true)" == false ]]; then
      docker logs "$name" > "$EVIDENCE/$name-startup.log" 2>&1 || true
      die "DISPOSABLE_DB_EXITED:$name"
    fi
    sleep 1
  done
  die "DISPOSABLE_DB_NOT_READY:$name"
}

db_url() {
  local port
  port="$(docker port "$1" 5432/tcp | sed 's/.*://')"
  printf 'postgresql://postgres:%s@127.0.0.1:%s/postgres?sslmode=require' "$PASSWORD" "$port"
}

bootstrap_auth() {
  local db="$1" auth="$2" port
  port="$(docker port "$db" 5432/tcp | sed 's/.*://')"
  docker exec "$db" psql -X -U supabase_admin -d postgres -v ON_ERROR_STOP=1 \
    -c "alter role supabase_auth_admin with password 'garage-commercial-auth-local'" >/dev/null
  docker run --pull=never --name "$auth" \
    -e GOTRUE_API_HOST=0.0.0.0 -e GOTRUE_API_PORT=9999 \
    -e GOTRUE_SITE_URL=http://127.0.0.1:3000 -e API_EXTERNAL_URL=http://127.0.0.1:9999 \
    -e GOTRUE_DB_DRIVER=postgres \
    -e "GOTRUE_DB_DATABASE_URL=postgresql://supabase_auth_admin:garage-commercial-auth-local@host.docker.internal:${port}/postgres?sslmode=disable" \
    -e GOTRUE_JWT_SECRET=garage-commercial-local-jwt-key-longer-than-32-characters -e GOTRUE_JWT_EXP=3600 \
    -d "$AUTH_IMAGE" >/dev/null
  for _ in $(seq 1 180); do
    if docker exec "$db" psql -X -Atq -U postgres -d postgres -c "select count(*) >= 70 from auth.schema_migrations" 2>/dev/null | grep -qx t; then break; fi
    [[ "$(docker inspect "$auth" --format '{{.State.Running}}' 2>/dev/null)" == true ]] || die "AUTH_BOOTSTRAP_FAILED:$db"
    sleep 1
  done
  [[ "$(docker exec "$db" psql -X -Atq -U postgres -d postgres -c "select count(*) >= 70 from auth.schema_migrations")" == t ]] || die "AUTH_BOOTSTRAP_INCOMPLETE:$db"
  docker rm -f "$auth" >/dev/null
}

push_bundle() {
  SUPABASE_TELEMETRY_ENABLED=false supabase db push --db-url "$2" --workdir "$BUNDLE" --include-all --yes > "$EVIDENCE/$1-push.txt" 2>&1
}

assert_history() {
  local count
  count="$(docker exec "$1" psql -X -Atq -U postgres -d postgres -c 'select count(*) from supabase_migrations.schema_migrations')"
  [[ "$count" == "$2" ]] || die "MIGRATION_HISTORY_MISMATCH:$1:$count:$2"
}

provider_gate() {
  local output inventory="$EVIDENCE/$2-provider-classifications.json"
  output="$(docker exec -i "$1" psql -X -Atq -U postgres -d postgres -v ON_ERROR_STOP=1 < "$APP/supabase/tests/application_fingerprint_provider_dependency_contract.sql")"
  [[ "$output" == *'BATCH_1E_PROVIDER_DEPENDENCY_PASS'* ]] || die "PROVIDER_GATE_BLOCKED:$output"
  docker exec -i "$1" psql -X -Atq -U postgres -d postgres -v ON_ERROR_STOP=1 \
    < "$ROOT/operations/tests/garage-link-provider-blocking-inventory.sql" > "$inventory"
  node "$ROOT/operations/tests/verify-garage-link-commercial-contract.mjs" "$ROOT" --classifications "$inventory" >/dev/null
}

privilege_gate() {
  docker exec -i "$1" psql -X -U postgres -d postgres -v ON_ERROR_STOP=1 \
    < "$APP/supabase/tests/application_privilege_contract_regression.sql" > "$EVIDENCE/$2-privilege.txt"
}

load_fixture() {
  docker exec -i "$1" psql -X -U postgres -d postgres -v ON_ERROR_STOP=1 \
    -c "set app.g0b_fixture='enabled'" -f - < "$APP/supabase/tests/g1a_fixture.sql" > "$EVIDENCE/$2-fixture.txt"
  docker exec "$1" psql -X -U postgres -d postgres -v ON_ERROR_STOP=1 -c \
    "insert into public.vehicles(id,store_id,management_no,status) values ('51300000-0000-0000-0000-000000000001','51100000-0000-0000-0000-000000000001','COMMERCIAL-GATE-GUARD','in_stock') on conflict (id) do nothing" >/dev/null
}

commercial_regressions() {
  local db="$1" label="$2"
  docker exec -i "$db" psql -X -U postgres -d postgres -v ON_ERROR_STOP=1 \
    -c "set app.g0b_fixture='enabled'" -f - < "$APP/supabase/tests/commercial_remediation_regression.sql" > "$EVIDENCE/$label-commercial.txt"
  docker exec -i "$db" psql -X -U postgres -d postgres -v ON_ERROR_STOP=1 \
    -c "set app.g0b_fixture='enabled'" -f - < "$APP/supabase/tests/commercial_remediation_batch_1b_regression.sql" > "$EVIDENCE/$label-commercial-1b.txt"
  privilege_gate "$db" "$label"
  provider_gate "$db" "$label"
}

fingerprint() {
  sed "/^select 'ledger|/,\$d" "$APP/supabase/tests/g0b_catalog_fingerprint.sql" | \
    docker exec -i "$1" psql -X -Atq -U postgres -d postgres -v ON_ERROR_STOP=1 > "$2"
}

rollback_commercial() {
  local db="$1" url="$2" label="$3" name
  for version in 20260731000300 20260731000200 20260731000100; do
    case "$version" in
      20260731000300) name='application_privilege_contract' ;;
      20260731000200) name='commercial_remediation_batch_1b' ;;
      20260731000100) name='commercial_remediation_batch_1' ;;
      *) die "ROLLBACK_VERSION_UNKNOWN:$version" ;;
    esac
    docker exec -i "$db" psql -X -U postgres -d postgres -v ON_ERROR_STOP=1 \
      < "$BUNDLE/supabase/rollback/${version}_${name}.down.sql" \
      > "$EVIDENCE/$label-rollback-$version.txt"
  done
  SUPABASE_TELEMETRY_ENABLED=false supabase migration repair 20260731000300 20260731000200 20260731000100 \
    --status reverted --db-url "$url" --workdir "$BUNDLE" --yes > "$EVIDENCE/$label-repair.txt" 2>&1
  assert_history "$db" 50
}

expect_privilege_rejection() {
  local db="$1" label="$2" mutation="$3" status
  set +e
  { printf '%s\n' 'begin;' "$mutation"; cat "$APP/supabase/tests/application_privilege_contract_regression.sql"; } | \
    docker exec -i "$db" psql -X -U postgres -d postgres -v ON_ERROR_STOP=1 > "$EVIDENCE/$label.txt" 2>&1
  status=$?
  set -e
  [[ $status -ne 0 ]] || die "NEGATIVE_PRIVILEGE_ACCEPTED:$label"
  privilege_gate "$db" "$label-post"
}

expect_provider_rejection() {
  local db="$1" classification="$2" mutation="$3" fixture="$EVIDENCE/provider-$2.json" status
  { printf '%s\n' 'begin;' "$mutation"; cat "$ROOT/operations/tests/garage-link-provider-blocking-inventory.sql"; printf '%s\n' 'rollback;'; } | \
    docker exec -e PGPASSWORD=garage-commercial-auth-local -i "$db" \
      psql -h 127.0.0.1 -X -Atq -U supabase_auth_admin -d postgres -v ON_ERROR_STOP=1 > "$fixture"
  set +e
  node "$ROOT/operations/tests/verify-garage-link-commercial-contract.mjs" "$ROOT" --classifications "$fixture" \
    > "$EVIDENCE/provider-$1.out" 2>&1
  status=$?
  set -e
  [[ $status -ne 0 ]] || die "NEGATIVE_PROVIDER_ACCEPTED:$classification"
}

assert_fingerprint_matches() {
  diff -u "$1" "$2" >/dev/null || return 2
}

checkpoint_contract() {
  node "$ROOT/operations/tests/verify-garage-link-commercial-contract.mjs" "$ROOT" > "$EVIDENCE/A01-contract.json"
}

checkpoint_fresh() {
  start_db "$FRESH"
  bootstrap_auth "$FRESH" "$AUTH_FRESH"
  FRESH_URL="$(db_url "$FRESH")"
  push_bundle A02-fresh "$FRESH_URL"
  assert_history "$FRESH" 53
  load_fixture "$FRESH" fresh
  commercial_regressions "$FRESH" fresh
  fingerprint "$FRESH" "$EVIDENCE/fresh.fingerprint"
}

checkpoint_blocking() {
  expect_privilege_rejection "$FRESH" missing-required "revoke select on public.garage_plan_entitlements from anon;"
  expect_privilege_rejection "$FRESH" excessive-grant "grant update on public.garage_plan_entitlements to service_role;"
  expect_provider_rejection "$FRESH" UNKNOWN "create function auth.commercial_provider_unknown_probe() returns integer language sql as 'select 1';"
  expect_provider_rejection "$FRESH" SECURITY_RELEVANT "revoke execute on function auth.uid() from public, anon;"
  docker exec "$FRESH" psql -X -U postgres -d postgres -v ON_ERROR_STOP=1 -c 'create table public.commercial_fingerprint_probe(id integer);' >/dev/null
  fingerprint "$FRESH" "$EVIDENCE/abnormal.fingerprint"
  set +e
  assert_fingerprint_matches "$EVIDENCE/fresh.fingerprint" "$EVIDENCE/abnormal.fingerprint"
  fingerprint_status=$?
  set -e
  [[ $fingerprint_status -ne 0 ]] || die 'FINGERPRINT_ABNORMALITY_ACCEPTED'
  diff -u "$EVIDENCE/fresh.fingerprint" "$EVIDENCE/abnormal.fingerprint" > "$EVIDENCE/fingerprint-negative.diff" || true
  docker exec "$FRESH" psql -X -U postgres -d postgres -v ON_ERROR_STOP=1 -c 'drop table public.commercial_fingerprint_probe;' >/dev/null
  fingerprint "$FRESH" "$EVIDENCE/fingerprint-recovered.fingerprint"
  assert_fingerprint_matches "$EVIDENCE/fresh.fingerprint" "$EVIDENCE/fingerprint-recovered.fingerprint"
  node "$ROOT/operations/tests/verify-garage-link-commercial-contract.mjs" "$ROOT" > "$EVIDENCE/A03-provider-classification-negative.json"
}

checkpoint_rollback_reapply() {
  rollback_commercial "$FRESH" "$FRESH_URL" fresh
  push_bundle A04-reapply "$FRESH_URL"
  assert_history "$FRESH" 53
  commercial_regressions "$FRESH" fresh-reapplied
  fingerprint "$FRESH" "$EVIDENCE/fresh-reapplied.fingerprint"
  assert_fingerprint_matches "$EVIDENCE/fresh.fingerprint" "$EVIDENCE/fresh-reapplied.fingerprint"
}

checkpoint_upgrade() {
  start_db "$UPGRADE"
  bootstrap_auth "$UPGRADE" "$AUTH_UPGRADE"
  UPGRADE_URL="$(db_url "$UPGRADE")"
  push_bundle A05-upgrade-bootstrap "$UPGRADE_URL"
  rollback_commercial "$UPGRADE" "$UPGRADE_URL" upgrade
  load_fixture "$UPGRADE" upgrade-current
  push_bundle A05-upgrade "$UPGRADE_URL"
  assert_history "$UPGRADE" 53
  commercial_regressions "$UPGRADE" upgrade
  fingerprint "$UPGRADE" "$EVIDENCE/upgrade.fingerprint"
}

checkpoint_restore() {
  docker exec "$FRESH" pg_dump -U supabase_admin -d postgres -Fc -n public -n supabase_migrations > "$EVIDENCE/fresh.dump"
  docker exec "$FRESH" pg_dump -U supabase_admin -d postgres --data-only --table auth.users > "$EVIDENCE/fresh-auth-users.sql"
  start_db "$RESTORE"
  bootstrap_auth "$RESTORE" "$AUTH_RESTORE"
  docker exec "$RESTORE" psql -X -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -c 'drop schema public cascade; drop schema if exists supabase_migrations cascade;' >/dev/null
  docker exec -i "$RESTORE" psql -X -U supabase_admin -d postgres -v ON_ERROR_STOP=1 < "$EVIDENCE/fresh-auth-users.sql" >/dev/null
  docker exec -i "$RESTORE" pg_restore -U supabase_admin -d postgres --exit-on-error < "$EVIDENCE/fresh.dump"
  assert_history "$RESTORE" 53
  commercial_regressions "$RESTORE" restore
  fingerprint "$RESTORE" "$EVIDENCE/restore.fingerprint"
}

checkpoint_final() {
  assert_fingerprint_matches "$EVIDENCE/fresh.fingerprint" "$EVIDENCE/upgrade.fingerprint"
  assert_fingerprint_matches "$EVIDENCE/fresh.fingerprint" "$EVIDENCE/restore.fingerprint"
  : > "$EVIDENCE/schema-upgrade-drift.diff"
  : > "$EVIDENCE/schema-restore-drift.diff"
  node "$ROOT/packages/billing/scripts/generate-garage-commercial-contract.mjs" --check
  node "$ROOT/operations/tests/verify-garage-link-commercial-contract.mjs" "$ROOT" > "$EVIDENCE/A07-final-contract.json"
  find "$EVIDENCE" -type f ! -name EVIDENCE_SHA256SUMS -print0 | sort -z | xargs -0 shasum -a 256 > "$EVIDENCE/EVIDENCE_SHA256SUMS"
  printf '%s\n' 'CRITICAL=0' 'HIGH=0' 'PHASE_A_ALL_CHECKPOINTS_PASS' > "$EVIDENCE/FINAL_STATUS"
}

write_checkpoint_marker() {
  local id="$1" executor="$2" previous="$3" marker="$EVIDENCE/$1.done"
  local manifests="$EVIDENCE/checkpoint-manifests" evidence_manifest="$EVIDENCE/checkpoint-manifests/$1.sha256"
  mkdir -p "$manifests"
  (cd "$TEMP_ROOT" && find evidence -type f \
    ! -name '*.done' ! -path 'evidence/checkpoint-manifests/*' \
    -print0 | sort -z | xargs -0 shasum -a 256) > "$evidence_manifest"
  node - "$TEMP_ROOT/state-secret" "$marker" "$id" "$executor" "$STATE_BINDING_HASH" "$previous" "$evidence_manifest" <<'NODE'
const crypto=require('node:crypto');
const fs=require('node:fs');
const [, , secretPath, markerPath, id, executor, stateBinding, previous, manifestPath]=process.argv;
const evidenceManifest=crypto.createHash('sha256').update(fs.readFileSync(manifestPath)).digest('hex');
const payload={id,executor,stateBinding,previous,evidenceManifest};
const signature=crypto.createHmac('sha256',fs.readFileSync(secretPath,'utf8').trim()).update(JSON.stringify(payload)).digest('hex');
fs.writeFileSync(markerPath,`${JSON.stringify({...payload,signature})}\n`,{mode:0o600});
NODE
}

validate_checkpoint_marker() {
  local id="$1" executor="$2" previous="$3" marker="$EVIDENCE/$1.done"
  local evidence_manifest="$EVIDENCE/checkpoint-manifests/$1.sha256"
  [[ -f "$evidence_manifest" ]] || die "RESUME_EVIDENCE_MANIFEST_MISSING:$id"
  (cd "$TEMP_ROOT" && shasum -a 256 -c "${evidence_manifest#$TEMP_ROOT/}") >/dev/null || die "RESUME_EVIDENCE_DRIFT:$id"
  node - "$TEMP_ROOT/state-secret" "$marker" "$id" "$executor" "$STATE_BINDING_HASH" "$previous" "$evidence_manifest" <<'NODE'
const crypto=require('node:crypto');
const fs=require('node:fs');
const [, , secretPath, markerPath, id, executor, stateBinding, previous, manifestPath]=process.argv;
const marker=JSON.parse(fs.readFileSync(markerPath,'utf8'));
const evidenceManifest=crypto.createHash('sha256').update(fs.readFileSync(manifestPath)).digest('hex');
const payload={id,executor,stateBinding,previous,evidenceManifest};
const expected=crypto.createHmac('sha256',fs.readFileSync(secretPath,'utf8').trim()).update(JSON.stringify(payload)).digest('hex');
const validKeys=Object.keys(marker).sort().join(',')==='evidenceManifest,executor,id,previous,signature,stateBinding';
const signatureValid=typeof marker.signature==='string' && marker.signature.length===expected.length && crypto.timingSafeEqual(Buffer.from(marker.signature),Buffer.from(expected));
if(!validKeys || !signatureValid || JSON.stringify({...marker,signature:undefined})!==JSON.stringify({...payload,signature:undefined})) process.exit(2);
NODE
}

run_checkpoint() {
  local id="$1" executor="$2" previous="$3" marker
  marker="$EVIDENCE/$id.done"
  if [[ -f "$marker" ]]; then
    validate_checkpoint_marker "$id" "$executor" "$previous" || die "RESUME_MARKER_AUTHENTICATION_FAILED:$id"
    printf 'RESUME_SKIP:%s\n' "$id"
    return
  fi
  "$executor"
  write_checkpoint_marker "$id" "$executor" "$previous"
  printf 'CHECKPOINT_PASS:%s\n' "$id"
  if [[ -n "$STOP_AFTER" && "$id" == "$STOP_AFTER" ]]; then
    printf 'INTENTIONAL_STOP_AFTER:%s\n' "$id"
    exit 75
  fi
}

run_graph() {
  local previous='GENESIS'
  prepare
  if [[ -f "$EVIDENCE/A02.done" ]]; then
    [[ "$(docker inspect "$FRESH" --format '{{.State.Running}}' 2>/dev/null || true)" == true ]] || die 'RESUME_DATABASE_MISSING'
    FRESH_URL="$(db_url "$FRESH")"
    assert_history "$FRESH" 53
    privilege_gate "$FRESH" resume
    provider_gate "$FRESH" resume
  fi
  while IFS=$'\t' read -r checkpoint_id executor; do
    declare -F "$executor" >/dev/null || die "CHECKPOINT_EXECUTOR_UNDEFINED:$executor"
    run_checkpoint "$checkpoint_id" "$executor" "$previous"
    previous="$(shasum -a 256 "$EVIDENCE/$checkpoint_id.done" | awk '{print $1}')"
  done < <(node - "$GRAPH" <<'NODE'
const fs=require('node:fs');
const graph=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
for(const item of graph.checkpoints) process.stdout.write(`${item.id}\t${item.executor}\n`);
NODE
)
  [[ "$(find "$EVIDENCE" -maxdepth 1 -name 'A0[1-7].done' | wc -l | tr -d ' ')" == 7 ]] || die 'CHECKPOINT_LEDGER_INCOMPLETE'
}

self_test() {
  local resume_state first_status tamper_status
  resume_state="$(mktemp -d "$ROOT/.garage-commercial-resume.XXXXXX")"
  set +e
  "$0" --local --state-dir "$resume_state" --stop-after A02
  first_status=$?
  set -e
  [[ $first_status -eq 75 ]] || { rm -rf "$resume_state"; die "RESUME_PROBE_FIRST_EXIT:$first_status"; }
  cp "$resume_state/evidence/A02.done" "$resume_state/A02.done.valid"
  printf '%s\n' 'tampered' >> "$resume_state/evidence/A02.done"
  set +e
  "$0" --local --state-dir "$resume_state" >/dev/null 2>&1
  tamper_status=$?
  set -e
  [[ $tamper_status -ne 0 ]] || { rm -rf "$resume_state"; die 'TAMPERED_RESUME_MARKER_ACCEPTED'; }
  mv "$resume_state/A02.done.valid" "$resume_state/evidence/A02.done"
  "$0" --local --state-dir "$resume_state"
  rm -rf "$resume_state"
  printf '%s\n' 'SELF_TEST_PASS'
}

MODE="${1:---local}"
shift || true
while [[ $# -gt 0 ]]; do
  case "$1" in
    --state-dir) STATE_DIR_ARG="${2:?state directory required}"; shift 2 ;;
    --stop-after) STOP_AFTER="${2:?checkpoint required}"; shift 2 ;;
    *) die "UNKNOWN_ARGUMENT:$1" ;;
  esac
done
case "$MODE" in
  --dry-run) dry_run ;;
  --self-test) self_test ;;
  --local) run_graph ;;
  *) printf '%s\n' 'usage: run-garage-link-commercial-gate.sh [--self-test|--dry-run|--local [--state-dir DIR] [--stop-after A01..A07]]' >&2; exit 2 ;;
esac
