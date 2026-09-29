# GARAGE LINK 認証改修計画

作成日: 2026-09-26。担当: Codex独立認証検査。対象: `projects/garage-link/worktrees/garage-link-overhaul-20260926`。
製品コード未変更。外部操作、秘密読込、Orca、GitHub Actionsなし。本書は実装前の契約であり認証PASSではない。

## 初回ログイン不調の証拠と限界

- 確定不具合: middlewareがSupabase refresh cookieを作成後、別のredirect/JSON responseへ載せ替えない。`apps/garage-link/src/middleware.ts:310,317,327,334,351,359,363`。
- `auth-cookie-repro.cjs`が実製品middlewareをTypeScriptでCommonJSへtranspileし、実NextRequest/NextResponse、合成Supabase・店舗判定mockで実行する。ネットワークなし、envは全て合成値。製品コード編集なし。
- 実行: `node operations/audits/garage-overhaul-20260926/auth-cookie-repro.cjs /Users/ksk/kannagi/projects/garage-link/worktrees/garage-link-overhaul-20260926`。結果: `auth-cookie-repro.jsonl`。
- 通常dashboard 200は保持。login→dashboard、onboarding→dashboard、dashboard→onboarding、onboardingによるAPI403、billing制限redirect、billing API402、cancelled billing redirectの7ケースすべてcookie脱落を実証。
- 既存`playwright.security.config.ts`はwebServer不要でtestDirがtests/security。既存`login-recovery-contract.test.ts`は分類関数のみを検証し、middleware実行試験なし。上記mock手法を回帰試験へ取り込める。runtimeでの初回ログインは別途必要。
- 原因候補: GarageLoginForm.tsx:75-77のrouter.replace/refresh連続実行と、サーバーAPIのみで更新されたcookie・ブラウザsingleton・prefetchの不整合。再現未確認。
- 原因候補: post-auth-redirect.ts:59がRPC通信エラーをno_accessと混同しsignupへ遷移。store-onboarding.ts:53のエラーもpost-auth-redirect.ts:67-70で未処理。認証成功後の誤遷移を引き起こし得る。
- password-login/route.ts:83-88のclear_login_failures失敗は正しい認証でも503になる。制限保護を削除して回避してはならない。
- password-login/route.ts:55-56、logout/route.ts:9、staging-preview/route.ts:73-74はcookie callback配列を置換する。複数callbackのcookie名別マージを検討し、古いchunk削除を失わない試験を追加する。

## OTPモジュール依存の全件分類

検索対象: repository tracked source/scripts/tests（env・秘密なし）。`adminEmailOtp`, `adminEmailOtpServer`, `adminEmailOtpTransport`, `trustedDevice`の参照検索。

|利用元|処置|
|---|---|
|Web middleware.ts|通常login gate、trusted cookie検証、service-role bootstrap呼出を撤去。Supabase認証、RLS、billing/onboarding、public pathの個別認証契約保持|
|api/auth/admin-email-otp/request,verify|410 JSONの副作用なしtombstone。request bodyを処理せず、mail/DB challenge/trust発行を呼ばない|
|api/mobile/admin-email-otp/request,verify|同じ410。旧mobileで安全に終了し、追加本人確認ではなくアプリ更新が必要と分かる固定コード|
|security/email-otp, security/mfa|固定`/dashboard`への安全redirect。fromを無検証で使用しない。dashboard側の認証・onboarding/billing判定を通す|
|api/auth/logout|Supabase signOutとそのcookie確実反映を保持。旧OTP cookieは期限0で消去可。trusted sessionの物理削除は不要（使われない履歴を保持）|
|staging-preview/route.ts|合成fixture、Preview限定条件、Supabase magiclink verifyOtpは保持。独自admin trusted session生成/upsert/cookie発行のみ撤去。Supabase verifyOtpはメール確認/認証のAPIであり撤去対象OTPと別|
|lib/mobile/bearerAuth.ts|通常trusted-deviceヘッダー読取/転送とadmin_security_required誘導撤去。JWT、membership、store選択、tenant scopeは保持|
|同bearerAuth.ts reviewFixtureProofFor|OTP以外の依存: mobile review fixtureを単一tenant/storeへ限定する仕組み。getAdminEmailOtpSecret、mobileReviewFixtureProof、mobileDeviceTokenHashを使用。scope制限(同:200-227)を保持。secret名/鍵の変更・rotationなし。helperを別モジュールへ移すならHMAC domainとdigest完全互換で別試験|
|lib/security/adminEmailOtpServer.ts|OTP endpointsのみ参照。tombstone化後未使用として撤去候補。認証/tenant共通機構へ転用しない|
|lib/security/adminEmailOtpTransport.ts|上記Serverのみ製品利用。OTP終了後撤去候補|
|lib/security/adminEmailOtp.ts|review fixture proofの依存が残るため丸ごと削除禁止。OTP専用関数は参照消滅後整理。残存helper名称整理は互換性を保つ|
|mobile src/mobileApi.ts|SecureStore trusted tokenの全API前読込/失敗gate、token header、request/verify methodsを撤去。Bearer認証・timeout・store header・通常APIエラー処理保持|
|mobile src/trustedDevice.ts|通常APIからの参照消滅後使用停止。既存SecureStore値の削除をログイン必須条件にしない|
|mobile App.tsx|OTP state/request/verify/画面分岐/AdminOtpコンポーネント撤去。session初期復元、SIGNED_OUT、foreground refresh、local logout保持|

OTP以外の用途は上記review fixture proofとPreviewのSupabase magiclink認証。その他module参照はOTP自身かテスト/監査データ。docs JSON snapshot manifest・過去監査evidenceは歴史記録であり書換不要。

試験・script参照: Web tests/security/{mobile-admin-email-otp-transport,owner-preview-contract,release-blocker-batch,runtime-safety-release-gate,stripe-security-controls,ux-acceptance-contract}.test.ts、tests/qa/release-critical-preflight.test.mjs、scripts/check-mobile-store-bootstrap.mjs、scripts/qa/release-critical-journeys.mjs、tests/e2e/helpers.ts。Mobile scripts/{quality-api.test.cjs,trusted-device-contract.test.mjs,trusted-device-key.test.cjs}。OTP想定を更新し、その他billing・role・fixture guardのassertを弱めない。

## DB契約

`20260723000300_admin_email_otp.sql:158`がauthenticatorのpgrst.db_pre_requestをOTP関数へ設定。最新実体`20260913115019_garage_mobile_review_fixture_access.sql:46-122`。Webだけ変更すると管理者DBアクセスが全停止する。

新規migrationで`public.enforce_administrator_email_otp()`を同じsignature/owner/grantsのno-opにする。無関係なpgrst.db_pre_request設定を上書き/resetしない。旧`enforce_administrator_aal2()`が現在呼ばれる箇所がないかmigration最終状態で検査。OTPテーブルDROP、既存レコード削除、RLS緩和、business write lock変更なし。旧challenge関数はAPI非到達に加え、必要ならservice_role executeを明示revoke（依存確認後）。signupメール確認やauthログイン制限関数と混同しない。

新規DBと既存DB更新の両方で: owner/admin/implementerがaal1・trusted無しで通常DB操作可、staff/viewer/他tenant・失効membershipは従前どおり拒否、匿名保護、role別write lockを検証。無害なOTPテーブルのデータ保持を確認。rollbackは元関数定義を復元する手順のみ準備し、稼働中セッションを突然拒否するため本番自動実行しない。

## Web・Mobile login契約

Web: password-loginのlock/captcha/失敗記録/成功clear維持。全responseでcookie更新を保持。成功後window.location.replace等のfresh navigationにより新cookieをもつdocumentへ遷移。内部pathのみ許可し、`//`、backslash含む外部URL解釈、認証entryへのloopを拒否する共通normalizerを用いる。next=signup等のonboarding意図を壊さない。意図しない自動再試行で「1回成功」を装わない。

Mobile: 現行Supabase直接signInWithPasswordはWeb独自get_login_lockを通らない。今回必須の失敗回数制限とbot対策を満たすため、通常login transportの保護同等性を独立検証する。既存保護を削除したりservice-role tokenをクライアントへ返さない。共通サーバーログインが必要ならmobile専用応答(session)とHTTPS・no-store・ログ非出力・captcha対応を設計したうえでCodexが実装。native Supabase session保存とonAuthStateChangeは継続する。これはOTP state撤去だけで完了としない。

signup/reset: auth/confirm、api/auth/confirm、auth/callback、auth/reset-password、forgot-password、signupのSupabase PKCE/メール確認を保持。callbackのnext検証も共通化。メールはlocal sink/synthetic限定で、新規登録確認→login、reset→新password→loginを実操作する。

## 実行順序と検証

1. cookie reproを先に回帰テスト化（現状FAILを確認済み）。OTP endpoints 410のmail/DB呼出0、旧画面redirect、JWT/roleガード保持の試験を追加。
2. DB migrationとWeb/mobile OTP撤去を一組で適用。中間状態を公開しない。
3. cookie保持、login navigation、post-auth通信エラーの誤遷移を修正。DBエラーを新規登録扱いにせず再試行可能な安全なエラーとする。
4. typecheck/lint/security/unit/mobile、DB fresh/update、build。
5. local/stagingの隔離synthetic fixtureで新ブラウザcontext、cookieなしでemail/passwordを一度だけ送信→dashboard。POST回数1・OTP遷移0・console/fetch記録。誤password→成功、logout→login、reload、context再取得、expired/stale sessionも確認。
6. owner/admin/implementer/staff/viewer、複数store、tenant越境、無効membership、billing・onboarding状態を確認。メール確認/resetはlocal sinkリンクを通す。
7. frozen HEADで新セッションログイン後、全画面操作回帰。実ブラウザ未実行をPASSにしない。

本調査の実行済み検証はmock cookie reproductionのみ。local runtime認証/DB/メール/全画面は未確認。

## 実装・自己検査記録（2026-09-26）

Codex-only認証境界として親から実装指示。Localへの割当なし（認証・security対象のため）。製品コードはunstaged、commit/pushなし。

実装: middleware独自OTP gate撤去、全redirect/403/402/503のrefresh cookie保持、複数setAll保持。店舗context障害はsignup誤転送せず503、public callback/reset/password-loginは店舗障害で停止させない。Web成功後fresh document遷移。password-login cookieを名前別マージしno-store。Web/mobile OTP4 APIは副作用なし410。旧画面は固定dashboardへredirect。Mobile OTP UIとSecureStoreの通常API必須条件を撤去。bearerAuthはreview fixture proofとtenant/store制限保持。staging-previewのSupabase magiclinkと環境guardを保持し独自trusted session発行だけ撤去。DB新migrationはOTP関数no-opのみ、既存search_path=''、security definer、既存grants維持。

検証:
- 既存367securityに対し旧OTP期待の5テストを新契約へ更新。新規middleware実行13ケース、post-auth2ケース、廃止API実行4ケースを含め最終 `pnpm test:security`: 384 PASS（約1秒）。これは静的/単体試験で全画面操作ではない。
- 認証変更対象eslint: PASS。
- Mobile `pnpm exec tsc --noEmit`: PASS。
- Mobile quality-api: PASS、auth-lifecycle/auth-transport/trusted-device計8試験PASS。
- Web型検査: 初回認証変更時PASS。その後の共有tree検査では親側新規business/money.tsのBigInt targetエラー6件のみでFAIL。認証ファイルの型エラーなし。全体PASSへ読み替えない。
- git diff --check: PASS。自己diffで通常Supabase・rate limit・captcha・tenant・billing・signup/resetを保持確認。

未確認: 新migration実DB適用、実ブラウザ初回認証/メール確認/reset/各role/全画面、全体build。これらは親・runtime担当が継続。
残課題: Mobileの従来Supabase直接password loginはWeb独自login lockを通らない。今回そのtransportは変更しておらず、従来保護も除去していないが、要件のWeb/mobile保護同等性は未証明。旧adminEmailOtp helperはreview fixture依存のため残す。古いDB OTPテーブル・関数履歴は削除しない。

## 実runtime継続結果

runtime/AUTH_RUNTIME_RESULT.mdを参照。5role初回1送信login/OTP0/reload、再login、freshcontext、誤password回復、実Mailpit reset/signupがPASS。発見したcallback origin/cookie不一致を補修。Mobile独自lock不足は共通handlerで補修しlocal実APIの共通lockoutを確認。security385 PASS、auth eslint/Mobile型検査PASS。native実機/全画面/最終frozen候補は未確認。
