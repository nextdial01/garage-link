# G3-R Vehicle sale atomicity 統合検証レポート

更新日: 2026-07-26  
判定更新（G0-B後）: **G3の統合回帰とfresh/upgrade/rollback/restore GateはローカルPASS。remote未適用のため公開GateはFAIL-CLOSED**

## 1. 正式repository

- Git root: `/Users/ksk/garage-link`
- 製品app: `/Users/ksk/garage-link/apps/garage-link`
- branch: `main`
- HEAD: `f45b0e924f611756e9f5d99e5534d73726f4c75a`
- remote: `origin https://github.com/nextdial01/garage-link.git`

G1-A、G1-B、G3のmigration、rollback、DB回帰、Route Handlerはこのrepositoryに存在する。

## 2. 監査文書の正本

| Path | 分類 | 根拠・扱い |
| -- | -- | -- |
| `/Users/ksk/garage-link/apps/garage-link/docs/quality-audit` | **正本** | 現在の製品修正、migration、回帰結果と同じrepositoryで管理。今回指定された04/05/07/08/09の組が存在 |
| `/Users/ksk/kannagi/docs/quality-audit` | 古い版・履歴保管 | 初回監査と第2工程の詳細証跡。00〜10を含むが、同名04/05/07/08は製品側とhash・内容が異なる。削除・移動しない |
| `/Users/ksk/kannagi/.tmp-line-cron/docs/quality-audit` | 別プロジェクト | L-LINK一時作業の監査資料 |

governanceは初期監査では会社OS側、G3では製品側09を参照しており混在していた。今後のGARAGE LINK製品修正の現在状態は製品側を参照し、会社OS側は履歴証拠として保持する。

## 3. Git状態

- 開始時点から大量の未コミット差分あり。G1-A/G1-B/G3、WEB-001/API-001/TEST-001とその他既存差分を含む。
- G3-Rでは製品コード、migration、RLS、環境設定を変更していない。
- 製品側変更は本監査文書6ファイルのみ（5更新、1新規）。既存差分を削除・上書き・整形していない。
- timestamp migration番号重複0。schema snapshotは番号`037`が2件。rollbackはG1-A/G1-B/G3の3本。

## 4. fresh baseline

新しい`public.ecr.aws/supabase/postgres:17.6.1.136` containerを`--network none`、port公開なし、remote project refなしで作成した。DB ownerを`supabase_admin`として初期SQLを適用したが、`supabase/schema/001_initial_core_tables.sql:68`で`auth` schemaが存在せず停止した。

結果: **FAIL**。repositoryにauth/storage bootstrapとschema snapshotを正式migration列へ組み込む正本がない。G1-A/G1-B/G3には到達していない。検証containerは破棄済み。

## 5. upgrade path

既存G0の合成fixtureを複製し、G3 objectだけを除いたpre-G3相当DBを作成した。

| fixture | precheck | 結果 |
| -- | -- | -- |
| clean | duplicate active 0、status mismatch 0、orphan 0 | G3適用PASS、整合済み成約1件をclaimへbackfill |
| ambiguous | duplicate active 1 | `G3_PRECHECK_DUPLICATE_ACTIVE_SALE`で停止、transaction rollback、推測修復0 |

clean fixtureは4 tenant、6 store、32 membership、3 vehicle、103 deal。全て合成データで実顧客データなし。

## 6. migration時間・lock

- G3 apply/reapply: 0.01〜0.02秒（3 vehicle/103 deal）
- lock wait: 観測0
- `lock_timeout`: 2秒
- 最大lock保持時間: 個別計測器はなく、今回の小規模fixtureではmigration全体0.02秒未満が上限相当
- remote規模での最大lock時間: **未確認**
- G3 catalog: RLS 2 table、固定search_pathのSECURITY DEFINER 5 function、authenticated EXECUTE 3 RPC、partial UNIQUE/CHECK/複合FK/guard triggerを確認

## 7. rollback

G3適用済みDBをcustom dumpへbackup後、security-preserving rollbackを実行した。

- claim 1件を保持、G3 mutation RPCのauthenticated EXECUTE 0
- G1 helper 2件とG1-B role回帰を維持
- 旧コード相当のdeal直接成約は`SALE_TRANSITION_REQUIRES_ATOMIC_RPC`で安全停止
- G3再適用後、EXECUTE 3、active claim 1、回帰PASS

rollbackはclaim/operation/auditを消さず、専用archive tableへ移送もしない。保持がarchive要件を満たす扱いであり、削除復旧ではない。

## 8. restore drill

- pre-G3 backup: 0.06秒、655.2KB
- restore: 0.29秒
- G3再適用: 0.01秒
- ローカルRTO相当: 約0.30秒（小規模fixture限定）
- RPO相当: backup時点。backup後の納車更新は意図どおり失われた
- 欠落・重複・orphan: 0
- restore後: tenant 4、store 6、membership 32、vehicle 3、deal 103、vehicle=`売約済み`、deal=`成約`

最初の`pg_restore --no-privileges`はauthenticated ACLを失い回帰FAILとなった。製品不具合ではなくrestore手順の誤りで、DBを再作成し`--no-owner`のみでACLを保持するとPASSした。正式runbookでは`--no-privileges`を禁止する必要がある。手動harnessにはmigration ledgerがなく、restore後の適用履歴確認はPARTIAL。

## 9. G1-A回帰

- 未招待自己所属・他tenant自己所属・role自己昇格: direct write revokeとsecurity suiteで拒否
- inactive membership、old-only `store_members`: helper結果0、G3 RPC拒否
- 最後のowner無効化: 拒否
- `memberships`/`store_members` authenticated INSERT/UPDATE/DELETE grant: 0
- rollback/restore後も維持

結果: **PASS**。G0-Bでfresh DBからの構築、再実行、upgrade、rollback・再適用、restore後の回帰も追加PASS。

## 10. G1-B回帰

- DB role regression: PASS
- viewer/inactive/old-only: business write拒否
- owner/admin/staff: G3で許可されたscope内操作成功
- implementer/viewer: G3 mutation拒否
- 他tenant・他store: 拒否
- service roleだけのactorなし実行: 拒否

結果: **PASS**。viewer PII SELECT範囲は対象外で変更なし。

## 11. G3回帰

| 試験 | 結果 |
| -- | -- |
| 売約2 worker | 成功1、active claim 1、成約deal 1、vehicle売約済み |
| 売約10 worker | 同上 |
| 売約100 worker | 同上 |
| 同key・同内容 | 保存済み成功結果 |
| 同key・異内容 | conflict |
| 別key・同deal | 同一売約へ収束 |
| 別key・別deal | 1件成功、他はconflict |
| 取消2/10 worker | active 0、vehicle在庫中、deal失注、audit 1 |
| 納車2/10 worker | vehicle/claim納車済み、audit 1 |
| 売約なし納車、納車後取消 | 拒否 |

## 12. API smoke

実Next Route Handlerをlocalhostで起動し、Supabase応答だけをloopback stubへ限定した。

- 未認証401
- viewer/inactive/他tenant/他store 403
- 正常売約200、競合409、idempotent retry 200
- 取消200、納車200
- DB一時障害503
- responseに内部SQL、constraint名、stack traceなし

DB transactionの正しさはstubではなく前節の実PostgreSQL試験で別に確認した。

注意: 最初のproduction buildには旧build-time endpoint `127.0.0.1:54321`が残り、既存の未分類SSH listenerへ無効なviewer tokenの認証probe 1件を送った可能性がある。valid session・RPC・writeはなく、データ変更の証拠はない。直ちに停止し、URLを`127.0.0.1:55432`へ固定して再build後に全smokeを再実施した。既存listenerは変更していない。

## 13. UI smoke

Playwright browserの追加downloadは行わず、既存Google Chromeを外向きrequest abort付きで利用した。

- PC/mobile: login表示、未認証保護pageのlogin redirect、console error 0
- owner: 商談売約、二重click、取消、再売約、車両納車の配線を確認
- viewer mobile: mutation 403とエラー表示を確認
- viewerには保存操作が表示される: UX-002として記録、製品修正なし
- 他store切替: UI fixture不足でNOT TESTED。DB/API scopeはPASS

通常`pnpm test:e2e`は1 PASS、11 SKIP、20 FAIL。20件はbundled Chromium欠如であり製品機能FAILではない。UI smoke全体は**PARTIAL**。

## 14. remote staging preflight

remoteへ接続・適用していない。現状は**FAIL-CLOSED**。

- project ref、DB host fingerprint、本番との差分が未承認
- 匿名backup取得とACL保持restoreのremote実績なし
- test tenant A/B、3 store、5 roleの専用account未準備
- outbound deny/mock、operator、監視、停止時間の承認なし
- 既存localhost 54321 listenerの用途が未分類

進行条件は、environment classification、project/host fingerprint、実顧客なしfixture、backup/restore、rollback、外部通信deny、precheck 0件、lock/timeout上限、operator二者確認である。

## 15. Critical・High再集計

- コード未修正Critical: 0
- remote未適用Critical: 3（TENANT-001、AUTH-001、VEHICLE-001）
- 全体のコード未修正・未完了High: 16（AUTH-002、AUTH-003、BILL-001、BILL-002、INVENTORY-001、INVOICE-001、MEMBER-001、PAYMENT-001、PII-001、QUOTE-001、SERVICE-001、STRIPE-001、STRIPE-002、TENANT-002、TENANT-003、VEHICLE-002）
- コード修正済み・remote確認待ちHigh: 1（DB-001。Critical 3件は別集計）
- 動的確認待ちHigh: 1（LLINK-001）
- 仕様確認High: 1（VEHICLE-002会計連動、17件との重複分類）
- High Test Gap: 1（TEST-002）

全体open Highは重複なしで19件。今回対象外のHighは会社OS初回監査版の根拠・状態をcarry-overし、本報告で解消扱いにはしない。

## 16. test debt

- TEST-001: 問い合わせ管理check PASS。前回修正を維持
- TEST-002: 実DB・API回帰はG0-BでCI化。browser runtime固定のみ未完
- security suite: 202/202 PASS
- L-LINK S2S、ACK、問い合わせ取込、問い合わせ管理: PASS（実通信なし）
- lint、TypeScript、production build: PASS
- generated DB typeとG3新table/RPCの整合: PARTIAL

## 17. 残存リスク

- DB-001のローカルfresh/DRは解消。managed Auth/Storage DRとremote lock計測は未確認
- remoteにCritical修正が未適用
- remote規模のmigration lock未計測
- remote managed backupのACL/migration ledger実績は未確認
- viewer mutation UIと他store切替UIが未完
- VEHICLE-002会計・取消仕様が未確定

## 18. 次Batch

G0-BローカルGateは完了した。次は接続しないremote preflight準備、その後G1-C、承認後のremote staging統合、VEHICLE-002会計状態モデルの順を推奨する。

## 19. 本番適用前チェックリスト

- [x] 公式Supabase bootstrapを含むfresh baselineが1コマンドで成功
- [x] migration ledgerがローカルbackup/restore後も一致
- [x] schema番号037重複をmanifest順で一意化（既存ファイル名は保持）
- [ ] remote stagingのproject/host fingerprintを二者確認
- [ ] 匿名backupとACL保持restoreを実施
- [ ] precheck duplicate/mismatch/orphanが0
- [ ] migration lock/timeoutが合意内
- [ ] G1-A/G1-B/G3のDB/API/browser回帰PASS
- [ ] outbound deny/mockと監視・alert確認
- [x] ローカルrollback後もCritical経路が復活しない
- [ ] 本番backup、停止判断者、復旧責任者を記録

## 20. 公開可否への影響

- remote stagingへ進むか: **接続前preflight準備のみ可**。実接続・適用はoperator承認後
- 本番適用: **不可**
- 正式公開: **不可**

ローカルG3とfresh/DR品質は統合回帰で維持された。remote適用という運用上の必須条件は未達である。

## G1-C後の再確認

- migration ledger: 43 entry、G1-CをG3/repair後へ追加。
- G1-C rollback後もG1-A/G1-B/G3のsecurity guardを保持し、再適用PASS。
- restore後のG3 regression PASS。G1-Cは車両売約ロジックを変更していない。
- API smokeでG3の401/403/409/503と正常売約・取消・納車を維持。
- remote staging・本番は未適用のため公開判定は変更しない。

## G1-D後の統合追補（2026-07-27）

- manifest/ledgerは44 entry、public table/RLSは65/65、policyは176。
- G1-D fresh/upgrade/security-preserving rollback/reapply/restore後もG3の2/10/100 worker、取消、納車、idempotency、process kill回帰をPASSした。
- `current_user_store_ids()`は検証済みactive storeだけを返すが、G3 mutation RPCは最新membership、role、vehicle/deal scopeも再確認するためpreference単独を権限に使わない。
- tenant/store改ざん、viewer、inactive、old-onlyはG3でも拒否を維持。
- G1-Dはvehicle/deal/claimのstatus・transaction・constraintを変更していない。
- remote staging・本番は未適用。コード未修正Critical 0、remote未適用Critical 3のため公開判定は**不可**のまま。
