# GARAGE LINK G5-R C6 migration preflight report

実施日: 2026-07-27  
対象: Current Supabase `controlled_test`  
工程: read-only preflight / migration実行計画  
判定: **DB-003 Local Resolved / C6再preflight待ち（Current migration適用0件）**

## 1. Current Supabase識別

| 項目 | 結果 |
| -- | -- |
| repository | `/Users/ksk/garage-link` |
| app | `/Users/ksk/garage-link/apps/garage-link` |
| branch / HEAD | `main` / `f45b0e924f611756e9f5d99e5534d73726f4c75a` |
| project ref | `wmlpuzuskfiwdipluglz` |
| API host fingerprint | `a0a021f4073239bf` |
| L-LINK ref / host fingerprint | `umijciuwyggxnrzymxmb` / `29311a87bd37b661` |
| environment | operator承認済み`controlled_test` |

前回C5時と一致し、GARAGE LINKとL-LINKは別projectである。秘密値は出力・保存していない。Current SupabaseへのSQLは`BEGIN READ ONLY`で実行し、`transaction_read_only=on`を確認した。

## 2. Git・manifest

- 既存snapshot SHA-256: `919c2169303440514dc0dea9b5876a7f401690789b8dac72fbf6d41c45a5b7ce`。
- snapshot対象189ファイルを再計算し、製品コード・migrationの差分は0件。監査結果の追記により`04-findings.md`と`07-remediation-plan.md`だけが既存snapshotから変化している。
- baseline manifest SHA-256: `bb9a60d9e4561ce9667043ea024d1d6c3e8a4c5098f133e57a13fce8d0d9a1f7`（既存snapshotと一致）。
- package lock SHA-256: `158a5bd5df81ba088fd8f08132cc4c79ebb1d49bf50c32c93f54f6d361adc9a2`（一致）。
- `migration-runner validate`: 46 entry PASS。version重複0、filename重複0、rollback checksum drift 0。
- worktreeは開始前からdirty。commit、push、一括整形、既存差分の削除は行っていない。

## 3. remote ledger

Current Supabase ledgerは39件、latestは`20260725010000`。既存backupの39件と、version・name・`md5(statements::text)`から算出したledger fingerprint `d9ae069f0b3b58d457d5d73d1c2b460a`が一致した。

| 分類 | 件数 | 内容 |
| -- | --: | -- |
| remoteとlocal共通 | 37 | 書換え・順序逆転なし |
| remoteだけ | 2 | `20260706160000`、`20260706170000`。旧L-LINK専用としてmanifestの`excluded/obsolete`に明示済み |
| local baselineだけ | 1 | `000000000001`。fresh専用bundleでCurrent Supabaseへ適用しない |
| 今回のpending | 8 | G1-A、G1-B、G3、G0-B compatibility repair、G1-C、G1-D、G4-A、G4-B |

`supabase db push --linked --include-all --dry-run`も上記8件だけを表示した。dry-runによるDB変更は0件。

## 4. checksum

- manifest本体、8 pending SQL、7 rollbackは既存snapshotと一致した。
- remote ledgerはbackup fingerprintと一致した。
- remote-only 2件は未分類driftではなく、manifestで明示されたobsolete migrationである。
- baseline、schema snapshot、test fixture、rollback、archive、DB-002 repair SQLはC6適用対象外。
- `20260726000400`は種別名が`repair`だが、classificationで`Upgrade適用=はい`とされたG1-A/G3の`extensions.digest`互換migrationであり、単独data repairではない。C6対象に含める。

## 5. backup

既存backup: `/private/tmp/garage-link-g5r-current-20260727.K15VOe`。manifest SHA-256は`6065c8667870b530cc27b833f3a31e1807025787fc9a3cc51a95dcf6282b225c`、11 primary file、850,490 bytes、全file checksum一致、project ref一致。

- schema、public data、39-entry ledger、role/ACL、catalog、row counts、Auth export、Storage metadata/inventoryを保全。
- public schema/ledger/catalogのlocal restoreはPASS。
- managed AuthはID stubによるpublic FK検証までで完全restore未確認。managed Storageはbucket 2、binary object 0、metadata-only object 1で完全restore未確認。
- backupはDB-002 repair前である。backup後の変更はmembership 1行の`joined_at/updated_at`とaudit 1行だけ。復元時は承認済みDB-002 repairを再適用しなければCriticalを再導入する。
- RPOはbackup作成点（repairの約52分前）。local public DBの既測RTOは約0.32秒だが、managed Auth/Storageを含むRTOは未確定。
- 一時領域は耐久保管ではないため、C6実行前にpost-repair backupを取得し、暗号化した耐久保管へ移す必要がある。

判定: **PASS WITH MANUAL VERIFICATION**。現在のC6実行用の最終backupとしてはpost-repair再取得が必要。

## 6. external communication

- appはStripe test mode。Stripe live keyは検出していない。
- LINE設定0、接続0、webhook enabled 0、token/secret 0。
- email provider 0、Push送信起動0、appのL-LINK URL 0。root側L-LINK URLはloopback。
- `pg_cron` extension 0、`cron.job` relationなし、Stripe webhook event 0。
- activeな別DB session 0。Vercel deploy、runtime、worker、外部fetchは起動していない。

DB実値の変更は0件。外部送信を起動するruntimeも開始していない。

## 7. tester-only

tester-onlyはoperator申告を正本とし、Auth 5、tenant 1、store 5（active 4）、active owner 1、customer/vehicle/deal各3、invoice/quote各2を確認した。機械的test markerは5 user全員ではないため、判定は**PASS WITH MANUAL VERIFICATION**。個人情報・tokenは取得・出力していない。

## 8. C5再監査

| 検査 | 件数 |
| -- | --: |
| active owner | 1 |
| active owner `joined_at NULL` | 0 |
| invalid active membership | 0 |
| tenant without valid owner | 0 |
| duplicate active membership | 0 |
| membership/store tenant mismatch | 0 |
| unsupported role/status | 0 |
| invited membership | 0 |
| legacy conflict | 0 |
| old-only membership | 4（自動移行・権限付与なし） |
| cross-parent relation（存在する対象表） | 0 |
| non-null tenant scope mismatch | 0 |
| G1-C deterministic NULL backfill候補 | 5（company subscription 4、plan request 1） |
| G3 duplicate/inconsistent sale | 0 / 0 |
| G3 claim backfill候補 | 0 |
| G1-D assignment backfill候補 | 1 |
| G4-A nonzero paid / unknown invoice / unknown quote | 0 / 0 / 0 |
| G4-B delivered candidate | 0 |
| DB-002 repair audit | 1 |

データ値のCritical不整合は0件。ただしmigration precondition catalogで、G1-CがSQL本文から無条件参照する45 relation中、次の4件がCurrent Supabaseに存在しない。

- `payment_items`
- `trade_in_vehicles`
- `delivery_overage_logs`
- `delivery_usage_logs`

G1-Cはこれらに対してdynamic skipを行わず、precheck JOINおよびUPDATEを実行する。read-only queryでも`payment_items`参照時に`42P01 relation does not exist`を再現した。したがって現行8 migrationを順番適用すると`20260726000500`で必ず停止する。C5のデータ監査部分はPASS、C6 migration readinessは**FAIL**。

## 9. 適用migration一覧

以下はschema drift解消後の予定であり、今回は0件適用。

| 順番 | Version | 目的 | 対象ID | 事前条件 | 主なDDL | Data変更 | Lockリスク | Rollback |
| --: | -- | -- | -- | -- | -- | -- | -- | -- |
| 1 | `20260726000100` | membership admission | TENANT-001/AUTH-001/002 | owner・membership precheck 0 | memberships列・制約・index・policy・RPC | 原則なし | memberships AccessExclusive/index | security-preserving機能停止 |
| 2 | `20260726000200` | role-aware write | AUTH-001 | G1-A active helper成立 | 65表policy/grant・helper/RPC | なし | 多数表の短時間policy lock | policyを広げず機能停止 |
| 3 | `20260726000300` | sale atomicity | VEHICLE-001 | duplicate/status不整合0 | claim/operation、UNIQUE/FK/trigger/RPC | claim backfill 0予定 | vehicle/deal index/FK | RPC停止、claim保持 |
| 4 | `20260726000400` | extension互換 | DB-001 | G1-A/G3の6 RPC存在 | 6 function body置換 | なし | function catalog lock | 原則維持（逆戻し禁止） |
| 5 | `20260726000500` | service role/scope | TENANT-002/AUTH-003/DB-001 | **45 relation存在、cross-scope 0** | 複合UNIQUE/FK、immutable guard、RLS/RPC | deterministic backfill 5予定 | **最大。多数表index/FK/UPDATE** | security-preserving機能停止 |
| 6 | `20260727000100` | store assignment/preference | TENANT-003 | G1-C、membership/store整合 | 2 table、FK/RLS/RPC | assignment 1予定 | memberships/store index | switch停止、権限正本維持 |
| 7 | `20260727000200` | accounting integrity | QUOTE/INVOICE/PAYMENT/VEHICLE-002 | paid/status precheck 0 | ledger/operations、guard/RPC/FK | legacy paid backfillなし | invoices/quotes validate/index | mutation停止、ledger保持 |
| 8 | `20260727000300` | delivered correction | VEHICLE-002 | delivered scope/status整合 | case/event/refund/ownership 5表・RPC | なし予定 | claim/vehicle/deal index/FK | case機能停止、履歴保持 |

## 10. lock・timeout

- 計画値: `lock_timeout='3s'`、`statement_timeout='120s'`。各migration transaction内で設定する。
- local 46-entry fresh実績は5.145秒、remote lockは未測定。0msとは扱わない。
- maintenance window案は30分、通常期待は5分以内。30分を最大想定停止時間とし、超過時は後続を開始しない。
- 適用前にactive session 0、worker/Cron停止、backup、fingerprint、C5、ledgerを再確認する。
- lock wait、timeout、unexpected row count、catalog差異を監視し、1件でも異常ならcurrent transactionを中断して後続停止。
- G1-Cは多数表へindex/FK/UPDATEを行う最大risk migration。欠落4 relationが解消されるまでmaintenanceを開始しない。

## 11. migrationごとの停止条件

全migration共通: precheck、checksum、version/filename、ledger、expected object、row count、RLS、owner/grant、lock 3秒、statement 120秒のいずれかが不一致なら即時停止。UNIQUE/FK/CHECK/RPC/policy作成失敗、想定外backfill、外部通信、active session発生でも停止する。

追加条件:

- G1-A: valid owner 1を維持できない、old-onlyが昇格する。
- G1-B: viewer/inactive/old-only write policyが残る、OR迂回が残る。
- G3: active sale候補重複、vehicle/deal不一致、claim backfill件数不一致。
- G0-B repair: 対象6 RPC不存在、未修飾`digest`残存。
- G1-C: 必須relation/column欠落、cross-scope、非一意親、backfill 5以外。
- G1-D: assignment backfillが1件以外、membership/roleを書き換える。
- G4-A: paid amount、status、ledger precheck不一致。
- G4-B: delivered scope/status、active case/refund/ownership不一致。

## 12. rollback

Current Supabaseで検証目的の破壊的rollbackは行わない。G1-A/B/C、G3の脆弱経路を復活させるdownは使用禁止。障害時は、(1) 当該transaction rollback、(2) 後続停止、(3) 新mutation API/RPCをfail-closed停止、(4) append-only dataを保持、(5) restore cloneでsecurity-preserving rollback検証、(6) 必要時だけoperator承認でCurrent Supabase復旧、の順とする。

7 rollback fileはlocalで検証済み。G0-B compatibility repairは安全性を弱めないため通常rollbackしない。再適用はprecheck、ledger、checksum、catalogが一致した場合だけ許可する。

## 13. C6実行順

1. project/host fingerprint再確認。
2. worker/Cron/Webhook/外部送信停止確認。
3. **post-DB-002 backupを再取得し耐久保管**。
4. C5 read-only再実行。
5. ledger 39件とmanifest/checksum再確認。
6. **DB-003（欠落4 relation）をlocal/fresh/upgradeで解消し、新snapshotを固定**。
7. operator承認後にmaintenance開始。
8. migrationを1件ずつ適用し、直後にledger/catalog/RLS/RPC/smoke確認。異常時は後続停止。
9. 8件完了後にG1-A〜G4-B DB回帰とledger 47件（remote-only 2件を含む）を確認。
10. maintenance解除を別判断し、runtime C7以降へ進む。Vercel deployは別承認。

## 14. operator承認文案

**未作成**。preflightが全PASSの場合だけ作成する条件に対し、G1-C必須relation 4件欠落とpost-repair final backup未取得があるためである。DB-003修正、新snapshot、fresh/upgrade回帰、post-repair backup後に、project fingerprint、backup SHA、ledger 39、manifest SHA、8 version、3秒/120秒、停止条件、rollback、correlation ID、事後検証、deploy別承認を含む文案を作成する。

## 15. C6開始可否

**不可**。データC5はPASSだが、migration catalog preconditionがFAIL。今回のCurrent Supabase変更、migration、repair、deploy、外部送信はいずれも0件。

## 16. 新規発見事項

`DB-003`（High/P0/Confirmed Bug）: Current Supabase upgrade経路にはfresh baselineだけで作成される4 relationがなく、G1-C migrationが未存在relationを無条件参照する。現行C6は`20260726000500`で失敗する。対象外の業務仕様は変更せず、次Batchでexpand compatibility migrationまたはG1-Cの安全なoptional-relation処理を設計し、fresh/upgrade双方を再検証する。

## 17. 公開可否への影響

current未適用Critical 3件は維持。コード未修正Critical 0件。DB-003を追加し、コード未修正Highは10件、current確認待ちHighは9件。Current Supabase migration、本番migration、本番deploy、正式公開はいずれも不可。

## 18. DB-003修正後のC6計画（2026-07-27）

4 relationはcanonical fresh schemaのrequired tableであり、optional skipは採用しなかった。G1-C直前に`20260726000450_restore_required_baseline_relations.sql`を追加し、G1-C本体は未変更。manifestは47 entry、Current 39-entry ledgerに対する予定pendingは8件から9件へ変わる。

localではfresh 47、再実行47 skip、Current相当38→47 upgrade、security-preserving rollback 8／reapply 9、restoreをPASSした。欠落4表、各1表のみ存在、全存在はすべてPASSし、required column欠落はfail-closedで停止した。詳細は`20-db003-g1c-upgrade-compatibility-report.md`。

C6再開前に、(1) 新snapshot、(2) project/host fingerprint、(3) post-DB-002 backupの耐久保管とchecksum、(4) C5 read-only、(5) remote ledger 39とlocal manifest、(6) 4表の現存状態、(7) external deny、(8) operator承認を再確認する。既存snapshotとpre-repair backupをそのまま使用しない。

現時点の分類はコード未修正High 9、コード修正済みCurrent確認待ちHigh 10。Current Supabase、本番、Vercel、外部サービスへの変更は0件である。

## 19. C6再preflight差分（2026-07-27）

DB-003修正後snapshot、post-repair backup、Current project、C5、ledger、relation contractを再取得した。DB-003の4 relationは想定どおり全欠落で`PENDING_CREATE`、ledgerは39、manifestは47、pendingは新migration追加により8ではなく9件である。

一方、`stores.tenant_id NULL`4件を新たに検出し、G1-C `G1C_PRECHECK_STORE_WITHOUT_TENANT`の停止条件が成立した。旧preflightはこの検査を落としていた。tenant所属を推測修復しないため、C6は引き続き不可。operator承認文案も未作成。新しい正本は`21-g5r-c6-repreflight-report.md`。

## 20. DB-004 repair準備差分（2026-07-27）

4 storeは旧signupによる独立store/member/subscription行で、正式tenant・canonical membership・tenant付きaudit/child/subscriptionが存在しない。既存1 tenantへの割当根拠はなく、A 0、B 0、C 4。DB-004は単純なstore tenant repairではなく、正式構成の人間確認と、必要ならtenant recovery Batchが必要である。C6、operator migration承認文案、Current repairは停止を維持する。

## 21. DB-004 independent tenant recovery設計差分（2026-07-27）

オーナーは4 storeを個別new tenantへ復旧する設計を承認した。既存tenant割当候補の旧分類とは別にowner候補を再評価し、A 0/B 4/C 0とした。owner個別承認、CLI一時credential措置、G1-D未存在tableの二段階方式が未承認のため、recovery・C6・migrationは0を維持する。

R1成功後も、post-recovery backupとC5 read-onlyを再実行し、DB-003 PENDING_CREATE、ledger 39、manifest 47、pending 9、checksumを再照合する。C6 migration適用は別operator承認である。
