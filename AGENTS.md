## KANNAGI main / Production safety guard

- Agent work must use a dedicated branch. Do not push an agent work branch directly to `main`.
- Advancing remote `main` requires explicit Owner approval quoting the exact 40-character commit SHA being advanced.
- Production deployment requires a clean worktree at that exact approved SHA and must pass `--build-env KANNAGI_RELEASE_SHA=<same exact SHA>`.
- Never guess, reuse, shorten, or substitute a branch name for `KANNAGI_RELEASE_SHA`.
- Do not remove, weaken, bypass, rename, or skip `apps/garage-link/scripts/verify-production-approval.mjs` or the `buildCommand` that invokes it from `apps/garage-link/vercel.json`.
- Preview and local builds remain allowed without Owner Production approval.
- If exact Owner approval is absent or SHA identity is ambiguous, stop before remote `main` write or Production deploy.

## Google Play review credential gate

- GARAGE LINK's canonical Google Play review login identifier is `app-review@kannagi-co.com`. Do not use legacy dummy review identities for review.
- Before every Google Play submission or resubmission, read back Play Console > App content > Sign-in details from the actual UI after saving. Never infer the saved value from memory, a prior run, or local configuration.
- The Play Console UI evidence must be fresh (maximum 24 hours), must contain the canonical identifier, English instructions, reusable credentials, no Owner-dependent OTP, and full review access. Never include the password in evidence, chat, logs, Git, screenshots, or reports.
- Before submission, verify a clean login using the exact version code being submitted, then run `pnpm google-play:review-preflight -- --evidence <fresh-ui-evidence.json>` with the review password supplied only from the approved secure source. The evidence version code must match the submitted version code and the command must also prove a live login against GARAGE LINK Production.
- If the preflight does not return `GOOGLE_PLAY_REVIEW_PREFLIGHT_PASS`, submission/resubmission is prohibited.
- After submitting, read back the Play Console review state. Do not report completion until Play Console shows the changes were sent for review.
- Any future invalid-credential rejection must trigger a cross-check of Play Console saved identifier + live Production login before considering a new build. Do not create a new build unless a separate verified code issue requires it.
- If `mobile_review_fixture_access.tenant_id` or `.store_id` is changed, `proof_hash` must be cleared to `NULL` in the same bounded change. A non-null proof hash is scope-bound; carrying it across a tenant/store change invalidates the review fixture and can fall back to ordinary store selection.

<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->
