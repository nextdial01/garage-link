# GARAGE LINK 全体改修 — 検査記録

本番公開・mainマージは行っていません。全画面の受入条件には未達があり、リリース可能という判定ではありません。

## 実装

- 店舗別マスター6種類（メーカー、部品カテゴリー、作業分類、単位、受付経路、部品仕入先）。追加・編集・無効化・並び順。既存の文字列は失わず表示します。
- 車両の自賠責満了日、CSV入出力、顧客の必須生年月日・郵便番号検索、整備内の顧客／車両の原子的登録。
- 小数数量・在庫、共通金額計算、税込／税抜設定、過去帳票の方式・明細スナップショット、未保存状態で開く見積／請求コピー。
- 整備作業の構造化行、行追加・編集・削除・コピー、部品と税区分を保持した見積／請求への引継ぎ。
- 通常メールOTPを撤去。メール確認・パスワード再設定・失敗制限・bot対策・セッション・店舗RLS・権限は維持。middlewareの分岐で失われていた更新cookieも修正しました。

## 検証の境界

最終コード候補はcandidate10（936code manifest SHA256 `f8b7ae5df5acf15b80216101a059c963da38f842ae58566f0554d6f6be0f1b55`）です。候補08からMobile表示と試験の3ファイルだけを変更し、Mobile全検証を再実行しました。Web・DB・API・auth・依存関係は候補08と完全一致し、以下の対応するPASSを継承しています。build、Web lint／型、security390件、QA99件、Mobile15 test files・144 SSRケース・写真multipart4試験がPASS。DB関連265ファイルが候補06と完全一致することを照合し、標準DB新規／既存更新8契約と既存6suiteのPASSを継承しました。SSR表示は全画面実操作の代用にしていません。

固定ビルドのローカルメール確認停止を調査し、同一source1124ファイル・同一SHAのcandidate09ビルドで公開origin設定を補っても停止することを確認しました。原因はrelease版が本来のHTTPSドメインだけを許可する既存安全制約で、ローカルMailpitはdevelopment＋62321＋3001に限定されています。この制約を緩めず、メール確認・再設定は同一sourceの許可済み3001環境で実操作し、その他は固定releaseビルドで確認します。コード936ファイルの同一性も確認しています。標準E2Eは32PASS／2SKIP（外部課金）、FAIL0。

実操作はローカルSupabase・Mailpit・合成データのみ。Webはpage.tsxを再集計した124画面、Mobileは通常OTPを除いた36画面を棚卸し。画面一覧は各CSV、個別40項目はACCEPTANCE.jsonを参照してください。Webの移行案内・未実装設定・外部送信の制約はBLOCKEDのまま残し、PASSへ読み替えません。

Mobileの全画面操作はReact Native Web＋実ローカルAPIです。iOS Simulatorでは33業務＋3認証/店舗/今日の36routeも追加確認し、NATIVE_PAGE_INVENTORY_FINAL.csvへ分けて記録しました。物理カメラ、Android実機、実人間CAPTCHAは未確認です。

## ローカルLLMとCodexの補修

正式runnerでQwenを先行使用しました。採用は部品明細入力1ファイルの一部で、厳密な数値検査と統合をCodexが補修しました。単独完了は0件です。調査timeout、対象外の重複パス出力、モデルprobe失敗は不採用として正式reviewを保存し、未採用出力は統合していません。認証・RLS・migration・金額の安全境界、失敗した通常作業、全件レビュー・実操作検査はCodexが担当しています。LOCAL_LLM_REVIEW_SUMMARY.jsonに時間と次回改善範囲を記録しています。

## DB適用と戻し方

今回のmigrationはローカルだけへ適用しました。本番適用・DROPはしていません。既存NULLの生年月日を保持しつつ新規・通常編集の保存で必須化し、業務値を変えない削除・復元のみ許可します。NULL既存顧客の削除・復元で生じた回帰を修正し、DB正負試験と実UI再操作で確認しました。数量列をnumericへ広げ、履歴列を追加しています。

戻す必要がある場合は、まずアプリを前の版へ戻し、追加列と小数データを保持してください。利用後のnumericをintegerへ縮小したり、履歴列をDROPする逆migrationは用意していません。テスト用DBではtransaction rollback・再適用と既存データ保持を検証しました。実環境のDB適用／復旧は本PRの承認範囲に含まれません。

## リリース前の未確認

全画面回帰のBLOCKEDを解消するか、正本の受入範囲を明示する必要があります。実人間CAPTCHA・物理カメラ・Android実機は追加の未確認範囲として区別し、今回の証拠を拡張して主張しません。外部送信・実決済は行っていません。GitHub Actionsを起動しないためコミットに `[skip ci]` を付け、PRはdraftで提出します。

## 標準コマンドへの組込み

`pnpm --filter @apps/garage-link run test:db:fresh` に今回の8契約を組み込み、新規・既存更新の両経路でPASS。専用の外部試験スクリプトだけに依存しません。標準Web E2Eの旧仕様前提を修正し、従来の電話・メール・車両価格検査も維持しました。低速JSの初回入力とCAPTCHA画面再訪の回帰を追加しPASS。iOS nativeの追加実操作も36routeを記録しました。


## 実操作で検出した追加補修

初回React起動前の入力取りこぼしを防ぎ、CAPTCHAスクリプト再利用時にも画面再訪でwidgetを再作成します。公式テストwidgetと独立したローカルGoTrueで初回・再ログイン・LP往復を確認しました。実人間challengeの証拠とは分けています。

Expo57のfetchが旧URI形式multipartを拒否する写真不具合を、実installed converterとiOS操作で再現しました。Native専用File readerでbytes・元ファイル名・MIMEを保持するよう補修。最初のdynamic import案はnativeで失敗したため候補07を不採用とし、静的importへ変更した候補08で車両・下取り写真の送信と再表示が通りました。RNWeb写真3種とNative写真3種とも再確認済みです。


## 監視結果の扱い

Webの先読みGET中断は、秘密を含まないprefetch/RSCフラグと、その後の主操作・保存・再読込結果を照合して分類しました。生の監視FAIL履歴は残し、全中断を単に無視していません。部品・整備の明示reloadで中断した同じ画面のRSCも値一致を再確認しています。分類結果はbusiness-browser-error-review.jsonに記録しました。Nativeの追加UI検証は全console／全HTTPの網羅的採取ではなく、RNWebの通信監視とは別の観測範囲です。


## 最終候補10の表示補修

Native見積詳細の無区分net金額を検出し、見積・請求詳細の明細へ税抜／非課税／税対象外／保存時のラベル、snapshot方式の数量・単価、保存済み税・値引・下取り・支払額を明示しました。金額の再計算や保存処理変更はありません。旧NULL数量・単価は未設定として表示します。独立helperのQwen再委譲はprovider_circuit_openで実行前停止し、正式handoff後Codexが補完。候補10のMobile全15試験・型・lintと独立reviewがPASSです。

最終Webは124画面中78PASS/46BLOCKED、最終fresh RNWebは36/36PASS。Native補完も36routeの主操作・再開PASSです。Native請求PDFはUIで生成した実ファイルをrenderして照合し、OSプレビュー成功とは区別しています。受入未達はREMAINING_ACCEPTANCE.mdを参照してください。
