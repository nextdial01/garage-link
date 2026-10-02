# GARAGE LINK Google Play review preflight

This gate exists because Google Play review was rejected on 2026-10-02 after Play Console still contained an obsolete reviewer identifier while the production review account had already been standardized.

## Canonical review identity

- App: GARAGE LINK
- Package: `com.kannagi.garagelink`
- Review login identifier: `app-review@kannagi-co.com`
- Password: never store in Git, evidence files, chat, logs, or screenshots.

## Mandatory sequence before every Google Play submission or resubmission

1. Open Play Console > Policy and programs > App content > Sign-in details.
2. Read back the saved login identifier from the Play Console UI. If it is not exactly `app-review@kannagi-co.com`, correct it and save before continuing.
3. Keep the reviewer instructions in English. The credentials must be reusable, non-expiring for the review window, not location-dependent, and must not require a one-time code from the Owner.
4. Generate a temporary evidence JSON from the actual Play Console UI readback. Do not hand-author it from memory and do not include the password.
5. Install/run the exact version code being submitted and verify a clean sign-in with the same review credentials. Record only the version code, PASS state, and verification time; never record the password or session token.
6. Run the live preflight with the same password that is saved in Play Console.
7. Submission/resubmission is blocked unless the command returns `GOOGLE_PLAY_REVIEW_PREFLIGHT_PASS` and the tested version code exactly matches the submitted version code.
8. If the production mobile review fixture scope is changed, update `tenant_id`/`store_id` and clear `proof_hash` to `NULL` in the same bounded operation. The next authenticated mobile request must regenerate the proof for the new scope before final-build verification.
9. After submitting, read back the Play Console review status. Do not report completion until the status shows that the changes were sent for review.

## Evidence JSON contract

The temporary evidence must contain: `package_name`, `login_identifier`, `saved=true`, `instructions_language=en`, `reusable_credentials=true`, `otp_required=false`, `all_app_functions_accessible=true`, `submitted_version_code`, matching `tested_version_code`, `final_build_login_verified=true`, fresh `final_build_verified_at`, `source=play-console-ui-readback`, and a fresh `readback_at` timestamp.

Evidence older than 24 hours is rejected. A failed live production login is rejected. Any checked-in `@review.invalid` reviewer identifier outside the gate's own fixtures is rejected.

## Review fixture scope invariant

`mobile_review_fixture_access.proof_hash` is derived from the exact user + tenant + store scope. It must never be reused after `tenant_id` or `store_id` changes. A scope change without clearing the proof is considered a failed preflight condition.

## Native review workspace acceptance (required, never inferred from Auth alone)

Run the submitted version code from a clean logout and process restart. Capture secret-free evidence from the actual native UI, Production API status logs, and fresh read-only DB queries. Complete a second logout, full process stop, restart and login with the same Keychain credential. Do not use a rebuilt candidate in place of the submitted artifact.

`review_workspace` is mandatory in the evidence JSON:
- `source`: `final-build-ui-api-and-db-readback`.
- `scope_changed`: boolean. For true, `scope_change.before` and `.after` contain user_id, tenant_id, store_id and after.proof_is_null=true from locked transaction readback. Call `validateFixtureScopeChange` before committing any bounded fixture scope change; a carried proof fails. This helper is a guard, never Production write authority.
- `fixture`: user_id, tenant_id, store_id, revoked=false, proof_length=64, current_scope_verified=true. Never copy the proof value. Establish current scope by successful authenticated native bootstrap returning exactly the prepared review store, plus NULL-to-NONNULL64 DB readback after any reset. A length of64 alone is insufficient.
- `stores`: exactly one object with id, tenant_id and name matching the canonical prepared review workspace in policy. No foreign store may be returned.
- `current_user_active_store_id`: actual reviewer-context RPC readback must equal the review store, not just the per-tenant preference.
- `preferences`: all accessible tenant preference snapshots with id, tenant_id, active_store_id, updated_at. The globally newest row must be the prepared review store.
- `store_selection_status=200`, `store_selection_409_count=0`, `today_status=200`, `today_store_id` matching review store. Any conflict blocks submission.
- `major_screens`: today, vehicles, customers, maintenance and quotes all true after actual read-only UI verification.
- `relogin_verified=true`, `flower_store_visible=false`, `unrelated_production_changes=0`, `password_exposure=0`.

Verify Today, Vehicles, Customers, Maintenance and Quotes in the actual app without saving/creating/editing/deleting sample or customer data. Inspect logs only after the repair timestamp for foreign-store business access. No password/token, request body, HAR or trace is evidence.

### Multi-tenant no-op selection regression

`current_user_active_store_id()` selects the accessible preference ordered by updated_at DESC, then id. The current `switch_active_garage_store()` returns unchanged without refreshing updated_at when that tenant already has the requested store. Therefore reselecting the same review store does **not** reestablish the global current scope if another tenant preference is newer. The regression test preserves this failure case and blocks submission even when the submitted review preference's store ID is correct. A separately authorized one-column timestamp reassertion makes the review preference newest; never change/delete another tenant's preference or membership.

No backend/RPC fix, migration, deployment or new Android build is part of this PR extension. If future implementation changes same-store switching, add a new migration and run the cross-tenant regression against it; never rewrite an applied migration.

### Secret input

The live CLI reads the named Mac Keychain item directly through captured process pipes into memory. Do not export the review password into an environment variable, use a clipboard, write a temporary file, or enable request tracing. Report only PASS/failure codes and nonsecret evidence.
