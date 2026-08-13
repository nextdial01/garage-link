# Controlled Auth Email Contract

GARAGE LINK keeps Supabase Auth as the identity system. Customer-facing
confirmation and password-recovery messages must be sent through a configured
custom SMTP provider from a verified GARAGE LINK domain (for example,
`no-reply@auth.garage-link.tech`). Supabase default SMTP is not a production
transport.

## Required environment contract

For each environment, configure `NEXT_PUBLIC_AUTH_CONFIRM_ORIGIN` to that
environment's GARAGE LINK-controlled HTTPS origin. It must serve this same app
and its `/auth/confirm` endpoint. Never use localhost, a bare Supabase project
hostname, or a Production origin for Staging QA.

The origin must be in the Supabase Auth redirect allowlist together with the
existing `/auth/callback` path. Configure a stable Staging custom hostname
before running the actual-email Release Critical lane.

## Hosted Supabase configuration

In Authentication > Email Templates, apply the templates in
`supabase/templates/confirmation.html` and `supabase/templates/recovery.html`.
They use `TokenHash` and `RedirectTo` to make the app-domain `/auth/confirm`
page the primary link. Do not use `ConfirmationURL` as the customer-facing
link.

In Authentication > SMTP, configure the selected custom SMTP provider with a
verified GARAGE LINK sender. Disable provider click tracking for Auth mail so
the TokenHash link is not rewritten.

## Verification contract

`GET /auth/confirm` only renders an explicit confirmation button. It never
consumes a token. Its POST handler verifies the TokenHash with
`supabase.auth.verifyOtp`, writes the Supabase SSR session cookies, and then
redirects to the existing `/auth/callback` and signup/recovery continuation.

Release Critical must fail closed unless it observes the controlled
`/auth/confirm` entry, its expected callback continuation, and a fresh
human-handoff checkpoint. A stale checkpoint must be cleaned without asking a
human to click a time-sensitive email.
