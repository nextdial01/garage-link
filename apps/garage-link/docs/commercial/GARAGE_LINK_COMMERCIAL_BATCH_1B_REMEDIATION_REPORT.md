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
TypeScript, SQL and the public plan matrix are checked for drift in CI.

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
  project and Stripe test account and denies Production/Live identifiers.
- The 18-step Stripe test suite uses a Test Clock, verifies gross totals through
  Checkout, Subscription, Invoice, receipt and Portal, exercises failure and
  recovery, and tears down marker-owned disposable Stripe objects only.

## Local evidence

| Gate | Result |
|---|---|
| lint | PASS |
| typecheck | PASS |
| security tests | PASS, 278/278 |
| build | PASS with the existing Edge-runtime warning |
| commercial contract drift | PASS |
| migration fresh / reapply | PASS, 52 migrations |
| Current-like upgrade fixture | PASS |
| rollback / reapply | PASS |
| schema drift | PASS |
| quota concurrency | PASS, 2/10/100 workers |
| local Batch 1B matrix | PASS, 42 named cases |

## Deliberately pending

No remote test result is claimed. Dedicated Vercel/Supabase staging, inclusive
Stripe test Prices, Portal configuration, webhook registration, PC/mobile
browser checks and the 18-step real Stripe lifecycle require the separate
remote execution gate. Until those pass, all paid plans remain `NOT_READY`.

