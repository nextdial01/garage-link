# GARAGE LINK Commercial Remediation Batch 1B

- Date: 2026-07-31
- Base SHA: `2ac482ba70edbce995122d8d1f183456529c437a`
- Scope: GARAGE LINK only
- Production changes: 0
- Stripe Live changes: 0
- Current DB changes: 0
- Remote staging/test writes: 0

## Fixed commercial contract

All customer-facing monthly amounts are gross JPY totals. Checkout disables
automatic tax and every registry Price must be `tax_behavior=inclusive`.

| Item | Gross | Net basis |
|---|---:|---:|
| Starter | ¥7,480 | ¥6,800 |
| Standard | ¥16,280 | ¥14,800 |
| Pro | ¥32,780 | ¥29,800 |
| Extra staff | ¥1,100 | ¥1,000 |
| Extra store | ¥5,500 | ¥5,000 |
| Extra storage 10 GB | ¥550 | ¥500 |

The machine-readable source is
`packages/billing/contract/garage-commercial-contract.json`. Generated
TypeScript, SQL and the public plan matrix are checked for drift in CI. The
billing-state policy is also generated from the same contract into TypeScript
and the SQL migration; unknown Stripe states fail closed.

## Remediation

- Entitlement access now evaluates Stripe status, grace expiry, period end,
  cancellation and restoration synchronously. Exact grace expiry is
  fail-closed without waiting for a webhook or worker.
- Every supported webhook retrieves the current Stripe Subscription and applies
  that authoritative snapshot. Event timestamps and event ID ordering are not
  used to decide the current state.
- Event ID idempotency, atomic retry claims, leases, exponential backoff,
  dead-letter state, manual retry and reconciliation diagnostics are present.
- Subscription mutations use a per-subscription lease and a durable operation
  ledger. A second open mutation is rejected rather than creating a duplicate
  Subscription.
- Plan and option changes use the existing Stripe Subscription with no
  proration. Downgrades apply at the next billing boundary.
- DB entitlement and quota checks use the generated entitlement table. The
  quota guard serializes concurrent writers and tests 2, 10 and 100 workers.
- The staging preflight fingerprints the exact Vercel team/project, Supabase
  project and Stripe test account and denies Production/Live identifiers. It
  also reads the deployed application's authenticated, non-secret runtime
  fingerprint and compares the app's actual Supabase host, Stripe mode/account,
  Vercel project/deployment and release SHA.
- The 18-step Stripe test suite uses a Test Clock, verifies gross totals through
  Checkout, Subscription, Invoice, receipt and Portal, exercises failure and
  recovery, and tears down marker-owned disposable Stripe objects only.

## Local evidence

| Gate | Result |
|---|---|
| lint | PASS |
| typecheck | PASS |
| security tests | PASS, 326/326 |
| build | PASS with the existing Edge-runtime warning |
| commercial contract drift | PASS |
| migration fresh / reapply | PASS, 52 migrations |
| Current-like upgrade fixture | PASS |
| rollback / reapply | PASS |
| schema drift | PASS |
| quota concurrency | PASS, 2/10/100 workers |
| owner-fixed Batch 1B matrix | PASS, 31/31 traced to executable tests/fixtures |
| local billing-state variations | PASS, 33 executable cases |

## Independent review history

The first fixed SHA `72cbd02ac718f8a45ad1716d73acfb24aa6a2d4f`
failed independent review. It found stale-subscription overwrite, false-positive
out-of-order/reconciliation/quota tests, incomplete cancellation/add-on/grace
coverage, missing lease fencing, a process-kill recovery gap and a Vercel
self-attestation weakness. None was waived.

The follow-up remediation:

- rejects a delayed event from an old Subscription after re-contracting;
- always prefers metadata from the retrieved current Subscription;
- fences webhook completion/failure by lease owner;
- reconciles stale `started` mutations only after verifying Stripe observed the
  requested target;
- attests Vercel project/deployment/SHA through the read-only Vercel API;
- performs an actual two-writer vehicle quota race in staging;
- requires reconciliation HTTP 200 and uses unique non-duplicate reverse-order
  webhook fixtures;
- adds durable scheduled-cancellation/restoration operations, add-on removal,
  exact restriction with zero-day remote grace and canceled re-contract flows.

The successor SHA must receive a fresh two-axis independent review before any
remote write.

The latest local remediation also requires a stable client idempotency key for
Checkout recovery after a process loss, prevents an unrelated `started`
operation from being completed by a webhook snapshot, makes reconciliation
fail when the requested Stripe mutation is not observed, and requires the real
E2E reconciliation step to claim and complete a forced recovery operation.

## Deliberately pending

No remote test result is claimed. Dedicated Vercel/Supabase staging, inclusive
Stripe test Prices, Portal configuration, webhook registration, PC/mobile
browser checks and the 18-step real Stripe lifecycle require the separate
remote execution gate. Until those pass, all paid plans remain `NOT_READY`.

Stripe keeps completed Checkout Sessions and finalized/paid test invoices as
immutable test-mode ledger records. Teardown therefore expires open Sessions,
deletes draft invoices, cancels every tracked Subscription, deletes the
marker-owned Customer/Test Clock and verifies zero non-canceled
Subscriptions. Immutable terminal Sessions/invoices are inventoried by count
without IDs, PII or payloads; they cannot be deleted through Stripe's API.
