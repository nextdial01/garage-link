#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$APP_ROOT"

# Fail closed: every build-time integration target is loopback or a non-live test value.
export NEXT_PUBLIC_SUPABASE_URL='http://127.0.0.1:55432'
export NEXT_PUBLIC_SUPABASE_ANON_KEY='g0b-build-only'
export SUPABASE_SERVICE_ROLE_KEY='g0b-build-only'
export CRON_SECRET='g0b-build-only'
export LINE_CHANNEL_SECRET='g0b-build-only'
export STRIPE_SECRET_KEY='sk_test_g0b'
export STRIPE_WEBHOOK_SECRET='whsec_g0b'

pnpm test:db:runner
pnpm test:db:fresh
pnpm test:g1c:static
pnpm lint
pnpm typecheck
pnpm test:security
pnpm test:line-link-s2s
pnpm test:line-link-s2s-ack
pnpm test:l-link-inquiry-s2s
pnpm test:inquiry-response-management
pnpm build
pnpm test:api:g0b
