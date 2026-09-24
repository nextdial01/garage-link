#!/usr/bin/env bash
set -euo pipefail
APP_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
NAME="garage-link-g0b-mobile-v2-${PPID}-$$"
IMAGE="public.ecr.aws/supabase/postgres:17.6.1.136"
cleanup() { docker rm -f "$NAME" >/dev/null 2>&1 || true; }
trap cleanup EXIT INT TERM
docker run --pull=never --network none --name "$NAME" -e POSTGRES_PASSWORD='local-disposable-only' -d "$IMAGE" >/dev/null
bash "$APP_ROOT/scripts/db/wait-supabase-ready.sh" "$NAME"
node "$APP_ROOT/scripts/db/migration-runner.mjs" apply --container "$NAME" --environment g0b-garage-mobile-v2 --manifest "$APP_ROOT/supabase/baseline/manifest.json" >/dev/null
for migration in "$APP_ROOT"/supabase/migrations/20260925000{1,2,3,4,5,6}00_*.sql; do
  docker exec -i "$NAME" psql -X -U postgres -d postgres -v ON_ERROR_STOP=1 -f - < "$migration" >/dev/null
done
for migration in "$APP_ROOT"/supabase/migrations/20260925000{1,2,3,4,5,6}00_*.sql; do
  docker exec -i "$NAME" psql -X -U postgres -d postgres -v ON_ERROR_STOP=1 -f - < "$migration" >/dev/null
done
docker exec -i "$NAME" psql -X -U postgres -d postgres -v ON_ERROR_STOP=1 -f - < "$APP_ROOT/supabase/tests/mobile_v2_migration_contract.sql"
docker exec -i "$NAME" psql -X -U postgres -d postgres -v ON_ERROR_STOP=1 -f - < "$APP_ROOT/supabase/tests/mobile_v2_runtime_contract.sql"
