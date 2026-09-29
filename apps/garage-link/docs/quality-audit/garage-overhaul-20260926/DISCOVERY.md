# 全体調査と実装判断

## 横断確認
Web123 page.tsx、Mobile App.tsx→v2独自router、共通部品、packages/database、app内supabase/schema・migrations・baseline、CSV、mobile APIを調査。root supabaseはmain tracked正本に存在しない。canonical checkoutのuntracked supabaseは流用しない。

## 問題群と依存関係
- 数量: UI parseInt、Math.floor、DB integer、RPC集約::intの一式。
- 金額: Web見積/請求 taxAmount=0、部品税率0を||0.1が上書き、mobileは別集計。現行金額を上書き再計算せず保存済み帳票はsnapshot扱い。
- 整備: text[]を画面でカンマ連結/分割。構造化行と旧配列をlosslessに扱う。
- 顧客: newの年齢は未bound表示欄、生年月日不明表示あり。new/detail/mobile/CSVの生年月日がnullable保存。
- 車両: maker文字列、inspection_expiry_dateのみ。CSVは検査日すら未収録。
- 認証: Web/mobile/DBの三重OTP。redirect時refresh cookie喪失を確認。初回原因の実証は未完。
- DB検証: baseline manifest57件だけでは9月差分13本を網羅しない。一部は本番固有fixture前提。

## マスター分類
|項目|判断|理由|
|車両メーカー|採用|依頼必須、既存文字列と無効値保持|
|部品カテゴリー|採用|依頼必須、検索/選択共通|
|作業分類|採用|店舗独自の工賃分類に価値、処理状態と分離|
|単位|採用|個/本/時間等の店舗差|
|受付経路|採用|LINE/電話/来店を固定、集客運用に差|
|部品仕入先|採用|現状自由入力、店舗固有の候補登録に価値|
|支払方法|今回保留|入金RPC/会計出力との契約値、表示名だけ独立させる設計が先|
|権限/認証/課金/内部状態/税率|不採用|制御値であり店舗編集不可|
|車種区分/修復歴/燃料等|今回保留|販売feed等の標準分類と連動、任意追加の価値より互換性維持|

## 設計候補10案比較（実装前）
|案|適用可能性と代償|選択|
|種類別table|FK強、種類追加migrationが多い|保留|
|汎用entry table(kind/store/id/label/active/order)|共通CRUD、kind制約と店舗FKが必要|マスター採用|
|store JSON設定に全選択肢|小規模なら可、参照整合性弱い|不採用|
|コードseed＋店舗override|既定値には有効、空マスター要件と衝突|新規既定seedはしない|
|文字列を識別子にする|互換性高、改名履歴が弱い|legacy表示だけ|
|必須FKへ全移行|正規化強、既存不明値を失う|不採用|
|nullable FK＋label snapshot|旧値保持と将来参照を両立|将来候補。今回は既存label snapshotを維持|
|全金額をnetへ一括変換|計算統一可、既存意味が変わる|不採用|
|保存済帳票を常時設定から再計算|実装少、履歴が変動|不採用|
|新規文書にmode/line snapshot＋純粋共通計算|過去不変、Web/mobile/DB整合の試験必要|採用|

## 実行成立確認
最新main・隔離worktree・lockfile install・local Docker成立。外部送信禁止、local Mailpitのみ。fixtureは合成、test結果を実データへ送らない。自身のcontainer/fixtureのみcleanup。DB/auth runtime成立は調査中のため実装の最終着手条件未達。

## Baseline
型検査PASS。lintは0 error/3既存warning。QA unit 71 PASS。未変更baselineのみの結果、改修完了証拠ではない。

## 最終設計の補足
マスターはstore_master_entriesのIDで編集し、車両・部品・明細は選択時のlabel文字列を保存します。改名・無効化で既存表示を変更せず、過去の文字列は「既存値」として表示します。新規メーカー・カテゴリーを移行時に店舗別既存値から安全にseedします。制御値は任意編集にしません。

初回認証のcookie喪失はmiddleware分岐試験で実証し修正、画面遷移は新規document navigationへ統一しました。local Docker/Supabase/Mailpitと合成fixtureで認証・DB・保存試験を実施しています。初期の未達記述は調査時点の経過であり、最終証拠は実操作inventoryとacceptanceに集約します。
