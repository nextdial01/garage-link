# GARAGE LINK 静的監査レポート — G3-R追補

更新日: 2026-07-26

## 結論

G1-A、G1-B、G3は既存の分離DB、upgrade、security-preserving rollback後の再適用、backup restore後の再適用で維持された。G3は2・10・100 workerで各1件だけ成功し、売約・取消・納車とprocess killの原子性を確認した。

G0-Bで公式Supabase PostgreSQL imageをbootstrap正本とし、checksum付きmanifest、Supabase標準ledgerを正本とする補助integrity記録、fresh/upgrade/rollback/restore CIを追加した。完全な新規DBから42 ledger entry、62 table、全62 table RLS、171 policyを再現でき、DB-001のローカル範囲はPASSした。本番適用・正式公開はremote未適用Criticalのため引き続き不可である。

## 正本とGit

- repository: `/Users/ksk/garage-link`、対象app: `/Users/ksk/garage-link/apps/garage-link`
- commit: `f45b0e924f611756e9f5d99e5534d73726f4c75a`
- remote: `origin https://github.com/nextdial01/garage-link.git`
- 現在の修正・検証文書の正本: 製品app内`docs/quality-audit`
- 会社OS側`/Users/ksk/kannagi/docs/quality-audit`: 初回監査・第2工程の履歴保管。削除・移動なし
- `.tmp-line-cron/docs/quality-audit`: L-LINK一時作業の別プロジェクト
- 開始時の大量の未コミット差分は保持し、G3-Rで製品コード・migration・環境設定を変更していない

## 検証結果

| 項目 | 結果 | 証拠 |
| -- | -- | -- |
| fresh baseline | PASS | network-none公式Supabase PostgreSQLから42 entryを適用、再実行0、catalog検査PASS |
| upgrade / rollback / restore | PASS | 旧相当DBの行保持・G3 claim backfill、機能停止型rollback、再適用、ACL fingerprint一致 |
| clean upgrade | PASS | precheck重複0、不整合0、orphan 0、backfill 1 |
| ambiguous upgrade | PASS（安全停止） | active売約候補2件で`G3_PRECHECK_DUPLICATE_ACTIVE_SALE`、transaction rollback |
| migration再実行 | PASS | 0.01秒、小規模fixture |
| rollback / 再適用 | PASS | G1 helper維持、G3 execute 0→再適用後3、claim維持 |
| restore drill | PASS | backup 0.06秒、restore 0.29秒、G3再適用0.01秒、欠落・重複・orphan 0 |
| G1-A/G1-B | PASS | membership direct write拒否、inactive/old-only拒否、最後owner保護、role DB回帰 |
| G3競合 | PASS | 2/10/100 worker各成功1、active claim 1、成約deal 1、vehicle売約済み |
| 取消/納車 | PASS | 取消2/10はaudit 1。納車2/10はvehicle/claim納車済み、audit 1 |
| process kill | PASS | lock前後、vehicle/deal/claim途中はrollback。commit後killは成功状態1件を保持 |
| API smoke | PASS（stub併用） | 実Route Handlerで401/403/409/503、正常売約・取消・納車。内部情報漏えいなし |
| UI smoke | PARTIAL | 既存Google ChromeでPC/mobileを確認。viewer操作表示と他store切替は残存/未確認 |
| security | PASS | 202/202 |
| lint / type / build | PASS | 外部URLをloopback 55432へ固定して実行 |
| E2E suite | BLOCKED | 1 PASS、11 SKIP、20 FAILはbundled Chromium欠如 |

## migrationと型

- timestamp migration番号重複: 0
- schema snapshot番号重複: `037`が2件
- G3の2 tableはRLS有効、5 SECURITY DEFINER functionは`search_path=public, pg_temp`
- authenticated EXECUTEは3 mutation RPCだけ
- partial UNIQUE、CHECK、複合FK、guard triggerをcatalogで確認
- generated Database型は未生成で、Route Handlerは局所的な結果型を使用するため型整合はPARTIAL
- restore用の正式migration ledgerはなく、手動harnessでは適用履歴を復元できない

## 暫定公開可否

**公開不可**。ローカルのCritical経路とfresh/DR Gateは閉じたが、remote未適用Criticalが3件、全体open Highが19件ある。次はremote staging preflightのoperator確認後、read-only監査・backup/restore可否を先に確定し、その後G1-Cを推奨する。

## G1-C追補

G1-CではASTでservice role参照31ファイルを再抽出し、実行経路・診断表示・中央factory・対象外Stripeを分類した。High経路11ファイルへ明示的`GarageTenantContext`またはcredential-bound contextを適用し、Cron 2経路は全store一括/null scopeを廃止した。L-LINKはkey IDを`line_link_connections`のactive tenant/storeへ固定し、nonceにもtenantを保存する。

DBは63 public table、全63 RLS、171 policy。親子複合FKを61件、scope不変triggerを57テーブル、新規service-only tableを1件、新規service RPCを2件追加した。fresh 43 migration、upgrade、security-preserving rollback、再適用、backup/restoreはPASS。G1-A/G1-B/G3、security 209/209、Lint、型、build、Route smokeもPASSした。server cache実装は0件で、既存dashboard/analytics RPCはG1-Bのmembership scope wrapperを維持する。

現在は`TENANT-002`、`AUTH-003`、`LLINK-001`をローカル解消。`TENANT-003`は旧scope列更新をimmutable guardで安全停止したが、scope列を書き換えないactive-store正本化はmembership/session設計変更になるため未修正。remote未適用Critical 3件とopen High 19件が残るため、暫定判定は引き続き**公開不可**。

## G1-D追補（2026-07-27・現在状態）

オーナー承認済みのactive membership＋store assignment方式を実装した。`memberships`をtenant所属・roleの正本に維持し、lower roleの利用可能storeを`membership_store_assignments`、user＋tenantの現在操作storeを`user_active_store_preferences`へ分離した。owner/adminはtenant内全active store、implementer/staff/viewerはassignment済みstoreだけを利用できる。

旧switchは停止し、店舗切替によるmembership、role、業務データscope変更は0件。fresh/upgrade/rollback/reapply/restoreは44-entryでPASSし、public table/RLS 65/65、policy 176、security suite 216/216を確認した。2/10 worker、process kill、inactive/old-only、他tenant、古いtab writeを安全に処理し、既存Google ChromeによるPC/mobile/tabs/viewer/inactive/console smokeもPASSした。

`TENANT-003`はコード上ローカル解消、remote未適用へ移行した。コード未修正Critical 0、remote未適用Critical 3、コード未修正・未完了High 13、コード修正済remote待ちHigh 5、High Test Gap 1、全体open High 19である。本番適用・正式公開は引き続き**不可**。

## G4-A追補（2026-07-27・現在状態）

G4-Aは見積・請求・入金・返金と売約取消の会計整合を実装した。実入金は`invoice_payment_ledger`のappend-only行を正本とし、既存`invoices.paid_amount/unpaid_amount/status`はledgerからRPC内で更新する派生値とした。発行済みinvoice header/item、saleに採用したquote snapshot、payment ledgerの直接更新・削除はDB triggerと権限で拒否する。

`issue_garage_invoice`、`void_garage_invoice`、`record_garage_payment`、`record_garage_payment_reversal`の4会計RPCと、G4対応版`cancel_vehicle_sale`を同一transaction・row lock・idempotency付きで提供した。未入金売約取消は請求void、claim終了、vehicle在庫復帰、deal失注を原子的に実施する。一部・全額入金または納車済みは通常取消を拒否する。

network-none使い捨てDBで45 migrationのfresh/再実行、38→45 upgrade、6 rollback/7 reapply、backup/restoreがPASSした。2/10/100 worker入金はledger 1件、2/10 worker返金は反対仕訳1件、payment対invoice void・payment対sale cancelはいずれか一方の整合状態へ収束した。payment commit前killは0件、応答喪失retryは1件、sale cancel commit前killはclaim/vehicle/deal/invoiceがすべて変更前にrollbackした。

実Route Handler smokeは未認証401、viewer/inactive 403、過入金・過剰返金409、DB障害503、内部情報漏えい0。Security suite 223/223、L-LINK静的回帰、問い合わせ管理、migration runner、Lint、型、production buildはPASSした。public table/RLSは67/67、policy 177、migration ledger 45である。

ローカルコード未修正Criticalは0。コード未修正・未完了Highは10、コード修正済remote待ちHighは8、High Test Gapは1で全体open Highは19。remote未適用Critical 3件があるため、本番適用・正式公開は引き続き**不可**。

## G4-B追補（2026-07-27・現在状態）

納車済み売約を通常取消へ戻さず、独立`sale_correction_cases`、append-only refund/ownership/event、冪等operationを追加した。owner/adminだけが承認・返金・在庫復帰でき、staffはcase作成のみ、implementer/viewer/inactive/old-only/他scopeは拒否する。承認だけではvehicleを変更せず、processing、検品完了、ownership解決、外部手続き確認後の専用RPCだけが在庫へ復帰する。元claim/deal/invoice/payment/deliveryは維持する。

未送信フォロー候補は承認時にskipped、新規候補はDB triggerで抑止し、送信済み・ACK履歴は変更しない。外部通信・実返金は0件。fresh 46 migration、38→46 upgrade、7 rollback/8 reapply、backup/restore、case/承認/完了/restock 2/10 worker、refund 2/10/100 worker、process kill、実Route Handler smoke、Security 229/229、Lint、型、buildはPASSした。G3/G4-B再適用precheckは、scopeが完全一致する明示的な完了済みrestock caseだけを履歴例外として認識し、曖昧な不整合は引き続き停止する。

`VEHICLE-002`はコード上ローカル解消。コード未修正Critical 0、コード未修正High 9、コード修正済remote待ちHigh 9、High Test Gap 1、全体open High 19。remote未適用Critical 3件と残存Highがあるため、本番適用・正式公開は引き続き**不可**。

## G5-R追補（2026-07-27）

dirty treeはHEAD `f45b0e9...`、tracked差分107、untracked対象82、46 migrationを個別SHA-256付きmanifestとして固定した。正確なsnapshot hashは`remote-staging-snapshot-manifest.json`を正本とする。`pnpm verify:g0b`とChrome smokeは再度PASSし、製品コード変更、commit、push、remote接続、外部送信は0件だった。

一方、staging設定候補はloopbackであり、remote project ref、直接DB URL、productionとの差異、backup、restore clone、Vercel staging link、operator承認、外部送信denyを証明できなかった。remote read-only監査すら実行せず、G5-Rは**BLOCKED**。remote不整合件数、lock、ACL、Auth、Storage、PITRを未確認のままPASSにはしていない。
