# GARAGE LINK Onboarding/Billing Path — Independent Follow-up Review

Reviewer: independent spec review agent
Reviewed: commit `56d80fb`, branch `codex/garage-link-staging-commercial-verification`
Scope: the one-line fix adding `/onboarding` to `CANCELLED_ALLOWED_PATHS` in
`apps/garage-link/src/lib/billing/contractAccess.ts`, and how it interacts with
`middleware.ts`, `post-auth-redirect.ts`, `onboarding/page.tsx`, `store-onboarding.ts`.

## 1. Does this close the loop for the targeted states?

Yes, for the six states the fix targets (`checkout_pending`, `initial_payment_pending`,
`restricted`, `unpaid`, `canceled`, `reconciliation_required`). Traced `middleware.ts` L200-243
by hand for a tenant with incomplete onboarding and `accessState = 'unpaid'`:

- Request to `/onboarding`: L193 skipped (postAuthPath is `/onboarding`, not `/dashboard`).
  L200's incomplete-onboarding block explicitly excludes `pathname !== '/onboarding'`, so it never
  fires here. L233-243's billing block now finds `isBillingRecoveryAllowedPath('/onboarding')`
  true (via `BILLING_RECOVERY_ALLOWED_PATHS = [...CANCELLED_ALLOWED_PATHS, ...]`, imported
  correctly at L5), so no redirect — `/onboarding` renders. **`/onboarding` is now a stable
  terminal landing page for these six states.**
- Request to `/settings/billing` while onboarding is still incomplete: L200's block fires
  (`postAuthPath.startsWith('/onboarding')` is true) and bounces once to `/onboarding`, which is
  now stable per above. So it's a single hop, not a loop — `/settings/billing` cannot actually be
  reached until onboarding completes, which matches the fix's intent (onboarding always wins over
  billing-recovery until `onboarding_completed_at` is set, then the tenant lands on
  `/settings/billing` on their first post-completion request via L233-243). No infinite loop for
  this scenario.

## 2. Critical gap: the fix touches a list `middleware.ts` doesn't use for `cancelled_retention`

`middleware.ts` does **not** import `isCancelledRetentionAllowedPath` from `contractAccess.ts` —
only `isBillingRecoveryAllowedPath` is imported (L5-8). Instead, `middleware.ts` L34-37 and L54-58
define their **own local, same-named** `CANCELLED_RETENTION_ALLOWED` array (`['/settings/billing',
'/logout']`) and `isCancelledRetentionAllowedPath` function, used at L227 for the
`cancelled_retention` branch. This local array was **not** touched by commit `56d80fb` — the fix
only edited `contractAccess.ts`'s exported `CANCELLED_ALLOWED_PATHS`/`isCancelledRetentionAllowedPath`,
which `grep` confirms is dead code (never imported anywhere in `src/`).

Consequence: a tenant with incomplete onboarding and `accessState === 'cancelled_retention'`
still bounces forever:
1. `/onboarding` → L227: local `isCancelledRetentionAllowedPath('/onboarding')` is false (list
   lacks `/onboarding`) → redirect to `/settings/billing?contract=cancelled`.
2. `/settings/billing` → L200: `postAuthPath` still `/onboarding` → redirect back to `/onboarding`.
3. Repeat indefinitely — `ERR_TOO_MANY_REDIRECTS`, identical failure class the fix was meant to
   eliminate, just for the one `ContractAccessState` the fix's own commit message (and this
   review's brief) excluded from its target list. This is a real, currently-open gap, not a
   theoretical one — `cancelled_retention` is a normal, reachable state (retention window after
   cancellation) and nothing prevents it coinciding with incomplete onboarding.

Recommend either: (a) add `/onboarding` to `middleware.ts`'s local `CANCELLED_RETENTION_ALLOWED`
too, or (b) delete the local duplicate and have `middleware.ts` import
`isCancelledRetentionAllowedPath` from `contractAccess.ts` so there is one source of truth.

## 3. Any new authorization gap from exempting `/onboarding`?

None found. `onboarding/page.tsx` and `store-onboarding.ts` only read/update the tenant's own
`stores` row (name, address, business_type, sales/purchase recognition basis, primary nav tabs,
`onboarding_completed_at`) — profile/preference fields, not plan entitlements, and the store
already exists pre-onboarding (created during signup). No store creation, no Stripe
calls, no RPC that provisions paid features. The "先に1台登録する" link to `/vehicles/new` does
not bypass billing gating — that route is re-checked by middleware on its own request and is not
in any allow-list, so a billing-restricted tenant clicking it is bounced to `/settings/billing`
same as before. Exempting `/onboarding` from the billing block does not widen what a
restricted-billing tenant can mutate.

## Final: FAIL
Critical: 1
High: 0
