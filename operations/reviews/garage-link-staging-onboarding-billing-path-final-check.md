# GARAGE LINK Onboarding/Billing Path — Final Confirmation Check

Reviewer: independent final-confirmation pass
Reviewed: commit `c5f48fe`, branch `codex/garage-link-staging-commercial-verification`
Scope: `apps/garage-link/src/middleware.ts` (full), `apps/garage-link/src/lib/billing/contractAccess.ts`
(full), `apps/garage-link/src/lib/auth/post-auth-redirect.ts` (full) — every `ContractAccessState`
value against both `/onboarding` and an other protected path, plus a redirect-URL-construction sweep.

## Mechanics confirmed by reading the code

Two independent gates exist and c5f48fe closes the one prior review (`...-review.md`) flagged open:
- `middleware.ts` L34-38/L55-59: local `CANCELLED_RETENTION_ALLOWED` / `isCancelledRetentionAllowedPath`,
  used only for `accessState === 'cancelled_retention'` (L228). **Now contains `/onboarding` (L36).**
- `contractAccess.ts` L37-44 `BILLING_RECOVERY_ALLOWED_PATHS` (spreads `CANCELLED_ALLOWED_PATHS`, which
  already had `/onboarding` from 56d80fb), used via imported `isBillingRecoveryAllowedPath` for the
  six-state array `['checkout_pending','initial_payment_pending','restricted','unpaid','canceled',
  'reconciliation_required']` (L235-236). Unchanged by c5f48fe, still contains `/onboarding`.
- `contractAccess.ts`'s own exported `isCancelledRetentionAllowedPath` (L46-51) remains dead code
  (never imported by `middleware.ts`) — harmless now, but a landmine for the next person who assumes
  editing it affects `cancelled_retention` routing. Not a launch blocker; worth a follow-up cleanup.

Critically, when `onboarding_completed_at` is null, `resolvePostAuthPath` returns `/onboarding`
**independent of billing state** (`post-auth-redirect.ts` L69-70 never inspects contract access).
Middleware's L201-215 block redirects any non-`/onboarding`, non-public path to `postAuthPath` whenever
it starts with `/onboarding`/`/signup` — this fires and returns *before* `get_member_contract_access`
is even queried (L223), so for part (b) the `ContractAccessState` value is never consulted at all.

## State-by-state enumeration (onboarding incomplete)

| State | (a) request `/onboarding` | (b) request `/settings/billing` or `/dashboard` | Stuck bouncing? |
|---|---|---|---|
| `active` | No billing branch matches; renders `/onboarding`. | L201 fires unconditionally → 1 hop to `/onboarding`, which renders. | No |
| `grace_period` (unexpired) | Same as above, no billing branch matches. | Same 1-hop path. | No |
| `grace_period` (expired→`restricted`) | In 6-state array; `/onboarding` allowed → renders. | Same 1-hop path (state not even checked). | No |
| `cancellation_scheduled` (unended) | No billing branch matches; renders. | Same 1-hop path. | No |
| `cancellation_scheduled` (ended→`canceled`) | In 6-state array; `/onboarding` allowed → renders. | Same 1-hop path. | No |
| `checkout_pending` | In 6-state array; allowed → renders. | Same 1-hop path. | No |
| `initial_payment_pending` | In 6-state array; allowed → renders. | Same 1-hop path. | No |
| `restricted` | In 6-state array; allowed → renders. | Same 1-hop path. | No |
| `unpaid` | In 6-state array; allowed → renders. | Same 1-hop path. | No |
| `canceled` | In 6-state array; allowed → renders. | Same 1-hop path. | No |
| `cancelled_retention` | Checked against local `CANCELLED_RETENTION_ALLOWED`, which **now** includes `/onboarding` (c5f48fe) → renders. | Same 1-hop path. | No — this was the exact gap the prior review flagged; confirmed closed. |
| `reconciliation_required` | In 6-state array; allowed → renders. | Same 1-hop path. | No |
| `no_store` | No billing branch matches. | Same 1-hop path. | No |
| `anonymous` | No billing branch matches. | Same 1-hop path. | No |

For every one of the 12 states, `/onboarding` is now a stable terminal landing page (L217-245 finds it
allow-listed under whichever branch applies, or no branch applies at all), and any other protected path
resolves in exactly one hop to `/onboarding` before billing state is even read. **No state produces an
infinite bounce.**

No state triggers a billing-redirect branch while being absent from the corresponding allow-list —
every state that reaches L228 or L234-244 maps to a list that contains `/onboarding`.

## Redirect-URL construction sweep (stale query-string check)

Grepped every `NextResponse.redirect(...)` / `nextUrl.clone()` / `new URL(...)` in `middleware.ts`:
- L153 `loginUrl.clone()` (unauth → `/login`): sets pathname + one `next` param, doesn't reset `.search`,
  so unrelated pre-existing query params could ride along to `/login`. This is a single one-directional
  hop to a public page (`/login` can't re-trigger this branch), not a bounce — not the 115c3ce class.
- L169 `verificationUrl = new URL('/security/email-otp', request.url)` — fresh URL, one param. Clean.
- L186/L209 `redirectUrl.clone()` then explicit `redirectUrl.search = ...` (full overwrite, never appended)
  — clean, no accumulation.
- L195 `dashboardUrl.clone()` then `search = ''` — clean.
- L229/L241 `new URL('/settings/billing', request.url)` — fresh URL, one param each — this is exactly the
  115c3ce fix and remains intact; no `clone()` regression reintroduced.

No construction carries forward an accumulating/doubly-encoded query string the way the pre-115c3ce code did.

## Final: PASS
Critical: 0
High: 0
