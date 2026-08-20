# GARAGE LINK Production privileged readiness — 2026-08-20

## Approved operation

- Objective: emergency recovery for password login and sidebar brand rendering.
- Approval scope: staged validation, then Production deployment and smoke test only after Staging passes.
- Prohibited actions: Supabase credential rotation, password reset, Production fixture/user mutation, Production DB migration, Stripe Live write, LINE send, billing-gate weakening, authentication bypass, rollback without evidence.

## Immutable baseline

- Canonical repository realpath: `/Users/ksk/kannagi/projects/garage-link/repos/main`.
- Isolated implementation worktree: `codex/garage-link-emergency-login-logo-20260820`.
- Production Vercel project: `garage-link` / `prj_OOUdmGaVBHaVPMxPHTiPXLw3Tq64`.
- Production deployment at preflight: `dpl_2PhHGUJLDYTbcNeeJ98b6DGottvu`, READY, source `901d9f0fc0ecd26e79be7834af556226c5089108` on `main`.
- Staging Vercel project: `garage-link-staging` / `prj_Km3mc8IAxkLNDceHMbXEHQx2WmA3`.
- Staging Supabase target: `gaytoojzwqkpuvfofeql`.

## Readiness gates

- Repository identity, baseline SHA, worktree isolation, Vercel project identities, Staging target: verified read-only.
- Required repository instructions and installed Next.js 16.2.11 Proxy, Route Handler, Cookie, and Image documentation: reviewed.
- Local QA lifecycle, fresh DB, lint, typecheck, security regression, and build: required before Staging deployment.
- Staging lifecycle: must use one UUIDv4 and complete `PREFLIGHT_READY` through `VERIFIED_CLEAN`/`COMPLETE` with zero residue.
- Production credential validation: no Owner password, customer account, or Production fixture will be used. A previously authorized safe validation credential, if available, may be used only for the final Production login proof.
- Production write gate: blocked until the Staging lifecycle and its new auth/layout browser probes pass.

## Release decision rule

Production deploy is permitted only when every local gate and the Staging lifecycle gate pass. Any missing Owner-only Production validation credential is a single terminal Owner gate; it does not authorize a password reset, temporary account, or customer-data mutation.
