# 最終候補 Web 監視の再検査

候補04、2026-09-26 JST。製品コードは変更せず、担当104画面の採用PASS証跡をconsole/requestfailedの観点でも再点検しました。

設定を即座に連続遷移した旧実行では、Supabase auth-jsの`TypeError: Failed to fetch`が残っていました。`requestfailed`を追加して再観測したadminプラン一覧→billing→一覧の往復では、同時に`/auth/v1/user`および`/api/billing/status`の`net::ERR_ABORTED`を記録しました。遷移先到達直後に次の文書へ移動したことによる未完了リクエスト破棄です。URL到達だけで次操作へ進めず、通信が安定してから往復する検査へ補修しました。製品のエラーを隠すconsoleフィルターは追加していません。

監査ログ、公開前チェックリスト、メンバー変更保存/復元、点検案内設定保存/復元、ごみ箱復元、保存済み新店舗の再読込について、追加検査のconsole errorは0です。新店舗の追加自体は同一候補のstore-create-resultsで保存・初回設定・再表示を実施済みです。監視追加時点では店舗上限3件なので、新規追加を繰り返さず同じ保存店舗を再読込しました。主操作証拠と監視補完証拠を両方保持します。

画面戻る/次画面遷移でキャンセルされたRSC、静的JS/CSS、membership読取、dashboard集計の`net::ERR_ABORTED`は、生ログに保持したうえで非重大のnavigation cancellationとして分類します。HTTP 4xx/5xx、保存失敗、未到達、未保存をこれに含めません。無効CSV入力の意図的な400は入力検証ケースであり、正しいCSVの保存/再読込は別のvehicle-csv-resultsで確認済みです。

証跡: runtime/monitor-final-executions.json、monitor-final-*.log、dashboard-settings-results.json、remaining-settings-results.json、last-settings-final-results.json、trash-results.json、plan-recheck-results.json、store-monitor-final-results.json。画面別の生ログを削除して重大0とする手法は採っていません。BLOCKED画面の未実施業務に正常性を広げません。

最終adminプラン一覧再試験でも、往復操作に伴うAuthとbillingのERR_ABORTEDが同時に残りました。操作・再表示は成功し、HTTPエラーはありませんが、「console error全件0」とは主張しません。重大エラー0という判定は、この観測済みnavigation cancellationを除外した範囲です。
