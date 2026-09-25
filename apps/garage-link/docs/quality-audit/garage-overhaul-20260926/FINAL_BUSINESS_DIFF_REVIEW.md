# Final business diff review

対象: GARAGE LINK overhaul 作業ツリー。金額・数量・マスター・顧客DOBと関連Web/Mobile/DB差分を読み取り確認。親担当の実装を独立確認し、帳票は同じ担当者による再検査です。全体PRの別人による独立承認を代替しません。

## 発見・対応

**F1 / P1 / 修正済み（親の追加実装指示による）**

商談配下の請求新規が vehicles.total_price を全部課税車両価格へ変換していた。現行schemaはbase_price/total_price別列、現行車両UIはtotal_priceを「税・法定費用含む支払総額」と表示するため、法定費用まで課税する経路だった。

修正は車両本体base_priceと支払総額との差額を分離。差額の税区分はDBから確定できないため未選択を初期状態とし、明示選択まで保存を拒否する。課税10%/8%、非課税、法定費用等の税対象外から選択可能。差額0は選択不要。複数税区分の差額は内訳明細へ分ける案内。総額は保持し、勝手な税区分推定で保存しない。車両切替時も選択をリセットする。

変更: `apps/garage-link/src/app/deals/[id]/invoices/new/page.tsx`、新 `src/lib/business/vehicleInvoice.ts`、`tests/qa/vehicle-invoice-tax.test.mjs`。

試験: 単体4PASS（両mode、欠損base、未選択拒否・課税差額の総額維持）。実ブラウザではbase110000/total120000の合成fixtureで、未選択保存→件数不変→税対象外を明示選択→保存→DB tax10000/total120000→preview→戻る→再open一致。元のvehicle価格へfinallyで復元済み。runtime/vehicle-invoice-tax-results.json=PASS/issues=[]。型検査・対象lint・diffcheck PASS。

## その他確認

- Decimal: 数量3桁、単価4桁を共通厳密計算。数量parseInt/Math.floorの該当業務残存を検索し未検出。行値引は元数量/単価を保持して各税区分の計算前に適用し、全体値引は残額から配賦。
- Historical: quote/invoiceの税mode・値引input・明細をsnapshot保存。previewは店舗設定で再計算しない。旧NULL modeは保存時表示、copyの旧外税推定も保存subtotal/tax evidenceに限定。
- Price storage: Web部品/車両・Mobile仕入は保存済み税込basisを維持し、税抜表示時の変換を保存時に戻す。未変更値は原値を再利用。参考相場/支払総額/法定費用を無根拠に税抜化しない（F1以外の読取対象で新規重大違反なし）。
- Copy: 新規画面読込だけで保存しない。新番号/日時/発行状態、invoice paid0、原本不変。part ID/cost/unit/note/category/行値引もAPI/RPC/Native草稿で保持。Mobile fee/optionのallowlist漏れは前段監査で補修し実API5PASS済み。
- Masters: store_idで取得、RLS店舗スコープ、owner/admin書込、scope不変trigger。旧label/無効labelを履歴値として保持。物理削除UIなし。追加候補とsystem制御値は別扱い。
- Customer: Web新規/編集/inline・Mobile共通validationで実在DOB必須。DB triggerで新規/更新も保証、既存NULLをmigrationで書換えない。郵便住所検索は共通化し手入力を残す。
- Maintenance: 作業JSONはカンマ保持、実部品がある時は集約parts_amount行を二重に作らない。数量/税率/行値引/stock metadata保持。原子inline RPCはstoreチェックとallowlistを持ち、途中失敗は同transactionで戻す。
- Inventory: numeric列/decimalRPC、同店舗の部品と案件確認、確定状態を専用RPCへ限定。確定後qty変更/直接削除はtrigger拒否、返却後削除。実UI10.5→9→10.5は既録。
- Cross-store: 今回追加のmaster/maintenance部分取得/帳票copy取得・関連ID照合は明示storeスコープまたはBearer RLSを確認。新しい重大な店舗漏洩は見つけていない。

このbounded再検査で未解決の追加P1/P2はなし。未実施の全経路実操作を静的レビューからPASSに昇格しない。全Web/Mobile画面数、native実機、全build/DBsuite最終判定は親の証跡集約を正本とする。

## Local LLM / Codex

採用Local成果は1ファイル（PartLineItemsEditorの小数入力修正）。先行調査timeout・scope violation等の未採用出力は採用率へ算入しない。今回のF1は最終financial reviewの発見であり親の指示によりCodexが補修、Localに最終判定を委譲していない。

## Hash / evidence

`runtime/document-codehash-business-review.json` のsha256:
`aaf776925c1d4483748f3cabb20c4a4a5ecac6294b9c8639ef0597d707199da4`

本補修を含めDB担当がfreeze04を作成し、影響検査を再実行する。先行freeze03等の成功を本候補の全build成功と混同しない。
