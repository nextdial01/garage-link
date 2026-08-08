#!/usr/bin/env bash
set -euo pipefail
name="${1:?container name required}"
timeout="${2:-180}"
for _ in $(seq 1 "$timeout"); do
  health="$(docker inspect "$name" --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' 2>/dev/null || true)"
  ready="$(docker exec "$name" psql -X -Atq -U postgres -d postgres -c "select case when to_regnamespace('auth') is not null and to_regnamespace('storage') is not null and to_regnamespace('extensions') is not null and exists (select 1 from pg_roles where rolname in ('supabase_admin','authenticator','anon','authenticated','service_role')) then 'ready' else 'pending' end;" 2>/dev/null || true)"
  if [[ "$health" == healthy && "$ready" == ready ]]; then exit 0; fi
  sleep 1
done
echo "database did not become Supabase-ready: $name" >&2
exit 1
