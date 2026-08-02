# GARAGE LINK G5-R Current Supabase controlled-test rehearsal

実施日: 2026-07-27  
正式repository: `/Users/ksk/garage-link`  
製品app: `/Users/ksk/garage-link/apps/garage-link`  
HEAD: `f45b0e924f611756e9f5d99e5534d73726f4c75a` (`main`)  
総合判定: **PARTIAL / C6 FAIL-CLOSED（DB-002修復・C5 data PASS、upgrade schema drift検出）**

## 1. Operator承認

オーナーは、現在GARAGE LINKが接続するSupabaseをテスターアカウント・テストデータ専用の`controlled_test`として使用することを承認した。承認は本番Vercel deploy、production hostname公開、Stripe live、LINE・メール・Push実送信、L-LINK本番通信、実顧客データ投入、現行Supabase上の破壊的rollbackを含まない。会社OSの`governance/owner/directives/2026-07-27-run-garage-link-current-supabase-controlled-test-rehearsal.md`へ記録した。

## 2. Current project識別

| 項目 | 結果 |
| -- | -- |
| repository root | `/Users/ksk/garage-link` |
| snapshot SHA-256 | `919c2169303440514dc0dea9b5876a7f401690789b8dac72fbf6d41c45a5b7ce`（再計算一致） |
| GARAGE LINK project ref | `wmlpuzuskfiwdipluglz` |
| DB host fingerprint | `a0a021f4073239bf` |
| project状態 | `ACTIVE_HEALTHY` / ap-northeast-1 / PostgreSQL 17.6 |
| L-LINK project ref | `umijciuwyggxnrzymxmb` |
| L-LINK host fingerprint | `29311a87bd37b661` |

GARAGE LINKとL-LINKのproject ref・host fingerprintは異なる。秘密値、接続password、API key、JWT、service role keyは文書・ログへ保存していない。製品コード・migrationはsnapshotから変更していない。監査文書だけを本検証結果として更新した。

## 3. Tester-only確認

Auth user 5、tenant 1、store 5、membership 1、legacy `store_members` 5、customer 3、vehicle 3、deal 3、quote 2、invoice 2、payment ledger対象tableは未適用である。オーナーのtester-only申告を一次根拠とし、個人情報は出力していない。一部レコード名だけではtester markerを機械判定できないため、Gateは`PASS WITH MANUAL VERIFICATION`とする。

## 4. 外部通信停止

- app実行環境はStripe test modeで、LINE設定0件、接続済み0件、webhook有効0件、token/secret保存0件。
- app環境にはメールprovider、L-LINK接続URLがなく、Push送信を起動していない。
- DBに`cron.job` relationはなく、pg_cron自動jobは0件。Stripe webhook eventも0件。
- localhost runtimeは起動せず、外部API、Webhook、LINE、メール、Push、L-LINKへの送信は0件。
- repository rootには本番用秘密設定を含む別ファイルが存在するが、app directoryのcurrent runtime設定として読み込まれていない。値は確認・出力・変更していない。

環境実値の変更は0件。静的確認を含むため`PASS WITH MANUAL VERIFICATION`とする。

## 5. Backup

現在Supabaseを変更する前に、read-onlyでroles、schema、data、public data、Auth user、Storage metadata、migration ledger、catalog、row count、Storage inventoryを取得した。保存先は分離一時領域`/private/tmp/garage-link-g5r-current-20260727.K15VOe`。primary backup 11 file、合計850,490 bytes、manifest SHA-256は`6065c8667870b530cc27b833f3a31e1807025787fc9a3cc51a95dcf6282b225c`。接続文字列、password、Stripe secret、JWT-like tokenの埋込みは0件だった。

一時領域は長期保管先ではない。再開前にoperator承認済みの暗号化保管先へ移し、retentionを確定する必要がある。

## 6. Storage inventory

bucket 2、実ファイルobject 0、synthetic metadata entry 1。保全対象のbinary objectは0件だった。bucket/object inventoryはbackupへ保存した。bare PostgreSQL restore環境にはmanaged Storage schemaがないため、Storage metadata restoreは未完であり`PASS WITH MANUAL VERIFICATION`とする。

## 7. Read-only監査

Critical不整合を**1件**検出した。唯一のactive owner membershipで`joined_at`がNULLだった。tenant/store対応、user存在、tenant/store active、role/statusは成立するが、G1-Aの「招待承認済み」条件だけを満たさない。

安全なID fingerprint:

- tenant: `27d52d58ff9f`
- membership: `88e1ce7e5469`
- user: `1fdd96e3c93c`
- store: `c30f3051b471`

network-none restore cloneでG1-A migrationのexact precheckを実行すると`G1A_PRECHECK`で停止した。transaction適用後の`invite_token_hash`追加0、membership件数維持、未承認owner 1件でありpartial changeはない。

その他はduplicate active membership 0、membership/store tenant不一致0、unsupported legacy role/status 0、canonical/legacy conflict 0、orphan deal/customer 0、orphan deal/vehicle 0、cross-store deal parent 0、active sale重複候補0、won/vehicle status不一致0、未知invoice/quote status 0だった。old-only `store_members`は4件あり、G1-Aの仕様どおり自動昇格しない。

## 8. Migration

remote ledgerは39 entry、local manifestは46 entryで、未適用はG1-A、G1-B、G3、G0-B repair、G1-C、G1-D、G4-A、G4-Bの8 migration。version重複・checksum driftはない。

read-only監査でCritical 1件を検出したため、停止条件どおりcurrent Supabaseへの適用は**0件**。lock待ち、対象行、backfill、最大lock時間は`NOT TESTED`であり0msとは扱わない。RLS、owner、grant、ledger、データは変更していない。

## 9. Lock時間

current Supabase migrationは未実行のため、最大lock時間は`NOT TESTED`。

## 10. G1-A〜G1-D

current Supabase: **BLOCKED**。G1-A precheck不合格のため後続を適用・動的実行していない。ローカル固定snapshotではG1-A自己所属・自己昇格・inactive/old-only・最後のowner、G1-B role/RLS、G1-C TenantContext/scope、G1-D assignment/preferenceの全回帰がPASSした。

## 11. G3

current Supabase: **BLOCKED**。ローカル固定snapshotでは2/10/100 worker成功1件、active claim 1件、idempotency、取消、納車、process kill、tenant/store/roleがPASSした。

## 12. G4-A

current Supabase: **BLOCKED**。ローカル固定snapshotではissued invoice guard、append-only payment、入金・返金2/10/100 worker、返金上限、入金済み取消拒否、process killがPASSした。

## 13. G4-B

current Supabase: **BLOCKED**。ローカル固定snapshotではcase、承認、refund、検品、restock、ownership、元履歴維持、2/10/100 worker、process killがPASSした。

## 14. Runtime

current Supabaseに必要migrationを適用できなかったため、localhostからのmutation smokeとbrowser smokeは実施していない。production hostname、Vercel deploy、外部通信は0件。未実施をPASSにしない。

## 15. Local restore drill

network-none PostgreSQL 17.6 cloneへroles、public schema、remote 39-entry ledger、Auth user ID stub 5件、public dataを復元した。public catalog fingerprintはremoteと完全一致した（table 103、RLS table 103、policy 364、function 51、SECURITY DEFINER 44、trigger 80、constraint 352、index 441）。public row countとledgerも一致した。

managed Auth schemaの版差により完全Auth row restoreはできずID stubでpublic FKを検証した。bare imageにStorage schemaがないためStorage metadata restoreは未実施。したがってrestore Gateは`PASS WITH MANUAL VERIFICATION`で、managed Auth/Storageの完全DRは残件である。

## 16. C0〜C13

| Gate | 判定 | 根拠 |
| -- | -- | -- |
| C0 Snapshot | PASS | 指定SHA-256と再計算一致。製品コード・migration差分なし |
| C1 Current project識別 | PASS | GARAGE LINK ref/hostをL-LINKと分離確認 |
| C2 Tester-only確認 | PASS WITH MANUAL VERIFICATION | operator申告、Auth 5件。PII非表示 |
| C3 外部通信停止 | PASS WITH MANUAL VERIFICATION | Stripe test、LINE設定0、cron 0、runtime送信0 |
| C4 Backup | PASS | 11 file、checksum、secret scan 0 |
| C5 Read-only監査 | PASS | operator承認repair後、active owner joined_at NULL 0、invalid 0 |
| C6 Migration | BLOCKED | Critical検出により0件適用 |
| C7 G1-A〜G1-D | BLOCKED | current未適用。local PASS |
| C8 G3 | BLOCKED | current未適用。local PASS |
| C9 G4-A | BLOCKED | current未適用。local PASS |
| C10 G4-B | BLOCKED | current未適用。local PASS |
| C11 Local/current runtime | BLOCKED | migration前停止。production利用0 |
| C12 Local restore drill | PASS WITH MANUAL VERIFICATION | public/ledger一致、managed Auth/Storage未完 |
| C13 全回帰 | PASS | `pnpm verify:g0b` exit 0、Security 229、L-LINK mock、問い合わせ、lint、型、build、API smoke |

## 17. 新規問題

`DB-002`（Critical/P0/Confirmed Data Integrity Issue）はoperator確認・監査付き1行repair後にC5 PASS。backupの一時保存、managed Auth/Storage restore未完はOperation/Test Gapとして追跡する。

## 18. Critical・High再集計

- current data Critical: 0件（DB-002解消）
- current Supabase未適用Critical: 3件（TENANT-001、AUTH-001、VEHICLE-001）
- コード未修正Critical: 0件
- コード未修正High: 9件
- コード修正済み・current確認待ちHigh: 9件

## 19. 本番公開前の残作業

1. backupを暗号化した耐久保管先へ移し、managed Auth/Storageのrestore手順を確立する。
2. C6開始時にsnapshot/checksum、remote ledger 39件、project fingerprintを再確認する。
3. current SupabaseでG1-AからG4-Bを順番適用し、C6〜C11を実行する。
4. 残存High 9件をBatch修正し、最終回帰・本番適用Gateを実施する。

## 20. 公開可否への影響

本番migration、本番deploy、正式公開はいずれも**不可**。次工程はCurrent Supabase Gate C6以降のmigration rehearsal。Gate合格後も、残存Highのうち`INVENTORY-001`を中心とする整備・部品在庫・棚卸しを次Batch候補とする。

## DB-002 repair完了追記

最新のread-only dumpで対象1件、Auth user存在、tenant/store active、scope一致、owner/active、active owner 1、重複0を再確認した。ownerとして同一storeのcustomer deleteを行った監査行1件とsign-in実績があり、分類A相当の正規利用証拠はある。一方、invite event、`invited_at`、旧表`joined_at`はなく、実際の承認日時は特定できない。

operatorは対象、正規owner/招待承認済み、repair実行時刻、`updated_at` trigger、1行repair、audit、rollback、C5を明示承認した。repair後はactive owner joined_at NULL 0、owner 1、duplicate 0、scope mismatch 0、audit 1でC5 PASS。migration ledger 39、policy 364、RLS table 103を維持した。詳細は`18-db002-owner-membership-repair-report.md`。

## C6 migration preflight追記

- project ref/host fingerprint、tester-only承認、外部送信停止、ledger 39、backup checksum、manifest/package lockは一致。
- DB-002後のC5 data監査はowner 1、joined NULL 0、invalid/duplicate/cross-parent/G3/G4不整合0、old-only 4。
- G1-C必須45 relation中、`payment_items`、`trade_in_vehicles`、`delivery_overage_logs`、`delivery_usage_logs`の4件が欠落。現行G1-C SQLはskipせず参照するためC6はFAIL。
- `db push --dry-run`は8 pendingを正しく列挙したが、適用は0件。
- 既存backupはDB-002前であり、復元時はrepair再適用が必要。C6前にpost-repair backupを耐久保管する。
- 新規`DB-003` High/P0として記録。詳細は`19-g5r-c6-migration-preflight-report.md`。

## DB-003ローカル修正追記（2026-07-27）

- 4 relationはoptionalではなく、canonical fresh schemaと後続G1-B/G1-C/G4-Aの前提となるrequired schemaと確定した。
- G1-C本体を変更せず、直前の`20260726000450_restore_required_baseline_relations.sql`でCurrent相当の欠落をexpandする。
- manifestは47 entry、Currentの39-entry ledgerに対する予定pendingは9件。最終remote ledgerはremote-only obsolete 2件を含め48件になる見込みだが、read-only再照合前には断定しない。
- local fresh/upgrade/rollback/reapply/restore、全欠落・部分存在・全存在・不正shape停止、G1-A〜G4-B、Security、API smoke、Lint/型/buildはPASS。
- Current Supabase変更・migration適用は0件。既存snapshotは製品/migration差分により失効し、新snapshotとpost-repair backup取得後にC6 preflightを再実行する。

## C6再preflight結果（2026-07-27）

- 新snapshot: `0ac9a0bb90492104ce988cd6caa6dc12468c3e5df1f7e820cac642e0aa593c68`。
- post-repair backup: 一時領域外、17 file、884,882 bytes、SHA-256 `6c49e2c87070a8326950419e4b7589f541dbb454c7f86e905e470e80072da1e5`。public restore PASS、managed Auth/Storage完全restoreはversion差でPARTIAL。
- DB-002: owner 1、joined NULL 0、invalid/duplicate 0、audit 1で維持。
- DB-003: 4 relation全欠落、contract上`PENDING_CREATE`で期待どおり。
- ledger: 39、manifest 47、common 37、remote-only obsolete 2、pendingは**9**。pre/post repair ledger statement checksum差0。
- 新規DB-004: store 5件中`tenant_id NULL`4件。G1-Cは適用前precheckで停止するためC6不可。
- migration 0、Current data変更0、deploy 0。operator migration承認文案は作成条件未達のため未作成。

完全な根拠と次工程は`21-g5r-c6-repreflight-report.md`を正本とする。

## DB-004 read-only特定追記（2026-07-27）

Current GETとpost-repair backup cloneを照合し、tenant NULL 4 storeを新方式`SHA-256(store.id)[:12]`で再識別した。4件ともold-only member 1、canonical membership 0、store audit 0、created/updated actor NULL、subscription 1かつtenant NULLである。

旧signup RPCはtenantを作らずstore/member/subscriptionを同時作成する。4件はこの時間・shapeと一致し、各legacy userも唯一のcanonical ownerとは別である。existing tenant `cbc9a4f71eee`との客観的関連は0のため、A 0、B 0、C 4。repair、migration、Current変更はいずれも0。詳細は`22-db004-store-tenant-repair-plan.md`。

## DB-004 independent tenant recovery設計追記（2026-07-27）

4 storeをそれぞれnew tenantへ1対1復旧する方針が承認された。Current read-only再確認ではstore 4件、tenant NULL 4件、old-only member各1件を維持。owner候補分類はA 0/B 4/C 0で、個別owner承認前のrecovery実行可能件数は0。

Currentには`membership_store_assignments`と`user_active_store_preferences`が未存在（404）のため、migration 0のままR1 transactionへ含められない。R1とG1-D後R2の二段階承認が必要であり、C5/C6は引き続きBLOCKED。Current data変更0、migration 0。正本は`23-db004-independent-tenant-recovery-plan.md`。

## DB-004 R1実行Gate追記（2026-07-27）

owner候補4件とR1 scopeは承認されたが、一時DB credentialの失効・rotationを確認できず、4 transactionとも開始0で停止した。post-R1 backupとC5は未実施。Current data、audit、migration、RLS/policy変更はいずれも0。`24-db004-r1-execution-report.md`を実行記録とする。

## Post-R1 manual backup Gate（2026-07-27）

DB-004 R1とpostcheckはCurrentでPASS済み。Free Plan Dashboard backupの代替としてSupabase CLI 2.107.0のlinked論理dumpを試行したが、API認証401とCurrent DB password未設定でDB接続前停止となった。

- backup file: 0
- Current query/write: 0
- migration: 0
- C5: NOT TESTED
- 判定: backup BLOCKED / C5 BLOCKED

再開条件は、既存GARAGE LINK Current DB passwordをCodex起動元の承認済みsecret管理機構へ設定して再起動すること。credential値は共有しない。

## DB-005 store authorization eligibility追記（2026-07-27）

- 正式仕様を `active` / `trial` のみeligible、その他・NULL・未知値はfail-closedへ統一した。
- eligibilityだけでは権限を付与せず、canonical `memberships` のactive状態、role、tenant/store整合を引き続き必須とする。
- G1-A/G1-B/G1-C/G1-DのDB認可helper、R1 pre/postcheck、C5を同一仕様へ揃えた。`store_members` fallbackは追加していない。
- local fresh/upgrade/rollback/reapply/restore、G1-A〜G4-B、Security 233件、API smoke、Lint、TypeScript、production buildはPASS。
- Current C5はread-onlyで再実行し、既存trial store 1件を含め全項目PASS。ledger 39、RLS table 103、policy 364、新規不整合0。
- Current data変更0、migration適用0、外部通信0。新snapshotは `44eae79c4403741e1c3cd9cf6fc199b5baeb392f0c2cd88078d3b003cc3387a5`、47 migration manifest SHA-256は `3f0358fcb993071ba6def9c8bdb2e81a901b300c4301dabb8dd33ca1dbfb24f0`。
- C6は更新版snapshot/manifestを対象とするoperator承認後に開始可能。本番migration、deploy、正式公開は未承認・不可。

詳細と更新版C6 operator承認文案は `30-db005-store-eligibility-remediation-report.md` を正本とする。
