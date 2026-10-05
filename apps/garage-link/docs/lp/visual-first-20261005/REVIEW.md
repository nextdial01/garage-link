# Visual-first LP / 2026-10-05

Baseline: 1d32b21bd6cf8bebf3954d7e642226f28b081dcc. Owner replaced the previous document-like design and old layout contract.

- Real existing product DOM, 88% viewport width; starts at y397.7 (1440) / y375.4 (390).
- Marketing copy 329 / 752 characters = 43.75%, identical exclusions and hydration state.
- Hero → five-state product platform → free operation → centered Free price → short CSV migration → FAQ → final CTA/legal.
- Existing demo business logic, data, tracking, billing facts, SEO and legal destinations preserved.
- Qwen canonical runner attempted first, 600s timeout, zero diff, no extra generation. Codex implemented and reviewed; independent QA found mobile stage scroll retention, fixed and click/keyboard rechecked. No P0/P1. Minor repeated initial vehicle screen retained because presentation and free operation have different purposes.
- Build, typecheck, changed-file lint PASS. LP 11 + conversion/navigation 17 = 28 PASS. Five viewports checked. Tests now enforce latest product-first requirements instead of rejected platform spacing.
- Mobile sticky CTA now hides whenever final CTA is visible. Stage tabs reset internal scrolling and visual separators are hidden from assistive technologies.
- Scope: local unauthenticated LP only. Staging QA lifecycle targets authenticated DB-backed fixtures; not invoked and no claim of staging cleanup or Production validation.
- No Production, main, remote Git, dependency, backend, auth, database or billing changes.

Screenshots are actual local production-build browser captures, not generated images. Final public Preview read-back is recorded in CURRENT_MASTER_STATUS.json.
