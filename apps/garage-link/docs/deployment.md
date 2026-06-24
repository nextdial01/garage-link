# GARAGE LINK デプロイ手順

GARAGE LINKをVercelへ本番公開する前に確認する手順です。secret系の値はGitHubへ上げず、VercelのEnvironment Variablesで管理してください。

## 1. GitHubにpush

1. ローカルで `npm run lint` と `tsc --noEmit` が通ることを確認します。
2. 変更をGitHubリポジトリへpushします。
3. `.env.local` はコミットしません。

## 2. Vercelプロジェクト作成

1. Vercelで新規Projectを作成します。
2. GitHubリポジトリを選択します。
3. Framework PresetはNext.jsを選択します。
4. Build Commandは通常 `next build` のままで進めます。

## 3. Environment Variables設定

VercelのProject SettingsからEnvironment Variablesを設定します。

`.env.local` はVercelに自動反映されません。ローカルの値を必要に応じてVercel側へ手動設定してください。

### Vercelに設定する環境変数

必須:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_APP_URL`

サーバー側のみ:

- `SUPABASE_SERVICE_ROLE_KEY`

LINE連携時:

- `LINE_CHANNEL_SECRET`
- `LINE_CHANNEL_ACCESS_TOKEN`
- `APP_ENCRYPTION_KEY`
- `LINE_WEBHOOK_DISABLE_ENV_SECRET_FALLBACK`

E2Eは本番Vercelには不要:

- `E2E_TEST_EMAIL`
- `E2E_TEST_PASSWORD`

注意:

- `NEXT_PUBLIC_` から始まる値はブラウザに公開されます。
- `SUPABASE_SERVICE_ROLE_KEY` は絶対に `NEXT_PUBLIC_` にしないでください。
- LINE Channel Access Tokenは画面やログに出さないでください。

## 4. Supabase URL / Anon Key設定

以下を設定します。

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

`NEXT_PUBLIC_` から始まる値はブラウザに公開されます。公開されて問題ない値だけにしてください。

## 5. Service Role KeyはServer専用

必要な場合だけ、以下をVercelに設定します。

- `SUPABASE_SERVICE_ROLE_KEY`

注意:

- フロントエンドコードで使わない。
- 画面やログに表示しない。
- API Routeなどサーバー側処理だけで使う。

## 6. LINE Channel Secret / Access Token設定

LINE連携を使う場合は以下を設定します。

- `LINE_CHANNEL_SECRET`
- `LINE_CHANNEL_ACCESS_TOKEN`
- `APP_ENCRYPTION_KEY`

注意:

- 画面やログに表示しない。
- GitHubに上げない。
- LINE Messaging APIの実送信実装時も、サーバー側だけで利用する。
- マルチテナント本番では、暗号化済みChannel Secretを使い、`LINE_WEBHOOK_DISABLE_ENV_SECRET_FALLBACK=true` で環境変数fallbackを無効化する。

## 7. NEXT_PUBLIC_APP_URLを本番URLに設定

本番URLを設定します。

- `NEXT_PUBLIC_APP_URL=https://your-domain.com`

ローカルでは以下で構いません。

- `NEXT_PUBLIC_APP_URL=http://localhost:3000`

## 8. Supabase AuthenticationのSite URL設定

Supabase DashboardでAuthentication設定を開きます。

Site URL:

- `https://your-domain.com`
- `https://本番ドメイン`

## 9. Redirect URLs設定

Supabase AuthenticationのRedirect URLsに以下を追加します。

- `https://your-domain.com`
- `https://your-domain.com/login`
- `https://your-domain.com/dashboard`
- `https://本番ドメイン`
- `https://本番ドメイン/login`
- `https://本番ドメイン/dashboard`

ローカル確認も使う場合:

- `http://localhost:3000`
- `http://localhost:3000/login`
- `http://localhost:3000/dashboard`

## 10. LINE DevelopersのWebhook URL設定

LINE DevelopersのWebhook URLに本番URLを設定します。

本番Webhook URL例:

- `https://your-domain.com/api/line/webhook`
- `https://本番ドメイン/api/line/webhook`

開発中のローカル例:

- `http://localhost:3000/api/line/webhook`

本番ではWebhook利用を有効化し、署名検証に必要な `LINE_CHANNEL_SECRET` が設定されていることを確認してください。

LINE Developers設定:

- Webhook URL: `https://本番ドメイン/api/line/webhook`
- Webhook利用: ON
- 応答メッセージ: 運用方針に応じてON/OFF
- チャネルアクセストークン: Vercel環境変数 `LINE_CHANNEL_ACCESS_TOKEN` に設定
- チャネルシークレット: Vercel環境変数 `LINE_CHANNEL_SECRET` に設定

## 11. Supabase Storage bucket設定

Supabase Storageで以下のbucketを使用します。

- `company-assets`（本番の既存private bucket。新規作成不要）
- `garage-public-assets`

推奨設定:

- `company-assets`: private
- `garage-public-assets`: publicでも可。ただし顧客情報・業務ファイル・CSV・車両画像・帳票画像は置かない

GARAGE LINKの業務ファイルは原則 `company-assets` に保存します。
画像や帳票ロゴの表示は `/api/storage/signed-url` で短時間のsigned URLを発行します。
※ `l-link-images` はL-LINK専用のpublic bucketのため、GARAGE LINKからは使用・変更しません。

## 12. 本番確認URL

公開後、以下を確認します。

- `/`
- `/login`
- `/dashboard`
- `/vehicles`
- `/customers`
- `/deals`
- `/line`
- `/settings/env-check`
- `/settings/security-check`
- `/api/settings/env-check`
- `/api/line/webhook`
- `/api/storage/signed-url`

確認ポイント:

- ログインできる。
- ダッシュボードが開く。
- 車両管理が開く。
- LINE管理が開く。
- 500エラーが出ない。
- `Application error` が出ない。
- 環境変数チェックで設定済み / 未設定だけが表示される。
- secret値そのものが画面に表示されない。
- Webhook APIが `{ ok: true }` を返す。
- private bucketの画像がsigned URL経由で表示される。

## 13. rollback方法

問題が起きた場合は、VercelのDeploymentsから直前の安定版へRollbackします。

1. Vercel Projectを開く。
2. Deploymentsを開く。
3. 安定していたDeploymentを選択する。
4. Promote to ProductionまたはRollbackを実行する。

同時に確認すること:

- Environment Variablesを変更していないか。
- Supabase側でSQLやRLSを変更していないか。
- LINE DevelopersのWebhook URLを変更していないか。

## 本番前の最終チェック

- `.env.local` がGitHubに上がっていない。
- Vercelに必要なEnvironment Variablesが設定されている。
- Supabase RLSが有効。
- `owner` アカウントが最低1つ残っている。
- 削除は論理削除を基本にしている。
- 監査ログが記録される。
- secret系の値が画面・ログ・エクスポートに含まれない。
