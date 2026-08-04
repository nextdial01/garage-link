# Vercel Remote Change Plan — GARAGE LINK Integration Remediation

Human approval required: **yes**. No Vercel setting was changed for this plan.

## Evidence used

- Current project relationship and environment-scope finding: `projects/garage-link/evidence/2026-08-04-independent-github-integration-gate.md` (read-only, 2026-08-04).
- Official Vercel behavior: a Git-linked project creates Preview deployments for non-production branch pushes; Preview variables apply to non-production branches unless narrowed. Vercel docs, checked 2026-08-04.
- A local Vercel CLI binary was not available, so this remediation does not claim a second authenticated setting snapshot. The human Gate below begins with a read-only screenshot/export of every listed setting.

## Adopted single plan

### Project: Production `garage-link`

Current setting: Git-linked to `nextdial01/garage-link`, production branch `main`, custom domain `garage-link.tech`, and Preview scope contains the same Supabase identity/credential entry as Production according to the Integration Gate evidence.

Required setting: retain `main` as the only Production branch, remove all Production Supabase/service-role values from Preview scope, and configure the project's Ignored Build Step to skip every non-`main` Git deployment. The ignore condition must use Vercel's Git branch system variable and return the documented skip status for all branches other than `main`.

Reason: a Git-linked Vercel project otherwise creates a Preview for each non-production push. Skipping the Production project's non-main build closes the unsafe deployment path before application code can start.

Production impact: pushes/merges to `main` retain the existing Production deployment behavior. The custom domain remains attached only to this project.

Rollback: restore the prior Ignored Build Step and Preview environment entries only after staging has independently passed its deployment and identity checks. Do not copy Production credential values into Preview during rollback.

Verification: read-only inspect a non-main test push and show it was skipped on this project; inspect a `main` merge in an approved change window and confirm its deployment is Production and uses only Production scope.

### Project: staging `garage-link-staging` (`prj_Km3mc8IAxkLNDceHMbXEHQx2WmA3`)

Current setting: no Git link according to the Integration Gate evidence; canonical staging identity is `gaytoojzwqkpuvfofeql`.

Required setting: link only `nextdial01/garage-link`, restrict Preview branch tracking to the approved QA/staging branch pattern, and set every Supabase URL/service-role value in its Preview scope to the staging project only. No Production domain or Production credential is assigned to this project.

Reason: candidate previews require a dedicated project whose branch and credential scope are independently staging-only.

Production impact: none; this project has no Production domain and cannot deploy `garage-link.tech`.

Rollback: unlink the staging Git integration and remove the staging Preview branch rule. Do not transfer settings to the Production project.

Verification: after an approved candidate push, inspect its READY deployment: staging project ID, branch, source SHA, URL, and Supabase identity must all match the QA runner's required provenance contract. Confirm Production project shows no Preview for the candidate SHA.

## Main merge behavior

Only a merge to `main` creates a Production deployment on `garage-link`. The staging project must not be used as a Production promotion path; production receives its own build with Production-scoped variables.
