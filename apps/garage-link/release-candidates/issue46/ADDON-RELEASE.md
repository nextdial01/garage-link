# Issue 46 — additional staff/store/storage only

Source candidate ca52fbe38804201bf07729aa0d1111a04897dcbf; baseline main e8f73c1d296d5be4a6530f7d20064060e0917f7f. Local unapplied candidate. No L-LINK runtime, SQL, S2S keys, store mapping or cancellation cron is imported. Existing GL webhook, billing reconciliation, billing contract and quota enforcement remain baseline main.

## Independent authorization

Addon admission is closed by default. Exact approved/deployed 40-character SHA, production Live Stripe, correct GL DB URL, enabled schema/rollback attestation are required. An authenticated current active owner/admin membership and AAL2 are required. Existing service-only assert_service_tenant_store_context RPC verifies eligible GL store/tenant. Direct service SELECT of stores is deliberately not used: its Production permission is false. Paid GL subscription and matching Live Stripe company/customer/base plan/quantity remain mandatory. No fake tenant or static LL scope is introduced.

## Minimal design comparison

Ten possible decoupling routes considered: (1) selected standalone addon contract plus existing authoritative GL context RPC; (2) addon-only GL tenant/store allowlist; (3) dedicated addon API adapter with its own contract; (4) GL DB addon allowlist with RLS; (5) addon feature-specific discriminator in shared contract; (6) separate addon and LL policy functions in shared module; (7) purpose-specific release configuration objects; (8) versioned addon manifest with GL scope claims; (9) database-mediated addon admission RPC; (10) per-store signed addon release claims. Routes 2/4/8/10 require redundant store provisioning; 5/6 preserve shared security coupling; 3/7 add redundant wrappers; 9 adds a new security boundary/migration. Route 1 reuses actual authenticated GL scope and needs no new role/grant/store mapping. This is a bounded adapter fix, not a new payment architecture.

## Application DAG (all Production operations require Owner approval)

Use only addon.up.sql against GL wmlpuzuskfiwdipluglz. Do not run blanket migration push. Its baseline body/owner/search_path/ACL guard is the concurrency/staleness precondition. Set session garage.issue46_commercial_candidate_sha to the exact Owner-approved SHA. The value is an operator authorization marker, not a cryptographic SQL self-hash; verify the external manifest and clean approved Git HEAD before execution. New garage_addon_release_ready checks promoted body MD5 b5fdf216089d780caeb4cacfe33599bc and exact privilege contract.

Existing three active Live JPY monthly price IDs and base-plan IDs, Live secret/webhook/GL DB keys and CRON_SECRET are reused. No new Stripe Product/Price/customer/subscription/purchase is needed to publish. Staff 1,100 yen/person; store 5,500 yen/store; storage 550 yen/10GB. Starter staff/storage, Standard/Pro all, Free none. Provider mutation is idempotent, no proration, payment error_if_incomplete; API returns pending until authoritative webhook/reconciliation reflects absolute quantities. Existing extra entitlement fields feed staff/store/storage limits. Decrements retain currently paid limits until renewal.

Closed application deployment can occur only after exact approval; SQL/config preparation are independent while admission remains false. Open after SQL readiness=true, GL DB/provider binding passes, webhook route and existing GL /api/jobs/billing-reconciliation cron */10 * * * * registration are read back. This is deployment verification, not an authorized purchase or card test. No live billing mutation is part of operator verification. MFA returns to billing. Public pages and billing forms open only for matching server-owned public SHA and addon admission; closed display says receipt stopped. L-LINK copy and behavior retain baseline.

## Git and deployment

GitHub push/PR may trigger Vercel automatically; never push before exact SHA approval. Candidate commit contains [skip ci]; existing push/pull_request workflows are skipped under GitHub documented semantics. No workflow is created/changed/run/rerun, no dispatch and no GitHub Actions fallback. Schedule/workflow_dispatch historical workflows are not invoked. Before approved main fast-forward, read back main still equals baseline and workflow trigger types still match this reviewed baseline. Read-only GitHub branch read-back confirmed main is unprotected, required checks empty, and still equals baseline. The approved publication route is exact candidate main fast-forward with [skip ci], letting the Git-associated Vercel build carry the actual commit identity. If these preconditions change, do not run Actions or force past protection; preserve the frozen candidate and stop that publication operation. Vercel auto-deploy remains closed until matching environment configuration is applied. Same-SHA redeployment/config opening is included in the single Owner operation set.

GitHub reference: https://docs.github.com/en/actions/how-tos/manage-workflow-runs/skip-workflow-runs

## Restore

Close GARAGE_ADDON_ENABLED and GARAGE_ADDON_PUBLIC_SHA and redeploy the same SHA closed. Keep existing webhook and GL billing reconciliation running; wait for in-flight requests to finish, then settle existing operations by authoritative Stripe reads. No purchase replay. SQL rollback refuses any non-completed/non-failed change_option operation, operator_action_required (including uncertain failed), or any active subscription lease, using table locks. Resolve dead-letter/uncertain outcomes before down. Set reviewed-SHA marker; apply addon.down.sql; restore baseline GL deployment dpl_2XqMp9r4TARUNeGHdYumdbJSMkQu (main e8f73c...). Preserve invoices/subscriptions/operation history and paid extra quantities. Rollback is not a refund and does not erase service data. No LL operation is necessary.

## Independent audit remediation 6095770301 (unapplied)

Three bounded fixes only: billable extra quantity now comes from the authoritative Stripe item under the existing mutation lease; DB extra fields remain current-cycle retained entitlements. A same-key operation is rechecked inside the lease before any provider mutation. SQL up/down and canonical body hashes are unchanged.

The billing screen stores a per-store explicit intent with payload/key/state. A new purchase gets a new UUID even when its payload matches a prior completed purchase. Pending/uncertain requests use the separately labelled previous-request retry with the original key/payload. The authenticated AAL2-scoped GET change-options endpoint reads only that tenant's change_option status. Reload recovers pending/completed state; completion permits a deliberate new purchase. New purchases remain disabled during uncertain/pending recovery, and synchronous controller locking prevents duplicate-click identity creation.

Purchase, public presentation, status and MFA all use admittedReadyAddon: enabled production Live/correct-DB/manifest/actual deployment identity **and** exact GARAGE_ADDON_PUBLIC_SHA plus real garage_addon_release_ready=true. Missing/mismatched public SHA or RPC failure closes both API and display. No environment setting is changed by this implementation.

Restoration remains closed admission/public SHA -> retain webhook/reconciliation until drain -> guarded SQL down -> previous production baseline. The prior b573476 candidate was never deployed and contains the three audited defects; it is historical evidence, not a rollout or rollback target. Publication still requires new exact-SHA Owner approval.
