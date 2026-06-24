# GARAGE LINK 本番障害時の確認手順

本番（Vercel + Supabase）で障害が疑われるときに、原因を素早く切り分けるための導線です。
**前提: ログやスクリーンショットに、顧客情報・LINE Channel Secret / Access Token・Webhook本文・メッセージ本文・APP_ENCRYPTION_KEY・service_role keyを絶対に含めないこと。** 共有時は値をマスクしてください。

## 0. まずヘルスチェック

- `GET https://<本番ドメイン>/api/health`
  - 正常: `200 { "ok": true, "service": "garage-link" }`
  - DB到達不可: `503 { "ok": false, "service": "garage-link", "code": "db_unavailable" }`
  - 環境変数不足: `503 { "ok": false, "service": "garage-link", "code": "config_missing" }`
- Secretや設定値は返しません。外部公開して問題ないレスポンスです。
- `db_unavailable` が続く場合は Supabase 側（下記4）を確認します。

## 1. Vercel Deployment Logs（ビルド・デプロイ失敗）

- Vercel → 対象プロジェクト → Deployments → 該当デプロイ → Build Logs
- 画面が出ない / 500 が全ページで出る場合、まずデプロイが成功しているかを確認します。
- TypeScript/ビルドエラーはここに出ます（本番ビルドは型チェックを無効化していません）。

## 2. Vercel Functions Logs（API / SSRの実行時エラー）

- Vercel → 対象プロジェクト → Logs（Runtime Logs / Functions）
- アプリのサーバーログは `[garage-link:error]` プレフィックスの1行JSONで出力されます。
  - 例: `[garage-link:error] {"service":"garage-link","code":"storage_upload_failed","route":"/api/storage/upload","method":"POST","tenant_id":"...","store_id":"..."}`
  - 含まれるのは `code` / `route` / `method` / `tenant_id` / `store_id` のみ。本文・Secret・スタックトレースは含めません。
- `code` で失敗種別を切り分けます（下記「安全なエラーコード一覧」）。
- 画面に表示される「参照コード」（`error.digest`）は、このログと突き合わせるための識別子です。

## 3. 画面エラー（クライアント側）

- ユーザーには汎用メッセージと「参照コード」だけを表示します（スタックトレース・内部メッセージは出しません）。
- `error.tsx` … 各画面セグメントの予期しない例外のフォールバック。
- `global-error.tsx` … レイアウトレベルの致命的例外のフォールバック。
- ブラウザDevTools → Console に `[garage-link] unexpected ... error <digest>` が出ます（digestのみ）。

## 4. Supabase Logs（DB / RLS / PostgREST）

- Supabase Dashboard → Logs → 用途別:
  - **Postgres Logs**: SQLエラー、制約違反、RLS違反など。
  - **API (PostgREST) Logs**: REST経由のクエリ失敗（401/403/4xx/5xx）。
  - **Auth Logs**: ログイン・トークン関連。
- アプリログの `tenant_id` / `store_id` / 時刻を使って該当リクエストを突き合わせます。
- `db_unavailable`（health）や `db_insert_failed` / `db_update_failed` が出ているときの一次調査先です。

## 5. Storageエラー時の確認箇所

- 対象API: `/api/storage/upload`、`/api/storage/signed-url`、`/api/storage/delete`
- 失敗時のレスポンスは `{ ok:false, error, code }`。`code` で切り分けます:
  - `unauthorized` / `forbidden_no_membership` / `forbidden_role` … 認可・所属の問題。
  - `storage_config_missing` … サーバー側のStorage設定（service role未設定など）。
  - `storage_upload_failed` … Supabase Storageへの保存失敗（**private bucket `company-assets` の存在・権限**を確認）。
  - `signed_url_failed` … 署名URL発行失敗。
  - `db_insert_failed` / `db_update_failed` … `uploaded_files` への保存・更新失敗（Supabase Logs参照）。
  - `not_found` / `cross_tenant_blocked` … 対象なし / テナント・store scope外。
- Supabase Dashboard → Storage で `company-assets`（private）を確認します。
  - **`l-link-images` はL-LINK専用のpublic bucket。GARAGE LINKからは参照・変更しません。**
- 保存pathは必ず `tenants/{tenant_id}/stores/{store_id}/...` 形式です（034のCHECK制約）。

## 6. LINE関連の確認

- 対象API: `/api/line/*`。失敗時は `{ ok:false, error, code }`。
  - `webhook_secret_missing` … Webhook用のChannel Secretが未設定。
  - `webhook_signature_invalid` … 署名不一致（送信元・Secret不一致）。
  - `line_settings_read_failed` / `line_settings_save_failed` … LINE設定の取得・保存失敗。
  - `encryption_key_missing` … `APP_ENCRYPTION_KEY` 未設定（暗号化/復号不可）。
  - `line_send_error` … 配信処理の失敗。
- `security_events` テーブルにも署名不一致・権限不足などが記録されます（本文・Secretは保存しません）。

## 安全なエラーコード一覧（抜粋）

| code | 区分 | 主な原因 |
|---|---|---|
| `unauthorized` | 認可 | 未ログイン |
| `forbidden_no_membership` | 認可 | 所属store/tenant未取得 |
| `forbidden_role` | 認可 | ロール権限不足 |
| `storage_config_missing` | 設定 | サーバーStorage設定不足 |
| `storage_upload_failed` | Storage | bucketへの保存失敗 |
| `signed_url_failed` | Storage | 署名URL発行失敗 |
| `db_insert_failed` / `db_update_failed` | DB | `uploaded_files` 保存・更新失敗 |
| `not_found` / `cross_tenant_blocked` | データ | 対象なし / scope外 |
| `db_unavailable` / `config_missing` | health | DB到達不可 / 環境変数不足 |
| `webhook_secret_missing` / `webhook_signature_invalid` | LINE | Webhook設定・署名 |
| `line_settings_read_failed` / `line_settings_save_failed` / `encryption_key_missing` / `line_send_error` | LINE | 設定・暗号化・配信 |

## やってはいけないこと

- ログ・課題チケット・スクリーンショットに Secret / Token / 顧客個人情報 / メッセージ本文 / Webhook本文を貼らない。
- `.env.local` / Vercel環境変数 / service_role key を共有しない。
- `l-link-images` bucket を変更・削除・公開設定変更しない。
