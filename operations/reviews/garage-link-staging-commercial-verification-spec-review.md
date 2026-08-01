# GARAGE LINK Staging Commercial Verification — Independent Spec Review

Reviewer: independent spec review agent
Reviewed: commit range `2496f25..HEAD`, branch `codex/garage-link-staging-commercial-verification`
Scope: `ae2e761` (health-check table), `115c3ce` (middleware redirect loop), `3f1b3e8` +
rollback (Free-tier NULL `stripe_status` billing-state fix), and adjacent files that gate
redirect/contract behavior (`contractAccess.ts`, `post-auth-redirect.ts`, `store-onboarding.ts`,
`middleware.ts`).

## Coverage

Read the full diff and the referenced supporting files, traced the middleware control flow by
hand for every `ContractAccessState`, verified the migration/rollback pair byte-for-byte against
their pre-fix source, and recomputed both checksums against `manifest.json`.

**Bug #1 (health check):** correct and safe. `stripe_webhook_events` is granted
`DELETE, INSERT, SELECT, UPDATE` to `service_role` under `20260731000300_application_privilege_contract.sql`;
`stores` is not (only `authenticated` has it there), so the swap is necessary, not just
sufficient. The table holds no PII (`stripe_event_id`, `event_type`, `status`, timestamps only).
A `head:true,count:'exact'` query succeeds identically whether the table has 0 or N rows, so a
brand-new tenant/project with zero webhook events yet still returns `ok:true`. Note: neither
`stores` nor `stripe_webhook_events` grants `anon` any privilege, so the route's anon-key fallback
path (`SUPABASE_SERVICE_ROLE_KEY` unset) was already broken pre-fix and remains equally broken
post-fix — not a regression, just worth knowing it isn't newly introduced.

**Bug #2 (middleware loop, security-gate case):** correct for the case it targets. Exempting
`isSecurityGate(pathname)` from the billing-contract block, and switching both billing-redirect
targets from `request.nextUrl.clone()` to `new URL(pathname, request.url)`, eliminates the
specific `/security/email-otp` <-> `/settings/billing` query-string-doubling loop. Verified no
other call site in `middleware.ts` still clones a URL into a billing-redirect target.

**Bug #3 (SQL NULL branch):** correct and additive-only. Both new `WHEN` branches test
`p_stripe_status is null`; every other branch does an equality/`IN`/`NOT IN` comparison against
`p_stripe_status`, which is NULL-intolerant (`NULL <op> x` is never true), so the two new branches
can only ever fire in place of the old catch-all `ELSE` for NULL input — placement first in the
`CASE` is inert with respect to every real (non-null) Stripe status; behavior for `active`,
`past_due`, `incomplete`, `unpaid`, `canceled`, `paused`, `cancel_at_period_end`, etc. is
byte-identical to before. The `.down.sql` rollback is an exact restoration of the
`20260731000200` definition (diffed line-for-line, no drift). `manifest.json`'s new forward entry
checksum (`64909f85...a468a`) and rollback entry checksum (`85f18ce5...9a02a48e`) both match
`shasum -a 256` of the actual files, and `dependsOn`/`kind: "repair"` follow the pattern of
neighboring repair entries.

## Finding: redirect loop is not fully closed (not touched by any of the three fixes)

`BILLING_RECOVERY_ALLOWED_PATHS` in `contractAccess.ts` does **not** include `/onboarding`.
`resolvePostAuthPath()` (`post-auth-redirect.ts`) is entirely billing-state-agnostic — it decides
`/onboarding` vs `/dashboard` purely from `onboarding_completed_at`, with no awareness of
`ContractAccessState`. Trace for a tenant with **incomplete onboarding and a genuinely restricted
paid-plan Stripe state** (`unpaid`, `restricted`, `canceled`, `reconciliation_required`,
`checkout_pending`, `initial_payment_pending` — i.e. real, non-null `stripe_status`, unaffected by
the bug #3 fix):

1. Request to `/onboarding`: `isBillingRecoveryAllowedPath('/onboarding')` is false, so
   `middleware.ts` L233-243 redirects to `/settings/billing?contract=<state>`.
2. Request to `/settings/billing`: `resolvePostAuthPath` still returns `/onboarding` (onboarding
   still incomplete, and this function never looks at billing state), so `middleware.ts` L200-214
   redirects back to `/onboarding`.
3. Repeat indefinitely — the same `ERR_TOO_MANY_REDIRECTS` failure mode as bug #2, for a
   different path pair. Neither the `isSecurityGate` exemption (bug #2) nor the NULL-`stripe_status`
   branch (bug #3) covers this pair, since it requires neither a security-gate path nor a NULL
   Stripe status.

This is a real, currently-open gap for any store that reaches a restricted/unpaid/canceled Stripe
state before finishing onboarding (e.g. a Starter/Standard/Pro checkout that lands on
`initial_payment_pending` via 3DS, or a subscription that lapses, while onboarding is still
mid-flight). It fully locks the tenant out with no in-app escape route, the same class of
commercial-launch blocker the three fixes in this branch were written to eliminate — it just
wasn't in scope for the free-tier-focused E2E run that found bugs #1-3. Recommend adding
`/onboarding` to `BILLING_RECOVERY_ALLOWED_PATHS` (or making `resolvePostAuthPath` billing-aware)
before treating paid-tier commercial launch as fully verified.

## Final: FAIL
Critical: 1
High: 0
