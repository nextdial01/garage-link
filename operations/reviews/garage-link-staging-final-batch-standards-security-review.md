# GARAGE LINK Staging Final Batch — Independent Standards / Security Review

Reviewer: independent standards/security review agent
Reviewed: 2026-08-02
Scope: `7595bea..HEAD` on `codex/garage-link-staging-commercial-verification` (8 commits: `8cabc7a`, `1b896e1`, `45e8efc`, `d8fc7a0`, `9f28373`, `3426550`, `22c0fb8`, `77f6900`), worktree `/Users/ksk/kannagi/worktrees/garage-link-local-commercial-completion`. Earlier commits already reviewed in the sibling file; not re-reviewed here.

## Middleware exemptions (`8cabc7a`, `3426550`) — fail-closed check

Read all four job/cron routes plus the fingerprint route in full:
- `apps/garage-link/src/app/api/jobs/billing-webhook-retry/route.ts`
- `apps/garage-link/src/app/api/jobs/billing-reconciliation/route.ts`
- `apps/garage-link/src/app/api/jobs/inspection-reminders/route.ts`
- `apps/garage-link/src/app/api/cron/purge-expired-store-data/route.ts`
- `apps/garage-link/src/app/api/commercial-staging-fingerprint/route.ts`

All five use the same pattern: `const secret = process.env.CRON_SECRET?.trim(); return Boolean(secret && header === \`Bearer ${secret}\`)` (or the equivalent `if (!secret) return false;` form in `inspection-reminders`/`purge-expired-store-data`). In every case a missing or empty-string `CRON_SECRET` makes `secret` falsy, so the `Boolean(secret && …)` / `if (!secret)` short-circuits to `false`/`return false` before the string comparison ever runs — there is no path where `header === "Bearer " + undefined` (or `"Bearer "` matching an empty secret) evaluates true. No "Bearer undefined" bug found in any of the five routes.

`inspection-reminders` `POST` (manual/session path) additionally does its own `supabase.auth.getUser()` check plus owner/admin role check, independent of the middleware exemption — this was already required before `8cabc7a` and is unaffected by making `/api/jobs/` public at the middleware layer.

`commercial-staging-fingerprint`'s `GARAGE_COMMERCIAL_STAGING_FINGERPRINT_ENABLED` gate is checked with `!== 'true'` (not `=== 'false'`), so it fails closed (404) on missing/unset/misspelled values, not just on an explicit `'false'`. Its production-denial block (`runtimeHost === 'garage-link.tech'` / `.endsWith('.garage-link.tech')`, `supabaseHost.includes(CURRENT_SUPABASE_REF)`, `projectId === PRODUCTION_VERCEL_PROJECT_ID`, `projectName === 'garage-link'`, `!stripeKey?.startsWith('sk_test_')`) is a static, hardcoded OR-chain evaluated before any response is built, unaffected by the auth/enable gates.

## `VERCEL_DEPLOYMENT_ID` removal (`22c0fb8`)

Confirmed by reading the full current `verify-commercial-staging-preflight.mjs`: every safety/production-denial check is independent of the removed deployment-ID/`githubCommitSha` fields —
- `baseUrl.hostname === 'garage-link.tech' || .endsWith('.garage-link.tech')` (line 36)
- `supabaseUrl.hostname.includes('wmlpuzuskfiwdipluglz')` (line 39)
- `!secretKey.startsWith('sk_test_')` (line 42)
- `EXPECTED_VERCEL_PROJECT_ID === productionProjectId || EXPECTED_VERCEL_PROJECT_NAME === 'garage-link'` (line 46)

None of these four denial checks ever referenced `VERCEL_DEPLOYMENT_ID` or `deployment.meta.githubCommitSha`; they are hardcoded-value comparisons unrelated to the deployment-lookup step. The removed checks (`deployment.meta?.githubCommitSha !== actualSha`, `runtime.vercel_deployment_id !== deployment.id`, and `deployment.id` in the fingerprint hash) were purely identity/provenance glue tying the Vercel API's view of "this deployment" to the runtime's self-report — not safety properties. The replacement `deployment.projectId !== project.id || deployment.url !== baseUrl.hostname` check (now looked up by `GET /v13/deployments/get?url=`) still confirms the hostname under test actually belongs to the already-denial-checked project before proceeding, so provenance is preserved by an equivalent mechanism, just anchored on hostname instead of a pre-known deployment ID. `runtime.release_sha !== actualSha` (using `VERCEL_GIT_COMMIT_SHA`, set explicitly per the code comment, not via Vercel's git integration) still independently ties the runtime fingerprint to the exact commit under test. Net assessment: the removal does not weaken the "never point this at production" guarantee — that guarantee lives entirely in the hardcoded denial checks, none of which were touched.

## Secret handling (`77f6900` and full range)

`git diff 7595bea..HEAD` and `git status` were both inspected in full. `77f6900` only adds `VERCEL_AUTOMATION_BYPASS_SECRET: ${{ secrets.GARAGE_STAGING_VERCEL_BYPASS_SECRET }}` to the workflow env (a GitHub Actions secret reference, no literal value) and reads `process.env.VERCEL_AUTOMATION_BYPASS_SECRET` in `playwright.config.ts` (no default/fallback string, only forwarded as a header value when present). `helpers.ts` reads `previewOtp` off the rendered page text via a regex, never logs or hardcodes a code. `git status` shows a clean working tree — no untracked files in this worktree. A targeted grep of the full diff for `sk_live|sk_test_<token>|whsec_|Bearer <token>` patterns returned nothing. No secret values found in any file, script default, or log statement introduced in this batch.

## Add-on disablement (`45e8efc`) — information disclosure

`apps/garage-link/src/app/api/billing/change-options/route.ts` now: 401s if unauthenticated (`ログインが必要です`), 403s if authenticated but not an active owner/admin member (`契約を変更する権限がありません`), otherwise unconditionally 403s with a single static message (`スタッフ・店舗・保存容量の追加購入は初回販売の対象外です`) regardless of the caller's plan, `stripe_subscription_id` state, or add-on `type`/`action`/`amount` — those fields are no longer read from the request body at all, so there is no code path where plan tier or current entitlement affects the response. This is strictly less differentiated than the removed code (which previously varied its error by plan-eligibility via `canAddStaff`/`canAddStore`/`canAddStorage`). No new information-disclosure surface introduced. The UI (`settings/billing/page.tsx`) matches: all three add-on `request_type` options are filtered out of the dropdown uniformly, and the client-side validation message is now a single generic string, not plan-conditional.

Final: PASS
Critical: 0
High: 0
