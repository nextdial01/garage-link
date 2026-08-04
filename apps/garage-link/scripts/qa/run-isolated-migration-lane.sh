#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
IMAGE="public.ecr.aws/supabase/postgres:17.6.1.136"
NAME="garage-link-g0b-qa-${PPID}-$$"
cleanup(){ docker rm -f "$NAME" >/dev/null 2>&1 || true; }
trap cleanup EXIT INT TERM
echo '[qa-lane] isolated Docker apply 4/4'
docker run --pull=never --network none --name "$NAME" -e POSTGRES_PASSWORD='qa-local-disposable-only' -d "$IMAGE" >/dev/null
for _ in $(seq 1 180); do
  if docker exec "$NAME" psql -X -Atq -U postgres -d postgres -c 'select 1' >/dev/null 2>&1; then break; fi
  sleep 1
done
node "$APP_ROOT/scripts/db/migration-runner.mjs" apply --container "$NAME" --environment g0b-qa --manifest "$APP_ROOT/supabase/baseline/manifest.json"
node "$APP_ROOT/scripts/db/migration-runner.mjs" apply --container "$NAME" --environment g0b-qa --manifest "$APP_ROOT/supabase/qa/manifest.json"
echo '[qa-lane] SQL regression'
docker exec -i "$NAME" psql -X -U postgres -d postgres -v ON_ERROR_STOP=1 -c "set app.g0b_fixture='enabled';" -f - < "$APP_ROOT/supabase/tests/qa_lifecycle_regression.sql"
echo '[qa-lane] residual and privilege check'
[[ "$(docker exec "$NAME" psql -X -Atq -U postgres -d postgres -v ON_ERROR_STOP=1 -c "select case when (select count(*) from information_schema.role_routine_grants where routine_schema='public' and routine_name like 'qa_lifecycle_%' and grantee in ('anon','authenticated'))=0 then 'QA_RESIDUAL_0' else 'QA_RESIDUAL_FAIL' end;")" == *QA_RESIDUAL_0* ]]
echo '[qa-lane] rollback 4/4'
node "$APP_ROOT/scripts/db/migration-runner.mjs" rollback --container "$NAME" --environment g0b-qa --manifest "$APP_ROOT/supabase/qa/manifest.json"
[[ "$(docker exec "$NAME" psql -X -Atq -U postgres -d postgres -v ON_ERROR_STOP=1 -c "select case when (select count(*) from pg_namespace where nspname='qa_internal')=0 and (select count(*) from pg_proc where proname like 'qa_lifecycle_%')=0 then 'QA_ROLLBACK_RESIDUAL_0' else 'QA_ROLLBACK_RESIDUAL_FAIL' end;")" == *QA_ROLLBACK_RESIDUAL_0* ]]
echo '[qa-lane] reapply 4/4'
node "$APP_ROOT/scripts/db/migration-runner.mjs" apply --container "$NAME" --environment g0b-qa --manifest "$APP_ROOT/supabase/qa/manifest.json"
echo '[qa-lane] PASS'
