# RN Web 最終税表示補修後の再操作

2026-09-26 JST。親PATCH_READY後、ownerの新ブラウザcontextで実施。nativeadminをlogoutせず、店舗税表示は親が税込へ復元後に固定。対象3fileの試験前後SHA差分0（runtime/final-rnweb-candidate.json）。製品ソース変更なし。

36画面すべて主操作→保存/確定→戻る/一覧→再開→値一致を確認しました。MOBILE_PAGE_INVENTORY_FINAL.csvはこの最新証跡から全36行を更新、古い結果からのPASS継承なし。PLATFORMはReact Native Webを明記し、今回の結果をiOS native実機結果に変換しません。

- journey24: login1回、店舗選択再操作、今日展開/再開、顧客/車両/商談の作成編集詳細一覧、予約/下取、成約、取消、別商談で納車状態の再開。
- maintenance11（journeyと2重複）: inline顧客/車両、作業3行/小数/カンマ/行copy/edit/delete、見積→copy→請求→copy→入金500→一覧から再開。PDF2の実ボタン→popup→金額/方式一致は追加証跡。
- photo3: ローカル合成PNGを実upload→一覧→再開→画像decode。
- API追加10: 値引・fee/option・小数・snapshot・コピー元不変・idempotency・不正part400/専用IDとtitleに保存0。API試験を画面数へ加算しません。

税表示の追加assertは、税込単価、税抜行金額、小計、消費税、合計を対応ラベルで確認。見積コピーは保存APIの小計4546/税454/合計5000、請求コピーは5001/499/5500と一致。税額は行単位の丸めで決まるため、総額を1.1で割った455円という試験側の誤期待は採用しませんでした。保存値とラベル対応を実検証し、製品計算を変えていません。再開後の請求表示・支払済500・未入金5000も確認しました。

試験側補修と失敗履歴:
1. 店舗選択5秒待ち失敗をcatch無視していた旧scriptは、実際の3店舗表示を確認しprimary表示を待って必ず選ぶ処理へ修正。
2. 顧客保存後の「保存・読込中…」でexpect既定5秒が切れたため、既存整備試験と同じ30秒まで実表示を待つ設定へ統一。assertは維持。
3. 税455円の固定期待は行丸めを無視した試験側誤り。実保存応答と表示・合計関係を検証する形へ補修。
4. API負例で全店舗invoice数を比較する旧試験は並行native作成と競合し得るため、専用UUID/titleの保存0およびHTTP400で検証。

最終のconsole/pageerror/requestfailed/HTTP>=400観測errors0。API負例400は意図した負例として別記録。既存CORS route処理を保持し、実API/localDBを利用。trace/HAR/storageState/credential保存なし。外部送信・実課金なし。

証跡: runtime/final-rnweb-mobile-journey-results.json、final-rnweb-mobile-maintenance-results.json（保存税表示assertとfixture付）、final-rnweb-mobile-photo-results.json、final-rnweb-mobile-discount-copy-results.json、final-rnweb-mobile-fee-option-results.json、final-rnweb-candidate.json。
