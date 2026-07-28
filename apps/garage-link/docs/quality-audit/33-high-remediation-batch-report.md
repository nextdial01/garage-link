# GARAGE LINK High remediation batch report

実施日: 2026-07-28  
対象snapshot: `docs/quality-audit/evidence/g7-high-remediation-preflight.json`  
Current変更: data 0 / migration 0 / deploy 0 / 外部送信 0

## 1. 結論

正本issue ledgerのコード未修正High 9件（AUTH-002、BILL-001、BILL-002、INVENTORY-001、MEMBER-001、PII-001、SERVICE-001、STRIPE-001、STRIPE-002）は、forward-only migration `20260728000100`と最小アプリ修正で**Local Resolved**になった。非owner、inactive、old-only、他tenant、assignment外の動的境界も分離DBでPASSした。

新規migrationはCurrentへ未適用である。コード未修正Critical/Highは0件だがCurrent確認待ちHighは9件で、Current controlled-test適用・回帰前のstaging deployは不可である。

## 2. 開始時Highと修正

| ID | 根本原因 | 修正 | 証拠 | 状態 |
|---|---|---|---|---|
| AUTH-002 | canonical化後もlegacy write/RPCが残った | `store_members` write revoke、招待・role・無効化・store作成を`memberships`＋assignmentだけへ再定義 | invite DB fixture、user-facing legacy query 0 | Local Resolved / Current待ち |
| BILL-001 | quotaのCOUNT→INSERTが直列化されていない | tenant advisory transaction lock付きquota trigger | 2/10/100 workerで成功1、row 1 | Local Resolved / Current待ち |
| BILL-002 | store直接INSERTとupload metadataのNULL/path/scope迂回 | store direct INSERT停止、secure RPC限定。upload tenant必須・path CHECK・direct write revoke | DB/RLS回帰 | Local Resolved / Current待ち |
| INVENTORY-001 | header/items分割、可変snapshot、active重複、確定競合 | snapshot作成/確定RPC、unique、snapshot不変/terminal guard | 2/10/100、process-kill | Local Resolved / Current待ち |
| MEMBER-001 | 招待tokenを利用する本人承認画面がない | fragment招待URL、本人accept画面、承認後fragment消去、assignment作成 | invite fixture、Security、Chrome | Local Resolved / Current待ち |
| PII-001 | permissive SELECTのORでsoft-deleted rowが通常roleへ見える | 主要表のrestrictive visibility policy、membership auditのPII除去 | viewer deleted customer不可 | Local Resolved / Current待ち |
| SERVICE-001 | clientが部品を一律復元しjob取消と別transaction | row lock、`stock_adjusted=true`だけ復元、movement unique、status/auditを1 RPC化 | 2/10 worker、stock 12、movement 1、kill | Local Resolved / Current待ち |
| STRIPE-001 | event重複排除はあっても古い別eventが新stateを上書き可能 | `created + event id`順序付きRPC、stale event no-op、scheduled planもevent順序へ統合 | new→oldでold `superseded` | Local Resolved / Current待ち |
| STRIPE-002 | Stripe成功後のDB失敗を未確認のまま成功応答し得た | durable operation、idempotency、checked write、reconciliation state、checkout session unique | Security/mock、DB unique/order | Local Resolved / Current待ち |

LLINK-001は前BatchでCurrent適用済み。本BatchではHMAC、tenant/store connection binding、nonce replay、ACK retry、他tenant拒否をmockで再確認し、製品コードは変更していない。

## 3. migration・manifest

- forward: `supabase/migrations/20260728000100_high_remediation_batch.sql`
- rollback: `supabase/rollback/20260728000100_high_remediation_batch.down.sql`
- manifest entries: 48
- manifest/migration SHA-256、snapshot fingerprintは生成JSONを正本とし、本書へ手入力しない。
- security-preserving rollbackは新機能を停止するが、legacy認可、viewer write、直接store/upload write、soft-deleted PII閲覧を復活させない。
- SECURITY DEFINERは固定`search_path`、最小EXECUTE、NULL role fail-closedを確認した。

## 4. DB・競合結果

| 検査 | 結果 |
|---|---|
| fresh 48 / 再実行 | PASS / 48 skip |
| Current相当upgrade 38→48 | PASS、既存データ保持 |
| rollback / 再適用 | PASS、9 rollback / 10 reapply |
| backup / restore | PASS |
| cross-tenant / cross-store / orphan | 0 / 0 / 0 |
| quota 2/10/100 | 各成功1、row 1 |
| inventory same-key 2/10/100 | 全worker同一結果、snapshot 1 |
| inventory競合 2/10/100 | 成功1、active 1 |
| service cancel 2/10 | stock復元1回、movement 1 |
| process-kill | commit前0、retry後1、部分更新0 |

## 5. 非owner動的検証

| Actor | 結果 |
|---|---|
| owner | 自store正常業務・棚卸し確定・整備取消を許可、他scope拒否 |
| admin | 既存許可範囲を維持、棚卸し確定・整備取消を許可 |
| staff | snapshot作成/数量記録を許可、確定・整備取消・membership管理を拒否 |
| implementer | 明示許可だけ。membership・会計確定・不明mutationを拒否 |
| viewer | 業務write、mutation RPC/API、soft-deleted PIIを拒否 |
| inactive / old-only | write/RPC/API拒否、authorization 0 |
| 他tenant / assignment外 | SELECT/write/RPC/store switch拒否 |

Currentには安全な非owner fixtureがないためCurrentデータは作成していない。CurrentはC6時点のschema/ACL/read-only整合を基準とし、動的証拠は同一48 migration＋今回forward migrationを適用した分離DBで取得した。

## 6. 全回帰

| 検査 | 結果 |
|---|---|
| G1-A〜G4-B / G7 DB | PASS |
| Security suite | 239 PASS |
| API smoke | PASS、401/403/409/503、内部情報leak 0 |
| L-LINK mock / ACK / inquiry | PASS |
| 問い合わせ管理 | PASS |
| lint / TypeScript / production build | PASS / PASS / PASS（130 pages/routes） |
| localhost browser | 既存Chromeで9 route PASS、500/blank/overlay/console error 0 |

bundled Chromium不足は製品不具合と分離し、既存Chromeを明示利用する`test:e2e:local-chrome`を追加した。大容量downloadなしで再現でき、TEST-002の今回のstaging Gate範囲は解消した。

## 7. 変更範囲

- DB: 新規migration/rollback、manifest、catalog/G7 regression、競合・kill test
- inventory/service: `inventory-counts/new`、`inventory-counts/[id]`、`maintenance/[id]`
- membership: `settings/members`、`membership/accept`、middleware
- Stripe: webhook、change-plan、applyPlan
- 検査: High security contract、evidence generator、local Chrome smoke
- 文書: issue ledger、remediation plan、本書、Current適用runbook

開始時の未コミット差分を保持し、Current適用済み9 migrationは変更していない。対象外変更は0件。

## 8. Current適用operator承認文案

適用対象は`20260728000100`の1件だけとする。

1. `pnpm evidence:g7`でmanifest 48、migration checksum一致、snapshot PASSを確認する。
2. GARAGE LINK Current fingerprint、ledger 48、外部worker/Cron/runtime停止を確認する。
3. Current backupを新規取得しSHA-256とrestore手順を耐久保管する。
4. read-only precheckでquota超過、upload tenant NULL/path不正、重複active棚卸し、tenant/store/orphan、Stripe重複keyが0であることを確認する。
5. `lock_timeout=3s`、`statement_timeout=120s`、最大30分、1 transactionで適用する。
6. ledger 49、RLS/policy/RPC/owner/grant、row/backfill、G1-A〜G4-B/G7、非owner、2/10/100 worker、API/browserを確認する。
7. 異常時はdeployを停止し、security-preserving機能停止またはbackup restore判断とする。
8. この承認にVercel deploy、外部送信、正式公開は含めない。

正本runbook: `docs/quality-audit/operator/g7-high-remediation/00-current-migration-runbook.md`

## 9. 判定

- 未解消Critical: 0
- コード未修正High: 0
- Current確認待ちHigh: 9
- staging deploy: **不可（単一forward migration適用・Current回帰待ち）**
- 正式公開: **不可（Current回帰、staging deploy smoke、外部送信設定の最終Gate、別承認が必要）**

## 10. Current適用試行（2026-07-28）

operator承認後に正本snapshot/checksum一致を再確認したが、新規Current backupの最初のdumpがDB接続前401で停止した。backup不備の停止条件によりprecheck、migration、Current回帰を開始していない。Current query/write、migration、deploy、外部送信は0件で、Current確認待ちHigh 9件とstaging deploy不可を維持する。詳細は`34-g7-current-migration-execution-report.md`。

## 11. OPS-007（2026-07-28）

401の原因だったSupabase管理API経路を廃止し、operatorがTTYで非表示入力するPostgreSQL connection URLと一時pgpassを使う単一runnerへ固定した。URL/passwordは引数・標準出力・JSON・reportへ残さず、終了・異常終了時に一時資格情報を削除する。静的検査およびCurrent同一migrationを使うnetwork-none使い捨てDBのprecheck→migration→postcheckはPASS。Current backup/migration/回帰はoperator実行待ちで、Current変更・外部送信・deployは0件である。
