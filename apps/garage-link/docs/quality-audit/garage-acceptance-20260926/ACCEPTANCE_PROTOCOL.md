# PR #36 remaining acceptance

Starting commit: `f15b773e2f4015717e083fc4714b01e6413f3c7b`.
Branch: `codex/garage-link-overhaul-20260926`.
The existing overhaul remains in place. Production deployment, main merge, GitHub Actions, Orca, live Stripe charges and real customer/LINE sends are prohibited. The PR remains Draft after reporting.

## Product contract

- The 42 retired LINE routes are migration notices and navigation to L-LINK. Their primary operation is notice → L-LINK destination → return to GARAGE LINK → ordinary operation → revisit/reload. Each route may be `PASS_FEATURE_MOVED` only after the entire journey succeeds and error monitoring is reviewed. Do not restore legacy LINE operations.
- `/settings/l-link` exposes the current contract, eligibility, plan matrix and external destination. Current data integration availability may correctly be “preparing”. Verify the real subscription response, destination URL, no direct LINE operation, return and reload. Successful verification is `PASS_EXTERNAL_NAVIGATION`; no external configuration write is needed.
- `/settings/documents` edits the existing `stores.tax_display_mode`, `quote_note` and `invoice_note`. Company information uses the existing company settings. Shared notes are rendered by existing previews, not copied into individual document notes. Existing document number generation remains unchanged and its rule is displayed.
- `/settings/security` is read-only. It displays the authenticated account and current store role, Web login bot protection mode, self-only login restriction state and links to password reset, membership and audit management. Routine email OTP cannot be enabled from this page. No credentials or identity hashes leave the server helper.
- Billing acceptance uses the existing Stripe test registry and synthetic fixtures only. Complete test Checkout, local signed webhook processing, application return and subscription readback. `BLOCKED_EXTERNAL_TEST_ENV` requires evidence that no safe test environment can run.

## Freeze and evidence

After source review, commit one candidate and record its SHA and file manifest. Run all safe available automated suites and every one of the 124 Web routes against that candidate. Previous results are historical evidence, not inherited final PASS. Final browser tests include open, primary operation, back/close, reopen and reload; mutation routes also save and verify retained values. Run fresh-session login, logout/relogin, wrong-password recovery and reset after the changes. Exercise all 36 Android screens when the installed emulator can run. iOS evidence is identified separately.

Capture console, failed requests, HTTP errors, React/hydration failures, redirect loops and DB/RLS failures. Preserve raw events and explain confirmed navigation cancellations separately; do not silently discard unexplained errors.

The secret-free follow-up run ledger and final evidence are stored in the KANNAGI audit directory `operations/audits/garage-acceptance-20260926/`. Post-freeze test evidence stays outside the product checkout so that recording results does not change the tested HEAD. The PR report links the final SHA, evidence summary and unresolved items. A result is never PASS solely because the page rendered.

## Work routing

Independent local-safe document presentation work is offered first to the canonical Local runner. Auth, credential handling, billing, server authorization and final acceptance remain Codex work. Record Local completion, rejected/unavailable output and Codex supplementation. Review actual file changes and safety boundaries before adoption.
