# G0-B Fresh baseline・migration ledger・restore integrity報告

実施日: 2026-07-26  
対象: DB-001、TEST-002のDB・migration・API環境部分  
判定: **ローカルG0-B完了。remote staging・本番は未適用。正式公開不可。**

## 1. DB-001再現

通常の空PostgreSQLへ`supabase/schema/001_initial_core_tables.sql`を適用すると、`store_members.user_id references auth.users(id)`（ソース63行目）で`auth` schema不存在（SQLSTATE `3F000`）となる。通常PostgreSQLには`auth`、`storage`、`realtime`、`vault`、`graphql`、Supabase client roles、`auth.uid()`がないためである。

公式Supabase PostgreSQL imageの初期化前や、標準`postgres` DBから派生させただけの通常DBも同等ではない。公式imageの初期化済み標準DBでは必要schema/role/helperが存在する一方、`pgcrypto`は`extensions` schemaにある。この差によりG1-A/G3の固定`search_path=public,pg_temp`関数内の未修飾`digest()`が実行時に失敗する第2原因も再現した。

`pg_net`、`pg_cron`、`supabase_functions`、`auth.jwt()`は現行GARAGE LINK SQLから参照されず、今回の必須bootstrap対象外。未使用を「存在する」とは扱っていない。

## 2. 正式baseline方式

採用: **方式B（公式Supabase PostgreSQL image bootstrap）＋方式C相当の明示manifest**。

- image: `public.ecr.aws/supabase/postgres:17.6.1.136`（事前取得済み、CIは`--pull=never`）
- network: `none`、公開portなし、使い捨てcontainerのみ
- bootstrap正本: imageが初期化する標準`postgres` DB。独自`auth` mockは作らない
- app baseline: 46 schema snapshot＋GARAGE専用overlayを1つのbaseline entryとしてtransaction適用
- incremental: manifest掲載順、checksum一致時だけ適用
- productionとの差: Auth API、Storage API、Realtime等の各サービス自体は起動しない。DB schema/role/RLS/ACL検証用であり、managed serviceの完全代替ではない
- maintenance cost: image tagとmanifest checksumの明示更新が必要
- local: imageは既存cacheを使用し、実行後container・dumpを破棄

## 3. migration分類

全SQLの個別分類正本は`supabase/baseline/migration-classification.csv`。概要:

| 区分 | 件数 | Fresh | Upgrade | 備考 |
| --- | ---: | --- | --- | --- |
| schema snapshot | 47 | 46件採用 | 不適用 | `028`はarchive、`037`番号重複はmanifest順で一意化 |
| baseline overlay | 1 | 採用 | 不適用 | GARAGEが使用する`l_link_onboarding_completed_at`のみ |
| timestamp migration | 43 | 41件採用 | ledger未適用分 | 2件は旧モノレポL-LINK専用でobsolete |
| rollback | 3 | 不適用 | 明示時 | G1-A、G1-B、G3。security-preserving |
| test SQL | 10 | fixture/検査時のみ | fixture/検査時のみ | 明示markerと使い捨て環境限定 |

除外した`20260706160000_ll_subscriptions_stripe.sql`と`20260706170000_ll_friend_info_defaults.sql`は、現リポジトリに存在しないL-LINK固有helper/tableへ依存し、製品コード参照も0件。推測補完せずobsoleteとしてmanifestから除外した。baselineの`028_legacy_pii_cleanup_plan.sql`は実行用でないarchive。

## 4. bootstrap

確認済みschemaは`auth`、`storage`、`extensions`、`realtime`、`vault`、`graphql`。roleは`postgres`、`supabase_admin`、`authenticator`、`anon`、`authenticated`、`service_role`。`anon`/`authenticated`はsuperuser・BYPASSRLSでなく、`service_role`はSupabase標準どおりBYPASSRLS。`auth.uid()`と`extensions.pgcrypto`を確認する。container名、image、DB/user、network、portをrunnerがfail-closed検査する。

## 5. migration ledger

正本はSupabase標準`supabase_migrations.schema_migrations`。補助表`migration_integrity`はversion、SHA-256、種別、環境、state、適用時刻、実行順、rollbackを保持し、二重正本にはしない。`migration_runs`は成功・失敗・rollbackを記録する。manifest変更、SQL変更、version重複、順序逆転、ledger checksum不一致は適用前に停止する。

適用entryは42件（baseline bundle 1＋採用timestamp 41）。再実行はapplied 0 / skipped 42。既存migration本文は変更していない。明示transactionを持たないmigrationはrunnerがtransactionで包み、失敗時に部分適用を残さない。明示transactionを持つG3にも同じlock/statement timeoutを設定する。

## 6. fresh baseline

正式計測時の全適用は5.145秒、再実行は1.313秒。最終catalog:

| 項目 | 件数 |
| --- | ---: |
| 非system schema | 10 |
| public table | 62 |
| public function/RPC | 71 |
| RLS有効table | 62 |
| policy | 171 |
| trigger（非internal） | 58 |
| constraint | 277 |
| public index | 348 |
| fixed search_pathなしSECURITY DEFINER | 0 |

generated DB型の正本ファイルはリポジトリに存在せず、整合は未検証（TEST-002残存）。

## 7. upgrade path

G1-A直前（version `20260725010000`まで）のDBへ、active owner、store、membership/store_members一致、売約済みvehicle＋成約dealを投入し、G1-A/G1-B/G3/repairを順次適用。既存行を保持し、G3 active claimを1件backfillした。precheckは曖昧なactive売約を自動統合せず停止する設計を維持。`lock_timeout=3s`、`statement_timeout=120s`でtimeoutなし。個別lock待ちの精密計測はremote相当データで未実施。

## 8. backup

ローカル方式は`pg_dump -Fc`で`public`＋`supabase_migrations`を保存し、合成fixtureの`auth.users`をdata-onlyで分離した。計測: app dump 0.09秒・667,690 bytes、auth fixture 0.06秒・1,571 bytes。roles自体は公式bootstrapが再作成するため、アプリdumpから勝手に再定義しない。

production候補はmanaged Supabaseの標準backupを正本とし、論理dumpは追加検証用。`pg_dumpall --roles-only`はmanaged roleを復元できない可能性があるため単独DR正本にしない。Storage object本体とAuth identity全体は今回のアプリschema dump対象外。

## 9. restore

新しい公式bootstrap済みcontainerへ、`auth.users` fixtureを`supabase_admin`で投入後、空の`public`/`supabase_migrations`を除去し、custom dumpを`supabase_admin`でrestoreした。restoreは0.30秒、ローカルRTO相当0.32秒、RPOはdump開始点。欠落・重複・orphanは0。

`pg_restore --clean`はpolicy依存順で失敗し、postgres role restoreはmanaged owner/default privilegeで失敗したため成功扱いにしていない。正しい手順は初期化済み空環境＋管理role restore。dumpが省略するsource既定の`PUBLIC USAGE ON SCHEMA public`のみ明示復元した。

## 10. ACL

source/restoreについてrelations、functions、policies、constraints、triggers、extensions、roles、schemas、default ACL、ledgerを正規化fingerprintで比較し全一致。owner、GRANT、function EXECUTE、SECURITY DEFINER、RLS、policyを保持した。restore後もG1-B role回帰、G3売約回帰、catalog assertionsがPASS。

## 11. rollback

順序はG3→G1-B→G1-A。G3のmutation RPCを停止しつつtransition guard・active claim UNIQUEを保持し、G1-Bはviewer writeを復活させず、G1-Aはmembership direct writeを復活させない。ledger stateを`rolled_back`へ変更し、依存repairもrolled_backへ伝播。再適用は4件を適用、38件skipし、全回帰PASS。完全な脆弱状態へのrollbackは禁止。

## 12. fresh CI

- `pnpm test:db:runner`: manifest正常、checksum drift、version重複・順序逆転、transaction/timeout契約（4/4 PASS）
- `pnpm test:db:fresh`: fresh、再実行、G1-A/B/G3、rollback/reapply、upgrade、backup/restore、fingerprint（PASS）
- `pnpm test:api:g0b`: loopback stub＋実Next Route Handler（PASS）
- `pnpm verify:g0b`: 上記にlint、typecheck、security、L-LINK静的回帰、問い合わせ管理、buildを統合。外部接続先はloopback/test値へ固定

DB jobはブラウザdownloadを要求しない。通常browser E2Eは別jobへ残す。

## 13. remote preflight

次が1つでもunknownなら接続・適用を停止する: environment分類、project ref、DB host fingerprint、本番refとの差、backup取得とrestore可能性、rollback bundle、ledger/checksum一致、既存データread-only precheck、active user不在時間、operator承認、外向き通信deny/mock、専用test tenant/store/user。現時点は値も承認も未提示のため**FAIL-CLOSED**。

## 14. DB-001修正範囲

修正済み: fresh baseline不能、bootstrap前提、migration ledger/checksum、ACL restore、security-preserving rollback、fresh/upgrade/restore CI、`extensions.digest`互換。

残存: managed Supabase標準backupによるAuth/Storage object restore drill、remote実データ量でのlock計測、generated types正本、remote ledger drift確認。複合FK/RLS/status/tenant整合の全業務再設計は対象外で既存Highへ残す。

## 15. 残存リスク

- remoteにTENANT-001、AUTH-001、VEHICLE-001が未適用
- managed Auth/Storageの完全DRは未実施
- browser E2E runtime固定は未完
- obsolete L-LINK migrationを含む過去環境は、remote ledger read-only監査なしに自動判断しない

## 16. 本番適用順

1. remote staging preflight承認
2. ledger/checksum・既存不整合read-only監査
3. backupとrestore可能性の証拠取得
4. maintenance windowとlock監視設定
5. stagingへG1-A→G1-B→G3→repair→G1-Cを適用
6. DB/API/browser回帰
7. rollback/restore drill
8. 別途オーナー承認後に本番。直接適用は禁止

## 17. 公開可否への影響

DB-001のローカルP0は解消し、remote staging preflight準備へ進める。ただしremote未適用Critical 3件とopen High 19件があるため、本番適用・正式公開は不可。

## G1-C ledger追補

- checksum付きmanifestは42から43 entryへ更新し、version重複0・順序PASS。
- fresh/upgrade/再実行/rollback/再適用/backup restoreを公式Supabase PostgreSQL image・network noneでPASS。
- public tableは63、RLS有効63、policy 171。新規`line_link_connections`はservice-onlyでauthenticated/anon grant 0。
- security-preserving rollbackは複合FK・scope不変guard・credential bindingを残し、tenant越境を復活させない。
- G1-C fixtureの既存不整合0、決定的backfill 0、隔離0。曖昧行はprecheckでmigration全体を停止する。

## G1-D ledger・restore追補（2026-07-27）

- checksum付きmanifestは44 entry。version重複0、順序/checksum PASS。
- freshは44 applied、再実行は44 skipped。upgradeはpre-G1-A相当38 entryからG1-Dまで6 entryを適用した。
- G1-Dの決定的assignment backfillはfixture 1件、preference backfillは0件。追加storeを推測していない。
- security-preserving rollbackは5 entryを停止し、依存repairを含む6 entryを再適用。旧membership書換えswitchやviewer writeを復活させない。
- backup/restore後のcatalog fingerprint、65 table/RLS、176 policy、44 ledger、G1-A/B/C/D/G3回帰は一致。
- migration containerはnetwork none。lock timeout 3秒、statement timeout 120秒でtimeout/lock待ち観測0。remote規模の最大lock時間は未確認。
- remote適用順はG1-A→G1-B→G3→repair→G1-C→G1-D。44-entry read-only ledger/checksumとassignment precheckが停止条件となる。

## DB-003 upgrade互換追補（2026-07-27）

- canonical fresh schemaに存在する一方、timestamp upgrade経路に作成migrationがなかった4 relationを`20260726000450`でexpandする。既存の`20260726000500`は未変更。
- manifestは47 entry。manifest SHA-256は`bbd25cc33f2b726cc564704758a9211961c200e32b262166a6691cc23f38ec54`、新migration SHA-256は`e6b31cd773f48632964ccc01580eff18b315f9d5f17c99c7b5e741a6fe99718d`。
- fresh applied 47、再実行 skipped 47。upgradeは38 entry時点で4 relationを欠落させ、00450を含む9 entryを適用して47へ到達した。
- security-preserving rollbackはG1-A〜G4-Bを停止しても4 relation、RLS、G1-B write boundaryを保持し、再適用9件をPASSした。
- `payment_items`のみ、`trade_in_vehicles`のみ、各delivery logのみ、全存在、全欠落をPASS。不正な既存shapeは`DB003_RELATION_SHAPE_MISMATCH`でtransaction全体を停止した。
- backup/restore、G1-A〜G4-B DB回帰、Security 229/229、Lint、型、production buildを`pnpm verify:g0b`でPASSした。Current Supabaseへは未接続・未適用。
