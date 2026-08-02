# G3 Vehicle sale atomicity remediation report

更新日: 2026-07-26  
対象: VEHICLE-001、VEHICLE-002の売約・販売・取消に直接関係する範囲

## 1. 修正前のCritical経路

修正前G0で、同一車両に紐づく異なる2商談をownerとstaffが同時に直接UPDATEした。両方が成功し、最終状態は商談`成約`2件、車両`在庫中`、原子的な売約記録0件だった。原因は画面が`deals.status`だけを更新し、DBにactive売約の一意制約、transaction、idempotency、直接遷移guardがなかったこと。

## 2. 車両・商談status

実装で確認した車両statusは`在庫中`、`展示中`、`商談中`、`整備中`、`売約済み`、`納車済み`（旧defaultは`in_stock`）。商談statusは`新規`、`連絡済み`、`来店予定`、`見積済み`、`商談中`、`成約`、`失注`。

- 売約可能車両: `在庫中`、`展示中`、`商談中`、`整備中`、互換用`in_stock`
- 売約成功: vehicle=`売約済み`、deal=`成約`、claim=`active`
- 取消成功: vehicleをclaim保存済みの直前statusへ復旧、deal=`失注`、claim=`cancelled`
- 納車成功: vehicle=`納車済み`、deal=`成約`維持、claim=`delivered`
- 納車済み取消: 拒否
- 請求・正の入金明細あり取消: 自動処理を拒否

別商談の見積失効、請求取消・返金の業務仕様は`Specification Required`。

## 3. 売約の正本

売約の存在と排他は`vehicle_sale_claims`、車両・商談の表示状態は`vehicles.status`と`deals.status`で保持し、3者を1 transactionで更新する。status片方だけを正本にはしない。

## 4. 原子的RPC

- `reserve_vehicle_sale`: actor確認、membership/role、vehicle→deal row lock、scope/customer整合、status、idempotency、claim作成、vehicle/deal更新、監査ログ、操作結果保存。
- `cancel_vehicle_sale`: claim/vehicle/dealをlockし、会計存在確認後にclaim取消、vehicle復旧、deal失注、監査ログを同一transactionで実行。
- `complete_vehicle_delivery`: active claim、売約済みvehicle、成約dealを確認し、claimとvehicleを同一transactionで納車済みにする。

すべてSECURITY DEFINER、`search_path = public, pg_temp`固定、actorは`auth.uid()`から取得する。

## 5. DB制約

- vehicleごとのactive claim partial UNIQUE
- dealごとのactive claim partial UNIQUE
- claim status CHECK: active/cancelled/delivered
- operation CHECK: reserve/cancel/deliver
- tenant単位idempotency key UNIQUE
- vehicle/store、deal/store、store/tenant複合FK
- deal/vehicleの直接売約遷移trigger
- 新2テーブルはRLS有効、authenticated direct writeはREVOKE

## 6. idempotency

APIは8〜200文字のclient request IDを受け取る。同じtenant/key/同じfingerprintは保存済み結果を返す。同じkey/異内容は`IDEMPOTENCY_CONFLICT`、異なるdealによる同一vehicle競合は`ALREADY_RESERVED`または`CONFLICT`。監査ログにはkey全文でなくSHA-256識別子だけを保存する。

## 7. role・tenant・store

owner/admin/staffは許可。implementer/viewerは拒否。inactive、old-only、未認証、他tenant・他storeは拒否。clientからtenant/store/actor/roleを受け取らず、deal→vehicle→store→tenantをDBで再検証する。service roleのみの呼出しはactor不在として拒否する。

## 8. キャンセル

二重取消は保存済み結果または`ALREADY_COMPLETED`へ収束する。2/10 worker試験でactive 0、vehicle=`在庫中`、deal=`失注`、取消監査ログ1件。納車済み、請求・正の入金明細ありは409相当で拒否する。

## 9. 見積・請求・納車との整合

見積・請求は既存仕様上売約時の同時作成ではないためG3 transactionへ含めていない。請求・入金あり取消は自動変更しない。納車はatomic RPCへ接続し、売約なしでは拒否する。見積失効、請求作成との競合、返金は後続仕様確認。

## 10. 監査ログ

成功した売約・取消・納車についてstore、vehicle、deal、actor、role、前後status、key hash、correlation ID、日時を記録する。個人情報、価格明細、token全文、SQLは記録しない。拒否はDB transaction内へ永続化するとrollbackと矛盾するため、現Batchではレスポンスcodeで扱う。

## 11. migration

`20260726000300_vehicle_sale_atomicity.sql`は、重複成約とvehicle/deal status不整合を事前検出して停止する。曖昧な既存データを推測統合しない。整合済みの既存成約だけをclaimへbackfillし、actorは推測せずNULLとする。再実行PASS。小規模G0で適用PASS。複合indexの本番相当lock時間はremote staging確認が必要。

## 12. 同時実行テスト

| worker | 成功 | active claim | 成約deal | vehicle |
| --: | --: | --: | --: | -- |
| 2 | 1 | 1 | 1 | 売約済み |
| 10 | 1 | 1 | 1 | 売約済み |
| 100 | 1 | 1 | 1 | 売約済み |

同じkey/同内容は成功結果を再返却、同じkey/異内容は競合、別key/同じdealは同じ売約へ収束した。

## 13. process kill

G0限定の一時triggerでvehicle更新直後に30秒停止し、そのbackendを強制終了した。結果はvehicle=`在庫中`、成約deal=0、claim=0、operation=0で、部分更新なし。一時trigger/functionは試験後に削除した。

## 14. 回帰結果

- G3 SQL role/status/idempotency/finance/delivery: PASS
- 2/10/100売約競合: PASS
- 2/10取消競合: PASS
- process kill: PASS
- G1-B DB regression: PASS
- Security suite: 202/202 PASS
- L-LINK S2S、問い合わせ管理: PASS
- lint/typecheck/build: PASS
- localhost未認証API: PASS
- localhost画面7件: BLOCKED（Playwright Chromium未導入。製品FAILではない）

## 15. 残存仕様確認

- 請求・入金あり売約取消の承認・返金フロー
- 別商談の見積を売約後も有効とするか
- `整備中`車両を売約可能とする既存挙動の正式承認
- deal=`失注`以外の取消後status
- 納車後の訂正手順

## 16. 後続Batch

VEHICLE-002残存として、見積・請求・入金・返金と売約取消の状態表を合意し、専用transaction/outboxを設計する。G3では会計状態を推測変更しない。

## 17. rollback

security-preserving rollbackは3 RPCのauthenticated EXECUTEをREVOKEし、direct transition trigger、claim一意制約、RLSを保持する。売約操作は停止するが、二重売約脆弱性を復活させない。rollback、拒否確認、再適用、回帰はPASS。

## 18. remote staging確認項目

- 本番コピーではない匿名データでpreflight結果を確認
- active owner/staff/viewerおよび2 tenant/3 storeのAPI/browser試験
- index build、lock待ち、migration全時間、serverless timeout
- 既存成約backfill件数と曖昧行0件の人間承認
- API 401/403/404/409/503、ログ・alert、backup/restore
- rollback後に売約が安全停止すること

## 19. 公開可否への影響

VEHICLE-001のCritical経路は分離DBで閉じた。remote staging未検証のため本番適用不可、正式公開不可。G3-R完了後に再判定する。

## 20. G3-R統合検証追補

- clean upgrade: precheck重複0、不整合0、orphan 0、backfill 1、適用PASS。
- ambiguous upgrade: active売約候補2件で`G3_PRECHECK_DUPLICATE_ACTIVE_SALE`となり、推測修復せず全rollback。
- 2/10/100 worker: 各成功1、active claim 1、成約deal 1、vehicle=`売約済み`。
- 取消2/10 worker: active claim 0、vehicle=`在庫中`、deal=`失注`、取消audit 1。
- 納車2/10 worker: vehicle/claim=`納車済み`、納車audit 1。売約なし・他scope・納車後取消は拒否。
- process kill: lock前後、vehicle更新後、deal更新後、claim作成後は全rollback。commit後・応答前killは成功結果1件を保持。
- rollbackはclaimを保持してmutation RPCを停止し、G1-A/G1-Bを維持。再適用PASS。
- pre-G3 backup restore後、行数・FK・RLS・membership・vehicle/deal状態を確認し、G3再適用でclaim 1件をbackfill。
- 実Route Handler smokeは401/403/409/503、正常売約・取消・納車、idempotent retryを確認。DBは別途実PostgreSQLで検証。
- G0-Bでfresh baseline、旧DB upgrade、security-preserving rollback、再適用、ACL保持restore後のG3回帰をPASS。2/10/100 workerは各成功1、process killは部分更新0を再確認した。本番適用はremote未適用のため不可。

## G1-C統合追補

G1-Cは売約RPC・claim・status遷移を変更していない。車両・商談・store/tenantの既存G3複合FKに加え、周辺parent/child FKとscope不変guardを追加した。fresh/upgrade/rollback/restore後のG3 sale regressionはすべてPASSし、Route smokeの正常売約・409競合・取消・納車・503も維持した。
