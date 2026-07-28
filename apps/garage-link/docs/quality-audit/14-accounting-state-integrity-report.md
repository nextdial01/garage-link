# GARAGE LINK G4-A Sale・Invoice・Payment accounting integrity report

実施日: 2026-07-27  
製品root: `/Users/ksk/garage-link/apps/garage-link`  
開始commit: `f45b0e924f611756e9f5d99e5534d73726f4c75a`  
環境: `public.ecr.aws/supabase/postgres:17.6.1.136`、Docker `--network none`、remote・外部決済接続なし  
判定: **G4-A Local Completed / remote未適用 / 本番適用不可 / 正式公開不可**

## 1. 対象ID

- `VEHICLE-002`: 未請求・未入金、請求済み未入金の売約取消と、入金・納車時のfail-closed範囲。
- `QUOTE-001`: 売約に採用した見積snapshotと、別商談見積の失効。
- `INVOICE-001`: 発行・取消、発行後immutable、支払合計連動。
- `PAYMENT-001`: append-only入金・反対仕訳・冪等性・返金上限。

納車後の返品・契約訂正、外部決済への実返金、税・丸めの再設計は対象外とした。

## 2. 修正前の問題経路

修正前は請求詳細画面から`status`、`issue_status`、`paid_amount`、`unpaid_amount`を直接UPDATEでき、商談画面から発行済みinvoiceを直接cancelledへ変更できた。paymentの正本となるappend-only台帳、返金元参照、冪等性がなく、売約取消は請求を検出すると一律停止していたため、請求済み未入金の承認済み取消仕様を実行できなかった。

静的根拠は旧`src/app/invoices/[id]/page.tsx`の直接UPDATEと旧`src/app/deals/[id]/page.tsx`の汎用帳票取消であり、分離DBでは発行後header/item変更、直接paid amount変更、入金済み売約取消、二重処理の防止をDBだけでは保証できない状態だった。

## 3. 採用状態仕様

| 対象 | 状態 | 許可遷移 |
| -- | -- | -- |
| quote `issue_status` | draft / issued / cancelled | 発行済み見積は売約採用時にsnapshot化。競合商談の見積は`expired` |
| invoice `issue_status` | draft / issued / cancelled | draft→issued、issued→cancelled。直接遷移不可 |
| invoice `status` | draft / issued / partially_paid / paid / void / cancelled / overdue / sent | issued以降の入金状態はledger合計からRPCが更新 |
| payment ledger | payment / reversal / refund | UPDATE/DELETEなし。取消・返金は元paymentを指す新規行 |
| sale claim | active / cancelled / delivered | 入金あり・deliveredは通常取消不可 |
| deal / vehicle | 既存日本語status | 取消成功時はdeal=`失注`、vehicle=claimに保存した以前の在庫status |

quoteの既存業務`status`には日本語・英語値が併存するため、今回独断で全面CHECK化せず、発行状態と売約snapshotだけを制約した。

## 4. quote

`vehicle_sale_claims.quote_id`にstore複合FKを追加した。active claim作成時、同一deal・vehicleに発行済み有効見積が1件ならclaimへ固定して`approved`とし、他dealの同一vehicle見積を物理削除せず`expired`へ遷移する。候補が複数なら`G4A_QUOTE_SELECTION_REQUIRED`で売約transaction全体を停止する。採用見積header/itemの金額・scope・status直接変更はguardで拒否する。

## 5. invoice

invoiceは必ずdraftとして作成し、発行は`issue_garage_invoice`だけで行う。発行済みheaderの番号、親ID、subtotal、tax、discount、trade-in、totalと、全invoice itemは直接変更不可。`paid_amount`、`unpaid_amount`、支払status、発行・取消statusもRPC専用である。store内invoice番号UNIQUEを維持し、void後も番号を再利用しない。

## 6. payment

実入金の正本は新規`invoice_payment_ledger`。正方向の`payment`だけが請求残額を増やし、金額は正の整数、tenant/store/invoice/deal/vehicle複合FK、actor、role、correlation ID、idempotency fingerprintを保持する。`invoices.paid_amount/unpaid_amount/status`はledger純額から同一transaction内で再計算する。

既存`payment_items`は支払予定内訳であり実入金の正本へ推測移行しない。G4-Aでは将来誤って実入金として編集・削除されないようauthenticatedのUPDATE/DELETEを停止した。

## 7. reversal・refund

`record_garage_payment_reversal`はowner/adminだけが実行できる。reversal/refundは元payment ID、理由、金額を持つ新規ledger行であり、元paymentを変更・削除しない。同一元paymentへの反対仕訳合計をrow lock下で集計し、元入金額を超える要求を`REFUND_EXCEEDS_PAYMENT`で拒否する。Stripeその他の外部決済には通信しない。

## 8. 売約取消

- 未請求・未入金: claim、vehicle、dealを1 transactionで取消・復旧。
- 請求済み未入金: invoiceをvoidし、上記3データと同一transactionで更新。物理削除・番号再利用なし。
- 一部・全額入金: `PAYMENT_EXISTS`で通常取消を拒否。自動返金・ledger書換えなし。
- idempotent retry: 同じkey・同じ内容は保存済み結果、異内容はconflict。

invoice行をID順にlockしてからledger純額を確認するため、取消と同時入金はどちらか一方へ収束する。

## 9. 納車済みの扱い

claimまたはvehicleが納車済みの場合、invoice voidと売約取消を`DELIVERED_CANNOT_CANCEL`で拒否し、vehicleを在庫へ戻さない。返品・契約訂正は`Specification Required`としてG4-Bへ残した。

## 10. 原子的RPC

| RPC | 役割 | role |
| -- | -- | -- |
| `issue_garage_invoice` | draft請求発行 | owner/admin/staff |
| `void_garage_invoice` | 未入金請求void | owner/admin |
| `record_garage_payment` | 入金ledger追加 | owner/admin/staff |
| `record_garage_payment_reversal` | 取消・返金ledger追加 | owner/admin |
| `cancel_vehicle_sale`（G4置換） | 請求voidを含む未入金売約取消 | G3既存owner/admin/staff |

全5処理は`auth.uid()`、最新active membership role、active store、tenant/store、対象行scope、row lock、現在status、idempotency、auditをDB transaction内で検査する。4会計RPCをuser-facing Route Handlerから呼び、actor user IDやroleをbodyから受け取らない。

## 11. DB制約

- invoice/quote issue statusとinvoice payment statusのCHECK。
- invoiceは直接INSERT時にdraft・paid 0・unpaid totalのみ許可。
- ledger entry type、正金額、理由、元payment、actor role、idempotency length/fingerprint CHECK。
- tenant/store/invoice/deal/vehicleとquote/claimの複合FK。
- tenant＋idempotency key UNIQUE、store内invoice/quote番号既存UNIQUE。
- ledger、legacy payment item、発行済invoice header/item、sale quote snapshotのimmutable guard。
- ledgerとoperation tableはRLS有効。authenticatedは自scope ledger SELECTだけ、直接mutation 0。
- SECURITY DEFINERは`search_path=public, pg_temp`固定、補助集計RPCのauthenticated EXECUTEは0。

## 12. idempotency

`accounting_operations`にtenant、store、operation、request fingerprint、resultを保持する。同じkey＋同じ内容は同じ結果、同じkey＋異内容は`IDEMPOTENCY_CONFLICT`。異なるkeyで同一invoiceへ競合した場合もinvoice row lockと残額検査で成功1件に収束する。key全文はauditへ保存せずSHA-256識別子だけを記録する。

## 13. 競合テスト

| 試験 | 結果 |
| -- | -- |
| 同一入金 2 / 10 / 100 worker | PASS、各ledger payment 1件、invoice paid |
| 異なるkeyで全額入金 2 / 10 / 100 worker | PASS、成功1件、過入金0 |
| 同一返金 2 / 10 worker | PASS、反対仕訳1件 |
| payment vs invoice void | PASS、`paid/issued`または`void/cancelled`の一方だけ |
| payment vs sale cancel | PASS。実測はpayment勝利で`paid/active/売約済み/成約`、ledger 1件 |
| 過剰返金 | PASS、409相当・追加行0 |
| idempotent retry | PASS、同一結果・行数1 |

## 14. process kill

- payment RPC後・commit前kill: ledger 0、paid 0、unpaid 1000。
- payment commit後応答喪失＋retry: ledger 1、paid 1000、unpaid 0。
- sale cancel RPC後・commit前kill: claim active、vehicle売約済み、deal成約、invoice issuedの全変更前状態。

部分更新、orphan、二重ledgerは0件だった。

## 15. role

- owner/admin: issue、void、payment、reversal/refund可。
- staff: 既存通常業務に合わせissue/payment可。void/refund不可。
- implementer/viewer: 会計確定・入金・返金不可。
- inactive、old-only、他tenant、他store: scope拒否。

API smokeでviewer 403、inactive 403を実Route Handler経由で確認した。

## 16. 監査ログ

auditへstore（tenantはstore/ledgerから一意）、actor、role、deal、vehicle、invoice/payment、元payment、操作前後status・金額、理由、correlation ID、idempotency hash、日時を記録する。ledger自体にもtenant/store/actor/roleを保存する。カード情報、外部secret、token、内部SQL、stack traceは保存しない。

## 17. migration

`20260727000200_accounting_state_integrity.sql`を45番目のexpand migrationとしてmanifestへ登録した。事前検査は未知statusと、既存`paid_amount`に対応ledgerがない状態を安全停止する。既存入金を推測backfillしない。既存の無矛盾issued/unpaid invoiceはupgradeで保持し、ledgerを推測生成しない。

| 経路 | 結果 |
| -- | -- |
| fresh / 再実行 | PASS、45 applied / 45 skipped |
| upgrade | PASS、38→45、既存invoice保持、推測ledger 0 |
| rollback / 再適用 | PASS、6 rollback / 7 reapply（依存repair含む） |
| backup / restore | PASS、catalog fingerprint一致、全回帰PASS |

rollbackは機能停止型で、会計RPCのauthenticated EXECUTEを剥奪する。ledger・データ・append-only/immutable guard・安全なcancel関数は保持し、直接writeや危険な旧取消を復活させない。

## 18. 回帰

| 検査 | 結果 |
| -- | -- |
| G0-B / G1-A / G1-B / G1-C / G1-D / G3 | 全PASS |
| G4-A DB regression | PASS |
| DB catalog | 67 table、67 RLS、177 policy、45 migration |
| API smoke | PASS、401/403/409/503、内部情報漏えい0 |
| Security suite | 223/223 PASS |
| L-LINK static / inquiry / ACK | PASS |
| migration runner | 4/4 PASS |
| Lint / TypeScript / production build | PASS |

## 19. 残存仕様

- 納車後の返品・契約訂正と、顧客所有車両・在庫・会計の戻し方。
- 外部決済返金の連携、失敗、再試行、照合（今回実通信なし）。
- quote業務statusの日本語・英語併存を統一するcontract migration。
- invoiceの0円発行は既存仕様を維持。負数発行と過入金は拒否。税率・丸めは変更なし。

## 20. remote staging項目

1. productionと識別できるproject ref・DB host fingerprintをoperatorが確認。
2. backup/restoreとsecurity-preserving rollbackを事前準備。
3. read-only precheckでunknown status、paid/ledger不一致、scope不一致が0件。
4. 実顧客データを使わず2 tenant・3 store・role別fixtureを使用。
5. Stripe・メール・LINE・L-LINK・外部決済をdeny/mock。
6. G1-A→G1-B→G3→repair→G1-C→G1-D→G4-Aの順で適用。
7. 2/10/100 worker、cancel/payment race、API 401/403/409/503、backup/restoreを再実行。

## 21. 公開可否への影響

`QUOTE-001`、`INVOICE-001`、`PAYMENT-001`はコード上ローカル解消。`VEHICLE-002`は未入金・請求済み未入金・入金あり拒否まで解消し、納車後の返品・契約訂正だけを仕様確認として残す。コード未修正Criticalは0だが、remote未適用Critical 3件、全体open High 19件があるため、本番適用・正式公開は不可。

## G4-B互換追補

G4-B case refundは元invoice snapshotへ折り戻さないため、G4-A再適用precheckと`g4a_refresh_invoice_totals`は`sale_correction_refunds`へ関連付いたrefund行を元invoice派生残高から除外する。通常G4-A payment/reversalの意味は変更せず、G4-B case開始後の元invoiceへの通常ledger追加はG4-B guardが拒否する。fresh、rollback/reapply、restoreで両Batchの回帰を確認した。
