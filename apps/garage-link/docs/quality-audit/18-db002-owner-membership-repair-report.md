# GARAGE LINK DB-002 owner membership repair report

実施日: 2026-07-27  
対象環境: Current Supabase `controlled_test`  
状態: **COMPLETED（operator承認repair成功・C5 PASS・migration 0件）**

## 1. DB-002概要

唯一のactive owner membershipが`joined_at IS NULL`で、G1-Aの「activeかつ招待承認済み」条件を満たさなかった。operator承認付きrepairで解消し、C5はPASSした。Current Supabaseへのmigrationは0件。

## 2. 対象行の安全な識別

最新read-only dumpをnetwork-none PostgreSQLへ復元し、SHA-256先頭12桁だけを記録した。

| 対象 | fingerprint |
| -- | -- |
| membership | `096c2c207e42` |
| tenant | `cbc9a4f71eee` |
| store | `6add7888f35c` |
| user | `fa1ac2cdec39` |

確認結果:

- 対象membership 1件、role `owner`、status `active`、`joined_at NULL`。
- Auth user存在、email確認済み、sign-in実績あり、削除・ban・anonymousではない。
- tenant 1件・active、store 1件・active、tenant/store一致。
- active owner 1件、同一tenant/user membership 1件、重複0件。
- 同一user/storeのlegacy `store_members`はowner/active 1件。ただし`invited_at`・`joined_at`ともNULLで、権限根拠には使用しない。
- old-only membershipは別user分4件。自動昇格しない。

## 3. 承認済み根拠

招待record専用table、invite event、使用済みtoken、membership/legacyの`invited_at`・`joined_at`は存在しない。Authのsign-in日時は承認日時へ転用しない。

一方、対象userが同一storeで`user_role=owner`としてcustomer deleteを行ったaudit rowが1件あり、実利用の客観証拠がある。Auth userも確認・sign-in済みである。このため分類は**A相当（正規owner利用を客観確認）**とする。ただし、実際の招待承認日時は不明であり、operatorによる「正規owner・承認済み」の明示確認がrepairの必須条件である。

## 4. operator承認

取得済み。オーナーは対象fingerprint、正規owner・招待承認済み、repair実行時刻、既存triggerによる`updated_at`更新、membership 1行、audit 1行、correlation ID `dec35909-f204-4914-8b94-53bf35ae79cb`、rollback条件、C5再実行を明示承認した。governance正本へ原文相当を保存した。

## 5. joined_at決定根拠

実承認日時は存在しないため、Auth/legacy日時を転用せず、transaction内の`clock_timestamp()`を採用した。設定値は`2026-07-27T03:59:53.719019+00:00`（JST 12:59:53）。auditへ`joined_at_source=data_repair_execution_time`を保存した。

## 6. 修復transaction

Supabase CLIの一時dump roleによる最初の試行はtable権限不足でUPDATE前に失敗し、transaction rollback・変更0件だった。その後、Supabase Management APIの`db query --linked`で承認済みtransactionを実行した。

transaction内でfingerprint 4件、対象1件、owner/active、`joined_at NULL`、Auth user、tenant/store active・一致、active owner 1、重複0、correlation未使用を再確認した。row lockとtransaction advisory lockを取得し、直接更新したmembership列は`joined_at`のみ。既存triggerが`updated_at`を更新した。

更新後は、修復前後のmembership JSONから`joined_at/updated_at`だけを除いた値が完全一致すること、membership件数不変、audit件数+1、policy件数不変、migration ledger件数不変をcommit前に検査した。

## 7. 修復前後

| 項目 | 修復前 | 修復後 |
| -- | -- | -- |
| 対象件数 | 1 | 1 |
| joined_at | NULL | repair実行時刻 |
| role | owner | owner |
| status | active | active |
| tenant/store/user | fingerprint一致 | 変更なし |
| active owner | 1 | 1 |
| duplicate membership | 0 | 0 |
| membership更新行 | - | 1 |
| audit追加行 | - | 1 |

RLS table 103、policy 364、migration ledger 39を維持した。migration適用は0件。

repair前後dumpのtable hash比較では`memberships`、`audit_logs`に加え`vehicle_listing_statuses`のdump block hashも差分になったため追加調査した。同tableは1行の全業務列・timestamp・hashが前後完全一致しており、dump表現差だった。実data差分は`memberships`と`audit_logs`だけである。

## 8. 監査ログ

`audit_logs`へappend-onlyで1行追加した。action `data_repair`、target `membership`、evidence class A、repair前後の`joined_at/updated_at`、correlation、operator承認記録、repair実行時刻だけを保存した。PII、token、SQL、stack traceは保存していない。C5でcorrelation 1件、target一致、before NULL、after membership一致を再確認した。

## 9. rollback

緊急rollback SQLを[`evidence/db002-owner-membership-emergency-rollback.sql`](evidence/db002-owner-membership-emergency-rollback.sql)へ保存した。別operator承認、新しいrollback correlation、current project fingerprint、元repair audit 1件、現在の`joined_at/updated_at`がrepair audit after値と一致、後続の正当なmembership更新なしをすべて要求する。placeholder未置換では必ず失敗する。通常運用では実行せず、今回もrollback 0件。

## 10. C5再実行

**PASS**。

| 検査 | 件数 |
| -- | --: |
| active owner `joined_at NULL` | 0 |
| active owner | 1 |
| invalid active membership | 0 |
| duplicate active membership | 0 |
| membership/store tenant不一致 | 0 |
| unsupported role/status | 0 |
| invited membership | 0 |
| active tenant without valid owner | 0 |
| old-only membership | 4（権限fallbackなし、自動昇格なし） |
| cross-tenant/cross-store deal parent | 0 |
| repair audit | 1 / valid |

G1-A precheckと同値のread-only条件はすべて0件。C5 queryの`c5_pass=true`を確認した。

## 11. G5-R再開可否

DB-002単体の再開条件は満たしたが、後続C6 preflightでG1-C必須relation 4件欠落（DB-003）を検出したため、**現在のC6開始は不可**。DB-002 repair自体は維持され、C5 data監査はPASS。今回もmigrationは適用していない。

## 12. 公開可否への影響

Current SupabaseのDB-002は解消したが、G1-A〜G4-Bが未適用である。本番migration、本番deploy、正式公開は引き続き不可。次の工程はG5-R C6 migration rehearsal。

C6前にはDB-003を解消し、新snapshot、post-repair backup、fresh/upgrade、C5、ledger/checksumを再確認する。詳細は`19-g5r-c6-migration-preflight-report.md`。
