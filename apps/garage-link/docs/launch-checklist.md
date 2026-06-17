# GARAGE LINK 本番前チェックリスト

GARAGE LINKを本番公開・顧客導入する前に確認する項目です。秘密情報やAPIキーは画面、ログ、ドキュメントに記載しないでください。

## 1. 基本設定

- 会社名、店舗名、住所、電話番号、メールアドレスが設定済み
- ロゴ画像と角印画像が設定済み
- 見積書備考、請求書備考、フッター文言が設定済み
- 銀行名、支店名、口座種別、口座番号、口座名義が設定済み
- 見積書・請求書プレビューで会社情報、ロゴ、角印が表示される

## 2. Supabase確認

- `stores` と `store_members` に本番店舗とownerユーザーが存在する
- `current_user_store_ids()` が所属店舗IDを返す
- 主要テーブルでRLSが有効
- owner/admin/staff/viewerで見えるデータが所属店舗に限定される
- `audit_logs` が作成済みで、操作履歴を確認できる
- 主要テーブルに `deleted_at` / `deleted_by` / `is_archived` がある
- 物理削除ではなく論理削除で一覧から非表示になる

## 3. Vercel確認

- GitHubの本番ブランチがVercelに接続されている
- Vercel Environment Variablesに必要項目を設定済み
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_APP_URL`
- 必要な場合のみ `SUPABASE_SERVICE_ROLE_KEY`
- LINE連携時のみ `LINE_CHANNEL_SECRET` / `LINE_CHANNEL_ACCESS_TOKEN`
- secret系を `NEXT_PUBLIC_` で始めていない
- `.env.local` はVercelへ自動反映されないため、Vercel側で手動設定する

## 4. Supabase Auth確認

- Site URLを本番URLに設定
- Redirect URLsに本番URL、`/login`、`/dashboard` を設定
- ローカル確認用に `http://localhost:3000` も必要に応じて残す
- 本番URLで新規登録、ログイン、ログアウトが動く

## 5. LINE Developers確認

- Webhook URLを `https://本番ドメイン/api/line/webhook` に設定
- Webhook利用をONにする
- Channel SecretをVercelの `LINE_CHANNEL_SECRET` に設定
- Channel Access TokenをVercelの `LINE_CHANNEL_ACCESS_TOKEN` に設定
- LINE設定画面でWebhook URLと接続状態を確認
- 送信テスト時にトークンやユーザーIDをログへ出していない

## 6. 権限確認

- ownerが最低1人存在する
- adminは店舗運用とメンバー管理ができる
- implementerはLINE構築と設定移行ができるがメンバー管理はできない
- staffは日常業務だけ操作できる
- viewerは保存、削除、発行、送信ができない
- 設定エクスポート / インポートはowner/admin/implementerのみ
- 監査ログ、ゴミ箱、セキュリティチェック、本番前チェックリストはowner/adminのみ

## 7. 車両・顧客・商談確認

- 車両を登録できる
- 車両一覧に表示される
- 車両詳細を編集できる
- 顧客を登録できる
- 顧客一覧に表示される
- 顧客詳細を編集できる
- 商談を登録できる
- 商談詳細に顧客情報と車両情報が表示される
- 商談詳細で車両差し替えができる
- 商談詳細から見積書、請求書、LINE案内へ進める

## 8. 帳票確認

- 商談詳細から見積書を作成できる
- 見積書プレビューがA4帳票として表示される
- ブラウザ印刷でPDF保存できる
- 商談詳細から請求書を作成できる
- 請求書プレビューがA4帳票として表示される
- 請求書に振込先が表示される
- 複数支払方法と下取り車両の表示を確認する
- 印刷時にサイドバーや操作ボタンが消える

## 9. LINE管理確認

- LINE管理トップが開く
- 友だち管理、タグ管理、テンプレート、一斉配信、シナリオ配信、回答フォーム、リッチメニュー、自動応答、流入経路が開く
- LINE設定を保存できる
- Webhook疎通確認ができる
- 商談詳細からLINE案内下書きを作成できる
- LINE下書き一覧に表示される
- Channel Access Token未設定時は送信エラーとして表示される

## 10. テスト確認

- `npm run lint` が成功
- `npm run build` が成功
- 主要URLが開く
- `/login`
- `/dashboard`
- `/vehicles`
- `/customers`
- `/deals`
- `/line`
- `/settings/env-check`
- `/settings/security-check`
- `/settings/launch-checklist`
- `/api/line/webhook`

## 11. 顧客導入前の最終確認

- 本番URLでログインできる
- owner/admin/staff/viewerの権限差が確認済み
- 会社情報と帳票設定が顧客名義になっている
- テストデータを削除またはアーカイブ済み
- ゴミ箱から復元できる
- 監査ログに操作履歴が残る
- 環境変数チェックで必要項目が設定済み
- セキュリティチェックで要対応項目がない
- 本番前チェックリストの手動確認項目を確認済み
