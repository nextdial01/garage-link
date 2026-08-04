# UX受入監査 Findings

| ID | Severity | 発見 | 対応／状態 |
|---|---|---|---|
| UX-001 | High | 独自modalがAppShellより下に潜る可能性、focus trap・復帰・背景inertがない | 共通Modalへ統合。source/contract PASS。認証後remote確認はBLOCKED |
| UX-002 | High | 一部公開ページの文字／背景contrastがaxe seriousに違反 | 色token修正。remote 5 viewport axe PASS |
| UX-003 | High | Soft deleteがnative confirm後に失敗理由をalert表示し、回復可能性が不明 | ConfirmDialogとinline errorへ変更。source/contract PASS |
| UX-004 | High | staging preview aliasでOTP sink対象host判定が不足 | `VERCEL_PROJECT_PRODUCTION_URL`を許可対象へ追加。unit PASS。ただし利用可能なcanonical fixtureがなくremote認証は403 |
| UX-005 | Critical blocker | UX監査fixture 2件とも `/security/email-otp` のrequestが403。認証後全route、主要業務、role、modal実操作を監査不能 | 未解消。検証できないpreview専用fallbackは最終branchからrevert。Release Blockedを維持 |
| UX-006 | Environment blocker | Playwright WebKitがページ起動前にAbort trap 6 | 製品判定不能。trace保存、Safari系未合格 |
| UX-007 | Medium | 複数画面にnative confirm/promptが残存 | inventory化。次回認証後監査で誤操作・回復性を実判定 |
| UX-ROLE-001 | High | staffの棚卸し保存が、既存の進行中棚卸しとの一意制約競合時に汎用の「保存に失敗しました。」だけを表示する | staff作成許可、server guard、authenticated grantは正しい。`inventory_counts_one_active_store_uidx`を既存棚卸しの再開案内へ変換し、汎用fallbackと二重送信防止を維持。targeted regression PASS。 |
| UX-ROLE-002 | High | メンバーrole／status変更が変更後stateを比較元にも使うためRPCを呼ばず、保存成功を誤表示する | 最後に永続化したsnapshotを別stateへ保持し、RPC成功payloadまで確認してから再読込するよう修正。DBの最後のowner guardとsession再評価はtransaction監査PASS。 |
| UX-ROLE-003 | Medium | 存在しない車両／顧客UUIDは安全に遮蔽されるが、PostgRESTのno-row表現によって個別not-foundではなく汎用取得失敗になる場合がある | PII／存在情報漏洩なし、一覧への復旧導線あり、主要業務を遮断しないためbacklog。`PGRST116`／`maybeSingle`による共通no-row判定を後続対応。 |

## 独立black-box見直し

実装差分を前提にせず、staging aliasから公開14 routeと認証必須9 routeの未認証挙動を再走査した。Chromium 5 viewportでconsole error、overflow、serious/critical axe違反は0。認証後を見られないため、製品全体のCritical/High 0とは判定しない。
