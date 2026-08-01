# GARAGE LINK Staging Final Batch — Independent Spec Review

Reviewer: independent spec review agent
Reviewed: commit range `7595bea..HEAD` (8 commits), branch
`codex/garage-link-staging-commercial-verification`
Scope: `1b896e1` (clear stale pending downgrade on upgrade), `8cabc7a` (cron routes public-path
exemption), `45e8efc` (disable staff/store/storage add-on purchase), `d8fc7a0` (Playwright
admin email-OTP handling), `9f28373` (Playwright Vercel bypass header), `3426550`
(commercial-staging-fingerprint public-path exemption), `22c0fb8` (drop `VERCEL_DEPLOYMENT_ID`
from staging preflight), `77f6900` (wire bypass secret into the staging gate workflow). Earlier
commits on this branch were reviewed separately and are out of scope here.

## Coverage

Read the full diff for each of the 8 commits plus every file each touches in full (not just the
hunks): `change-plan/route.ts` and `packages/billing/src/garagePlans.ts` (`isUpgrade`,
`GARAGE_PLAN_ORDER`); `middleware.ts` plus all four routes it now exempts
(`jobs/billing-reconciliation`, `jobs/billing-webhook-retry`, `jobs/inspection-reminders` GET+POST,
`cron/purge-expired-store-data`) and `commercial-staging-fingerprint/route.ts`; `change-options/route.ts`
(full pre/post diff) plus `settings/billing/page.tsx` and every other reference to
`add_staff`/`add_store`/`add_storage` in `apps/garage-link/src` (`admin/plan-requests/page.tsx`);
`verify-commercial-staging-preflight.mjs` in full plus the workflow yaml; `playwright.config.ts`
and `tests/e2e/helpers.ts`, and the workflow's artifact-upload step.

## 1. Stale `pending_plan` clear on upgrade — PASS

`change-plan/route.ts` computes `const upgrade = isUpgrade(currentPlan, requestedPlan)` once and
branches on it: `if (!upgrade)` sets `pending_plan`/`pending_plan_effective_at` (downgrade
scheduling, byte-identical to the prior behavior — untouched), `else` (upgrade path) now clears
both fields. `isUpgrade` is ordinal via `GARAGE_PLAN_ORDER = ['free','starter','standard','pro']`,
so the new clear only fires when the requested plan strictly outranks the current one. The clear
uses the same `admin` client and `subscription.id` scope as the downgrade branch and throws
(`subscription_schedule_clear_failed`) on error rather than silently continuing, consistent with
the existing error-handling convention in this route. No cross-tenant risk — same `.eq('id',
subscription.id)` scoping as before.

## 2. Cron/fingerprint public-path exemptions — PASS

All four routes newly reachable without a session cookie enforce their own Bearer check and fail
closed:
- `jobs/billing-reconciliation`, `jobs/billing-webhook-retry`, `cron/purge-expired-store-data`:
  each has its own `isAuthorized`/`isCronRequest` requiring `CRON_SECRET` env to be non-empty AND
  an exact `Bearer ${secret}` match; all return 401 otherwise.
- `jobs/inspection-reminders`: GET requires `isCronRequest` (same pattern, 401 without it); POST
  (the "manual, owner/admin, own-store-only" path referenced in its own comment) independently
  calls `supabase.auth.getUser()` and checks `current_user_active_store_membership` role
  in (`owner`,`admin`) before doing anything — it does not rely on middleware's session gate at
  all, so exempting the `/api/jobs/` prefix does not weaken it.
- `commercial-staging-fingerprint`: gated by `GARAGE_COMMERCIAL_STAGING_FINGERPRINT_ENABLED ===
  'true'` (404 otherwise) then its own `authorized()` Bearer check (401 otherwise), independent of
  middleware.

The middleware exemption is a prefix match on `/api/jobs/` and `/api/cron/`, which is broader than
the three routes named in this task, but every route under both prefixes was enumerated above and
all fail closed independently. No billing-mutating or PII-exposing path is reachable without a
valid `CRON_SECRET` or an authenticated owner/admin session.

`vercel.json` now also schedules `/api/jobs/billing-reconciliation` (`*/10 * * * *`), consistent
with the stated intent of actually firing crons that were previously silently 401'd.

## 3. Add-on purchase disable — PASS

`change-options/route.ts`'s `POST` still runs `supabase.auth.getUser()` (401 if absent) and the
`owner`/`admin` membership check (403 `forbidden`-style message if absent/wrong role) **before**
reaching the unconditional `403` — this is not an open 403, auth still gates it.
`settings/billing/page.tsx`'s `<select>` filters out `add_staff`/`add_store`/`add_storage` from
its options, and grep across `apps/garage-link/src` for those three literals turns up only this
page (filtered out of the select, `request_type` state defaults to `'plan_change'` and is only
ever set via the now-filtered `<select>`'s `onChange`, so it's unreachable) and
`admin/plan-requests/page.tsx`, which only uses them as a read-only label map for
historical/existing `plan_change_requests` rows — not a purchase trigger. No other client code
path assumes these options are still purchasable.

## 4. Dropping `VERCEL_DEPLOYMENT_ID` from the preflight — PASS

The preflight script's non-production anchors are unchanged and still run before the
hostname-based deployment lookup: production domain (`garage-link.tech`/`*.garage-link.tech`)
denied on `baseUrl`, production Supabase ref denied, non-`sk_test_` Stripe key denied, and —
critically — `EXPECTED_VERCEL_PROJECT_ID === productionProjectId` (`prj_OOUdmGaVBHaVPMxPHTiPXLw3Tq64`)
or `EXPECTED_VERCEL_PROJECT_NAME === 'garage-link'` denied, all before the deployment-lookup call
even runs. The new `deployments/get?url=<hostname>` lookup then re-checks
`deployment.projectId === project.id` (the already-vetted non-production project) and
`deployment.url === baseUrl.hostname`. Since Vercel deployment hostnames are unique per
deployment and the production project id/name/domain are independently denied earlier (not solely
via hostname), a hostname-based lookup cannot be confused with the production deployment — the
project-id anchor, not the deployment-id, was always the load-bearing production-exclusion check.
Dropping `deployment.meta.githubCommitSha` is compensated by the runtime `release_sha` check
(compares the deployed app's self-reported `VERCEL_GIT_COMMIT_SHA` against `actualSha` = `git
rev-parse HEAD` in CI, gated by `EXPECTED_RELEASE_SHA` matching first) — equivalent provenance
signal for a non-git-integrated deploy. No weakening of the "reject production" guarantee found.

## 5/6. Playwright bypass header and OTP helper — PASS, with one new finding (High)

`bypassSecret` is read only from `process.env.VERCEL_AUTOMATION_BYPASS_SECRET`, used only inside
`extraHTTPHeaders`, never logged, and not written to any committed file — the workflow sources it
from `secrets.GARAGE_STAGING_VERCEL_BYPASS_SECRET`. `completeAdminEmailOtpIfPresent` correctly
no-ops (returns immediately) when `page.url()` doesn't match `/security/email-otp`, so normal
non-gated logins are unaffected, and throws a descriptive error (not a silent skip) when the
`previewOtp` regex fails to match.

**Finding (High): the bypass secret is captured into uploaded CI artifacts.**
`playwright.config.ts` sets `trace: 'on-first-retry'` (pre-existing) and the new commit adds
`extraHTTPHeaders: { 'x-vercel-protection-bypass': bypassSecret }` to every request the test
runner makes. Playwright traces record full request headers for every network call in the trace.
`.github/workflows/garage-link-commercial-staging.yml`'s "Preserve non-PII evidence" step runs
`if: always()` and uploads `apps/garage-link/playwright-report` and `apps/garage-link/test-results`
(30-day retention) — both of which contain trace data on any retried test. Any principal with read
access to this repo's Actions artifacts can extract the live `VERCEL_AUTOMATION_BYPASS_SECRET` from
a retried run's trace.zip, which grants standing bypass of Vercel's SSO Deployment Protection on
this project's preview deployments. This is a new exposure surface introduced by this commit pair
(the header didn't exist before; the trace/artifact machinery did) — recommend either redacting/
excluding this header from trace capture (Playwright supports per-context header stripping via a
custom fixture, or drop `extraHTTPHeaders` in favor of a `page.route` interceptor that isn't
traced) or rotating the bypass secret on a schedule so a leaked copy has a short shelf life.

## Final: PASS
Critical: 0
High: 1
