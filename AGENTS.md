## KANNAGI main / Production safety guard

- Agent work must use a dedicated branch. Do not push an agent work branch directly to `main`.
- Advancing remote `main` requires explicit Owner approval quoting the exact 40-character commit SHA being advanced.
- Production deployment requires a clean worktree at that exact approved SHA and must pass `--build-env KANNAGI_RELEASE_SHA=<same exact SHA>`.
- Never guess, reuse, shorten, or substitute a branch name for `KANNAGI_RELEASE_SHA`.
- Do not remove, weaken, bypass, rename, or skip `apps/garage-link/scripts/verify-production-approval.mjs` or the `buildCommand` that invokes it from `apps/garage-link/vercel.json`.
- Preview and local builds remain allowed without Owner Production approval.
- If exact Owner approval is absent or SHA identity is ambiguous, stop before remote `main` write or Production deploy.

<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->
