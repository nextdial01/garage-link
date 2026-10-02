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
8. After submitting, read back the Play Console review status. Do not report completion until the status shows that the changes were sent for review.

## Evidence JSON contract

The temporary evidence must contain: `package_name`, `login_identifier`, `saved=true`, `instructions_language=en`, `reusable_credentials=true`, `otp_required=false`, `all_app_functions_accessible=true`, `submitted_version_code`, matching `tested_version_code`, `final_build_login_verified=true`, fresh `final_build_verified_at`, `source=play-console-ui-readback`, and a fresh `readback_at` timestamp.

Evidence older than 24 hours is rejected. A failed live production login is rejected. Any checked-in `@review.invalid` reviewer identifier outside the gate's own fixtures is rejected.
