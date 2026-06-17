# GARAGE LINK Monorepo

GARAGE LINKとL-Linkを同じリポジトリで管理するためのモノレポです。

## Apps

- `apps/garage-link`: 在庫管理SaaS「GARAGE LINK」
- `apps/l-link`: LINE外部ツールSaaS「L-Link」の内部検証用アプリ

`L-touring` は、L-Linkを使ったバイク・車屋向けLINE構築運用代行サービスとして扱います。現時点では独立アプリは作成していません。

## Packages

- `packages/ui`: 共通UIコンポーネント
- `packages/auth`: 認証・権限まわりの共通化土台
- `packages/database`: Supabaseクライアント・DB型定義の共通化土台
- `packages/billing`: GARAGE LINK / L-Linkの料金プラン定義
- `packages/config`: プロダクト名やテーマ値などの共通設定

## Setup

```bash
pnpm install
```

`.env.local` の値はGitにコミットしないでください。`NEXT_PUBLIC_` から始まる値以外のSecretはブラウザに公開しないでください。

GARAGE LINKは `apps/garage-link` 配下のNext.jsアプリとして動きます。ローカルでは `apps/garage-link/.env.local` に環境変数を置くか、ルートの `.env.local` を参照できるようにしてください。

## Development

GARAGE LINK:

```bash
pnpm dev:garage-link
```

L-Link:

```bash
pnpm dev:l-link
```

## Build / Check

全アプリ:

```bash
pnpm lint
pnpm typecheck
pnpm build
```

GARAGE LINKのプラン・契約機能を含む検証:

```bash
pnpm test:billing:garage-link
pnpm test:e2e:garage-link
pnpm verify:garage-link
```

`verify:garage-link` は以下を順に実行します。

```bash
pnpm lint
pnpm typecheck
pnpm build
pnpm test:billing:garage-link
pnpm test:e2e:garage-link
```

`test:billing:garage-link` はポート待受が不要な静的/ロジックテストです。GARAGE LINKの料金プラン定義、車両登録上限、見積・請求上限、L-Link連携可否、ストレージ上限、現在庫カウント対象ステータス、`030_company_billing_requests.sql` の契約テーブル・申込テーブル・`completed_at`・`complete_plan_change_request` RPC定義を確認します。

`test:e2e:garage-link` はPlaywrightで実画面と検証用Supabaseを使う破壊的E2Eです。必要な環境変数が揃っていない場合はskipします。

GARAGE LINKのみ:

```bash
pnpm build:garage-link
```

L-Linkのみ:

```bash
pnpm build:l-link
```

## GARAGE LINK Billing E2E

プラン・契約E2Eは、検証用SupabaseとローカルのGARAGE LINK画面を使って以下を確認します。

- `/settings/billing` でFree契約が自動作成される
- Starterへのプラン変更申込が `plan_change_requests` に `pending` で保存される
- `/admin/plan-requests` で `completed` にすると `company_subscriptions` に反映される
- `completed_at` が保存される
- `completed_at` 済み申込の二重反映が起きない
- Standard変更後に `l_link_integration_enabled=true` になり `/settings/l-link` の導線が有効になる
- スタッフ追加、店舗追加、ストレージ追加がcompleted後に加算される

実行条件:

```bash
export E2E_ALLOW_BILLING_MUTATIONS=true
export E2E_CONFIRM_TEST_SUPABASE=true # Hosted Supabaseを使う場合のみ。localhostでは不要
export E2E_TEST_SUPABASE_URL=http://127.0.0.1:54321
export E2E_TEST_SUPABASE_ANON_KEY=...
export E2E_TEST_SUPABASE_SERVICE_ROLE_KEY=...
export E2E_EMAIL=owner@example.com
export E2E_PASSWORD=...
export PLAYWRIGHT_BASE_URL=http://localhost:3000

pnpm dev:garage-link
# 別ターミナル
pnpm test:e2e:garage-link
```

`E2E_ALLOW_BILLING_MUTATIONS=true` は、検証用DBに対して契約・申込・車両・帳票などのテストデータを書き換える許可です。本番Supabaseでは絶対に設定しないでください。

Hosted Supabaseを使う場合は `E2E_CONFIRM_TEST_SUPABASE=true` がないとE2Eは停止します。また、`E2E_TEST_SUPABASE_URL` に `prod` / `production` / `prd` が含まれる場合は安全のため停止します。

## Local Supabase / SQL

本番Supabase DBへSQLを直接適用しないでください。まずローカルSupabaseまたは検証用Supabaseで確認します。

ローカルSupabaseを使う場合の前提:

- Supabase CLI
- Docker
- `apps/garage-link/supabase/schema/*.sql` を順番に適用できる検証DB

例:

```bash
supabase start
supabase db reset
```

`030_company_billing_requests.sql` は再実行可能な書き方にしています。

- `create table if not exists`
- `alter table ... add column if not exists`
- `create index if not exists`
- `create or replace function`
- `drop policy if exists` → `create policy`

検証DBでは以下を確認してください。

- `company_subscriptions` が作成される
- `plan_change_requests` が作成される
- `plan_change_requests.completed_at` が存在する
- `complete_plan_change_request(p_request_id uuid)` が存在する
- `complete_plan_change_request` が二重反映を防ぐ
- owner/adminのみ申込管理できる

## Codex Environment Note

Codex環境ではポート待受が禁止される場合があります。その場合、`pnpm dev:garage-link` やPlaywrightの実画面E2Eは実行できません。

この場合は以下で確認してください。

```bash
pnpm lint
pnpm typecheck
pnpm build
pnpm test:billing:garage-link
pnpm verify:garage-link
```

`verify:garage-link` 内のE2Eは、`E2E_ALLOW_BILLING_MUTATIONS=true` がない限りskipされます。実画面の最終確認は、手元MacでローカルSupabaseとGARAGE LINKを起動して実行してください。

## Product Boundaries

GARAGE LINKは在庫管理SaaSです。GARAGE LINK側では「L-Link連携可否」を表示する程度に留め、LINE配信・シナリオ配信・リッチメニュー管理などのL-Link本体機能はL-Link側で扱います。

L-LinkはLINE外部ツールSaaSです。GARAGE LINKの車両、商談、帳票、整備などの専用機能には依存しない構成へ段階的に分離します。

## L-Link Supabase / Webhook Setup

L-Linkの初期ローンチでは、商品管理・販売ページ・Stripe決済・注文管理・ASP管理は対象外です。友だち管理、友だち情報管理、タグ、回答フォーム、リッチメニュー、配信運用の土台を優先します。

L-LinkのSQLは以下です。

```txt
apps/l-link/supabase/schema/010_l_link_core.sql
```

本番Supabase DBへ直接適用せず、まずstaging Supabaseで確認してください。SQLは再実行できるように `create table if not exists`、`add column if not exists`、`create index if not exists`、`drop policy if exists`、`create or replace function`、`drop trigger if exists` を使います。

L-LinkのRLSは `company_id` と `ll_staff_roles` を前提にします。

- owner/admin/staff: 基本操作可能
- viewer: 閲覧中心
- LINE接続設定・メンバー・権限: owner/admin中心
- Webhook保存: サーバー側処理
- service role keyはブラウザに出さない

LINE DevelopersではChannel secret / Channel access tokenを取得し、L-Linkの `/settings/line` に保存します。画面ではSecret/Tokenを平文表示しません。ローカルWebhook検証にはngrokなどが必要です。

Webhook URL例:

```txt
https://your-l-link-domain.com/api/line/webhook
```

詳細は [apps/l-link/docs/supabase-and-webhook-setup.md](apps/l-link/docs/supabase-and-webhook-setup.md) を確認してください。
