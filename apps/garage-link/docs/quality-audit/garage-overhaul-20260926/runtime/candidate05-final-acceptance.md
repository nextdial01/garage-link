# 最終固定候補05 自動検証

Snapshot SHA256: 04a6798e6939e1e8f7193da72f36af1199eb72f3a4d8e8067a23b1770e151738
Source HEAD: a7cf7d75fb0dadcf3439c1565ad3e5a612fe08d5（追加migration/testのコミットは親担当）

## DOB回帰の修正

既存NULL顧客の純粋な削除・復元のみ例外とするguard関数を追加migrationで補修。旧/新DOB双方NULL、実際のdeleted_at/archived遷移、業務列全件不変の3条件をすべて要求。role全体bypassなし、RLS変更なし、新規・通常編集の生年月日必須を維持。

正負SQL試験: 削除・復元/値保持は成功。NULL新規、NULL通常編集、削除+名前変更、復元+電話変更、不完全archive、遷移なし、未来DOB、有効DOB消去、別店舗、viewer書込は拒否。正常DOB顧客編集は成功。

## 再実行したDB試験

candidate05-db-suites.jsonの6suiteすべてexit0:
- baseline fresh/upgrade/restore/concurrency
- QA migration apply/rollback/reapply
- DB003 relation compatibility
- overhaul existing DB upgrade（新DOB正負契約含む）
- overhaul fresh DB（新DOB正負契約含む）
- Mobile migration

専用localruntimeへmigration適用済み、本番適用なし。authagentは実Web詳細→soft-delete→ごみ箱→restore→再開/reloadNULL保持を確認し、console/fetch/HTTPエラー0と報告。通常保存の必須チェック証跡はauthagentの最終UI結果参照。

## Build/Web/Mobile結果の継承

候補04からの非文書差分は上記migrationとSQLtestのみ。Markdown/docsとsupabaseディレクトリを除いた700files（appコード・資産・依存manifest・packageソース・unit・runner）を全hash照合、一致。
Runtime digest: 20be01139748a0ae31ebc85c8fbf2300ea39f7acfab0026320776869898cb5b8

したがって04build/Weblint/type/security388/QA99と、同一Mobileコードの03lint/type/14testfile/SSR144を継承。05でbuildを再実行したとは主張しません。候補05最終判定時の原本drift0。本番・main変更なし。
