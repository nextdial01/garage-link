# 独立最終差分レビュー（database_audit）

対象: overhaul worktreeの未コミット候補。実装変更なし。認証担当以外による差分読取。CODEX_ONLY: 認証・RLS・秘密境界と統合差分検査。Local再委譲対象ではありません。

## Findings

- F1 条件付き P1 / 要件検証の限界: Mobile src/passwordLogin.ts は email/password のみPOSTし、CAPTCHA必須エラー時はブラウザ案内だけです。Supabase CAPTCHA有効環境でnative sessionを作るchallenge/戻り経路がありません。既存Mobileも同制約だったため新規回帰と断定しませんが、bot維持＋native利用可の要件はCAPTCHA無効local試験のみでは成立しません。Production設定を読んでいないため条件付き。親へ通知済み。
- F2 P1 / 新規導線の確定欠陥: api/mobile/quotes/route.ts:10,61 の ITEM_TYPES が fee/option を拒否。mobile v2/documentDraft.ts は整備の車検/法定/追加費用を fee とし、Web quotes/new の既存費用もfee/optionです。整備→見積、Web見積→Mobileコピー時400 invalid_items。document_integrationへ補修依頼済み。補修後の再検証は担当の証跡に委ねます。

## 確認した境界

- middlewareはSupabase getUserを維持。OTP gateだけ撤去。店舗context取得不能は503、公開の再設定/確認経路は利用可能。追加cookieをredirect/403/402へ引き継ぎ、refreshで既存set-cookieを捨てません。
- password-loginは既存get_login_lock/record_login_failure/clear_login_failuresを共通handlerへ保持。nativeも同handlerで検査し、token response no-store。OTP request/verifyは410で外部送信なし。
- login next pathは二重slash/backslash/control文字を拒否。確認メールredirectは設定済みoriginを使用。local例外はdevelopment＋固定loopback API/originの組合せに限定。Production設定の実確認はしていません。
- Mobile bearerはgetUserとactive store/member照合後、Bearer DB clientを使用。review fixtureもserver由来の専用scope以外を列挙・選択しません。店舗IDをbodyから無検査採用する新経路は検出しませんでした。
- masterはstore絞込＋RLS、owner/admin更新、旧文字列を選択肢へ残す。税modeは履歴snapshotを優先。parts価格無変更時は元保存値を保持。共通moneyは小数数量/price4桁・行値引・帳票値引を分離。
- 整備Mobile更新は既存工賃fallbackとsnapshotmode、同店部品subtotal/taxrateを利用。inline登録およびdocument保存は原子RPC。

本レビューはread-only静的検査です。全画面実操作PASSの証拠ではありません。稼働中の他agentによる後続差分は親のfreeze後に再検証が必要です。

追記: F2はdocument_integration補修済み連絡。runtime/mobile-fee-option-results.json に実API5試験PASS（fee/option保存・invoice化・両copy・冪等再送）。独立写真実操作で別F3を検出: RNWebのuploadCategorizedPhotoがnative専用URI objectをappendし、API400。親へ補修依頼済み。

## CAPTCHA追加の独立レビュー

LoginCaptcha.tsx/.web.tsx、captchaContract.ts、passwordLogin.ts、App Login、public challenge API、middleware公開exactpath、react-native-webview13.16.1依存を確認。重大なsecurity blockerは検出しませんでした。
- challengeはpublic enabled/siteKeyのみ。session/password/service secretをbridge/config/HTMLへ渡しません。invalid enabled configは503、no-store、nonce CSP。
- bridgeはexactURL・限定type・token1..2048/空白拒否・payload4096上限。別origin/query差分/session型を拒否。WebViewはsharedCookies=false/incognito、file access禁止。
- Appはchallenge readyまでログイン不可、試行後token消去・widget再作成。expire/errorはready=false、Supabase serverもtokenを検証。通常Web cookie更新処理は変更しません。
- authFetch20s上限、config失敗はerror表示と再試行、disabled明示時のみtokenなし可。
- Native CAPTCHAの実challenge→Supabase成功は未実行。F1のコード経路欠落は補完されましたが、実環境の公開sitekey/hostname設定に依存する受入条件は残ります。

独立試験: captcha-contract PASS、password-login PASS。quality-preview FAIL（SSR loaderが.web.tsxを優先せずnative WebView packageをNodeへload）。authagentへ原因/補修方針を通知。コード変更なし。
