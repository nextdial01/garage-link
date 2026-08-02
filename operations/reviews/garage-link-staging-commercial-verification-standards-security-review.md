# GARAGE LINK Staging Commercial Verification — Independent Standards / Security Review

Reviewer: independent standards/security review agent
Reviewed: 2026-08-01
Scope: `2496f25..HEAD` on `codex/garage-link-staging-commercial-verification` (3 commits: `ae2e761`, `115c3ce`, `3f1b3e8`), worktree `/Users/ksk/kannagi/worktrees/garage-link-local-commercial-completion`.

Read the full diff (5 files, +105/-6: `src/app/api/health/route.ts`, `src/middleware.ts`, `supabase/baseline/manifest.json`, the new migration + its rollback), the complete current `middleware.ts`, `contractAccess.ts`, the `admin-email-otp` request/verify routes, `/security/mfa` and `/api/auth/logout`, the privilege-contract migration (`20260731000300`), the `stripe_webhook_events` table definition (`20260723000200`), the prior `garage_effective_billing_state` definition (`20260731000200_commercial_remediation_batch_1b.sql`) and the `billing_state` column default (`20260731000100`), and `supabase/baseline/manifest.json`.

## Billing-check exemption for security-gate paths

`isSecurityGate` covers only `/security/mfa` (a pure redirect to `/security/email-otp`), `/security/email-otp`, `/api/auth/admin-email-otp/request`, `/api/auth/admin-email-otp/verify`, and `/api/auth/logout`. All four handlers were read in full: `request`/`verify` only issue/consume a hashed OTP challenge and set a trusted-device cookie; `logout` only revokes the trusted-session row and signs out. None reads or returns billing state, plan entitlements, or any tenant business data, and none performs a billing-gated mutation. The admin-security (OTP/trusted-device) gate at lines 158–173 of `middleware.ts` still runs unconditionally before the billing block for every non-security-gate, non-public path, and is itself independent of billing state — a restricted-billing account still cannot reach `/dashboard`, `/api/*` business routes, etc. without first clearing admin security. Exempting the security-gate paths from the billing redirect only stops the two gates from redirecting into each other; it does not open a path to protected functionality. The `request.nextUrl.clone()` → `new URL(pathname, request.url)` change is confirmed as the actual loop-breaker (clone() carried forward the prior `from`/`contract` query params, which is what caused unbounded growth); it drops unrelated incoming query params on the billing redirect, which is a behavior change but not a security issue since the target page does not depend on them.

## Health-check table swap

`stripe_webhook_events` (`20260723000200`) stores only `stripe_event_id`, `event_type`, `status`, `error_message`, timestamps — its own comment states "Event payloads and payment details are not stored." The health route uses `select('id', { head: true, count: 'exact' }).limit(1)` and returns only `{ ok, service }` or `{ ok: false, code }`, discarding `data`/`count`/`error` details in the response body — no row content, count, or table name is exposed to the client either way. This is a safe, arguably lower-blast-radius choice than the original `stores` check (a real business table). No timing or error-message side channel: errors collapse to a single generic `db_unavailable` code regardless of cause.

## Billing-state SQL fix

The replacement `garage_effective_billing_state` has no `security definer` clause (same as the `20260731000200` original it replaces) — it is `SECURITY INVOKER` by default, consistent with its own prior version. Grants are unchanged (`service_role, authenticated` execute only). The new `p_stripe_status IS NULL AND p_billing_state = 'active' → 'active'` branch is conservative, not permissive: every other NULL-stripe_status combination still falls to `reconciliation_required`, and `company_subscriptions.billing_state` defaults to `'active'` at column definition (`20260731000100`) for freshly inserted Free-tier rows. Critically, the privilege-contract migration (`20260731000300`) grants `authenticated` only `SELECT` on `company_subscriptions`; `INSERT/UPDATE/DELETE` are granted to `service_role` only. An authenticated caller (via PostgREST or any RPC) cannot set `billing_state='active'` directly to fabricate paid access — only server-side/service-role code paths (e.g. `apply_garage_subscription_event_v2`, itself `service_role`-only) can write that column. No bypass path found.

## Reversibility / secret handling

`supabase/baseline/manifest.json` registers the new migration with a `depends_on: [..., "20260731000200"]` and a matching rollback entry pointing at `20260801000100_free_plan_billing_state_fix.down.sql`, which restores the exact pre-fix CASE expression — consistent with how this repo tracks reversibility elsewhere in the manifest. `git status` in the worktree is clean (no untracked files); a full-diff grep for `sk_live|sk_test|whsec_|service_role key literals` found nothing. No secret-handling concerns from the code/artifacts left in the repo.

Final: PASS
Critical: 0
High: 0
