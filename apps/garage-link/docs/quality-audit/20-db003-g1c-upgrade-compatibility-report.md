# DB-003 G1-C upgrade compatibility remediation report

実施日: 2026-07-27  
対象: Current Supabase upgrade経路 / G1-C直前のexpand compatibility  
判定: **Local Completed / Current Supabase未適用 / C6再preflight待ち**

## 1. DB-003概要

Current Supabaseの39-entry ledger相当schemaには、canonical fresh schemaに含まれる4 relationが存在しなかった。既存G1-C `20260726000500_service_role_tenant_store_integrity.sql`はこれらを無条件参照するため、適用すると`42P01`でtransactionが停止する。

対象は次の4表である。

| Relation | 分類 | canonical source | 利用根拠 | Current欠落理由 |
| -- | -- | -- | -- | -- |
| `payment_items` | required-present | `supabase/schema/008_trade_in_and_payments.sql` | G1-B/G1-C/G3/G4-Aのpolicy・scope・guard対象 | fresh schemaにだけCREATEがあり、timestamp creation migrationがなかった |
| `trade_in_vehicles` | required-present | `supabase/schema/008_trade_in_and_payments.sql` | 商談の下取情報、G1-B/G1-Cのrole/scope対象 | 同上 |
| `delivery_usage_logs` | required-present | `supabase/schema/029_line_plan_billing.sql` | `src/lib/billing/lineBilling.ts`の配信利用記録、G1-C scope対象 | fresh schemaにだけCREATEがあり、timestamp creation migrationがなかった |
| `delivery_overage_logs` | required-present | `supabase/schema/029_line_plan_billing.sql` | 同billing処理の超過記録、G1-C scope対象 | 同上 |

rename、drop、代替正式table、廃止migrationは見つからなかった。したがってoptional legacyとしてskipせず、required schema driftとして扱った。

## 2. 原因

fresh構築は`supabase/schema`をbaseline bundleへ含める一方、既存環境のupgradeはtimestamp migrationだけを適用する。4表のCREATEが後者に存在しなかったため、freshとupgradeでschemaが分岐した。G1-Cはfresh側schemaを前提に複合FK、RLS、immutable guardを付与しようとしていた。

## 3. 修正方針

既存G1-C migrationは未適用Current以外の共有先が不明なため変更しなかった。G1-C直前に新しいexpand migration`20260726000450_restore_required_baseline_relations.sql`を追加した。

- relation欠落時だけcanonical定義で作成する。
- 既存relationはrequired columnを全件検証し、不足があれば`DB003_RELATION_SHAPE_MISMATCH`で停止する。
- 曖昧なrename、data copy、backfill、業務データ推測修復はしない。
- G1-B適用後に新規作成されるため、作成時点でRLSとrole-aware write boundaryを付ける。
- 後続G1-Cがtenant/store複合FKとimmutable scope guardを付ける。
- Current Supabase、本番、remote stagingへは接続も適用もしていない。

## 4. relation contract

`supabase/baseline/g1c-relation-contract.json`を正本とし、4表をすべて`required-present`に分類した。`scripts/db/check-g1c-relation-contract.mjs`は次をfail-closedで検査する。

- contract内の重複、未知state、creator migration欠落
- creator SQLにCREATEがない不一致
- post-upgradeでrelation欠落
- required column欠落
- RLS無効
- pre-upgradeではcreatorが未適用の場合だけ`PENDING_CREATE`

文字列検索だけでなく、migration runnerが作成したDB catalog JSONと実SQL assertionを併用する。

## 5. migration

追加version: `20260726000450`。適用順はG0-B repair `00400`の後、G1-C `00500`の前である。

主な処理:

1. 既存relation shape precheck
2. 4表の`CREATE TABLE IF NOT EXISTS`
3. canonical indexと`updated_at` trigger
4. RLS enable
5. G1-B相当のwrite policyを再適用
6. 欠落時だけactive membershipに限定したSELECT policy
7. relation存在・RLSのpostcheck
8. commit

`20260726000500_service_role_tenant_store_integrity.sql`の変更は**0件**。

## 6. policy・権限

| Relation | authenticated write |
| -- | -- |
| `trade_in_vehicles` | owner/admin/staffの通常write、DELETEはowner/admin |
| `payment_items` | owner/adminのみINSERT/UPDATE/DELETE |
| `delivery_usage_logs` | owner/adminのappend INSERTのみ、UPDATE/DELETE revoke |
| `delivery_overage_logs` | owner/adminのappend INSERTのみ、UPDATE/DELETE revoke |

anon writeは全表revoke。既存の広いwrite policyはOR迂回を残さないようdropする。G1-C適用後は親子scope、tenant/store不変条件もDBで検証する。

## 7. manifest・checksum

| 対象 | SHA-256 |
| -- | -- |
| manifest | `bbd25cc33f2b726cc564704758a9211961c200e32b262166a6691cc23f38ec54` |
| relation contract | `73572b5d9eed92c9e71ec255b611cda62c08469976d217534d87350eeb0fe06c` |
| `20260726000450` | `e6b31cd773f48632964ccc01580eff18b315f9d5f17c99c7b5e741a6fe99718d` |
| rollback | `a35df8315a88a5fd1140ddc8cf5329fbc23103423253e3639e62986c662c3e43` |
| package lock（変更なし） | `158a5bd5df81ba088fd8f08132cc4c79ebb1d49bf50c32c93f54f6d361adc9a2` |

manifestは46から47 entryへ更新した。G1-Cの`dependsOn`へ00450を追加し、classificationとrollback catalogも同期した。version重複、順序逆転、filename重複、checksum driftは0。

既存C6 snapshot `919c2169303440514dc0dea9b5876a7f401690789b8dac72fbf6d41c45a5b7ce`は製品/migration差分により失効した。C6前に新しいdirty-tree snapshotを作成する。

## 8. fresh・upgrade検証

network-noneの使い捨てSupabase PostgreSQLで実施した。

| シナリオ | 結果 |
| -- | -- |
| fresh | 47 applied、PASS |
| 再実行 | 47 skipped、PASS |
| Current相当upgrade | 38 entry適用後に4表を欠落させ、9 entry適用、最終47、PASS |
| 全4表欠落 | PASS、00450が4表作成 |
| `payment_items`のみ存在 | PASS |
| `trade_in_vehicles`のみ存在 | PASS |
| `delivery_usage_logs`のみ存在 | PASS |
| `delivery_overage_logs`のみ存在 | PASS |
| 全4表存在 | PASS、破壊的再作成なし |
| required column欠落 | `DB003_RELATION_SHAPE_MISMATCH`でrollback、PASS |

post-upgradeでは4表存在、RLS有効、G1-B write boundary、G1-C immutable trigger、主要複合FKを実catalog/SQLで確認した。

## 9. required absent時のpreflight

00450未適用のpre-upgrade catalogでは、creator versionがpendingの場合だけ4表を`PENDING_CREATE`として扱う。00450適用後のpost-upgrade catalogで1表でも欠落、required column不足、RLS無効があればFAILする。

これにより「Currentに欠落していること」と「適用後も欠落していること」を区別し、前者を安全なexpand対象、後者を停止条件にした。optional skipや成功扱いはしない。

## 10. rollback

`20260726000450_restore_required_baseline_relations.down.sql`はsecurity-preserving rollbackである。4表やデータをdropせず、RLSを維持し、relation存在をassertする。schemaを縮退するとG1-Cの再適用不能や旧write経路復活につながるため、破壊的downは採用していない。

ローカル結果はrolledBack 8、reapply applied 9 / skipped 38、最終47でPASS。G1-A、G1-B、G1-C、G1-D、G3、G4-A、G4-Bの拒否条件を維持した。

## 11. 回帰結果

| 検査 | 結果 |
| -- | -- |
| `pnpm test:db:db003` | PASS（全欠落、部分存在、全存在、不正shape） |
| `pnpm test:db:g1c-contract` | 3/3 PASS |
| `pnpm test:db:runner` | 4/4 PASS |
| `pnpm test:db:fresh` | PASS（fresh/upgrade/rollback/reapply/restore） |
| `pnpm verify:g0b` | PASS |
| G1-C static scope | PASS（references 31、scoped High 11、server cache不足0） |
| Security suite | 229/229 PASS |
| L-LINK S2S/ACK/inquiry mock | PASS |
| 問い合わせ管理check | PASS |
| API smoke | PASS（401/403/409/503/200、内部情報漏えいなし） |
| Lint | PASS |
| TypeScript | PASS |
| production build | PASS（129/129、既知middleware警告のみ） |

Current Supabaseの動的結果ではない。未実行をPASSとしていない。

## 12. post-repair backup準備

C6前にDB-002 repair後backupを新規取得する。手順は次のとおり。

1. project ref・host fingerprint・tester-only・外部送信停止をread-onlyで再確認する。
2. operator承認済みの暗号化耐久保管先を用意し、作業directoryをowner-only権限にする。
3. roles、schema、data、migration ledger、RLS/policy、function owner/EXECUTE、trigger/constraint/index、row counts、Auth export、Storage inventoryを分離保存する。
4. DB-002 correlation `dec35909-f204-4914-8b94-53bf35ae79cb`のmembership 1行＋audit 1行が含まれることを安全なfingerprintと件数で確認する。
5. backupへ接続文字列・password・API key・JWT・service role keyが埋め込まれていないことを検査する。
6. file size、作成時刻、SHA-256 manifestを保存し、network-none restore cloneでcatalog、row counts、RLS/ACL、G1-A〜G4-Bを検証する。
7. fingerprint不一致、backup/checksum/restore失敗、managed Auth/Storage保全不能のいずれかでC6を停止する。

本工程ではCurrentへ接続せず、backupも取得していない。既存pre-repair backupは緊急復旧資料として保持するが、C6最終backupには使用しない。

## 13. C6再preflight

ローカルコード面では再preflightへ進める。migration適用開始条件は次をすべて満たすこと。

- 新snapshot manifestと47-entry checksum固定
- Current project fingerprint一致
- post-repair backup取得・耐久保管・restore確認
- C5 Critical不整合0
- remote ledger 39とlocal manifestの再照合
- 00450を含むpending 9件の確認
- 4 relationの現存/欠落状態とrequired shape確認
- external deny/mock、Cron/Webhook停止
- operatorのmigration実行承認

1条件でも欠ければC6 migrationはBLOCKEDとする。

## 14. 変更範囲

DB-003で変更した製品側ファイルは、新migration、security-preserving rollback、manifest、classification、relation contract、preflight checker、DB test/fixture/assertion、G0-B runner、package scriptである。既存G1-C SQL、G1-A/G1-B/G3/G1-D/G4-A/G4-B業務実装、Current Supabase、本番、環境変数、外部サービスは変更していない。

worktreeには本作業前から多数の未コミット差分がある。削除、上書き、一括整形、commit、pushは行っていない。

## 15. 残存リスク

- Current Supabaseで00450を実行したlock時間、行数、ACL/policy実状態は未確認。
- post-DB-002 backupとmanaged Auth/Storageの完全restoreは未実施。
- Currentの4表欠落を前提にlocal fixture化したが、再preflightまでcatalog変化を否定できない。
- コード未修正High 9件、Current確認待ちHigh 10件、Current未適用Critical 3件が残る。

## 16. 公開可否

DB-003はローカルで解消したが、Current Supabaseへ未適用である。本番migration、本番deploy、正式公開は不可。次は新snapshot、post-repair backup、Current read-only C5/C6 preflight、operator承認である。

## 17. Current C6再preflight結果（2026-07-27）

4 relationはすべてabsentで、contract checkerは`PENDING_CREATE`を返した。partial relation、shape drift、想定外owner/grant/policyは0。したがってDB-003単体の適用計画は成立する。

ただしG1-Cより前のCurrent data条件として`stores.tenant_id NULL`4件を検出した。DB-003適用後であってもG1-Cは停止するため、00450だけを先行適用せず、DB-004を人間確認・別承認で解消してから9 migrationを一連のmaintenance windowで実施する。Current migration適用は0件。
