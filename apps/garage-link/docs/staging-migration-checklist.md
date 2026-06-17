# GARAGE LINK staging migration checklist

このチェックリストは、`022` から `027` までのセキュリティ系migrationを本番DBへ適用する前に、staging Supabaseで安全性を確認するための手順です。

## 前提

- 本番DBへ直接適用しない
- staging Supabaseを本番相当の構成で用意する
- stagingには本番データをそのまま持ち込まず、必要に応じてマスク済みデータを使う
- 適用前にDBバックアップまたはstaging再作成手順を用意する
- `.env.local` やVercelのsecret値は画面・ログ・ドキュメントに記載しない
- `supabase db reset` やmigration適用はstaging/localだけで実行する

## 適用順

1. `supabase/schema/022_tenant_security_foundation.sql`
2. `supabase/schema/023_line_secret_hardening.sql`
3. `supabase/schema/024_line_delivery_safety.sql`
4. `supabase/schema/025_csv_security.sql`
5. `supabase/schema/026_storage_security.sql`
6. `supabase/schema/027_pii_minimization.sql`

`028_legacy_pii_cleanup_plan.sql` は即時cleanup用ではありません。先に件数確認とstaging検証を行い、バックアップ後に必要なUPDATEだけを明示的に有効化してください。

## 適用前確認

- `stores` と `store_members` の件数を記録する
- `stores.id` が重複なく存在することを確認する
- 同名店舗がある場合でも、`022` のbackfillが店舗名JOINを使っていないことを確認する
- `line_settings` に既存の `channel_secret` / `channel_access_token` がある場合、暗号化移行前に件数だけ確認する
- `line_webhook_events` / `line_message_logs` に本文・raw payloadが残る件数を確認する
- `garage-private` Storage bucketをprivate bucketとして作成する

## backfill確認

`022_tenant_security_foundation.sql` 適用後に確認します。

- 既存 `stores.id` ごとに `stores.tenant_id` が設定されている
- 同名店舗があっても、store_idごとに別tenantへ紐づく
- `stores` / `store_members` は削除されていない
- `store_members` から `memberships` へ所属が補完されている
- `implementer` は互換上 `admin` へ寄せられていることを理解する
- `tenant_features` に `line`, `customer`, `vehicle`, `deal`, `maintenance`, `invoice` が補完されている

確認SQL例:

```sql
select count(*) from public.stores;
select count(*) from public.stores where tenant_id is null;
select tenant_id, count(*) from public.stores group by tenant_id order by count(*) desc;
select count(*) from public.memberships;
select tenant_id, feature_code, enabled from public.tenant_features order by tenant_id, feature_code;
```

## RLS確認

対象:

- `tenants`
- `tenant_features`
- `memberships`
- `security_events`
- `line_delivery_logs`
- `line_test_delivery_logs`
- `data_export_logs`
- `data_import_logs`
- `uploaded_files`

確認項目:

- A社ユーザーがA社tenantだけ見られる
- A社ユーザーがB社tenantを見られない
- A社ユーザーがB社のimport/export logを見られない
- A社ユーザーがB社のuploaded file metadataを見られない
- owner/adminだけがsecurity系ログを確認できる
- staff/viewerは設定・CSV・配信実行・Storage uploadの制限を受ける
- Service Role Keyを使わない通常APIで、既存store_idベース画面が引き続き動く

## role別確認

owner:

- LINE設定保存ができる
- CSV import/exportができる
- 本配信実行ができる
- Storage upload / signed URL発行ができる
- security-check / audit logs / trashを確認できる

admin:

- LINE設定保存ができる
- CSV import/exportができる
- 本配信実行ができる
- Storage upload / signed URL発行ができる
- メンバー権限変更の制限範囲を確認する

staff:

- 車両・顧客・商談の日常操作ができる
- CSV import/exportは403
- 本配信実行は403
- LINE設定変更は不可
- Storage uploadは許可範囲のみ、viewerより強いが設定系は不可

viewer:

- 閲覧のみ
- 保存、削除、発行、配信、CSV、Storage uploadは不可

## 画面疎通確認

車両管理側:

- `/login`
- `/dashboard`
- `/vehicles`
- `/customers`
- `/deals`
- `/maintenance`
- `/inventory-counts`
- `/analytics`

LINE管理側:

- `/line`
- `/line/settings`
- `/line/campaigns`
- `/line/message-logs`
- `/line/webhook-events`

設定:

- `/settings`
- `/settings/import-export`
- `/settings/security-check`
- `/settings/env-check`
- `/settings/trash`

Storage:

- 会社ロゴ画像アップロード
- 角印画像アップロード
- private bucket保存
- signed URL表示

## API疎通確認

- `GET /api/line/settings`
  - 平文secret/tokenを返さない
  - encrypted値も返さない
- `POST /api/line/settings`
  - secret/token空欄保存で既存値を維持
  - 入力時のみ暗号化更新
- `GET /api/line/webhook`
  - 疎通確認JSONを返す
- `POST /api/line/webhook`
  - 署名不一致は403
  - 本番設定でsecret未設定なら安全側で失敗
  - `security_events` に本文・raw_eventを保存しない
- `POST /api/line/send`
  - staff本配信は403
  - 配信前確認なし本配信は拒否
- `GET /api/customers/export`
  - owner/adminのみ成功
  - CSV式インジェクション値が無害化される
- `POST /api/customers/import`
  - previewなしcommitを拒否
  - CSV内の `tenant_id` / `store_id` を信用しない
- `GET /api/vehicles/export`
  - owner/adminのみ成功
- `POST /api/vehicles/import`
  - preview / commitの2段階
- `GET /api/line/friends/export`
  - `line_user_id` を出力しない
- `POST /api/storage/upload`
  - viewerは拒否
  - MIME type / 拡張子 / サイズ超過を拒否
- `POST /api/storage/signed-url`
  - tenant/store配下のfileだけ発行

## 既存PIIデータ洗い出し

| テーブル | カラム | 含まれる可能性がある情報 | 業務上の保存必要性 | マスク対象 | 削除対象 | 保持対象 | 優先度 |
|---|---|---|---|---|---|---|---|
| `line_webhook_events` | `message_text` | 受信メッセージ本文、問い合わせ内容 | ログ用途では不要 | はい | NULL化候補 | いいえ | 高 |
| `line_webhook_events` | `raw_event` | LINE payload全体、userId、本文、画像情報 | ログ用途ではhashと最小メタで十分 | はい | 最小JSONへ置換候補 | いいえ | 高 |
| `line_webhook_events` | `line_user_id` | LINE userId | ログ用途ではhashで十分 | はい | hash移行後NULL化候補 | いいえ | 高 |
| `line_message_logs` | `body` | 送信本文全文 | 長期ログでは不要。本文確認はdraft/template参照 | はい | hash/length移行後空文字候補 | いいえ | 高 |
| `line_message_logs` | `line_user_id` | LINE userId | ログ用途ではhashで十分 | はい | hash移行後NULL化候補 | いいえ | 高 |
| `line_message_logs` | `line_display_name` | LINE表示名 | ログ用途では不要 | はい | NULL化候補 | いいえ | 中 |
| `line_message_drafts` | `body` | 下書き本文 | 業務データとして必要 | いいえ | いいえ | はい | 中 |
| `line_message_drafts` | `line_user_id` / `line_display_name` | 下書き送信先情報 | 業務データとして必要な場合あり | 将来検討 | いいえ | はい | 中 |
| `line_form_responses` | `answers` | 氏名、電話、住所、車両情報、相談内容 | 業務データとして必要 | ログ保存禁止 | いいえ | はい | 高 |
| `line_form_responses` | `line_user_id` | LINE userId | 回答者特定に必要な場合あり | 将来hash併用検討 | いいえ | はい | 中 |
| `inquiries` 相当 | `message` / `body` / `content` | 問い合わせ本文 | 業務データとして必要 | ログ保存禁止 | いいえ | はい | 高 |
| `customers` | 氏名・電話・住所・メール・LINE情報 | 顧客台帳 | 業務データとして必要 | export制御対象 | いいえ | はい | 高 |
| `uploaded_files` | `original_filename` | ファイル名内の氏名・車両番号等 | 表示には必須ではない | 将来マスク検討 | いいえ | 条件付き | 中 |
| `audit_logs` | `metadata` / `before_data` / `after_data` | 過去実装由来の本文・個人情報 | 監査用途では最小メタで十分 | はい | 個人情報key除去候補 | 最小メタのみ | 高 |
| `security_events` | `details` | 過去実装由来の本文・個人情報 | セキュリティ用途では理由コードで十分 | はい | 個人情報key除去候補 | 最小メタのみ | 高 |

注: 現在の実スキーマではフォーム回答は `line_form_responses` です。要件文中の `line_form_answers` は今後追加される場合も同じ方針で扱います。

## stagingで確認する操作

- ログイン
- ダッシュボード表示
- 車両管理表示
- 顧客管理表示
- LINE設定保存
- SecretがAPI responseに返らないこと
- Webhook署名不一致403
- LINEテスト配信
- 配信前確認
- CSV customers export
- CSV customers import preview
- CSV vehicles import commit
- line_friends exportで `line_user_id` が出ないこと
- ロゴ画像アップロード
- signed URL発行
- viewer/staff/admin/owner別の権限
- A社/B社 tenant分離

## バックアップとrollback

- 本番適用前にDBバックアップ必須
- cleanup前にSELECTで対象件数を確認する
- stagingでcleanup前後の件数・画面・APIを確認する
- cleanup UPDATEは小さな単位で実行する
- 本番ではメンテナンス時間帯に実行する
- rollbackはDBバックアップからの復元、またはcleanup前に一時退避テーブルを作成して戻せる形にする

## 保持期間と自動削除案

初期方針:

- `security_events`: 180日〜1年
- `audit_logs`: 1年
- `line_webhook_events`: 30日〜90日
- `line_message_logs`: 90日〜180日
- `line_form_responses`: 業務上必要期間。ただしCSV export不可またはowner限定
- `uploaded_files`: 論理削除・保存目的に応じて管理

実装候補:

- Supabase Scheduled Functions
- `pg_cron`
- Vercel Cron
- 管理画面からの手動削除

本番では、保持期間を契約・法務・業務要件と合わせて確定してから自動削除を有効化してください。
