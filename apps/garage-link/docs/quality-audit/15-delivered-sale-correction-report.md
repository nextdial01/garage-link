# GARAGE LINK G4-B Delivered sale return・contract correction report

実施日: 2026-07-27  
製品root: `/Users/ksk/garage-link/apps/garage-link`  
開始commit: `f45b0e924f611756e9f5d99e5534d73726f4c75a`  
環境: 公式Supabase PostgreSQL使い捨てcontainer、`--network none`、実顧客・実返金・外部通信なし  
判定: **G4-B Local Completed / remote未適用 / 本番適用不可 / 正式公開不可**

## 1. 対象ID

`VEHICLE-002`の納車後取消・返品・契約訂正範囲。G4-A以前の通常売約取消、見積・請求・入金の状態仕様は維持した。

## 2. 採用仕様

納車済み売約を通常取消へ戻さず、独立した`case`として扱う。元の`vehicle_sale_claims`、`deals`、`invoices`、正方向payment、納車auditは変更・削除しない。返金は外部送金ではなくG4-A台帳の反対方向行、在庫復帰は承認・処理開始・検品・所有関係解決・外部手続き確認後の明示操作である。

## 3. caseモデル

`sale_correction_cases`へtenant/store、元claim、vehicle/deal/customer/invoice、種別、状態、申請・承認返金額、検品・在庫復帰・所有・フォロー・外部手続きの永続状態、actor、idempotency fingerprintを保存する。

種別は`customer_return`、`contract_correction`、`delivery_cancellation`、`vehicle_exchange`、`administrative_correction`。状態は`requested → under_review → approved → processing → completed`、および`under_review → rejected`、`requested/under_review → cancelled`だけをRPCで許可し、飛び越しを拒否する。

## 4. 権限

- owner/admin: 作成、審査、承認・却下、処理開始、返金記録、検品確定、所有関係解決、外部手続き確認、在庫復帰、完了。
- staff: case作成のみ。承認・返金・在庫復帰不可。
- implementer/viewer: mutation不可。
- inactive、old-only、他tenant、他store: scope拒否。

actorは全RPCで`auth.uid()`から取得し、`current_user_store_role`の最新active membershipを使用する。

## 5. case作成

`create_sale_correction_case`は元claim、vehicle、dealをlockし、claim=`delivered`、vehicle=`納車済み/delivered`、deal=`成約`、tenant/store一致、customerとinvoiceのscope、返金希望額を確認する。case作成だけでは元データ、vehicle status、invoice、payment、フォロー候補を変更しない。同じkeyは既存結果、異内容はconflict、別keyの同一saleはpartial UNIQUEで最大1 active caseへ収束する。

## 6. 承認・却下

`transition_sale_correction_case`が審査開始、承認、却下、処理開始、取消、完了をrow lock下で処理する。承認はowner/adminだけで、返金承認額を現在の純入金額以下へ制限し、在庫復帰方針を記録する。承認時点ではvehicleを在庫へ戻さない。却下は理由必須で、元売約・請求・入金・車両を変更しない。

## 7. refund

`record_sale_correction_refund`はG4-A `invoice_payment_ledger`へ元payment参照付き`refund`行をappendし、`sale_correction_refunds`でcaseへ関連付ける。元payment、元invoice snapshotは変更しない。case承認合計、元payment残額の両方をlock下で検査し、二重・超過を拒否する。G4-B case開始後の元invoiceへ通常のpayment/reversalを追加する経路もDB guardで停止する。Stripe・銀行・ローンへは通信しない。

## 8. vehicle inspection

`complete_sale_correction_inspection`はprocessing caseだけを`completed`へ進める。検品前の`confirm_sale_correction_restock`は`SUBPROCESS_INCOMPLETE`。検品結果の法的・機械的評価は自動推測せず、内部メモは2000文字に制限した。

## 9. inventory restock

在庫復帰はcase=`processing`、decision=`restock`、検品完了、ownership=`returned/corrected`、別active sale・別active caseなし、owner/adminを必須とする。専用RPCだけがG3 vehicle guardの限定escapeを使用し、vehicleを`在庫中`へ変更する。元claimは`delivered`、元dealは`成約`のまま保持する。repair_required/not_for_saleはcaseのdecisionへ保持し、自動的に別vehicle statusを推測設定しない。

## 10. customer ownership

既存に顧客所有車両の履歴正本がなかったため、`customer_vehicle_ownership_history`をappend-onlyで追加した。case作成時に元納車の`active`参照、承認時`return_pending`、明示解決時`returned/transferred/corrected`を追記する。物理削除・上書きは不可。

## 11. 見積・請求

元見積、元請求header/item、請求番号、元paymentは変更しない。case返金は元請求snapshotの派生残高へ折り戻さず、case台帳側で管理する。G4-A migration再適用precheckと集計helperはcase返金行を識別して除外し、rollback/reapplyでも元invoice snapshotを維持する。適格返還請求書等のPDFは法務・税務仕様未確定のため未実装。

## 12. L-LINK・フォロー

承認時に同一store/vehicleの未送信`inspection_reminder_events.status=pending`だけを`skipped`へ変更する。新規候補はDB triggerがapproved/processing/completed caseを検出して作成しない。processing/completed/failed、external_reference/ACK済み履歴は変更しない。L-LINK実通信は0件。車検・買替候補をcase種別別に再開する仕様は残存仕様とした。

## 13. 競合

| 試験 | 結果 |
| -- | -- |
| case作成 2 / 10 worker | PASS、case 1件 |
| 承認 2 / 10 worker | PASS、承認event 1件 |
| case完了 2 / 10 worker | PASS、完了1件 |
| refund 2 / 10 / 100 worker | PASS、refund ledger/mapping各1件、合計1000 |
| restock 2 / 10 worker | PASS、vehicle=`在庫中`、restock event 1件 |
| 同じkey retry | PASS、保存済み結果 |
| 同じkey・異内容 | PASS、`IDEMPOTENCY_CONFLICT` |

## 14. process kill

case RPC完了後・transaction commit前にbackendを強制終了し、case/operation 0件を確認した。同じ要求のretry後はcase 1件。各mutation RPCは単一DB transactionであり、refund mappingとledger、restockとcase statusも同じtransaction境界にある。外部処理は実行せず、結果不明を自動再実行する経路はない。

## 15. migration

`20260727000300_delivered_sale_correction.sql`を46番目としてchecksum manifestへ登録。5 table、4 SELECT policy、7 user-facing mutation RPC、複合FK、partial UNIQUE、append-only/immutable guard、follow-up block triggerを追加した。不整合precheckは納車済みclaim/vehicle/dealのscope・status不一致を安全停止し、既存売約を推測backfillしない。rollback後の再適用では、同一tenant/store・claim・deal・vehicleに結び付いた`processing/completed` caseかつ`restock_status=completed`の履歴だけをG3/G4-B precheckの明示的な例外とする。caseのない在庫復帰や曖昧な旧データは引き続きfail-closedである。

| 経路 | 結果 |
| -- | -- |
| fresh / 再実行 | PASS、46 applied / 46 skipped |
| upgrade | PASS、38→46、既存fixture保持 |
| rollback / 再適用 | PASS、7 rollback / 8 reapply |
| backup / restore | PASS、catalog fingerprint・全回帰一致 |

rollbackは機能停止型でRPC EXECUTEを剥奪し、case、refund、所有、audit、guardsを保持する。通常取消、直接payment/invoice mutationを復活させない。

## 16. 回帰

| 検査 | 結果 |
| -- | -- |
| G0-B / G1-A / G1-B / G1-C / G1-D / G3 / G4-A | PASS |
| G4-B DB regression | PASS |
| DB catalog | 72 table、全72 RLS、181 policy、46 migration |
| Security suite | 229/229 PASS |
| 実Route Handler API smoke | PASS、401/403/409/503、内部情報漏えい0 |
| L-LINK / ACK / inquiry static | PASS |
| Lint / TypeScript / production build | PASS |

## 17. 残存法務・会計仕様

- 名義変更、登録抹消、税金、保険、ローン、外部返金の実行・照合。
- 適格返還請求書、契約訂正文書、PDFの法的要件。
- exchange時のreplacement vehicle契約・差額会計。
- return不可車両の専用vehicle statusと、修理・廃棄への後続業務。
- 送信済みL-LINK候補の取消連絡、車検・買替候補のcase種別別再開条件。

これらは自動処理せず、`Specification Required`かつ手動確認必須である。

## 18. remote staging項目

1. project ref・DB host fingerprint・非productionをoperatorが確認。
2. backup/restore、security-preserving rollback、46-entry checksumを準備。
3. read-only precheckで納車済みscope/status不一致、active case重複、payment/ledger不一致を0件確認。
4. 外部決済・LINE・メール・L-LINKをdeny/mockし、架空2tenant/3storeだけを使用。
5. G0-B→G1-A/B/C/D→G3→G4-A→G4-B順で適用。
6. role、2/10/100、kill/retry、API、backup/restoreを再実行。

## 19. 公開可否への影響

`VEHICLE-002`の納車後返品・契約訂正はコード上ローカル解消し、通常取消拒否を維持した。コード未修正Criticalは0、コード未修正Highは9、remote未適用Criticalは3。本番・remote stagingへ未適用であり、残存Highと法務・外部手続き仕様もあるため正式公開は不可。
