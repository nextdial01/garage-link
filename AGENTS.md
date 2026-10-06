## KANNAGI main / Production approval policy

- Agent work must use a dedicated branch. Do not push an agent work branch directly to `main`.
- Advancing remote `main` requires explicit Owner approval quoting the exact 40-character commit SHA being advanced.
- Reflecting that Owner-approved SHA on `main` also authorizes Production publication of the same exact SHA, consistent with merged PR #37. Do not require a second approval through `KANNAGI_RELEASE_SHA`.
- Production deployment must use only that exact Owner-approved SHA. Before deploying, verify that the worktree is clean and HEAD exactly matches the approved SHA.
- If a different SHA becomes necessary, stop; never reuse approval for a previous SHA.
- Preview and local builds remain allowed without Owner Production approval.
- If exact Owner approval is absent, SHA identity is ambiguous, or remote `main` has advanced unexpectedly, stop before remote `main` write or Production deploy.

<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->
