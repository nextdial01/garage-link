# bee0d53以降 独立レビュー

Codex / 2026-09-26。製品ソース編集・テスト再実行なし。対象17ファイル（既存差分11、新規未追跡6）。候補08の936コードmanifestから漏れ0、現在原本との差分0。

判定: 新たなP1/P2指摘なし。

- hydration: useSyncExternalStoreのSSR false/client trueで初期入力とメニューを操作可能前だけdisabled。認証/RLS/redirect契約変更なし。低速JS試験はscriptを遅延させ初期disabled→有効→一回送信→Dashboard→reloadを実際にassert。
- Turnstile: mount時既存script即render、widget id単位cleanup、unmount後token callback無効化、別instance callback保護。新規2試験は重複render、再mount、期限切れ、stale callbackを検査。公式testwidget実通信のclient往復補修後PASS証拠と整合。人間challengeは別途未確認。
- Native写真: .native.ts静的importでMetroの動的import障害を回避。bytes()をFileへ委譲し元name/MIME保持。Web File/Blob経路は分離され、既存purpose/related_type/id/category・request認証は不変。実Expo converter4件とNative実操作証拠を確認済み。
- 依存: expo-file-system57.0.6はExpo57 bundled指定に一致。mobile lockは既存packageにあるfont/webviewの不足も同期。rootのoptional Babel peer表記変更は最終buildで検証済み。
- E2E: 顧客/車両の曖昧locatorとnetworkidle待ちを具体label・POST201待ちへ変更し、詳細を再開→reloadして全入力値の保持までassert追加。生年月日未入力と年齢欄なし、メーカーと独立した2満了日も検査。60秒は試験全体timeoutのみ、保存結果条件の緩和なし。LP alertも具体本文に限定し強化。
- 秘密: 対象17ファイルのレビューとprivate-key/provider-secret/JWT-literalの限定scanで混入0。環境ファイルや実秘密値は読まない。テストのsynthetic token/site keyのみ。
- 未追跡6ファイルは全て候補08manifest包含。生成AGENTS.md/CLAUDE.md2ファイルは既定方針どおりPR除外。親の最終stage/commit時には6新規source/testsを含める必要あり。

全画面実操作、外部課金/実人間challengeの未確認をこのsourceレビューでPASSへ置換しない。最終受入は親が統合。
