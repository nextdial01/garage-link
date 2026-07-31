# GARAGE LINK Batch 1B Release Execution Runbook

This runbook is restricted to the approved dedicated staging and Stripe test
mode. It never authorizes Production, Current DB, Stripe Live, DNS, paid sales
or advertising.

## 1. Before any remote write

1. Confirm the operator-approved commit SHA and a clean worktree.
2. Run lint, typecheck, security tests, build, contract drift, full DB
   fresh/upgrade/rollback/reapply and the independent review.
3. List the exact Vercel team/project, Supabase ref, Stripe test account,
   Products, old Prices, proposed new Prices, Portal configuration and webhook.
4. Read the actual Vercel deployment through the Vercel API and verify its
   project ID, team ID, project name, hostname and Git SHA; never self-compare
   two manually supplied copies of the same ID.
5. Compare every identifier with the Production/Live denylist.
6. Compute the staging fingerprint and stop on any mismatch.
7. Confirm the minimal resource tier and that no additional paid option is
   selected.

## 2. Persistent staging resources

1. Create Vercel project `garage-link-staging`.
2. Create Supabase project `garage-link-staging`.
3. Apply all 52 migrations to the dedicated empty staging database.
4. Insert synthetic, marker-owned fixtures only.
5. Configure only test-mode Stripe Price IDs and the staging webhook secret.
6. Deploy only the approved SHA.

## 3. Stripe test registry

For every recurring Price verify:

- `livemode=false`, JPY, monthly, active and expected Product;
- gross unit amount is exactly 7,480 / 16,280 / 32,780 / 1,100 / 5,500 / 550;
- `tax_behavior=inclusive`;
- Subscription `automatic_tax.enabled=false`;
- no Subscription default tax rates;
- Stripe account default and registrations cannot add tax.

Stop if an unapproved Product, Price or tax write is necessary. New Prices are
created instead of editing existing Prices. Old Starter/Pro Prices are
inactivated only after the new registry is deployed and reference count is zero.

## 4. Lifecycle execution

Run the preflight, registry verifier and `test:e2e:billing`. Preserve only
PII-free evidence for these 18 checkpoints:

1. paid signup
2. Checkout
3. payment success
4. webhook
5. DB plan
6. entitlement
7. quota
8. Portal
9. upgrade
10. downgrade
11. add-on
12. payment failure
13. grace/restriction and payment recovery
14. cancellation
15. restoration
16. duplicate webhook
17. out-of-order webhook
18. reconciliation

Confirm PC and smartphone behavior separately. The gross total must be checked
at Checkout, Subscription, Invoice, receipt, Portal, failure recovery and plan
change boundaries.

## 5. Teardown and evidence

Delete only objects carrying the exact disposable marker: test customer,
Subscription, Checkout Session, invoices where Stripe permits deletion, Test
Clock and disposable fixtures. Retain the dedicated staging projects, canonical
test Price registry, Portal configuration and webhook. Record retained resources,
deleted objects, reference-zero evidence, recurring cost, SHA and fingerprints
without secrets or PII.

## Stop conditions

Stop remote writes immediately on Production/Live detection, fingerprint or SHA
mismatch, dirty worktree, real customer data, wrong gross total/tax behavior,
unapproved object or migration, non-rollbackable state, secret/PII exposure or
unexpected recurring cost.
