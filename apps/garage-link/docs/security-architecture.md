# GARAGE LINK セキュリティ設計

このドキュメントは、GARAGE LINK本体とLINE単体パッケージを安全に運用するための設計方針です。顧客情報、LINE友だち、配信履歴、フォーム回答、店舗情報、LINE公式アカウント認証情報の漏洩防止を最優先にします。

## 現状のstore_idベース設計

現在のアプリは主に `stores` と `store_members` を中心にした `store_id` 分離です。

- 業務テーブルは `store_id` を持つ
- RLSは `current_user_store_ids()` を使って所属店舗データのみ参照可能にしている
- 画面/APIでもログインユーザーの `store_id` を取得して絞り込んでいる

この方式は店舗単位のMVPには有効ですが、LINE単体パッケージからGARAGE LINK本体へアップグレードする契約単位管理には不足があります。そのため、今後は `tenant_id` を契約・会社単位の主キーとして追加します。

## tenant_idへの段階移行方針

破壊的変更を避けるため、一括置換はしません。

フェーズ1:

- `tenants` を追加
- `tenant_features` を追加
- `memberships` を追加
- `stores.tenant_id` を追加
- 既存 `stores` / `store_members` は残す
- 既存 `store_id` ベースの画面/API/RLSは維持

フェーズ2:

- 主要業務テーブルに `tenant_id`, `created_by`, `updated_by` を追加
- 既存 `store_id` は必要なテーブルに残す
- APIは `tenant_id` と `store_id` の両方を検証する

フェーズ3:

- RLSを `tenant_id` 主軸へ移行
- `store_id` は店舗・拠点単位の絞り込みに限定
- `store_members` から `memberships` へ段階移行

## RLS方針

すべての業務テーブルでRLSを有効化します。

基本方針:

- ログイン済みユーザーのみアクセス可能
- 自分が所属する `tenant_id` のデータのみ参照可能
- 自分が所属する `tenant_id` のデータのみ作成・更新可能
- 削除はowner/adminのみ
- viewerは参照のみ
- staffは日常業務のみ
- owner/adminのみ設定変更可能

RLSヘルパー:

- `current_user_tenant_ids()`
- `current_user_role_for_tenant(target_tenant_id uuid)`
- `has_tenant_feature(target_tenant_id uuid, feature_code text)`

## 権限管理方針

roleは以下に統一します。

- `owner`
- `admin`
- `staff`
- `viewer`

owner:

- 全操作可能
- 契約変更
- ユーザー招待
- 権限変更
- LINE連携設定
- データエクスポート
- 削除操作

admin:

- LINE設定
- 配信実行
- シナリオ編集
- フォーム編集
- リッチメニュー編集
- ユーザー管理の一部

staff:

- 友だち管理
- 問い合わせ対応
- 配信作成
- フォーム回答確認
- 顧客情報更新の一部

viewer:

- 閲覧のみ

以下はowner/admin以上に制限します。

- LINE公式アカウント連携
- Channel Secret登録・更新
- Channel Access Token登録・更新
- Webhook URL設定
- 配信実行
- 一斉配信
- 予約配信
- CSVエクスポート
- ユーザー招待
- 権限変更
- 契約・プラン変更
- データ削除

## Secret管理方針

以下は平文保存・画面表示・ログ出力を禁止します。

- LINE Channel Secret
- LINE Channel Access Token
- Webhook関連secret
- Supabase Service Role Key
- Stripe Secret Key
- 外部APIキー

方針:

- フロントエンドに返さない
- DB保存時は暗号化する
- 表示は `************abcd` 形式
- ログ、監査ログ、セキュリティイベントにsecretを含めない
- `NEXT_PUBLIC_` にsecretを入れない
- Service Role Keyはサーバー側限定

今後必要な環境変数:

- `APP_ENCRYPTION_KEY`
- `WEBHOOK_SIGNING_SECRET`
- `LINE_CHANNEL_SECRET`
- `LINE_CHANNEL_ACCESS_TOKEN`
- `SUPABASE_SERVICE_ROLE_KEY`

## Webhook署名検証方針

LINE Webhookはraw bodyを使って署名検証します。

- JSON parse前の `request.text()` を使う
- `x-line-signature` を検証する
- DBに暗号化保存された `line_settings.channel_secret_encrypted` を優先して検証する
- 移行前互換として、既存の `line_settings.channel_secret` とサーバー環境変数 `LINE_CHANNEL_SECRET` は一時的な fallback とする
- 本番環境で検証可能なChannel Secretが1つも無ければ500
- `LINE_CHANNEL_SECRET` 環境変数fallbackは単一tenant互換のための暫定措置
- fallback使用時は `security_events.webhook_env_secret_fallback_used` に記録する
- `LINE_WEBHOOK_DISABLE_ENV_SECRET_FALLBACK=true` でfallbackを無効化できる
- 本番マルチテナント運用前にfallbackを無効化し、暗号化済みChannel Secretのみへ寄せる
- 署名不一致なら403
- 署名不一致時はイベント処理しない
- 署名不一致時は `security_events` に保存する
- 開発環境で署名検証をスキップする場合は `LINE_WEBHOOK_ALLOW_INSECURE_DEV=true` を明示的に設定する

## LINE Secret暗号化方針

第2段階では、既存 `line_settings` に暗号化カラムを追加します。

- `channel_secret_encrypted`
- `channel_access_token_encrypted`
- `channel_secret_last4`
- `channel_access_token_last4`
- `secret_encrypted_at`
- `token_encrypted_at`
- `secret_rotated_at`
- `token_rotated_at`

暗号化はサーバー側のみで行います。

- 暗号方式は AES-256-GCM
- 暗号化キーは `APP_ENCRYPTION_KEY`
- フロントエンドは暗号化・復号しない
- APIレスポンスには平文・暗号文を返さない
- 画面には `************abcd` 形式のマスクのみ表示する
- 空欄保存時は既存secret/tokenを維持する
- 入力がある場合のみ暗号化して更新する

既存平文カラム `channel_secret` / `channel_access_token` は段階移行のため残します。
本番データの自動NULL化はバックアップ前に行うと復旧が難しいため、この段階では行いません。
移行完了後、サーバー側の明示的な移行処理で暗号化保存し、検証後に平文カラムをNULL化します。
保守用API `/api/line/settings/migrate-secrets` は、owner/adminのみ、確認文字列 `ENCRYPT_LEGACY_LINE_SECRETS` を指定した場合だけ実行できます。

`authenticated` ロールからは、平文カラム・暗号化カラムを直接select/updateできない列権限へ寄せます。
Secret更新は、ログイン・所属店舗・roleを確認したサーバーAPIだけが行います。

## 監査ログ方針

重要操作は `audit_logs` に保存します。

対象:

- ログイン
- ログアウト
- LINE連携設定変更
- Channel Secret更新
- Channel Access Token更新
- Webhook設定変更
- ユーザー招待
- 権限変更
- メッセージ作成
- メッセージ配信実行
- テスト配信
- 配信前確認
- 配信失敗
- CSVインポート
- CSVエクスポート
- データ削除

注意:

- metadataにsecretを保存しない
- 個人情報は必要最小限にする
- `metadata` / `before_data` / `after_data` は保存前にredactionを通す
- 問い合わせ本文、フォーム回答全文、メッセージ本文全文は監査ログに保存しない

## セキュリティイベント方針

不審操作は `security_events` に保存します。

対象:

- `webhook_signature_invalid`
- `webhook_secret_missing`
- `tenant_access_denied`
- `role_access_denied`
- `feature_access_denied`
- `rate_limit_exceeded`
- `suspicious_request`
- `cross_tenant_delivery_blocked`
- `delivery_rate_limited`
- `delivery_target_mismatch`
- `line_token_decrypt_failed`
- `line_token_missing`
- `export_access_denied`
- `import_access_denied`
- `cross_tenant_export_blocked`
- `cross_tenant_import_blocked`
- `large_export_requested`
- `csv_formula_injection_detected`
- `csv_invalid_format`
- `csv_import_rate_limited`
- `csv_export_rate_limited`
- `file_upload_rejected`
- `file_upload_rate_limited`
- `file_access_denied`
- `file_delete_denied`
- `file_type_rejected`
- `file_size_rejected`
- `cross_tenant_file_access_blocked`

detailsにはsecretや個人情報を保存しません。
`secret`、`token`、`email`、`phone`、`address`、`name`、`line_user_id`、`message`、`body`、`raw_event`、`form_answer`、`csv`、`file` などのkeyは保存前にredactionします。

## LINE配信安全化方針

LINE配信は「作成」と「実行」を分けます。

1. 下書き作成
2. 対象人数と条件の計算
3. テスト配信
4. 配信前確認
5. owner/adminのみ本配信
6. 送信結果と監査ログ保存

本配信APIでは以下を必須にします。

- ログイン済み
- 所属店舗一致
- `line` feature有効
- roleがowner/admin
- 配信対象が同じ店舗に属するLINE友だちであること
- 配信前確認済み
- 確認時と実行時の対象人数が大きく変わっていないこと
- Channel Access Tokenを安全に取得・復号できること

staffは本配信不可です。APIを直接叩いた場合も403を返し、`security_events.role_access_denied` に記録します。

即時配信上限は初期値500件です。大量配信は予約配信・分割配信・追加確認へ進めます。

テスト配信ログは `line_test_delivery_logs`、本配信集計ログは `line_delivery_logs` に保存します。
新規の送信ログでは、本文全文とLINE userIdを保存しません。
代わりに以下を保存します。

- `body_hash`
- `body_length`
- `line_user_hash`
- `message_type`
- `send_status`
- `sent_at`

業務上、実際の本文確認が必要な場合は `line_message_drafts` を参照します。
監査ログ・セキュリティログ・配信集計ログには本文全文を残しません。

## Webhookログ最小化方針

LINE Webhook受信ログでは、raw event全体を保存しません。
新規保存では以下の最小項目に限定します。

- `tenant_id`
- `store_id`
- `event_id`
- `event_type`
- `source_type`
- `source_user_hash`
- `message_type`
- `raw_event_hash`
- `signature_valid`
- `processed`
- `status`
- `received_at`

保存しないもの:

- raw event全体
- LINE userIdそのもの
- メッセージ本文全文
- 画像URL
- フォーム回答全文
- Channel Secret
- Access Token

既存互換カラムとして `line_user_id`、`message_text`、`raw_event` は残します。
ただし新規Webhook保存では `line_user_id` と `message_text` は `null`、`raw_event` は最小メタデータとhashのみを保存します。

## フォーム回答・問い合わせ本文の扱い

`line_form_answers` / `line_form_responses` に相当する回答データは、氏名、電話番号、住所、相談内容、車両情報などを含む可能性が高いため、CSV export対象外です。
将来実装する場合も、owner限定、対象件数表示、追加確認、監査ログ記録、保持期間の明示を必須にします。

問い合わせ本文は業務テーブルに保存する場合がありますが、audit_logs / security_events / export logs には全文を保存しません。
viewerには必要に応じてマスク表示する方針です。

## データ保持期間方針

初期方針:

- `security_events`: 180日〜1年
- `audit_logs`: 1年
- `line_webhook_events`: 30日〜90日
- `line_message_logs`: 90日〜180日
- `line_form_answers`: 業務上必要期間。ただしexport制限
- `uploaded_files`: 論理削除・削除履歴方針に従う

自動削除は未実装です。
本番前に、保持期間に応じた削除・マスク用SQLまたは定期ジョブを追加してください。

## 既存PIIデータ整理方針

第6段階以降の新規保存では、Webhook raw payload、LINE userId、メッセージ本文全文をログへ残さない方針に寄せています。
ただし、過去データには以下が残っている可能性があります。

- `line_webhook_events.message_text`
- `line_webhook_events.raw_event`
- `line_webhook_events.line_user_id`
- `line_message_logs.body`
- `line_message_logs.line_user_id`
- `audit_logs.metadata` / `before_data` / `after_data`
- `security_events.details`

本番でいきなり削除・マスクしません。
`docs/staging-migration-checklist.md` と `supabase/schema/028_legacy_pii_cleanup_plan.sql` を使い、stagingで対象件数と業務影響を確認してから本番適用可否を判断します。

cleanupの優先順位:

1. Webhookログの本文、LINE userId、full raw payload
2. 送信ログの本文、LINE userId、LINE表示名
3. 監査ログ・security logに過去混入した本文・個人情報key

削除しない業務データ:

- `line_message_drafts.body`
- `line_form_responses.answers`
- 問い合わせ本文
- `customers` の顧客台帳情報

これらは顧客対応に必要な業務データです。
CSV export・ログ保存・閲覧権限を制限し、不要なログ転記を禁止することで保護します。

retention実装候補:

- Supabase Scheduled Functions
- `pg_cron`
- Vercel Cron
- 管理画面からの手動削除

Vercel Cronやメモリベース処理だけではDB内保持期間管理として不十分な場合があります。
本番ではSupabase側の定期処理または外部ジョブ管理を優先して検討します。

## CSV import/export安全化方針

CSVは顧客情報やLINE友だち情報を大量に持ち出せるため、フロントの表示制御だけに依存しません。
CSV操作APIでは、ログインユーザーの所属店舗とroleをサーバー側で解決し、CSV内の `tenant_id` / `store_id` / `role` / `owner` / `admin` は信用しません。

初期対応範囲:

- `customers` export
- `customers` import preview / commit
- `vehicles` export
- `vehicles` import preview / commit
- `line_friends` 最小項目export

`line_form_answers` は自由入力の個人情報が多いため、この段階ではAPIを作成しません。
次フェーズ以降でowner限定、対象件数表示、追加確認、保持期間整理を前提に検討します。

権限:

- owner/adminのみCSV import/export可能
- staff/viewer/implementerはCSV操作不可
- 権限不足時は403を返し、`security_events` に記録する

export:

- サーバー側で所属 `store_id` を固定する
- `tenant_id` 列があるテーブルは所属 `tenant_id` でも絞り込む
- 出力上限は初期値5,000件
- 大量exportは拒否し、`large_export_requested` を記録する
- CSV本文はログに保存しない
- 文字列セルはCSV式インジェクション対策として危険な先頭文字に `'` を付与する

import:

- preview / commit の2段階
- previewではDB保存しない
- preview tokenを発行し、commit時に行ハッシュ・対象テーブル・store・user・期限を検証する
- 1回の取り込み上限は初期値1,000件
- CSV内の `tenant_id` / `store_id` は許可カラムに含めず拒否する
- 保存時はサーバー側の所属 `store_id` を付与する
- 既存 `customers` / `vehicles` にはまだ `tenant_id` / `created_by` / `updated_by` 列がないため、DB列への付与はtenant列追加フェーズで行う

ログ:

- `data_export_logs` に対象テーブル、件数、出力カラム、statusを保存する
- `data_import_logs` に対象テーブル、件数、成功件数、失敗件数、statusを保存する
- CSV本文、顧客名、電話番号、住所、メール、LINE userId、フォーム回答全文、問い合わせ本文、Secret、Access Tokenは保存しない

レート制限:

- export: 10回 / 1時間
- import preview: 20回 / 1時間
- import commit: 5回 / 1時間

現状はメモリベースの簡易rate limitです。
Vercel本番ではインスタンス間で共有されないため、本番公開前にUpstash Redis等の外部ストア化が必要です。

## ファイルアップロード安全化方針

業務ファイルや顧客情報を含む可能性のある画像・CSV・添付ファイルは、原則private bucketに保存します。
公開URLをDBへ永続保存せず、表示時に短時間のsigned URLを発行します。

Storage bucket:

- `company-assets`: 原則すべての業務ファイルを保存するprivate bucket（本番既存）
- `garage-public-assets`: 公開してよいLP素材などに限定。顧客情報や業務ファイルは置かない

保存pathはサーバー側で生成します。

- `tenants/{tenant_id}/stores/{store_id}/company/logo/{uuid}.png`
- `tenants/{tenant_id}/stores/{store_id}/company/seal/{uuid}.png`
- `tenants/{tenant_id}/stores/{store_id}/vehicles/{vehicle_id}/{uuid}.jpg`
- `tenants/{tenant_id}/stores/{store_id}/line/rich-menus/{uuid}.png`
- `tenants/{tenant_id}/stores/{store_id}/imports/{uuid}.csv`

禁止:

- ユーザー入力ファイル名をStorage pathに使う
- `tenant_id` / `store_id` なしのpath
- public bucketにCSV・顧客添付・車両画像・帳票画像を保存する
- signed URLをDBに保存する

アップロードAPI:

- `/api/storage/upload`
- owner/admin/staff/implementerのみ許可
- viewerは不可
- `company-assets` 固定
- MIME type、拡張子、サイズを検証
- pathはUUIDで生成
- `uploaded_files` にメタデータを保存
- `audit_logs.file_uploaded` を記録

signed URL API:

- `/api/storage/signed-url`
- tenant/store所属確認必須
- `uploaded_files` に存在し、削除されていないファイルのみ発行
- pathが `tenants/{tenant_id}/stores/{store_id}/` 配下か確認
- 有効期限は5分
- `audit_logs.file_signed_url_created` を記録

削除API:

- `/api/storage/delete`
- owner/adminのみ許可
- tenant/store所属とpath scopeを確認
- `uploaded_files.deleted_at` / `deleted_by` を更新
- Storage objectの削除を試行
- `audit_logs.file_deleted` を記録

サイズ制限:

- 画像: 5MB
- CSV: 2MB
- PDF: 10MB

画像再エンコード:

- 現段階ではMIME type・拡張子・サイズ制限・private保存を優先
- 本番前にSharp等で画像再エンコードし、EXIF/メタデータ除去を行うことを推奨

レート制限:

- file upload: 30回 / 1時間
- 現状はメモリベースの簡易rate limit
- Vercel本番ではUpstash Redis等の外部ストア化が必要

## 今後の実装フェーズ

1. tenant基盤追加
2. Webhook署名検証強化
3. LINE Secret暗号化保存
4. LINE設定画面でsecretを返さない修正
5. tenant_id主軸のRLSへ段階移行
6. 配信前確認・テスト配信
7. CSV import/export対策
8. ファイルアップロード制限
9. tenant分離・Webhook・Secret非表示テスト
10. LINE単体パッケージ課金・配信数制御

## LINE単体パッケージ課金・配信数制御

第12段階で、LINE単体パッケージのFREE / LINE BASIC / LINE AUTOプランと、通数無制限オプションの設計を追加した。

セキュリティ方針:

- 課金ログはtenant単位で集計する
- AUTOの複数店舗でもtenant単位で月間通数を集計する
- FREEでは月間1,000通を超える配信を拒否する
- LINE BASIC / LINE AUTOでは超過見込みを配信前確認に表示する
- 通数無制限オプション中は本サービス上の配信通数上限を無制限にする
- 課金ログに本文、LINE userId、顧客名、電話番号、住所、メール、Secret、Tokenを保存しない
- LINE公式アカウント側の料金・配信通数は別途発生する可能性を画面に表示する

追加migration案:

- `supabase/schema/029_line_plan_billing.sql`

本番DBへ直接適用せず、stagingで022〜028の確認後に適用する。
