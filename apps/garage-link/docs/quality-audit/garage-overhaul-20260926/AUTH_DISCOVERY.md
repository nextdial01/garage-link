# 認証静的監査（実証前）
- middleware.ts:310,317,327,334,351,359,363でrefresh cookieを返さないredirect/JSON。
- GarageLoginForm.tsx:50-77 API cookie更新後router.replace+refreshでbrowser singletonが古いsessionを持ち得る。
- post-auth-redirect.ts:59 店舗取得失敗と未所属を混同、store-onboarding.ts:53,67-70も取得errorを無視。
- password-login/route.ts:83-88 clear_login_failures RPC失敗で正しいpassword後もsignOut/503。rate limitを消して回避してはいけない。
- password-login/route.ts:55-56 cookie callbackごとの配列上書きで複数callbackのchunk削除情報が落ちる可能性。
- OTPはmiddleware、mobile App/API、DB enforce_administrator_email_otpの3層。新migrationでOTP強制のみ無効化、権限/RLSは保持。旧OTP endpointsは外部送信しない終了応答、旧画面は正規経路へ安全redirect。
- trusted moduleにmobile review fixture proofの別依存あり、一括削除しない。
- signup email confirmation/reset/session/rate limit/captchaは保持。
- 現段階で初回失敗のruntime原因確定やPASSを主張しない。
