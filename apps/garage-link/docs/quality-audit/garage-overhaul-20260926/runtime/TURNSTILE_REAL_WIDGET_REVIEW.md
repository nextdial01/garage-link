# 公開テストキーによる実ウィジェット確認

2026-09-26 / Codex auth-security read/test scope。製品コード編集なし。Orca/GitHub Actions/Productionは未使用。

公式一次資料: https://developers.cloudflare.com/turnstile/troubleshooting/testing/ 。公式always-pass公開テストsitekey/secretを使用。これは実人間のchallenge合格ではない。

独立project `runtime/captcha-project` (project_id garage-captcha-20260926)、API 127.0.0.1:63321、Next専用コピー `runtime/captcha-web-candidate` port63314。既存3001/8082/62321のruntimeと利用者セッションは無変更。CLIstatusの生成ローカル資格情報はsubprocessメモリ内だけでNext/browser子processへ渡し、ファイル保存・表示しない。独立合成userは各試験後delete。

元migration 20260722000200のauth_login_attemptsとログイン回数制限3関数、service-only権限を無改変抽出して専用fixtureに適用。全baseline runnerはcontainer名allowlistによる拒否で実行せず、この環境では業務schemaを検証しない。

安全レビュー: 既存Authコンテナ全envを複製する案は自動承認レビューが資格情報露出リスクとして拒否し、未実行。再試行せず、独立Supabaseプロジェクト新規作成へ変更。既存秘密値は読み取らない。

実通信結果（修正前）:
- mobile-captcha実HTML→Cloudflare実script→token callback PASS (`turnstile-widget-probe.json`)
- Web初回実widget→password-login→GoTrue captcha検証 HTTP200 /help PASS
- logout→再login 同HTTP200 PASS
- /login→LP→/login clientリンク遷移 FAIL: script再利用でonload再発なし、widget未再表示、captchaTokenなし、API送信0。証跡 `turnstile-login-before-fix.json` / `turnstile-login-final.png`。authagentへP1補修依頼済み。

製品コピーのTurbopackは外部node_modules symlinkを拒否したため、ソース無変更でwebpack devへ変更。

修正後再試験待ち。実人間challengeおよび実機ネイティブchallengeは未確認。

## 修正後確定結果

認証担当によるGarageLoginForm mount時の既存widget即render/unmount cleanup修正をコピーへ同期。実widget初回・logout再login・LPclient往復後loginは全てHTTP200、pageerror0。欠落tokenは401 BOT_PROTECTION_REQUIRED。公開always-pass secretは任意invalid-test-tokenにも200を返したため、不正token拒否の実通信判定はこのテスト鍵ではできない。実人間challengeは未確認のまま。

修正後証跡 `turnstile-login-results.json` / `turnstile-login-final.png`。独立環境では業務schemaを入れないため200後dashboardの業務動作は今回主張しない（初回はpublic helpへ到達）。

Cleanup: 専用Next63314 PID83985をTERM、専用Supabase garage-captcha-20260926のみstop。既存runtime停止なし。合成userは各試験finallyで削除。
