# GARAGE LINK G5-R Current Supabase controlled-test rehearsal（旧Remote staging integrated rehearsal）

> 2026-07-27追記: オーナー承認により専用remote staging案を終了し、現在GARAGE LINKが接続するテスター専用Supabaseを`controlled_test`として使用する方針へ変更した。本書の以下は変更前Gateの履歴であり、現行結果の正本は`17-current-supabase-integration-report.md`である。旧記録は削除せず保持する。

> DB-002追記: 最新read-only再調査で正規owner利用の客観証拠は得られたが、data repairのoperator明示承認がないため未修復。詳細と安全なtransaction/rollbackは`18-db002-owner-membership-repair-report.md`を正本とする。

> DB-002完了追記: operator明示承認後、membership 1行の`joined_at`とtrigger管理`updated_at`、audit 1行だけを修復した。C5はPASS、migrationは0件。G5-RはC6から再開可能。

実施日: 2026-07-27  
正式repository: `/Users/ksk/garage-link`  
製品app: `/Users/ksk/garage-link/apps/garage-link`  
開始HEAD: `f45b0e924f611756e9f5d99e5534d73726f4c75a` (`main`)  
判定: **BLOCKED（remote接続・migration・deploy 0件）**

## 1. 検証snapshot

dirty treeをcommitせず、`remote-staging-snapshot-manifest.json`へ固定した。

| 項目 | 値 |
| -- | -- |
| snapshot SHA-256 | `919c2169303440514dc0dea9b5876a7f401690789b8dac72fbf6d41c45a5b7ce` |
| tracked差分 | 107 file |
| untracked検証対象 | 82 file |
| migration | 46 entry |
| baseline manifest SHA-256 | `bb9a60d9e4561ce9667043ea024d1d6c3e8a4c5098f133e57a13fce8d0d9a1f7` |
| package lock SHA-256 | `158a5bd5df81ba088fd8f08132cc4c79ebb1d49bf50c32c93f54f6d361adc9a2` |
| build output SHA-256 | `3bb4495e11bb2d10d7d11f29d483fe174d710943c314ad3e86eaaf61cae3c50f` |

HEADで再現できるclean fileはHEADを正本とし、manifestにはdirty trackedとuntracked対象の個別SHA-256を保存した。manifest自身と本報告は実行snapshotから除外した。commit、push、merge、branch作成は0件。Vercel等でcommitが必要な場合の推奨branchは`codex/g5r-remote-staging-rehearsal`だが、operator承認前には作成しない。

## 2. environment分離

秘密値を表示せず設定の有無とfingerprintだけを検査した。

- `.env.staging.local`のSupabase URLはloopbackであり、分離remote projectではない。
- staging project ref、直接DB URL、DB host fingerprintを確定できない。
- production projectとの非同一性を証明できない。
- Vercel staging project linkは存在しない。
- Stripe test/mock、L-LINK mock、LINE・メール・Push送信無効をremote runtimeについて証明できない。
- operator承認markerはなく、backup先・restore先も未設定。
- よってremote hostへは接続していない。既存`.env.local`の接続先にも接続していない。

## 3. read-only事前監査

**BLOCKED / NOT TESTED**。project ref、DB URL、environment classification、operator承認がないため、remote ledger、catalog、membership、tenant/store、売約、会計、返品caseのqueryは一切送信していない。事前Critical不整合件数は「0」ではなく**未測定**である。

## 4. backup

**BLOCKED / NOT TESTED**。remote DB、backup保存先、restore cloneが未指定。schema/data/ledger/ACL/RLS/function owner/audit archiveを取得していない。Auth export、Storage metadata/bucket policy、PITRも未確認。ローカル使い捨てDBのbackup/restore回帰だけはPASSしたが、remote backupの代替証拠にはしない。

## 5. migration

**BLOCKED / 0件適用**。remote preflight停止条件に該当したため、G1-A、G1-B、G3、G0-B repair、G1-C、G1-D、G4-A、G4-Bをremoteへ適用していない。remote migration ledger、checksum drift、未適用版、lock待ち、対象行、backfillは未測定。local manifestの46 checksumはmigration runnerでPASSした。

## 6. lock時間

remote最大lock時間は**NOT TESTED**。接続・migrationをしていないため0msとは記録しない。

## 7. G1-A〜G1-D

remote smokeはすべて**BLOCKED**。固定snapshotのローカル回帰では次がPASSした。

- G1-A: 自己所属、他tenant所属、自己昇格、inactive、old-only拒否、最後のowner保護。
- G1-B: viewer/inactive/他scope write拒否、role正常系。
- G1-C: TenantContext、親子複合scope、immutable、L-LINK mock。
- G1-D: assignment＋preference、2/10 worker、membership喪失、PC/mobile/複数タブ。

## 8. G3

remote API・worker・interruptionは**BLOCKED**。ローカルでは2/10/100 worker成功1件、claim 1件、取消・納車・idempotency・process kill・scope/roleがPASSした。

## 9. G4-A

remote smokeは**BLOCKED**。ローカルではinvoice/payment guard、2/10/100 worker、返金上限、売約取消競合、process killがPASSした。

## 10. G4-B

remote smokeは**BLOCKED**。ローカルではcase/承認/完了/restock 2/10 worker、refund 2/10/100 worker、検品前拒否、所有履歴、元履歴維持、process killがPASSした。

## 11. Vercel runtime

**BLOCKED / deploy 0件**。staging project linkと専用environmentがない。production/non-production hostname、cold start、region競合、timeout、server interruption、remote logは未確認。commit/push/deployは行っていない。

## 12. rollback

remoteは**BLOCKED**。local `pnpm verify:g0b`では7世代の機能停止型rollbackと8 migration再適用がPASSし、G1-A/G1-BのCritical保護を維持した。

## 13. restore

remote専用restore先がなく**BLOCKED**。localではcatalog、ACL、RLS、policy、function、constraintを含むbackup/restoreと全回帰がPASSした。managed Auth・Storage・PITRは未確認。

## 14. 全回帰

外部通信をloopback/test mockへ固定した`pnpm verify:g0b`を実行しPASSした。

| 検査 | local結果 |
| -- | -- |
| migration runner / checksum | PASS |
| fresh / reapply / upgrade | 46 applied / 46 skipped / 38→46 PASS |
| rollback / restore | PASS |
| G1-A〜G4-B | PASS |
| Security suite | 229/229 PASS |
| API smoke | PASS、401/403/409/503、内部情報漏えい0 |
| L-LINK / ACK / inquiry mock | PASS |
| 問い合わせ管理 | PASS |
| Lint / TypeScript / production build | PASS |
| Chrome browser smoke | PC/mobile/複数タブ/viewer/inactive/console PASS |

remote runtimeを含まないため、G5-Rの全回帰Gate自体は完全PASSではない。

## 15. R0〜R12判定

| Gate | 判定 | 根拠 |
| -- | -- | -- |
| R0 Snapshot再現性 | PASS | 個別hash、snapshot、migration/package/build hashを固定 |
| R1 Environment分離 | BLOCKED | remote staging projectを識別不能 |
| R2 Read-only事前監査 | BLOCKED | R1とoperator承認不足により未接続 |
| R3 Backup | BLOCKED | backup先・restore cloneなし |
| R4 Migration rehearsal | BLOCKED | 停止条件成立、適用0件 |
| R5 G1-A〜G1-D | BLOCKED | local PASS、remote未実施 |
| R6 G3 | BLOCKED | local PASS、remote未実施 |
| R7 G4-A | BLOCKED | local PASS、remote未実施 |
| R8 G4-B | BLOCKED | local PASS、remote未実施 |
| R9 Vercel runtime | BLOCKED | staging project/deployなし |
| R10 Rollback | BLOCKED | local PASS、remote/clone未実施 |
| R11 Restore | BLOCKED | local PASS、remote clone/Auth/Storage/PITR未実施 |
| R12 全回帰 | PASS WITH MANUAL VERIFICATION | local自動回帰＋Chrome PASS、remote runtime部分は未実施 |

G5-R総合判定は**BLOCKED**。

## 16. 未確認項目

remote ledger/catalog/data不整合、lock時間、backup/restore、Auth、Storage、PITR、Vercel runtime、Cron、serverless interruption、remote browser、100 worker許可、外部連携denyの実効性。

## 17. 新規発見事項

`OPS-004`（Medium/P0 Operation Risk）: staging用ファイル名は存在するが内容はloopback用で、remote project ref、DB接続、backup、restore先、Vercel link、operator承認、外部送信denyの証明がない。誤接続を避けるfail-closedは機能し、remote変更は0件だった。

## 18. remote未適用Criticalの再判定

TENANT-001、AUTH-001、VEHICLE-001の3件はローカルコード解消済みだが、remoteへ未適用・未検証のため残数**3件**を維持する。コード未修正Criticalは0件。

## 19. High再集計

- コード未修正High: 9件。
- コード修正済み・remote確認待ちHigh: 9件。
- High Test Gap: 1件（TEST-002 browser artifact範囲）。
- `OPS-004`は環境準備のMedium/P0であり、上記High件数には加算しない。

## 20. 次Batch

先に「Remote staging provisioning/preflight」を独立作業として実施する。project ref、host fingerprint、Vercel staging、外部deny、架空fixture、backup、restore clone、operator承認をそろえた後、同じsnapshot hashでG5-Rを再開する。G5-R合格後の製品修正は`INVENTORY-001`を推奨する。

## 21. 本番適用可否

本番migration、deployともに**不可**。remote staging Gate未通過、remote不整合件数未測定、backup/restore/Auth/Storage/PITR未確認である。

## 22. 公開可否への影響

正式公開は**不可**。ローカルCritical 0と全回帰PASSは維持したが、remote未適用Critical 3件とHigh 18件、TEST-002、OPS-004が残る。

## Current Supabase C6 preflight追記（2026-07-27）

専用remote stagingではなくoperator承認済みCurrent Supabase `controlled_test`を再確認した。project ref `wmlpuzuskfiwdipluglz`、API host fingerprint `a0a021f4073239bf`、39-entry ledger fingerprintは前回backupと一致。DB-002後のC5 data監査はCritical 0を維持した。

一方、G1-Cが無条件参照する45 relation中4件がCurrent Supabaseに存在せず、read-only解析でも`42P01`を再現した。C6は**FAIL-CLOSED**、migration 0、deploy 0。詳細と実行計画は`19-g5r-c6-migration-preflight-report.md`を正本とする。

## DB-003ローカル修正追記（2026-07-27）

欠落4 relationはcanonical fresh schemaのrequired tableと確認し、G1-C直前のexpand migration`20260726000450`を追加した。G1-C本体は未変更。47-entry fresh、38→47 upgrade、security-preserving rollback/reapply、restore、全欠落・部分存在・全存在・不正shape停止をnetwork-noneでPASSした。

この変更により既存snapshot `919c2169303440514dc0dea9b5876a7f401690789b8dac72fbf6d41c45a5b7ce`はC6適用用として失効した。Current Supabaseへの接続・migration・deployは0件。新snapshot、post-repair backup、C5/ledger/catalog再監査、operator承認までC6は再開しない。

## C6再preflight追記（2026-07-27）

新snapshot `0ac9a0bb90492104ce988cd6caa6dc12468c3e5df1f7e820cac642e0aa593c68`とpost-DB-002 backup `6c49e2c87070a8326950419e4b7589f541dbb454c7f86e905e470e80072da1e5`を固定した。Current project、Auth 5、ledger 39、manifest 47、DB-003の4 relation `PENDING_CREATE`、外部runtime停止は一致した。

ただし`stores.tenant_id NULL`4件をCurrent RESTとbackup cloneで確認し、G1-C exact precheckが失敗するためC6は再度FAIL-CLOSED。pendingはDB-003追加後の9件で、旧「8件」は更新が必要。migration、Current data変更、deployは0件。詳細は`21-g5r-c6-repreflight-report.md`。
