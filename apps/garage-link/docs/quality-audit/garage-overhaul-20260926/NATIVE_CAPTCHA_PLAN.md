# Native CAPTCHA bounded plan

Current evidence: local Supabase CAPTCHA disabled. Native one-attempt login is verified only under that condition. Hosted CAPTCHA configuration has not been read; do not infer disabled. Existing Web uses Cloudflare Turnstile and NEXT_PUBLIC_ENABLE_BOT_PROTECTION / NEXT_PUBLIC_BOT_PROTECTION_SITE_KEY. Native presently has no challenge UI and maps CAPTCHA failure to safe browser guidance. Preserve provider enforcement.

Official feasibility references (read 2026-09-26):
- https://docs.expo.dev/versions/latest/sdk/webview/ : react-native-webview is supported on iOS/Android and included in Expo Go; install via expo install for SDK compatibility.
- https://developers.cloudflare.com/turnstile/get-started/mobile-implementation/ : native uses a WebView hosting the widget; JS/DOM storage and Cloudflare challenge/about:blank/about:srcdoc access are required. Keep user agent consistent.

Ten implementation candidates compared before architecture change:
1. Disable provider CAPTCHA: rejected, protection reduction.
2. Native ignore CAPTCHA error: rejected, login fails and protection contract false.
3. Browser-only login redirect: existing temporary guidance; does not establish native session.
4. Browser auth-token custom deep link: rejected, unnecessary credential transport.
5. OS AuthSession external-browser challenge + deep-link captcha token: feasible but introduces redirect state/expiry and public callback surface.
6. Third-party CAPTCHA native wrapper: feasible but larger dependency trust and maintenance surface.
7. Inline WebView HTML with forged baseUrl: possible; weaker real-origin behavior and host registration clarity.
8. Entire login page in WebView and export auth session: rejected, increases password/token bridge boundary.
9. App-owned HTTPS challenge-only endpoint in WebView: selected. Only public config and short-lived captcha response pass to native; email/password stay native and Supabase session remains API transport.
10. Native mobile attestation replacement: changes CAPTCHA/security design; outside this requirement.

Selected bounded contract:
- App-owned challenge-only route reads existing public Web CAPTCHA configuration; config missing while enabled fails closed. No default test sitekey in production.
- Native WebView loads only the configured validated app origin/path. Allow challenge subframes/about documents as official runtime requires, prevent unrelated top-level navigation, disable file access/download/session sharing.
- Bridge accepts bounded typed captcha payload only from the exact expected page URL. Never auth session, email, password, or arbitrary message text. No logs of token.
- Pass captchaToken as optional third passwordLogin argument into existing protected password API. Server/Supabase validation remains authoritative. Expired/error/used challenges reset; login disabled until required challenge is ready.
- Need Expo native implementation plus an explicitly handled Expo Web counterpart; avoid breaking current mobile Web verification.
- Tests: trusted URL/bridge origin, invalid payload, enabled/missing config, disabled, token transport, expiry/reset, no session secret on bridge; native visible widget with official test key for code-path verification; real challenge completion human-only remains BLOCKED_CAPTCHA_HUMAN_REQUIRED without approved fixture.
- Runtime dependency install is local authorized; no hosted configuration changes, secret retrieval, sitekey rotation, provider CAPTCHA disable, or external real-user login.

Not implemented yet: complete Web page operations and CSV runtime restart first, per parent ordering. Final frozen candidate must be revalidated after any implementation.

Implementation update:
- Implemented selected endpoint/native WebView route and independent Expo Web widget (no iframe cross-origin auth bridge).
- Exact page URL + bounded type/token native messages; reject unknown/session messages; restricted top navigation; Cloudflare challenge subframes only. Expiry/errors/attempt completion clear readiness; config failure blocks sign-in with retry.
- Public config endpoint uses no-store and permits noncredential public reads. Enabled missing/invalid public sitekey returns 503; no test-key fallback. Challenge CSP uses per-response nonce and denies framing/form/base/object/default sources.
- Added react-native-webview 13.16.1 via Expo SDK57 compatibility. Initial Expo CLI incorrectly selected npm and failed a dependency build; reran with explicit --pnpm successfully. Only mobile package/lock change is WebView plus its dependency records; reviewed diff.
- Web targeted auth/captcha tests: 18 PASS. Mobile config/bridge/navigation and optional token transport PASS; mobile typecheck and focused lint PASS.
- Hosted CAPTCHA state and genuine human challenge still BLOCKED_CAPTCHA_HUMAN_REQUIRED. No CAPTCHA bypass/provider configuration changes performed.
- Actual Expo Web browser with a clearly synthetic widget/provider response: config503 disables login; retry loads enabled config; absent/expired token disables; callback enables; submit contains token; failed login clears token/recreates widget. PASS, pageerror0. This is a UI contract test, NOT human Turnstile verification (`runtime/captcha-browser-contract-results.json`).
- Root workspace dependency integration corrected duplicate React caused by standalone Expo install. Both tracked locks include WebView, root lock frozen offline install PASS. Removed unrelated generated Next/Babel resolution changes; retained only WebView/Expo peer graph updates.
- SSR harnesses now prefer actual `.web.tsx` platform implementation; no placeholder WebView mock. quote-retry and four SSR route renders PASS.
