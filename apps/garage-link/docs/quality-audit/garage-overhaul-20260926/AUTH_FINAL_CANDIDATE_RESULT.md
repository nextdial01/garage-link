# 最終候補 認証・担当Web再実操作

実施日: 2026-09-26 JST。候補04 code_content_sha256: `8d88faf93fbcb85941980f0034510f5e0e96905516148a336bbf0ef2c12c0798`。親正本 `runtime/candidate04-code-files.json`、親/DB検査者が原本drift0確認。HEAD `8893ebb8ce131b22aed0e87ee8ad3f5596410048`。作業ブランチ未コミット候補のためHEADだけでは実装内容を表さない。

- 新Web contextから5役割 owner/admin/implementer/staff/viewer を各1回POSTでログイン、dashboard、再読込維持、membersアクセス範囲を確認。通常OTP到達0。owner再ログイン・新contextセッション復帰・誤password401後正常ログインPASS。
- 専用audit fixture: local Mailpit再設定メール→確認→callback→新password→保存→ログインPASS。元の合成passwordへローカル管理APIで復元。初回のcallback待機timeoutは最終結果と混ぜず調査履歴に保持。再試行の303遷移先/callback/reset全観測は正常。初回timeoutの根本原因は断定しない。
- 独立した合成signup: localメール→確認→通常customers等と独立した店舗作成→ログアウト→初回onboarding到達PASS。実顧客への送信なし。
- Native最終再認証は親担当: ExpoToolsがlogoutを覆うQA干渉を浮動ボタン移動で解消後、logout→1回login→primary→今日、終了再起動→資格再入力なし→今日PASS。`runtime/native-auth-results.json`。自担当で完遂していない操作を独自PASSにしない。
- Hosted CAPTCHA有効状態と実人間challengeは未確認。ローカル無効状態のPASS、合成widget状態遷移PASSとは区別する。

担当Web104画面の最終再操作: 58 PASS / 42 BLOCKED_FEATURE_MOVED / 2 BLOCKED_NOT_IMPLEMENTED / 2 BLOCKED_EXTERNAL_SIDE_EFFECT。新セッション使用、主操作→保存/確認→戻る→再開を再実施。42移行案内は双方の遷移リンクを実操作し、旧child業務は未実施のままBLOCKED。外部送信/決済禁止を維持。

調査済みQA要因:
- 共用ownerの認証logoutは他担当ownerセッションを失効させた。連絡後ownerを解放し、担当Web操作は専用auditへ分離。帳票担当が独立再試験。
- 設定画面を即連続遷移すると未完のAuth getUserがERR_ABORTEDとなる。保存値一致はしていたがconsoleを無視せず、安定状態を待った往復保存試験を再実行しconsole/fetch0でPASS。
- 既にskip済みの合成イベント、1店舗1件の進行中棚卸し制約、既に入力済みlegacy DOB、追加された店舗selectorによる位置依存は再利用fixture/test条件の問題。合成pending再準備、新店舗に実UI新規保存した棚卸し、transaction限定legacyNULL再準備、実label/optionでのselectorへ変更して確認。
- 認証再試験中の製品コード追加変更なし。VMの写真Platform import追従1行のみtest補修し6/6PASS。

主証跡: `runtime/auth-browser-results.json`、`runtime/auth-reset-final-results.json`、`runtime/auth-signup-results.json`、`runtime/final-route-executions.json`、`runtime/*-results.json`、`PAGE_INVENTORY_OPERATION_CANDIDATE.csv`。
全画面回帰PASSとは判定しない。親の7画面と帳票13画面統合、BLOCKED維持が必要。

最終監視補完: `WEB_MONITOR_CLASSIFICATION.md`参照。admin plan→billing往復ではconsole Failed to fetchと同時にAuth/billing ERR_ABORTEDを観測し非重大navigation cancellationに分類しました。全console0とは主張しません。担当104の実操作結果58PASS/46BLOCKED、帳票13の実見出し・権限も統合済みです。
