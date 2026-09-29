# 帳票統合

分類 CODEX_ONLY: 4ファイル以上に及ぶ新規共通計算、保存済み金額意味の維持、税snapshot、整備明細の結合。先行Local全体調査は600秒timeout/成果なし、部品フォームはscope violation/変更なし。密結合変更を形式的に1–3ファイルへ分割しないrouter規則に従いCodex補修。Local採用済みPartLineItemsEditor数量変更は維持する。

現行発見: 見積new/edit・請求newにtaxAmount=0固定、parseInt(quantity)。見積編集はpart型以外の任意明細を落とす。請求見積importはpart_id・税区分を落とし失敗を握りつぶす。請求previewは数量1固定/単価に金額を表示。保存header→itemsは非原子的で途中失敗の既存弱点あり（改修検討中）。

方針: 新規帳票のunit_priceはmodeによる入力値、amountは税抜額、tax_amountは配賦後税額。headerは共通計算結果とmode/discount_input_amount保持。previewは保存済みsnapshotを表示し現在の店舗modeで再計算しない。コピーはGET相当の読込のみ、new状態へallowlist転記、番号・発行状態・支払履歴を移さない。

進行中、実操作未確認。PASS未判定。

追加発見・修正: 商談配下の見積/請求new/previewにも別計算・整数化・請求数量1固定が存在。共通計算/明細editor/保存snapshot表示に統合。Mobile quotes POSTの整数限定と独立外税計算を共通計算へ変更、税mode/単位/備考/税区分DTOを追加。DB担当が原子RPCとmobile snapshot RPCを実装。

単体5試験＋親money7試験=12PASS、型検査PASS、変更対象lint0error0warning（2026-09-26、後続最終差分再検証必要）。実ブラウザfresh login→quotes/new読込時pageerror0。保存確認runner初回はservice_roleに既存表SELECT権限がなくreadback403、通常owner RLS読取へ切替。製品権限を拡大せず解消する。

## 実操作結果（freeze前の候補）

- `runtime/document-operations-results.json`: 標準見積5・請求4routesすべて主操作PASS。小数2行3000保存、編集後再表示、見積copyは開くだけで件数不変→編集3500→保存→元不変。請求発行→合成現金入金500→copy→paid0/unpaid3500/draft→元不変。明細preview数量/単価/合計一致、390px横scroll。issues=[]。
- `runtime/deal-document-results.json`: 商談見積new/preview・請求new/previewの4routes主操作PASS。商談請求は既存unbound固定費/宛名inputも修正し1000＋0.5×3000=2500と宛名変更保存を確認。issues=[]。
- `runtime/document-tax-mode-results.json`: 設定税抜へ保存再読込、保存済み部品1100維持→選択時単価1000→数量1.5→税150合計1650保存。設定を税込へ戻してもcopy/previewは元税抜・1650維持。新規では1100を入力。元設定へ復元。issues=[]。
- `runtime/mobile-document-api-results.json`: Mobile API小数/税snapshot、同key再送同ID、quote→invoice snapshot、invoice copy編集paid0、quote copy/source不変PASS。これはHTTP API試験でありnative UI実操作PASSではない。

追加修正: Mobile quoteの既存冪等キーでも毎回quoteNoをランダム生成しRPC fingerprintが変わるため再送失敗する問題を修正。番号は店舗とoperation keyのSHA-256由来に固定。通常Web新規番号は秒単位衝突を避けランダム接尾辞を追加。

未了: 最終freeze後のfresh session再実行、native UIの親検証、DB担当によるmobile part/cost metadata適用後の追加readback。完了宣言はしない。

## Nativeコピー補修・最新確認

Native `documentDraft.ts` は共有importDocumentを使用し旧外税判定、discount/trade明細の二重取り込み除外、part_id/cost_price維持を実装。mobileApiのQuoteItem/QuoteDraftおよびContent parseQuoteItemsへ関連値を通す。App.tsxは共有QuoteDraft型をimportしており重複型なし。Mobile→WebのUI依存を避け、PartLineItem型は純粋businessモジュールへ移動しeditorで再export。親invoice mapperはsubtotalAmountと最小CopyDocumentSource型へ調整。

最新結果: Web tsc PASS、Mobile tsc PASS、documents6＋money8=14PASS、Native document-draft4PASS。Mobile HTTP追加試験5PASS: 部品ID/原価123.4567をquote→invoiceまで保持、再送同一ID、編集コピーpaid0/source不変、不正partId400かつ保存件数不変。runtime/mobile-document-api-results.jsonが証拠。Native実画面は親検証の範囲でありこの結果をUI PASSへ代用しない。

## 小数在庫 実ブラウザ追加試験

runtime/decimal-stock-browser-results.json: 3件PASS、issues=[]。fresh owner login→対象整備→部品picker追加→自動編集行数量1.5→保存→在庫確定→再読込→DB10.5から9確認→削除(在庫返却)→一覧へ戻る→再openで明細なし→DB10.5復元→部品詳細10.5表示確認。途中runnerは追加直後が自動編集状態の点とasync読込待ち不足で失敗し、試験作成した未確定行をUI削除して再実行。最終成功runは完全な追加から返却まで実施。製品コード変更なし。非金額LINE toggleラベルに税込suffixが付く既存候補問題は親へ報告済み。

## 整備実部品・明細値引の追加補修

Native整備変換がparts_amount集約しか持たず、Web整備importも部品値引・作業メモを落とす欠落を検出。親承認方針でMoneyLineにline_discount_input_amount（0既定/非負整数）を追加し、元数量・単価を維持して行の税計算前に控除。全体値引は控除後basisから別配賦。DB担当が専用新migrationで保存/コピーを拡張。Web editorで行値引入力と控除後金額、帳票previewで行値引表示。Mobile DTO/API/コピーdraft/parser/フォームも保持する。

Native GET maintenanceはsame-store Bearer RLSでmaintenance_job_partsを読取、row.maintenance_partsへ付加。既存readDetailがrow全体を保持するためそのままhelperへ渡る。helperは実部品をqty/unit/税率/備考/part/cost/行値引として転記し、実部品があるとparts_amount集約行を作らない。

検証: documents7+money8=15PASS、native helper5PASS、Web/Mobile型検査PASS。runtime/maintenance-part-discount-results.json 5PASS/issues=[]: 部品1.5×1000・行値引300をUI保存→Mobile GET→quote1200保存、Web整備見積保存/preview/copyに行値引300保持、在庫10.5→9→10.5確認して部品行除去。runtime/mobile-discount-copy-results.json 5PASS: 行値引300をquote→invoiceと双方copyへ保持、原数量単価不変/paid0/source不変、再送同ID/不正part拒否。Native実機UI全フローは親担当。

## React Native Web 実画面検証・帳票PDF

runtime/mobile-maintenance-results.json の18:38:47–18:38:53 UTC固定候補runが9records PASS、console error/pageerror/HTTP400以上/requestfailedはerrors=[]。合成ownerをfreshログイン1回→RN整備フォームで顧客DOB・メーカー車両・二つ満了日をその場登録→作業3行（1.5/.5、カンマ名）→保存→行編集/コピー/削除→保存4500→整備から見積保存→コピーqty2・5000→請求5000→請求copy qty2.5・5500→発行→合成現金入金500→一覧へ戻る→検索→整備4500/見積5000/請求5500未払5000/入金フォーム5000の再open確認。APIだけの試験ではなくReact Native Web DOM実操作（iOS/Androidネイティブとは区別）。途中候補runのHMRによるroute初期化は固定後再実行で解消、検索pendingの別raceは親が補修担当。

帳票はdocumentHtml.tsで保存snapshotを読む共通レンダラーへ補修。数量/単位/単価/行値引/税区分/行額、小計/消費税/全体値引/下取り/合計/入金/未払を表示。旧NULL modeは金額・小計・値引を『保存時』とし税抜と断定しない。HTMLescape検証を含む2単体PASS。Expo Print Web実装はhtml引数を無視しwindow.printのみなので、Web時は同じHTMLの別windowプレビューを開く。iOS/Android Print/Sharing処理は維持。RNのPDFボタンから実popupを開き合計/mode一致確認→Chromium PDF生成→閉じるまで確認。runtime/mobile-quote.pdf（5000円）/mobile-invoice.pdf（5500円、未払5000円）。外部共有送信なし。

独立監査のMobile fee/option保存allowlist不足を補修。runtime/mobile-fee-option-results.json 5PASSで保存・見積→請求・コピー・再送確認済み。

## 最終候補 再実操作・担当差分検査

2026-09-25 18:53–18:56 UTCにWeb帳票13route（標準9+商談4）とRN Web9journeyを新セッションで再実行。document-operations-results.json=12PASS、deal-document-results.json=4PASS、mobile-maintenance-results.json=9PASS、いずれもissues/errors=[]。RNは実primary店舗を選択し、登録/保存/編集/コピー/入金/一覧へ戻る/再open/PDFpopup/生成を完走。最新PDF artifacts更新済み。

初回並列試験18:53頃は認証担当が同ownerでlogout試験中だったためセッション失効が発生。認証担当本人の同時logout確認を受け、同owner認証変更を止めて順次再実行し成功。失敗証拠も*-auth-interference.jsonへ保持。これを製品の未解消認証FAILと混同しない。

担当差分の最終検査: 原子保存とstore制約、copyの番号/状態/支払0、正確小数・行値引/全体値引、歴史snapshot・法定費用、Mobile part/cost/type許可、HTMLescapeと旧NULL保存時表示、diffcheckを確認し追加指摘なし。repository全体の最終承認は親担当。

コードmanifest: runtime/document-codehash-after.json、SHA256 f74b895d103a7fe55d132bcfe452c3148a0ea13cb06033e4adb1b14c4490bedd。開始時manifestとの差分はContent.tsxのみ（mtime18:53:27UTC）、最終RN実操作18:55:50開始より前の親修正を含む。Web担当コードは全再試験期間で不変。最終reviewと成果物SHA256はruntime/document-final-review.json。未実施のiOS/Android操作を本RN Web結果で代用しない。

## candidate04 最後のRN再試験

2026-09-25 19:10:45–19:10:53 UTC、合成ownerの新セッション・primary店舗選択で既存mobile-maintenance.cjsを再実行。RN Web9journeyすべてPASS、console/page/HTTP/failed fetch errors=[]、PDFartifact2件も再生成。MobileMaintenanceSummaryとMasterSelectの後続修正を含む候補。試験前後source SHA256は共にaaf776925c1d4483748f3cabb20c4a4a5ecac6294b9c8639ef0597d707199da4で不変。対応manifest runtime/mobile-maintenance-candidate04.json。コード変更なし。
