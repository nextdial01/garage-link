# DB-004 R1 — Supabase SQL Editor operator package

## 目的と範囲

tenant未設定の4 storeを、既存tenantへ統合せず、1 store＝1 independent tenantとして復旧します。Current Supabaseへの接続・実行はoperatorがSQL Editorで行います。このpackage作成時点のCurrent変更は0件です。

correlation ID: `820a4de6-15fe-43ae-9779-a87e79998ddf`

| Store fingerprint | 承認済みowner fingerprint | Legacy role | Recovery key fingerprint |
|---|---|---|---|
| `2c127637ea1c` | `4a0360984dc0` | owner | `079dd4c23908` |
| `b7c22a4ee049` | `a7350f6f0933` | owner | `06c3f3c874c3` |
| `eb2bcbf525ea` | `dc5e4dbb6ea5` | owner | `dbe342055dc9` |
| `c4ff77ffe6b2` | `e9d226b2af53` | staff（operatorが正規ownerとして明示承認済み） | `eecf0a3ad617` |

実IDはfingerprintからSQL内で一意に再特定します。SQL・出力・文書へ個人情報、token、secret、subscription ID全文は含めません。

trial店舗は正本backup上で`store status/plan=trial`、契約ledger上は`subscription plan=free`です。これは既知の旧trial互換状態としてこの1組だけを許可し、新tenantの`plan_code`には契約正本であるsubscriptionの`free`を設定します。既存store/subscriptionのplan/statusは変更しません。他のplan不一致は停止します。

## 許可変更

各storeの独立transaction内で次の5操作だけを行います。

| Table | 操作 | 1 store | 4 store合計 |
|---|---|---:|---:|
| `tenants` | INSERT | 1 | 4 |
| `stores` | `tenant_id` UPDATE | 1 | 4 |
| `memberships` | canonical owner INSERT | 1 | 4 |
| `company_subscriptions` | `tenant_id` UPDATE | 1 | 4 |
| `audit_logs` | append-only INSERT | 1 | 4 |

合計はINSERT 12行、UPDATE 8行、DELETE 0行です。assignment、preference、業務データ、`store_members`、role、migration、外部サービス、deployは変更しません。

## 実行前条件

- SQL EditorのprojectがGARAGE LINK Currentであることをoperatorが画面で確認
- post-DB-002 backupを保持
- 外部worker、Cron、Webhook、runtimeが停止
- 実行者が本packageとcorrelation IDを二者確認
- 途中結果を保存する監査場所を準備
- migrationを同時実行しない

## 実行順

### 1. `01-read-only-precheck.sql`

- 期待結果: 4行すべて`PASS`、ledger 39、correlation audit 0
- 変更予定: 0行
- 停止条件: 1行でもFAIL、例外、fingerprint/owner/status/subscription/scope/orphan不一致
- 保存証拠: 全result grid、NOTICE、ledger/RLS/policy件数、実行時刻
- rollback: 不要（read-only transactionは最後にROLLBACK）
- 次へ: 全check PASSの場合だけ

### 2. apply SQLを1ファイルずつ実行

1. `02-apply-store-2c127637ea1c.sql`
2. `03-apply-store-b7c22a4ee049.sql`
3. `04-apply-store-eb2bcbf525ea.sql`
4. `05-apply-store-c4ff77ffe6b2.sql`

各ファイルを分割せず、1回のSQL Editor実行として送信します。同時実行しません。

- 初回期待結果: `DB004_COMPLETED` NOTICE、結果1行、owner/subscription/audit countが各1
- 初回変更予定: INSERT 3行、UPDATE 2行
- 正常再実行: `DB004_ALREADY_COMPLETED` NOTICE、変更0行、同じtenant fingerprint
- 停止条件: 任意の例外、結果0/2行、countが1以外、想定外NOTICE
- 保存証拠: store/tenant fingerprint、各count、開始/終了時刻、エラー全文（secret/PII除外）
- rollback: exception時はtransaction全体がrollback。SQL Editor sessionがabort状態なら`ROLLBACK;`だけを実行して停止
- 次へ: 直前storeの結果が完全一致した場合だけ次storeへ進む

1 storeが失敗しても、それ以前にcommit済みのstoreを戻しません。失敗storeの原因を人間確認し、同じファイルを修正せず再調査します。

### 3. `06-read-only-postcheck.sql`

- 期待結果: 4行すべてPASS、新tenant 4、audit 4、store tenant NULL 0、ledger 39、RLS 103、policy 364
- 変更予定: 0行
- 停止条件: cross-tenant/cross-store/orphan、owner/subscription/audit不一致、catalog count変化
- 保存証拠: 全result grid、NOTICE、集計行
- rollback判断: FAILならmigration禁止。R1後に正当な操作がない場合のみ`07`の適格性を別operatorが評価
- 次へ: PASS時だけpost-R1 backup

### 4. post-R1 backup

`08-post-r1-backup-checklist.md`に従います。耐久保存・SHA-256・restore手順が揃わなければ停止します。

### 5. `09-c5-read-only-checklist.sql`

- 期待結果: exceptionなし、C5 PASS、DB-003 4 relationは`PENDING_CREATE`相当
- 変更予定: 0行
- 停止条件: membership/scope/sale/accounting/catalog/ledgerの不一致
- 保存証拠: 全result grid、NOTICE、実行時刻
- 次へ: C5 PASSと別のC6 operator承認が揃った場合だけ

### 6. C6

`10-c6-migration-runbook.md`は後続工程の手順です。今回migrationを実行しません。C5がPASSするまでmigrationは禁止です。

## 冪等性

apply SQLはstore rowをlockし、correlation・store・owner・recovery key・既存tenantを照合します。同一対応の正常完了後は変更0で既存結果を返します。同じcorrelationで対応が異なる、またはauditなしでtenantが設定済みの場合は例外で停止します。

## Emergency rollback

`07-emergency-rollback-plan.sql`は初期状態で必ず停止する無効化済みplanです。別operator承認、C6未適用、事後業務更新0、tenant未使用を満たす場合だけ、1 storeずつ有効化を検討します。R1 auditは削除しません。G1-C適用後はtenant NULLへ戻すrollbackを禁止します。

## SQL SHA-256

| File | SHA-256 |
|---|---|
| `01-read-only-precheck.sql` | `ae2c3b3c5b8e5809d413dc4410ea412eb7908e15c0fc8e0488b9ffd9950bff92` |
| `02-apply-store-2c127637ea1c.sql` | `7681882d755c8fbb49d3646d6a7edc296585c47d7cc1c6805a86727c40ecd398` |
| `03-apply-store-b7c22a4ee049.sql` | `29ae70e5fb244421ac3cf9de96b10ee39f70debfc3beb5a13bb7807a14f8446a` |
| `04-apply-store-eb2bcbf525ea.sql` | `320539fb517a3bbd5ee927a2fc1adc21b771a366494ba8a0d6f7faf1d48806fb` |
| `05-apply-store-c4ff77ffe6b2.sql` | `d4b8fd3e850d16c60373ef334c57bcc9a08f8f52bed4cde782b13cb253c0a405` |
| `06-read-only-postcheck.sql` | `1cd2a2d8815cdfcf1d4ece0fc56397b2785d24509ecfc85aea9eecb043e95da9` |
| `07-emergency-rollback-plan.sql` | `7e6fbdd06e0f66c5f4a41206eedcc69ab6f835661d157320ae09cc7c74b464e0` |
| `09-c5-read-only-checklist.sql` | `c2100cbc86a4bf249f8bb7da26a78d2d69f697c6c674205a4d070ea99c5cf85f` |

## 禁止

- SQLの一部だけを選択実行
- fingerprint定数・owner mapping・correlationの現場変更
- 4 apply SQLの並列実行
- `store_members`をcanonical認可へ利用
- assignment/preference作成
- 業務データ直接UPDATE
- migration、deploy、外部通信
- secret/PIIを証拠へ保存
