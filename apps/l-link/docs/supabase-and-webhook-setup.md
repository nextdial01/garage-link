# L-Link Supabase / LINE Webhook 設定手順

本番Supabase DBへ直接SQLを適用しないでください。まずローカルまたはstaging Supabaseで検証します。

## SQL適用

対象SQL:

```txt
apps/l-link/supabase/schema/010_l_link_core.sql
```

Supabase SQL EditorまたはCLIで、staging環境に適用します。このSQLは複数回実行できるように以下を使います。

- `create table if not exists`
- `alter table ... add column if not exists`
- `create index if not exists`
- `drop policy if exists` → `create policy`
- `create or replace function`
- `drop trigger if exists` → `create trigger`

初期スコープでは商品・決済系を作成しません。

- `ll_products`
- `ll_orders`
- `ll_payments`
- `ll_product_pages`
- `ll_affiliates`

## RLS前提

L-Linkは `company_id` 単位でデータを分離します。`ll_staff_roles` にログインユーザーの `user_id`、`company_id`、`role`、`status='active'` を登録してから通常画面を確認します。

RLSの基本方針:

- 自社のデータのみ閲覧可能
- `owner` / `admin` / `staff` は基本操作可能
- `viewer` は閲覧中心
- LINE接続設定、スタッフ、権限は `owner` / `admin` 中心
- Webhook保存はサーバー側処理で行う
- service role keyはクライアントに出さない

## LINE Developers設定

1. LINE Developersでチャネルを作成します。
2. Messaging API設定からChannel secretを確認します。
3. Channel access tokenを発行します。
4. L-Linkの `/settings/line` に以下を保存します。
   - LINE公式アカウント名
   - Channel ID
   - Basic ID
   - LINE Bot User ID / destination
   - Channel secret
   - Channel access token
   - Webhook URL
5. Secret / Tokenは画面に平文表示されません。

## Webhook URL

ローカル検証ではLINEからlocalhostへ直接送れないため、ngrokなどのトンネルが必要です。

例:

```txt
https://xxxx.ngrok-free.app/api/line/webhook
```

Vercel本番時:

```txt
https://your-l-link-domain.com/api/line/webhook
```

LINE DevelopersでWebhook URLを設定し、Webhook利用をONにします。

## Webhook検証

Webhook処理では以下を守ります。

- raw bodyで `x-line-signature` を検証する
- JSON parse後のデータで署名検証しない
- Channel secretはDBの暗号化値を優先する
- 環境変数fallbackは検証用互換としてのみ扱う
- raw_event全体は保存しない
- `raw_event_hash`、`event_type`、`source_user_hash`、`received_at` などで追跡する
- Token / Secretをログ、画面、エラーに出さない

## 個人情報

友だち情報には氏名、電話番号、メール、住所、車検満了日、問い合わせ種別などが含まれる可能性があります。

- 監査ログ/securityログに本文や個人情報を保存しない
- フォーム回答や問い合わせ本文のexportは別途権限制御を設ける
- 削除/退会時のマスク・保持期間は次フェーズで運用ルール化する
