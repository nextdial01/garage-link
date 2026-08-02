# GARAGE LINK 修正計画

更新日: 2026-07-28

| Gate | 対象 | 状態 | 完了条件 |
| -- | -- | -- | -- |
| G0 | 分離DB baseline | PASS | network-none fixture環境を維持 |
| G1-A | Membership admission lock | Implemented / integrated PASS | memberships正本、自己所属・自己昇格不可 |
| G1-B | Role-aware write lock | Implemented / integrated PASS | viewer/inactive/old-only write不可 |
| G3 | Vehicle sale atomicity | Implemented / integrated PASS | 2/10/100成功1件、atomic、idempotent、rollback/restore PASS |
| G3-R | 統合検証 | **Current schema/data Gate PASS / dynamic fixtureはlocal PASS** | deploy前にCurrent role別fixtureの人間確認 |
| G0-B | 正式baseline・DR | **Local PASS / Current ledger 48** | 公式bootstrap、47-entry manifest、fresh/upgrade/rollback/restore/API CI PASS |
| G1-C | Service role・tenant/store integrity | **Current Applied / PASS** | service scope、親子複合FK、immutable guard、L-LINK binding |
| G1-D | Active store preference | **Current Applied / PASS** | assignment 5件、owner switch transaction PASS、role別dynamicはlocal PASS |
| G4-A | 売約・請求・入金の会計整合 | **Current Applied / catalog/data PASS** | append-only ledger・guard・RPC確認、dynamic fixtureはlocal PASS |
| G4-B | 納車後の返品・契約訂正 | **Current Applied / catalog/data PASS** | 独立case・guard・RPC確認、dynamic fixtureはlocal PASS |
| G5-R | Current Supabase controlled-test rehearsal | **C6 migration PASS / Current回帰は手動確認付きPASS / ledger 48** | DB-004 R1、backup、C5、9 migration完了。非owner role fixtureは最終Gateで確認 |
| G7 | Remaining High remediation | **Current Applied / ledger 50 / DB Gate PASS** | compatibility＋G7をSQL Editorの単一transactionでCOMMIT、想定外変更0 |

## 推奨順

1. **staging environment separation**: Currentと異なるremote staging Supabase、Preview専用credential、外向きdeny、架空fixture、再現可能なdeploy commitを確定する。
2. **staging deploy Gate**: 分離完了後、Preview deployとrole/tenant/store・業務・Stripe test・PII・L-LINK・browser/server logを確認する。
3. **最終公開Gate**: 外部連携のtest環境確認、backup/restore、本番migration・deploy計画を別承認で実施する。

## G1-D完了後の次Batch

1. remote staging preflightのoperator承認とread-only不整合検査。
2. G1-Dのassignment backfill候補、preference 0件、44-entry ledgerをremoteでread-only確認する。
3. G4-Aの`VEHICLE-002`会計範囲、`QUOTE-001`、`INVOICE-001`、`PAYMENT-001`はローカル完了。remote stagingでは入金・返金の実外部通信を無効化したfixtureだけで再検証する。
4. G4-Bの`VEHICLE-002`納車後範囲もローカル完了。次Batchは残存Highのうち業務事故リスクが高い`SERVICE-001`または`INVENTORY-001`を、仕様承認後に独立実装する。
5. `MEMBER-001`招待完了導線は上記と独立Batchにする。
6. Stripe、整備、棚卸しは各独立Batchとし、scope migrationへ混在させない。

## 停止条件

- 公式bootstrapまたは47-entry fresh migrationが再現できない
- G4-A precheckでpaid amountとledger不一致、未知invoice/quote statusが1件以上
- active売約重複、status不整合、orphanが1件以上
- environment/project fingerprintが本番と区別できない
- backupまたはrestore実績がない
- outbound deny/mockがない
- migration lockが合意時間を超える
- G1-A/G1-Bの拒否条件が1件でも復活する

## Current Supabase controlled-test再開条件

新snapshot、post-DB-002 backup、project fingerprint、tester-only、外部送信停止、DB-002維持、ledger 39、manifest 47/checksum、DB-003 PENDING_CREATEを確認した。一方、store tenant NULL 4件とCLI一時資格情報の失効未確認によりC6は不可。DB-004修復後にbackupを更新し、C5/C6を再実行してoperator承認を取り直す。現在のSupabase上で検証目的のrollbackは行わない。本番適用はC0〜C13通過後も別承認とする。

DB-004 read-only調査では4件すべてcanonical membership・tenant付き作成記録・tenant付き関連行がなく、旧signupによる独立company行だけを確認した。既存tenantへの1列repairは実行不可。正式構成確認後、tenantが不存在ならtenant作成・owner membershipを含む別recovery Batchを承認し、その後にbackup/C5/C6を再実行する。

2026-07-27追記: オーナーは4件を各々独立tenantとして復旧する設計を承認した。owner候補はA 0/B 4/C 0で、実行承認は未了。CurrentにはG1-Dのassignment/preference表が存在しないため、R1（tenant/store/membership/subscription/audit）と、別承認C6のG1-D後R2（assignment/preference）を分ける。Current data・migration変更は0。

2026-07-27追記: owner候補4件とR1実行はoperator承認済み。ただし一時DB credentialのrevoke/expiry/rotation確認がなく、R1はtransaction開始前でBLOCKED。Current data/audit/migration変更0。資格情報措置の確認後、同一correlation IDでR1を再開する。

2026-07-27追記: R1〜C6と条件付き9 migrationまで一括承認されたが、資格情報の措置種別・日時・operatorがプレースホルダーのまま。Phase 1で停止しCurrent接続0、変更0。3項目追完後に再開する。

2026-07-27追記: PAT revoke（17:25 JST、大久保圭祐）と旧credential無効を確認。snapshot/manifest/local fingerprintは一致したが、新credentialがCLI profile/process環境へ未構成でDB query不可。RESTで原子性を弱めず、R1・変更0で停止。新PATを安全経路でCLIへ設定後にPhase 1から再開する。
