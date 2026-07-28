# DB-004 R1 SQL Editor実行報告

- 実施日: 2026-07-27
- 実施時刻: 21:15 JSTまで
- 対象: GARAGE LINK Current Supabase
- project ref: `wmlpuzuskfiwdipluglz`
- project fingerprint: `5b41e1af2add`
- correlation ID: `820a4de6-15fe-43ae-9779-a87e79998ddf`
- operator承認: 取得済み

## 1. 結論

DB-004 R1の4店舗復旧とpostcheckは成功した。Current上で新tenant 4件、store更新4件、canonical owner membership 4件、subscription更新4件、append-only audit 4件を作成し、DELETE、migration、RLS/policy変更は0件である。

post-R1 backupはBLOCKED。DashboardでGARAGE LINK projectがFree Planであり、`Database Backups`に`Free Plan does not include project backups`と表示された。必須backupを耐久保管できないため、承認済みGateに従いC5は未実行、migrationは0件で停止した。

## 2. Project確認

| 項目 | 結果 |
|---|---|
| project名 | `garage-link` |
| project ref | `wmlpuzuskfiwdipluglz` |
| fingerprint | `5b41e1af2add`、過去監査記録と一致 |
| L-LINK分離 | 同一organization内の別project `l-link`を確認。接続・変更なし |
| Current | 指定projectのPrimary databaseを使用 |
| Edge Functions | デプロイ済みfunction 0件 |
| Installed integrations | Data API、Vaultのみ。Cron/Webhook integrationなし |
| 直近runtime | Project Overviewの直近60分Total Requests 0、Edge Functions 0 |
| 外部通信 | 実行0件 |

Dashboard上のbranch表示は`main / Production`だが、operatorがテスター専用Currentとして承認したproject refと一致する。一般公開・deploy・外部送信は行っていない。

## 3. SQL SHA-256

| File | SHA-256 | 判定 |
|---|---|---|
| `01-read-only-precheck.sql` | `ae2c3b3c5b8e5809d413dc4410ea412eb7908e15c0fc8e0488b9ffd9950bff92` | 一致 |
| `02-apply-store-2c127637ea1c.sql` | `7681882d755c8fbb49d3646d6a7edc296585c47d7cc1c6805a86727c40ecd398` | 一致 |
| `03-apply-store-b7c22a4ee049.sql` | `29ae70e5fb244421ac3cf9de96b10ee39f70debfc3beb5a13bb7807a14f8446a` | 一致 |
| `04-apply-store-eb2bcbf525ea.sql` | `320539fb517a3bbd5ee927a2fc1adc21b771a366494ba8a0d6f7faf1d48806fb` | 一致 |
| `05-apply-store-c4ff77ffe6b2.sql` | `d4b8fd3e850d16c60373ef334c57bcc9a08f8f52bed4cde782b13cb253c0a405` | 一致 |
| `06-read-only-postcheck.sql` | `1cd2a2d8815cdfcf1d4ece0fc56397b2785d24509ecfc85aea9eecb043e95da9` | 一致 |
| `08-post-r1-backup-checklist.md` | `469c13cd4fbaedaf4c5fa8af1ed91a4693c0eda11f93db936014846157ee11c0` | 記録 |
| `09-c5-read-only-checklist.sql` | `c2100cbc86a4bf249f8bb7da26a78d2d69f697c6c674205a4d070ea99c5cf85f` | 一致 |

正本ファイルは変更していない。

## 4. Precheck

`01-read-only-precheck.sql`は例外なしで完了した。

| 項目 | 結果 |
|---|---:|
| migration ledger | 39 |
| RLS table | 103 |
| policy | 364 |
| 同一correlation audit | 0 |

store fingerprint、owner候補、tenant NULL、subscription一意性、cross-scope、tenant付き子データ等のDO block検査も例外なし。判定はPASS。

## 5. R1

| Store fingerprint | Tenant fingerprint | Active owner | Subscription | Audit | 判定 |
|---|---|---:|---:|---:|---|
| `2c127637ea1c` | `070a6bf97e7f` | 1 | 1 | 1 | PASS |
| `b7c22a4ee049` | `078cea50bef1` | 1 | 1 | 1 | PASS |
| `eb2bcbf525ea` | `f396afb7915b` | 1 | 1 | 1 | PASS |
| `c4ff77ffe6b2` | `b24a1a657ea6` | 1 | 1 | 1 | PASS |

合計変更:

- `tenants`: INSERT 4
- `stores`: UPDATE 4
- `memberships`: INSERT 4
- `company_subscriptions`: UPDATE 4
- `audit_logs`: INSERT 4
- 合計: 20行操作
- DELETE: 0

### SQL Editor入力時の技術的エラー

1店舗目の初回入力では、Dashboardの長文editorへ置換ではなく前query断片へ追記され、SQL解析段階で`column "begin" does not exist`となった。transaction開始前のparse errorでDB変更は0件。

その後、editor全選択置換後にDashboardから再コピーし、正本SQLとの文字列完全一致（12,604 bytes）を確認して再実行した。再実行はPASS。残り3件も実行前に同じ完全一致確認を行った。SQLファイル自体の不具合ではない。

## 6. Postcheck

`06-read-only-postcheck.sql`は例外なしで完了した。

| 項目 | 結果 |
|---|---:|
| `stores.tenant_id IS NULL` | 0 |
| R1 audit | 4 |
| recovered tenant | 4 |
| migration ledger | 39 |
| RLS table | 103 |
| policy | 364 |

store/tenant 1対1、active owner、subscription、invalid membership、cross-tenant、cross-store、orphan等のDO block検査も例外なし。判定はPASS。

## 7. Backup

判定: **BLOCKED**

Dashboardの`Database > Backups > Scheduled backups`で以下を確認した。

- GARAGE LINK projectはFree Plan
- `Free Plan does not include project backups`
- Dashboard上の既存backupなし

したがって、`08-post-r1-backup-checklist.md`が求めるschema/data/ledger/role/RLS/RPC/Storage inventoryの耐久backup、file size、SHA-256、permission、restore手順を完成できない。

- backup file数: 0
- backup容量: 0
- backup SHA-256: 未作成
- durable storage: 未作成
- managed Auth/Storage: 未保全

### Operatorが行う具体的な次の1手順

承認済みの安全なDB管理端末で、GARAGE LINK project `wmlpuzuskfiwdipluglz`のpost-R1時点を`08-post-r1-backup-checklist.md`の全項目を満たす形で耐久保存し、backup manifestと全file SHA-256を同報告へ追記する。CLI資格情報調査はCodexへ戻さない。

料金プラン変更は別承認事項であり、CodexはDashboardの`Upgrade`を実行していない。

## 8. C5

backup GateがBLOCKEDのため、`09-c5-read-only-checklist.sql`は未実行。PASS扱いしない。

## 9. Rollback

- rollback必要性: 現時点ではなし
- `07-emergency-rollback-plan.sql`: 未実行
- R1 postcheckはPASSしており、異常な部分更新は検出されていない

## 10. 最終状態

| 項目 | 状態 |
|---|---|
| DB-004 R1 | Currentで完了 |
| R1成功store | 4 |
| R1失敗store | 0 |
| Current変更 | 許可された20行操作のみ |
| 対象外変更 | 0 |
| migration適用 | 0 |
| backup | BLOCKED |
| C5 | NOT TESTED |
| C6 | 禁止・未実行 |
| Vercel deploy | 0 |
| 外部通信 | 0 |
| 本番deploy・正式公開 | 不可 |

次工程はpost-R1 backupの耐久保管である。backup完了後にのみC5 read-only監査へ進める。

## 11. Manual backup試行（2026-07-27）

Supabase CLI 2.107.0のhelpを確認し、既存linked接続によるroles dumpから開始したが、API認証401および`SUPABASE_DB_PASSWORD`未設定でDB接続前に停止した。backup file 0、Current query/write 0、migration 0。credential調査へ進まず、C5はNOT TESTEDを維持する。詳細は`27-post-r1-manual-backup-report.md`。
