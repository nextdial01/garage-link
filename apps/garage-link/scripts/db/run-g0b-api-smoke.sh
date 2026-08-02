#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
STUB_PID=''
APP_PID=''

cleanup() {
  if [[ -n "$APP_PID" ]]; then kill "$APP_PID" >/dev/null 2>&1 || true; fi
  if [[ -n "$STUB_PID" ]]; then kill "$STUB_PID" >/dev/null 2>&1 || true; fi
}
trap cleanup EXIT INT TERM

node "$APP_ROOT/scripts/db/g0b-supabase-stub.mjs" > "${TMPDIR:-/tmp}/garage-link-g0b-stub.log" 2>&1 &
STUB_PID=$!
env \
  NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:55432 \
  NEXT_PUBLIC_SUPABASE_ANON_KEY=g0b-local-anon-key \
  SUPABASE_SERVICE_ROLE_KEY=g0b-local-service-key \
  LL_INBOUND_S2S_SECRET__DEFAULT=g0b-line-link-secret-at-least-32-bytes \
  pnpm exec next build --webpack > "${TMPDIR:-/tmp}/garage-link-g0b-build.log" 2>&1
env \
  NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:55432 \
  NEXT_PUBLIC_SUPABASE_ANON_KEY=g0b-local-anon-key \
  SUPABASE_SERVICE_ROLE_KEY=g0b-local-service-key \
  LL_INBOUND_S2S_SECRET__DEFAULT=g0b-line-link-secret-at-least-32-bytes \
  pnpm exec next start -p 3012 > "${TMPDIR:-/tmp}/garage-link-g0b-app.log" 2>&1 &
APP_PID=$!

for _ in $(seq 1 60); do
  if node -e "fetch('http://127.0.0.1:3012/login').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"; then
    node "$APP_ROOT/scripts/db/g0b-api-smoke.mjs"
    exit
  fi
  sleep 1
done

echo 'G0B_API_SMOKE_SERVER_NOT_READY' >&2
exit 1
