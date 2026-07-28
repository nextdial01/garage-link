# G7 High remediation Current適用runbook（今回実行禁止）

このrunbookは、High修正Batchのforward migrationをCurrent controlled-testへ適用する別工程用です。本BatchではCurrent Supabaseへ適用しません。Vercel deployと外部送信も別承認です。

## 正本と対象

- checksumの正本は`supabase/migrations/20260728000100_high_remediation_batch.sql`と`supabase/baseline/manifest.json`だけです。
- 対象versionは`20260728000100`の1件です。
- checksumをMarkdownへ転記しません。直前に`pnpm evidence:g7`を実行し、生成JSONの`manifestMatch: true`を確認します。
- Current開始ledgerは48件、正常終了後は49件です。

## 適用前Gate

1. GARAGE LINK Current project fingerprintが既存正本と一致する。
2. Current backupを新規取得し、SHA-256とrestore手順を保存する。
3. Currentデータのtenant/store/orphan、quota超過、重複active棚卸し、Stripe重複keyをread-onlyで確認する。
4. external worker、Cron、Webhook、runtime、外部送信を停止する。
5. migration実体・manifest・生成evidenceが一致する。
6. operatorがこの1 migrationの適用を明示承認する。

## 適用

- `lock_timeout`: 3秒
- `statement_timeout`: 120秒
- maintenance window: 最大30分
- 1 transaction、1 migrationとして適用する。
- ledger追加、DDL、RLS/policy、RPC/EXECUTE、function owner、row count、backfill件数を直後に確認する。

## 即時停止条件

- project・backup・checksum・ledger不一致
- quota超過、重複active棚卸し、tenant/store不整合などprecheck不合格
- lock/statement timeout
- FK/UNIQUE/CHECK、RLS/policy/RPC/owner/grant異常
- 想定外backfillまたはCurrentデータ変更
- 外部worker・外部通信の発生

## rollback

SQL transaction内の失敗はtransaction rollbackとします。commit後は`supabase/rollback/20260728000100_high_remediation_batch.down.sql`によるsecurity-preserving機能停止を使い、旧`store_members`認可、viewer write、直接store/upload write、payment/invoice mutationを復活させません。破壊的rollbackやappend-only auditの削除は行いません。

## 適用後

G1-A〜G4-B、G7、非owner role、2/10/100 worker、process-kill、Security、API、L-LINK mock、問い合わせ管理、lint、型、build、browser smokeを実行します。すべてPASSするまでdeployへ進みません。
