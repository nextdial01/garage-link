# G7 Current migration実行報告

実施日: 2026-07-28  
判定: **READY FOR ONE-RUN SQL EDITOR APPLY — Current未適用**

## Currentへの操作

- Current Supabase接続: 0
- Currentデータ変更: 0
- migration適用: 0
- Vercel deploy・外部送信: 0
- 既存operator runner方式: 終了。再実行しない

## G7 migration前backup

- 採用directory: `/Users/ksk/garage-link-backups/pre-g7-20260728-104502`
- dump取得: PASS
- 必須dump: 8/8、全件非0 byte
- directory permission: 700
- file permission: 600
- SHA256SUMS検証: 8/8 PASS
- `SHA256SUMS.txt` SHA-256: `8379a36438609c2d73e39e650b23c8c14f9a1a5d06d81368c8163520893c869f`
- migration ledger: 48件を保存
- credential／connection URI／PAT／JWT literal: 0件

runnerが付けた`INVALID`は、dump失敗ではなく後続restore smoke失敗を表す。取得済みdumpとchecksumは有効なため、G7 migration前backupとして採用する。

## restore停止原因

旧restore smokeはSupabase管理schemaの`auth`と`storage`をdrop・再作成し、通常ownerでdumpを流し込んだ。そのため`auth` ownershipに衝突し、`ERROR: must be owner of schema auth`で停止した。

これはbackup取得失敗でもG7製品不具合でもなく、restore検査対象の設計不良である。`invoice_payment_ledger`のcircular foreign-key warningは別件で、今回の直接停止原因ではない。Current backup内のledger行は0件だった。

## G7 application recovery smoke

Supabase管理schemaを保持したnetwork-noneのSupabase PostgreSQL 17.6.1.136へ、次の順で復元した。

1. `public` schema
2. `supabase_migrations` schema
3. `public` data（使い捨てDB内のみ`session_replication_role=replica`）
4. migration ledger data

結果:

- application restore: PASS
- ledger: 48
- public table: 119
- RLS table: 119
- policy: 363
- function: 120
- constraint: 579
- index: 527
- store／tenant／membership: 5／5／5
- cross-tenant／cross-store／orphan: 0／0／0
- G7が変更する全app-owned relationはpublic dump対象
- Supabase platform全体の完全restore: 今回のGate対象外・未検証

G7 migrationは`auth.uid()`、`auth.users`、`extensions.digest`等を参照するが、`auth`、`storage`、`realtime`、`extensions`、`vault`、`graphql`、`supabase_functions`へDDL・DML・owner変更を行わない。

## SQL Editor package

- package: `docs/quality-audit/operator/g7-high-remediation/02-current-sql-editor-apply.sql`
- 旧blocked package SHA-256: `fa89452ec1425ce6c492c313c115351710d759e8e02c62cb4e0a0dcb213cfdcc`
- 元migration body: byte-for-byte一致
- transaction: `BEGIN`から全postcheck後の`COMMIT`まで1件
- lock timeout: 3秒
- statement timeout: 120秒
- psql専用構文／外部通信／secret: なし
- identity、ledger 48、precheck、row fingerprint、DDL、ledger 49、RLS／policy／RPC／grant、整合性postcheckを内包

### Current backup cloneでの結果

**BLOCKED / fail-closed**

`public.inventory_count_items`に以下2列が存在しない。

- `deleted_at`
- `is_archived`

元migrationはpartial UNIQUE、snapshot guard、集計RPCで両列を参照する。このため、packageはDDL開始前に`G7_PRECHECK_REQUIRED_APP_COLUMN_MISSING`を発生させる。検証後もledger 48、G7 table 0、G7 column 0で変更はなかった。

不足2列だけを補った使い捨てcompatibility fixtureでは、同一packageがledger 48→49、RLS 120、policy 366、G7 policy 8、想定外backfill 0、業務データ変更0でPASSした。再実行はprecheckで拒否され、ledger 49を維持した。

## DB-007 compatibility remediation（2026-07-28追記）

- 正式contract: `deleted_at timestamptz NULL DEFAULT NULL`、`is_archived boolean NULL DEFAULT false`。
- 正本: fresh schema `020_soft_delete_and_security.sql`、G7 migration、inventory UI、G7 DB/security tests。
- Current相当backupでは`inventory_count_items`は0行。推測backfillやbusiness row UPDATEは不要。
- forward-only migration: `20260728000050_inventory_count_items_compatibility.sql`。
- compatibility checksum: `782af8feb8db7f54d642de4ab92a180c9834c070ae3e060c8a6d45039fff3325`。
- manifest: 49件、SHA-256 `c0e3ec5101cb35df4af3de80944c372ae975ebedc917f3699a32e46b7e14869f`。
- snapshot: `5d6d849a914b614668afb9579aabe01ae7753ccc3b0e968a26cff3cc175d8a60`。
- 統合package SHA-256: `72f71e202cb73a8008bda2d17896b19a142870c99ed15d7a724de2a8bdd76b92`。
- G7が参照する他のtable/columnについて、欠落・型・NULL・default driftは0件。

compatibilityとG7は`02-current-sql-editor-apply.sql`の1 transactionへ統合した。ledger 48の欠落状態から50まで成功し、G7途中失敗時は2列・両ledger行・G7 DDLが全rollbackする。

package検証:

- 2列欠落: PASS
- 正式contract＋compatibility ledger済み: PASS
- 型/default/NULL不一致: FAIL-CLOSED
- columnだけ存在・ledgerなし: FAIL-CLOSED
- ledger drift: FAIL-CLOSED
- G7途中失敗: compatibilityを含め全rollback
- 再実行: 拒否、ledger 50不変
- business row count／既存値: 不変
- RLS／policy／owner／grant: 維持
- Supabase SQL Editor互換、psql meta-command 0、secret 0

回帰結果:

- fresh 49 migration、upgrade、security-preserving rollback、再適用、backup/restore: PASS
- G1-A〜G4-B、G7、2/10/100 worker、process-kill: PASS
- Security 239、API smoke、L-LINK mock、問い合わせ管理、lint、typecheck、production build、localhost browser 9 routes: PASS
- Current接続・変更・migration・deploy・外部送信: 0

## Gate判定

| Gate | 判定 |
|---|---|
| Full backup files・checksum | PASS |
| G7 application recovery | PASS |
| Supabase platform完全restore | 対象外／未検証 |
| SQL package静的検査 | PASS |
| Current backup clone統合適用 | PASS（ledger 48→50） |
| Current migration | NOT_RUN |
| SQL Editor operator実行 | READY |
| staging deploy | Current適用・Current回帰まで不可 |
| 正式公開 | 不可 |

次工程は、GARAGE LINK Supabase SQL Editorで統合package全文を1回だけ実行し、ledger 50とpostcheck結果を保存すること。deployは別承認。

機械証拠: `docs/quality-audit/evidence/g7-backup-validation.json`

## Current SQL Editor実行結果（2026-07-28 12:06 JST）

- 実行先: Supabase project `garage-link`（project ref `wmlpuzuskfiwdipluglz`）
- 実行package: `docs/quality-audit/operator/g7-high-remediation/02-current-sql-editor-apply.sql`
- package SHA-256: `72f71e202cb73a8008bda2d17896b19a142870c99ed15d7a724de2a8bdd76b92`
- transaction構造: `BEGIN` 1件、`COMMIT` 1件、末尾`COMMIT;`を確認
- Dashboard SQL Editor操作: 新規Queryへ全文を無編集で貼り付け、Runを1回だけ実行
- 実行結果: `status=PASS`
- migration ledger: 48件から50件へ更新
- compatibility migration: 適用成功
- G7 migration version: `20260728000100`、適用成功
- RLS table: 120
- policy: 366（G7 policy 8）
- cross-tenant／cross-store／orphan: 0／0／0
- negative inventory／duplicate active inventory: 0／0
- unexpected backfill／unexpected business data changes: 0／0
- SQL error: 0件
- rollback: なし（transaction commit）
- Vercel deploy／外部送信／正式公開: 未実行

Current migration GateはPASS。staging deployへ進むためのDB前提は満たしたが、deploy自体は別operator承認を必要とする。正式公開はstaging deploy後のruntime・browser回帰完了まで不可。
