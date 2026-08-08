# GARAGE LINK Integration Remediation — Fixed Inventory

Date: 2026-08-04  
Base candidate: `93bda17e80ac8b7e494ef16bd11262f6ab832694`

## Scope fixed before remediation

| Area | Fixed source | Finding / root cause |
|---|---|---|
| Production migration lane | `supabase/migrations/20260804033831_*` through `20260804043651_*`, `supabase/baseline/manifest.json`, `migration-classification.csv` | High 2 / release-lane isolation |
| QA migration lane | above four SQL files and four rollback files | High 2, Medium 1 / isolated lifecycle and symmetric rollback |
| QA operator | `scripts/qa/lifecycle.mjs`, `scripts/qa/lifecycle-core.mjs`, `package.json` | High 1, High 4, Medium 2 / provenance and portable credential contract |
| Registry and teardown | `20260804033831_qa_lifecycle_framework.sql`, `qa_lifecycle_regression.sql` | High 3 / destructive scope |
| Completion state | framework migration, runner, `tests/qa/lifecycle-state-machine.test.mjs` | High 4 / external cleanup evidence |
| Runbook | `docs/qa-lifecycle-runbook.md` | High 1, High 2, High 4, Medium 1, Medium 2 |
| Tests | `tests/qa/lifecycle-state-machine.test.mjs`, `supabase/tests/qa_lifecycle_regression.sql` | contract, negative, lifecycle coverage |
| Remote configuration | Vercel project identities in lifecycle contract; Integration Gate evidence | High 1 / read-only plan only |

## Root-cause batches

1. Environment/release-lane isolation: move QA DDL out of the normal migration directory and normal manifest; require verified staging identity and immutable deployment provenance before the QA runner can operate.
2. Destructive operator scope: derive dry-run and actual deletion from the same exact registered IDs; reject any unregistered user relationship before deletion.
3. Lifecycle truth: represent DB, Auth, Storage, artifacts and verification separately; only evidence produced by the current run can satisfy finalize.
4. Reversibility/portability: restore every function changed by canary rollback and remove machine-specific Vercel authentication-file access.

## Deliberately out of scope

Completed browser/UX, black-box, OTP, canary, fixture cleanup and staging quality audits are not rerun. No remote DB, Vercel, GitHub, Stripe Live, LINE, or customer operation is authorized in this remediation.
