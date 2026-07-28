# GARAGE LINK G5-R C6 re-preflight report

実施日: 2026-07-27  
対象: Current Supabase `controlled_test`  
操作範囲: read-only API・logical backup・network-none restore  
判定: **FAIL-CLOSED / C6開始不可 / migration 0 / Current data変更0**

## 1. 新snapshot

| 項目 | 結果 |
| -- | -- |
| repository | `/Users/ksk/garage-link` |
| app | `/Users/ksk/garage-link/apps/garage-link` |
| branch / HEAD | `main` / `f45b0e924f611756e9f5d99e5534d73726f4c75a` |
| tracked change | 107 file |
| untracked product target | 79 file |
| snapshot target | 186 file |
| snapshot fingerprint | `0ac9a0bb90492104ce988cd6caa6dc12468c3e5df1f7e820cac642e0aa593c68` |
| product tree fingerprint | `7c9824ce7a6c59d465bb019774720bb142b3ae43696195de9d0ce70eb349c823` |
| migration manifest | 47 entry / `bbd25cc33f2b726cc564704758a9211961c200e32b262166a6691cc23f38ec54` |
| rollback | 8 file |
| package lock | `158a5bd5df81ba088fd8f08132cc4c79ebb1d49bf50c32c93f54f6d361adc9a2` |
| DB inspection scripts | `4d30e7e41b2bd4489305a984cec29e3c8c56952eecaf14e106bca850eb93bf62` |

正本は`current-supabase-c6-snapshot-manifest.json`。監査文書、ignored secret、build output、`node_modules`、`supabase/.temp`はruntime snapshotから除外し、製品コード・migration・test・DB scriptのdirty stateを個別SHA-256で固定した。

旧snapshot `919c2169303440514dc0dea9b5876a7f401690789b8dac72fbf6d41c45a5b7ce`との差は、DB-003 `20260726000450`、relation contract、upgrade fixture/test、manifest 46→47、関連監査scriptである。旧snapshotは再利用しない。

## 2. Current project識別

| 項目 | 結果 |
| -- | -- |
| project ref | `wmlpuzuskfiwdipluglz` |
| API host fingerprint | `a0a021f4073239bf` |
| direct DB host fingerprint | `aa846f67159110a1` |
| pooler host fingerprint | `4982c8162697c153` |
| status / region / PostgreSQL | ACTIVE_HEALTHY / ap-northeast-1 / 17.6 |
| L-LINK ref | `umijciuwyggxnrzymxmb` |
| L-LINK DB host fingerprint | `c263acd6193591ca` |
| environment | operator承認済み`controlled_test` |

前回C5のproject refとAPI fingerprintに一致し、L-LINKとは別project。Auth user 5、tenant 1、store 5、active store 4、membership 1、active owner 1。tester-onlyはoperator申告と前回証拠を正本とし、個人情報は出力していない。

## 3. post-repair backup

DB-002 repair後に新規logical backupを取得した。

| 項目 | 結果 |
| -- | -- |
| 保存先 | `/Users/ksk/Library/Application Support/Codex/garage-link-backups/g5r-c6-repreflight-20260727` |
| durability | 一時領域外 / directory `700` / file全件`600` |
| backup set SHA-256 | `6c49e2c87070a8326950419e4b7589f541dbb454c7f86e905e470e80072da1e5` |
| manifest fingerprint | `63b8fc06e073e93108b02f15a058ea0a5fce67f247d04a2e05c00e831e9176ed` |
| file / size | 17 file / 884,882 bytes |
| dump window | 38.46秒 |
| public schema/data | restore PASS |
| ledger/catalog | restore・fingerprint PASS |
| RPO相当 | logical dump 38.46秒窓。複数dump間の単一snapshot保証なし |
| local RTO相当 | public schema/data/ledgerはcontainer起動込み10秒未満 |

取得内容はroles、public schema/data、migration ledger、RLS/policy、function owner/EXECUTE、trigger/constraint/index、row counts、DB-002 membership/audit、主要業務表、L-LINK関連表、Auth/Storage schema/data、Storage inventory、restore runbook。

public restoreはnetwork-noneで成功した。managed Auth/Storageはlocal imageとのschema version差（`audit_log_entries.ip_address`、`users.is_sso_user`）により完全restoreできず**PARTIAL**。Auth dump 5 userとmembership 1件のuser参照は値を出さず照合して欠落0。Storageはbucket 2、top-level metadata 1を保全したがobject bodyはlogical DB dump対象外。managed Auth/Storage/PITRのRTOは未確定である。

非managed backupで接続文字列、`PGPASSWORD`、service role marker混入0を確認した。managed dataとpublic dataはtest dataを含む機密backupとしてowner-onlyで保管する。macOS volumeの暗号化状態とretentionは人間確認が残る。

## 4. read-only監査

post-repair dumpをnetwork-none cloneへ復元して検査し、Auth/store件数はCurrent RESTのread-only応答でも再確認した。

| 検査 | 件数 | 判定 |
| -- | --: | -- |
| active owner | 1 | PASS |
| active owner `joined_at NULL` | 0 | PASS |
| invalid active membership | 0 | PASS |
| duplicate active membership | 0 | PASS |
| membership/store tenant mismatch | 0 | PASS |
| membership Auth user欠落 | 0 | PASS |
| old-only `store_members` | 4 | 記録・権限付与なし |
| DB-002 repair audit | 1 | PASS |
| cross-store parent relation | 0 | PASS |
| orphan parent relation | 0 | PASS |
| tenant/store alias mismatch | 0 | PASS |
| G1-C deterministic NULL backfill候補 | 5 | 計画値一致 |
| active sale重複候補 | 0 | PASS |
| won vehicle/status不一致 | 0 | PASS |
| orphan deal customer/vehicle | 0 / 0 | PASS |
| nonzero legacy paid amount | 0 | PASS |
| unknown invoice/quote status | 0 / 0 | PASS |

新たに`stores.tenant_id IS NULL`を4件検出した。安全なstore fingerprintは`bc98358aef4c`、`cb6d181b5cc1`、`d2ff4da6a86d`、`e36a6f1ee914`。うちactive 3、trial 1。tenant付きactive storeは1件である。backupとCurrent RESTの両方で同じ4件を確認した。

G1-Cは最初のprecheckで1件でもNULLなら`G1C_PRECHECK_STORE_WITHOUT_TENANT`を返すため、現状では00450を適用できても00500で必ず停止する。tenantが1件でも、4店舗の所属を推測してbackfillしない。`DB-004` High/P0として記録し、C5/C6 readinessをFAIL-CLOSEDとした。

## 5. DB-003 relation状態

| Relation | Current | Contract result |
| -- | -- | -- |
| `payment_items` | absent | `PENDING_CREATE` |
| `trade_in_vehicles` | absent | `PENDING_CREATE` |
| `delivery_usage_logs` | absent | `PENDING_CREATE` |
| `delivery_overage_logs` | absent | `PENDING_CREATE` |

4件とも想定外のpartial relation、owner、grant、policyは存在しない。`check-g1c-relation-contract.mjs --phase pre-upgrade --applied-through 20260725010000`は4件を明示的`PENDING_CREATE`としてPASSした。required relationをskip扱いにはしていない。

## 6. ledger・manifest

- Current ledger: 39 entry、latest `20260725010000`。
- local manifest: 47 entry（fresh baseline 1＋incremental/repair 46）。
- common: 37。version/name mismatch 0。
- Current-only: `20260706160000`、`20260706170000`の旧L-LINK migration 2件。classificationでobsolete/excluded済み。
- pre-repair/post-repair ledger: 39/39、version差0、statement checksum差0。
- local manifest: official validator 47 PASS、manifest checksum一致、version/dependency/rollback drift 0。

47−39を未適用件数として扱うことはできない。fresh baseline 1はCurrentへ適用せず、Current-only 2件は削除しないためである。実際のpendingは、新規DB-003を含む**9件**である。依頼前提の「未適用8件」はDB-003追加前の値なので更新が必要。

## 7. 未適用migration

| 順番 | Version | 目的 | 前提 | DDL | Data変更予測 | Lock | 停止条件 | Rollback |
| --: | -- | -- | -- | -- | -- | -- | -- | -- |
| 1 | `20260726000100` | G1-A membership admission | valid owner/membership | membership制約・RLS・RPC | 原則0 | membership/index | owner・status・invite不整合 | security-preserving feature stop |
| 2 | `20260726000200` | G1-B role write lock | G1-A helper | role-aware policy/grant/RPC | 0 | policy catalog | viewer/inactive OR迂回 | writeを広げないfeature stop |
| 3 | `20260726000300` | G3 sale atomicity | active sale不整合0 | claim/operation/FK/RPC | claim backfill 0 | vehicle/deal/index | duplicate/status/orphan | claim保持・RPC停止 |
| 4 | `20260726000400` | extension互換repair | G1-A/G3 RPC存在 | function body置換 | 0 | function catalog | 対象RPC欠落 | 原則維持、逆戻し禁止 |
| 5 | `20260726000450` | DB-003 required relations | G1-A/B/00400 | 4表・index・RLS/policy | table作成4、row/backfill 0 | catalog/table create | existing shape不一致 | 表/RLSを保持するsecurity-preserving down |
| 6 | `20260726000500` | G1-C tenant/store integrity | **store tenant NULL 0、00450完了** | 複合FK・guard・RPC | 現状は開始不可。解消後backfill候補5 | 最大 | **現在4件で停止** | FK/guardを保持するfeature stop |
| 7 | `20260727000100` | G1-D active store | G1-C完了 | assignment/preference/RPC | assignment 1予定 | membership/store index | assignment不一致 | switch停止・権限正本維持 |
| 8 | `20260727000200` | G4-A accounting | G3/G1-C/G1-D | ledger/guard/RPC | legacy payment backfill 0 | invoice/quote FK | paid/status不整合 | ledger保持・mutation停止 |
| 9 | `20260727000300` | G4-B correction | G4-A完了 | case/refund/ownership/RPC | 0予定 | sale/vehicle/deal FK | delivered/refund不整合 | case停止・履歴保持 |

## 8. lock・timeout

適用時の固定値は`lock_timeout=3s`、`statement_timeout=120s`、maintenance window最大30分。今回migrationを実行していないためCurrent lock実測は`NOT TESTED`。

停止条件はproject fingerprint、backup、manifest/ledger/checksum、C5、required relation shape、store tenant、lock/statement timeout、row/backfill件数、FK/UNIQUE/CHECK、RLS/policy/RPC、owner/grant、ledger書込み、外部通信のいずれか1件の不一致。現在は`store tenant NULL 4`で停止条件成立中。

## 9. 外部通信停止

- Stripe: test mode。
- LINE env: 0。
- L-LINK URL: 0。
- email provider: 0。
- Push provider: 0。
- `pg_cron`: extension 0、`cron.job` relation 0。
- Stripe/LINE webhook event: 0 / 0。
- GARAGE LINK local Next runtime process: 0。
- Vercel deploy、production hostname、Google feed、worker起動: 0。

runtimeは起動していないため本工程からの外部送信0。ただしC6直前にもVercel/Cron/Webhook workerのoperator停止確認が必要。

## 10. rollback

Currentではrollbackを実行していない。各migrationはtransaction失敗時に当該transactionをrollbackし、後続を開始しない。downはG1-A/B/C、G3、G1-D、G4-A/B、DB-003のsecurity boundaryとappend-only履歴を保持する機能停止型である。00400は脆弱な未修飾functionへ戻さない。

障害時は、(1) current transaction rollback、(2)後続停止、(3)新mutation/RPC fail-closed、(4)append-only data保持、(5)network-none cloneで復旧検証、(6)別operator承認後のみCurrent restore、の順。現行Supabaseで検証目的の破壊的rollbackは行わない。

## 11. operator承認文案

**未作成**。全preflight PASS時だけ作成する条件に対し、`stores.tenant_id NULL`4件、managed Auth/Storage完全restore未確認、CLI一時資格情報の失効確認未完があるためである。

再preflight合格後の文案にはproject/API/DB/pooler fingerprint、新snapshot、backup set SHA、ledger 39、manifest 47/checksum、pending 9 version、3秒/120秒/30分、停止条件、security-preserving rollback、専用correlation ID、migration後のledger/catalog/RLS/RPC/G1-A〜G4-B検査、deploy別承認を含める。

## 12. C6開始可否

**不可**。DB-003 relation状態とledger/checksumは合格したが、G1-C必須precheckの`stores.tenant_id NULL`4件でFAIL。migration適用0件、DB-002再repair 0件、Current data更新/削除0件、deploy 0件。

次に必要なのは4店舗の正式tenant所属を人間確認し、対象・根拠・rollback・監査logを固定した別承認のdata repair、post-repair backup再取得、C5/C6再preflightである。自動backfillや00450だけの先行適用はしない。

## 13. 公開可否への影響

- コード未修正Critical: 0。
- Current未適用Critical: 3。
- DB-004追加後のコード/データ未修正High: 10。
- コード修正済みCurrent確認待ちHigh: 10。
- 本番migration: 不可。
- 本番deploy: 不可。
- 正式公開: 不可。

## 新規安全事象

`supabase db dump --dry-run`がCLI一時DBログイン資格情報を標準出力へ含めた。値は文書・backupへ保存せず、以後dry-runを禁止した。Current DB変更0。資格情報の自動失効/明示revokeをoperatorが確認するまでC6を開始しない。詳細は会社OS incident記録を正本とする。

## DB-004 read-only repair準備追記（2026-07-27）

4 storeをCurrent REST GETとbackup cloneで再照合した。4件ともcanonical membership 0、old-only member 1、store audit 0、created/updated actor NULL、company subscription 1かつtenant NULL。旧signup RPCのtenant未作成shapeと一致し、唯一のexisting tenantとの直接・間接関連は0だった。

分類はA 0、B 0、C 4。`stores.tenant_id`だけを更新できる候補はなく、operator repair承認文案も作成しない。正式store/tenant構成を人間確認し、必要ならtenant record・owner membershipを含む別recovery Batchを先に設計する。Current data変更0、migration 0。詳細は`22-db004-store-tenant-repair-plan.md`。

## DB-004 independent tenant recovery設計追記（2026-07-27）

独立tenant方針は承認済み。read-only Current再確認はproject `5b41e1af2add`、host `a0a021f40732`、対象4 store、tenant NULL 4、old-only member各1を維持した。owner候補はA 0/B 4/C 0で、実行承認前のrecovery可能数は0。

G1-Dのassignment/preference tableはCurrentに存在しないため、migration 0の現段階でR1へ含められない。R1 tenant recoveryと、G1-D適用後R2を分離する承認が必要。資格情報のrevoke/rotation確認も未了であり、C6開始不可、Current data変更0、migration 0を維持する。詳細は`23-db004-independent-tenant-recovery-plan.md`。

## DB-004 R1承認後停止追記（2026-07-27）

owner候補4件とR1実行は承認済み。一時DB credentialのrevoke/expiry/rotation完了が確認できず、明示停止条件によりR1 transactionを開始しなかった。Current data/audit/migration変更0、post-R1 backup/C5未実施。C6は引き続き不可。
