# 解約データ削除 Cron（1日1回）

解約から1年経過した店舗データを自動削除します。

## 自動実行（本番）

**Vercel Cron** で 1日1回実行されます（`vercel.json` 登録済み）。

| 項目 | 値 |
|------|-----|
| パス | `GET /api/cron/purge-expired-store-data` |
| スケジュール | `0 1 * * *`（UTC）≈ **毎日 10:00 JST** |
| 認証 | `Authorization: Bearer ${CRON_SECRET}`（Vercel が自動付与） |

### 必須環境変数（Vercel 本番）

- `CRON_SECRET` — ランダムな長い文字列（車検案内 cron と共通）
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_SUPABASE_URL`

`CRON_SECRET` 未設定時は cron は **401** になり、削除は走りません。

### シークレットの追加

1. マスター `.env.secrets.local` に `CRON_SECRET=` を追加（✅ 2026-07-06 生成済）
2. `pnpm sync:env` で `apps/garage-link/.env.local` に反映（✅ 済）
3. **Vercel 本番**に同じ値を設定（下記）

### Vercel Dashboard で CRON_SECRET を設定

CLI が使えない場合は Dashboard から設定します（GARAGE LINK / L-LINK **両プロジェクト**）。

1. [Vercel Dashboard](https://vercel.com/) → 対象プロジェクト（`garage-link` / `l-link`）
2. **Settings → Environment Variables**
3. **Add**:
   - Name: `CRON_SECRET`
   - Value: `.env.secrets.local` の値（チャット・Markdown に貼らない）
   - Environment: **Production**（Preview でも cron テストするなら Preview も）
4. **Save** → **Redeploy**（環境変数は再デプロイ後に反映）

**注意**: GARAGE LINK の cron ジョブ（`vercel.json`）は GARAGE LINK プロジェクトのみ。L-LINK に将来 cron を追加する場合も同じ `CRON_SECRET` 値を共有可能。

CLI を使う場合: `projects/garage-link/stripe-webhook-production-guide.md` の「Vercel CLI」節を参照。

## 手動実行（確認用）

```bash
curl -X POST "https://<本番ドメイン>/api/cron/purge-expired-store-data" \
  -H "Authorization: Bearer ${CRON_SECRET}"
```

## ローカル開発

`pnpm dev` では cron は自動実行されません。上記 curl で手動確認してください。

## 関連

- migration: `supabase/migrations/20260706150000_subscription_retention.sql`
- RPC: `purge_expired_store_data()`
