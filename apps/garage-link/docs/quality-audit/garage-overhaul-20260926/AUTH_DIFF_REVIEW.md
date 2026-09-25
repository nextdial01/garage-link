# Auth 差分検査

Codex-only Auth 改修。ローカルLLMへ秘密・認証実装を委譲せず。commit/stage/pushなし。

- middleware.ts: routine OTP gate除去。Supabase cookie更新を全redirect/拒否応答へ継承。store RPC障害503、権限・tenant・billing判定維持。
- GarageLoginForm / post-auth-redirect / store-onboarding: fresh document遷移、内部URL検証、DB障害を未所属と誤判定しない。
- password-login-handler + Web/mobile wrappers: 共通失敗回数制限、captcha、Supabase認証、cookie、no-store。nativeへ必要sessionのみ返却。
- 旧OTP request/verify 4API: 410応答のみ。外部送信なし。旧画面dashboardへ安全遷移。
- bearerAuth / staging-preview: 独自trusted sessionのみ撤去。mobile review fixture検証と通常magiclink確認維持。
- confirm / controlledEmailConfirmation: 構成済originをredirectへ使用。127.0.0.1 cookieがlocalhost遷移で脱落する再設定の実不具合を補修。loopback許可はdevelopment＋特定local Supabase＋特定callback origin全一致に限定。
- mobile App / mobileApi / passwordLogin: OTP画面・trusted header撤去、共通password-login API利用。車両担当の別変更が同ファイルにあるため統合diff注意。
- migration20260926010000: OTP用関数だけnoop化。DROP/grant/RLS変更なし。
- next.config: local dev origin許可。aftercare画像パス修正は親担当。dev request logging無効化で確認token URLのログ保存防止。

実検査: Web security385 PASS、auth lint PASS、mobile tsc・passwordLogin mock test PASS。ローカル実Auth: owner/admin/implementer/staff/viewer一回目login、OTP不到達、reload、fresh context復帰、logout/relogin、誤pw後成功、Mailpit経由reset/signup確認PASS。mobile API実session＋Webと共通lock試験PASS。Native端末操作は未確認。

本証跡は作業中candidate。最終frozen SHAでの全画面実操作再確認は未実施。詳細 runtime/AUTH_RUNTIME_RESULT.md。

## 2026-09-26 later review additions
- Shared password login now returns typed, fixed public mobile errors; provider messages never pass through. Local native failure was stale Expo CI bundle, resolved by clearing/restarting QA runtime, not an additional product authentication defect.
- Reviewed development-only loopback API origins; release requires HTTPS; path/query/userinfo and wrong port remain rejected. Executed origin and password transport contracts.
- Reviewed every added service-role inventory reference (42 total AST references), preserving caller guards (verified membership/store, signed webhook, cron secret, strict review fixture, or login lock HMAC). G1C checker unchanged and PASS.
- Inspection-reminder skip UI used a forbidden direct UPDATE. UI now obtains active context and calls the scoped CAS RPC delivered by DB reviewer. Role/RLS/write lockdown remains intact. Pending → skipped → reopen/reload real operation PASS.
- Vehicle/customer standalone UI, nullable legacy DOB requiring edit input, manual address after failed lookup, CSV import/export, additional store onboarding and restoring the dedicated audit user's active store executed. Missing legacy store_members mirrors and incorrect Pro limits were local fixture defects; fixture generator corrected without changing production policy.
- CAPTCHA implementation added app-owned challenge-only endpoint, strict bounded native bridge, platform-specific browser widget, reusable config/transport contract, optional token to unchanged server verification. Native passwords and Supabase sessions never enter the bridge. No production CAPTCHA configuration was inspected or changed. Real human challenge remains unverified; local disabled authentication is a separate result.

Latest verification after CAPTCHA and final local dependency repair:
- Web full security suite 388 PASS (`auth-security-after-captcha.log`).
- Mobile typecheck, captcha bridge/config/navigation contract, shared password token transport, quote retry: PASS.
- Focused new Web/mobile auth lint: PASS.
- Expo Web synthetic widget runtime seven-step contract PASS, no pageerror; real CAPTCHA human verification remains NOT_TESTED.
- Browser aggregate candidate: 123 original inventory rows, 71 PASS (includes document agent 13), 42 BLOCKED_FEATURE_MOVED, 2 BLOCKED_NOT_IMPLEMENTED, 2 BLOCKED_EXTERNAL_SIDE_EFFECT, 6 parent-owned routes NOT_TESTED in this merge artifact. Parent has separate operation evidence for these 6 plus new /settings/masters absent from old inventory. Do not label full regression PASS from this candidate.
- Web dev server retained on port3001, session67071. No production/main/remote action performed. Frozen-candidate final auth replay remains parent-coordinated.
