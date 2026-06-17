# GARAGE LINK security test plan

このドキュメントは、第1〜第6.5段階で追加したセキュリティ対策を壊さないためのテスト計画です。
本番DBには接続せず、まず静的・ユニットテストで壊れやすい処理を確認します。
RLSやtenant分離の実動作は、staging Supabaseで別途必ず確認します。

## 自動テスト

実行:

```bash
npm run test:security
```

対象:

- CSV式インジェクション対策
- CSV preview tokenのstore/user/row hash検証
- CSV許可カラム検証
- LINE Secret暗号化・マスク
- LINE設定APIレスポンス契約の静的確認
- LINE設定画面が既存secret/tokenをform stateへ保持しない確認
- Webhook署名検証
- LINE配信権限・対象人数安全化
- Storage path / MIME / 拡張子 / サイズ検証
- Redaction / security event detailsのPII除去
- line_friends exportの最小項目契約

## staging Supabaseで必須の手動/実DBテスト

### tenant分離

- A社ユーザーがA社データを見られる
- A社ユーザーがB社customersを見られない
- A社ユーザーがB社vehiclesを見られない
- A社ユーザーがB社line_friendsをexportできない
- A社ユーザーがB社uploaded_filesのsigned URLを発行できない
- A社ユーザーがB社data_export_logsを見られない
- A社ユーザーがB社line_delivery_logsを見られない

### role権限制御

- ownerはLINE設定・配信・CSV・Storage操作ができる
- adminはLINE設定・配信・CSV・Storage操作ができる
- staffは本配信不可
- staffはCSV export/import不可
- viewerはupload不可
- viewerはCSV不可
- viewerは配信不可
- API直叩きでも403になる

### LINE Secret非返却

- `/api/line/settings` が `channel_secret` を返さない
- `/api/line/settings` が `channel_access_token` を返さない
- `/api/line/settings` が `channel_secret_encrypted` を返さない
- `/api/line/settings` が `channel_access_token_encrypted` を返さない
- 空欄保存時は既存secret/tokenが維持される
- 入力ありの場合のみ暗号化更新される

### Webhook署名検証

- 正しい署名なら処理される
- 不正署名なら403
- 署名なしなら拒否
- 本番設定でChannel Secret未設定なら安全側で失敗
- 署名不一致時に `security_events` へ記録される
- 署名不一致時に `raw_event` や `message_text` が保存されない

### LINE配信安全化

- confirmなしでsend不可
- `target_count_snapshot` なしでsend不可
- 確認時と送信時で対象数が大きく変わると再確認
- staff/viewerの本配信API直叩きは403
- 別tenantのline_friendが混ざると `cross_tenant_delivery_blocked`
- テスト配信は本配信ログに混ざらない
- `line_token_missing` / `line_token_decrypt_failed` が `security_events` に記録される

### CSV import/export

- owner/adminはcustomers export可能
- staff/viewerはcustomers export不可
- owner/adminはvehicles import preview可能
- previewなしcommit不可
- preview token期限切れならcommit不可
- preview tokenのstore/user/row hashが違うとcommit不可
- CSV内の `tenant_id` / `store_id` は信用されない
- CSV式インジェクションが無害化される
- line_friends exportに `line_user_id` が含まれない
- line_form_answers / line_form_responses export APIが存在しない
- export/import logsにCSV本文や個人情報が残らない

### Storage / signed URL

- 未ログインはupload不可
- viewerはupload不可
- 許可外MIME typeはupload不可
- 許可外拡張子はupload不可
- サイズ超過はupload不可
- pathに `tenant_id` / `store_id` が含まれる
- ユーザー入力ファイル名がpathに使われない
- A社ユーザーがB社fileのsigned URLを発行できない
- signed URLは短時間のみ有効
- public bucketにCSVや顧客添付が保存されない
- `file_deleted` が `audit_logs` に残る
- `file_access_denied` が `security_events` に残る

### Redaction / PII混入防止

- `logSecurityEvent` に `message_text` を渡してもredactされる
- `logSecurityEvent` にphone/email/addressを渡してもredactされる
- `logSecurityEvent` にline_user_idを渡してもredactされる
- `logAudit` にSecretやTokenが保存されない
- Webhook署名不一致ログにraw_eventが保存されない
- CSV export logに顧客名・電話番号・住所が保存されない
- Storage logにファイル内容やCSV本文が保存されない

## 残る注意点

- 現在の自動テストは実DB RLSを検証しない
- 022〜027 migrationはstaging Supabaseで実適用確認が必要
- 028 cleanup planは件数確認から始め、本番でいきなりUPDATEを有効化しない
- Vercel本番ではメモリベースrate limitが不十分なため、Upstash Redis等の外部ストア化が必要
