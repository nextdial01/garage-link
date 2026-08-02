# DB-004 R1後backupチェックリスト

R1の4 transactionと`06-read-only-postcheck.sql`がPASSした直後、C5より先に実施します。Current上でrollback・restoreは行いません。

## 必須保全

- [ ] backup作成時刻（JST/UTC）を記録
- [ ] GARAGE LINK project fingerprint `5b41e1af2add`を再確認
- [ ] public schema
- [ ] public data
- [ ] migration ledger（39件のまま）
- [ ] roles / owners / grants / default privileges
- [ ] RLS / policies（103 / 364のまま）
- [ ] functions / RPC / EXECUTE
- [ ] triggers / constraints / indexes
- [ ] `tenants` / `stores` / `memberships` / `company_subscriptions` / `audit_logs`
- [ ] vehicle / deal / quote / invoice / service / inventory系
- [ ] Storage bucket・object inventory
- [ ] managed Authのexport可否と未保全範囲
- [ ] backupファイルごとのsize、SHA-256、permission
- [ ] credential、接続文字列、token literalがbackup manifestへ混入していない
- [ ] 一時領域ではない耐久保存先へ配置
- [ ] restore専用local DBへの手順と想定RPO/RTOを記録

## 証拠

保存するもの:

1. backup manifest
2. backup全体fingerprint
3. file一覧・size・SHA-256
4. row-count snapshot
5. catalog fingerprint
6. Storage inventory
7. `06`のPASS出力

## 停止条件

- schema/data/ledgerのいずれかを保全できない
- 耐久保存先がない
- SHA-256を作れない
- secret literalを検出
- project fingerprint不一致
- row countが`06`出力と一致しない

いずれかに該当した場合、C5とmigrationへ進みません。

## 次へ進む条件

上記必須項目が完了し、restore手順が別環境向けに確定した場合だけ、`09-c5-read-only-checklist.sql`を実行します。
