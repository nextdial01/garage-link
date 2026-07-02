# 未適用migration（20260630〜20260703）デプロイRunbook

対象: `supabase/migrations/` 配下の以下7ファイル。

```
20260630000000_delivery_candidate_event_types.sql        (037のプロモーション)
20260630000100_stock_movements_and_invoice_sale.sql      (038のプロモーション)
20260630000200_customer_deal_followup_fields.sql         (039のプロモーション)
20260701000000_followup_candidate_generation.sql         (040のプロモーション)
20260701000100_inventory_profit_turnover.sql             (041のプロモーション)
20260702000000_inspection_reminder_eligibility_scope_event_type.sql
20260703000000_generate_events_store_authorization.sql
```

このうち最初の5ファイルは、`ff4d14c`（037〜041導入コミット）の時点で `supabase/schema/` にのみ存在し
`supabase/migrations/` に対応物がなかった内容（＝ `supabase db push` が実際に適用する対象外だった内容）を、
タイムスタンプ付きmigrationとして正式に昇格させたもの。`supabase/schema/037`〜`041` はフレッシュDBを
ブートストラップする際の正本（canonical source）として引き続き残るが、**既存DB（035までブートストラップ
済みのDB）へは、この7ファイルを `supabase db push` で適用する**のが正しい手順になった。
schema/037〜041ファイル自体を直接SQL Editorへ貼り付けて適用する運用は本Runbookでは扱わない
（`supabase db push` が使えない場合の代替手順は 2.2 節末尾を参照）。

各migrationファイル冒頭のコメントに、対応する`supabase/schema/`ファイルと依存関係の詳細を明記している。
`tests/security/migration-chain-037-041.test.ts` が、この7ファイルの存在・並び順・依存順・
`supabase/schema/`ファイルとの内容一致を静的に検証する。

このドキュメントは「安全な適用手順」のみを扱う。アプリコードは変更しない。

## 0. まず知っておくべきこと（重要度づけの根拠）

アプリコードは **041・039 のカラムが存在する前提で書かれ、すでにデプロイ済み**。
未適用のままだと以下が実際に壊れる（想定ではなく `select`/`throw` を読んだ上での確認）:

| 画面/機能 | 参照しているカラム/関数 | 未適用時の挙動 |
| --- | --- | --- |
| `/vehicles`（一覧） | `vehicles.purchase_date`, `vehicles.listing_price`（041） | `select` が42703エラーで**一覧ごと表示不能** |
| `/customers/[id]`（詳細） | `deals.lost_reason`, `deals.last_contact_at`（039）／`vehicles.sold_date`（041） | `dealResult.error`/`vehicleResult.error` を`throw`しており**詳細ページごと表示不能** |
| `/dashboard` | `inventory_dashboard_metrics()` RPC（041） | RPCエラーを個別catchしており、**在庫指標カードのみ**「取得に失敗しました」表示（他は正常） |
| `/settings/store` | `stores.long_stay_threshold_days`（041） | エラーを握りつぶしており、閾値入力欄が既定値のまま**ページ自体は正常** |
| `/invoices/[id]` の「請求を確定」ボタン | `confirm_invoice_part_stock`/`cancel_invoice_part_stock` RPC（038） | ページは開けるが、**ボタン押下時のみ**「関数が見つかりません」的なエラー |
| 車検案内ジョブ（cron/手動） | `generate_followup_candidate_events`（040） | **部分失敗を許容する実装済み**のため、車検案内自体は継続動作。フォロー候補だけ生成されない |

→ **041 と 039 は既に本番の主要画面を壊している可能性が高く、優先度は「今すぐ」**。
037・038・040・20260702000000・20260703000000 は機能追加/整合性強化であり緊急度は相対的に低い。

## 1. 推奨適用順序

```
1. supabase/migrations/20260630000000_delivery_candidate_event_types.sql        (037)
2. supabase/migrations/20260630000100_stock_movements_and_invoice_sale.sql      (038)
3. supabase/migrations/20260630000200_customer_deal_followup_fields.sql         (039)
4. supabase/migrations/20260701000000_followup_candidate_generation.sql        (040)
5. supabase/migrations/20260701000100_inventory_profit_turnover.sql            (041)
6. supabase/migrations/20260702000000_inspection_reminder_eligibility_scope_event_type.sql
7. supabase/migrations/20260703000000_generate_events_store_authorization.sql
```

`supabase db push` を使う場合、ファイル名のタイムスタンプ順に自動で上記順序が適用される
（`20260629000000_inspection_reminder_ack_fn.sql` より後、`20260702000000...` より前に7ファイルすべてが並ぶ）。
以下は `supabase db push` が使えない場合の1ファイルずつ手動適用（SQL Editor）を想定した依存関係の説明。

厳密な依存関係は以下のみ（それ以外は互いに独立、番号順に適用すれば問題ない）:

- **040 は 037（CHECK制約緩和）と 039（`customers.last_contact_at`）に依存**。037・039より先に040を単独適用すると、040内のフォロー候補生成部分がCHECK違反または列不在エラーになる。
- **038・041・20260702000000・20260703000000 は 037/039/040 と無関係**（順序を入れ替えても失敗しない）。ただし番号順が最も検証しやすいので変更しない。
- 20260702000000 は `20260627000000_inspection_reminder_eligibility_fn.sql`（既に適用済みと推定）で作られた関数を `create or replace` するだけで、037〜041のどれにも依存しない。040適用前に流しても無害（その時点では`event_type`は元々`inspection_reminder`しか存在しないため、追加した`and e.event_type = 'inspection_reminder'`条件は無条件でtrueになるだけ）。
- 20260703000000 は `generate_inspection_reminder_events`（035・既に本番適用済みと推定）と `generate_followup_candidate_events`（040由来）を `create or replace` するだけで、037〜041のどれにも依存しない。035は既に本番にあるためこの関数の認可強化はすぐ効くが、040自体が未適用のうちは`generate_followup_candidate_events`側の強化は040適用まで意味を持たない（関数が存在しないため）。
  `20260701000000_followup_candidate_generation.sql`（040のプロモーション）自体にも同じ認可チェックを直接反映済みなので、20260703を040より先に単独適用しても・後から適用しても、最終的な関数定義は完全に同一になり安全（先に適用した場合は「まだ存在しない関数を認可チェック付きで新規作成」→後から040適用時に「同一内容のcreate or replaceで上書き」という順になるだけで、内容の差分は生じない）。番号順（040→20260703）の方が読みやすいので本Runbookではそちらを推奨する。

全ファイルとも `if not exists` / `create or replace` / `drop policy if exists` ベースで**再実行安全（idempotent）**。途中でSQL Editorのタイムアウト等が起きても、同じファイルを再実行すれば良い。

## 2. Operator Runbook

### 2.1 事前準備（共通）

1. 対象Supabaseプロジェクト（staging→productionの順）のダッシュボードで **Database → Backups** から直近バックアップの存在を確認する。バックアップが無ければ先に取得する（Point-in-Time Recovery対応プランなら追加取得は必須ではないが、開始時刻を記録しておく）。
2. `docs/staging-migration-checklist.md` の前提（本番データを直接いじらない／stagingで先に検証／Secretをログに残さない）をそのまま踏襲する。
3. `apps/garage-link/supabase/schema/035_inspection_reminders.sql` と `036_grant_core_tables.sql` が既に適用済みであることを 3章の pre-flight で確認してから開始する（未適用なら先にそちらを適用する。037以降はこれらに依存）。
4. ローカルに Supabase CLI（`supabase`コマンド）とプロジェクトへの接続設定があるか確認する。あれば `supabase db push` が使える（推奨）。無ければ 2.2 節末尾の手動適用手順に従う。

### 2.2 Staging適用

**`supabase db push` が使える場合（推奨）:**

1. staging Supabaseプロジェクトにリンクされていることを確認する（`supabase link` 済み、または `--db-url` を明示）。
2. `supabase db push` を実行する。CLIは `supabase/migrations/` 配下のタイムスタンプ順に未適用ファイルを検出し、1章の7ファイルを順番に適用する。
3. 適用ログで7ファイルすべてが成功したことを確認する。1件でも失敗した場合はそこで止まる（CLIの通常動作）ので、5章のロールバック/封じ込め手順に従う。

**`supabase db push` が使えない場合（SQL Editorでの手動適用）:**

1. Supabase Dashboard → SQL Editor で、1章の順に **1ファイルずつ**実行する。
2. 各ファイル実行直後に、4章の「post-flight」該当ブロックを同じSQL Editorで実行し、想定どおりの出力になることを確認してから次のファイルへ進む。

**共通（適用方法によらず）:**

3. 全7ファイル適用後、staging用のGARAGE LINKデプロイ（またはローカルから staging Supabase を向けたビルド）で以下を目視確認する:
   - `/vehicles` 一覧がエラーなく開き、仕入日・希望売価列が表示される。
   - `/customers/[id]` 詳細がエラーなく開く。
   - `/dashboard` の在庫指標カードがエラーメッセージなしで数値表示される。
   - `/settings/customer-follow-up/inspection-reminders` で「今すぐ案内対象・フォロー候補を判定」を押し、成功メッセージの内訳（車検案内／その他フォロー）が両方エラーなく表示される。
   - `/customer-follow-up/delivery-candidates` を開き、種別フィルタ（点検案内・納車後フォロー等）が選択できる。
4. `pnpm test:security` / `pnpm verify:garage-link` はアプリコード側の静的契約テストであり、DBの実適用有無とは独立して既にpassしている前提（今回のRunbookはコード変更を伴わない）。stagingのSupabase接続情報がある場合は `pnpm test:e2e:garage-link`（`E2E_ALLOW_BILLING_MUTATIONS` は今回対象外の課金E2Eなので必須ではない）で実描画確認を補完してもよい。

### 2.3 Production適用

1. stagingでの確認がすべて問題ないことを確認してから着手する。
2. メンテナンス告知は不要。ほとんどが `ADD COLUMN`/`CREATE TABLE IF NOT EXISTS`/`CREATE OR REPLACE FUNCTION` で、テーブルを長時間ロックする破壊的DDLは含まれない。
   例外は **20260630000000（037のプロモーション）の `ADD CONSTRAINT ... CHECK (...)`**（`inspection_reminder_events` にACCESS EXCLUSIVEロックを取り、既存全行を検証する）だが、この機能はリリースされたばかりでテーブルの行数は少ない想定のため実害は小さい。念のためトラフィックの少ない時間帯を選ぶ。
3. `supabase db push`（推奨）または1章の順序でSupabase本番プロジェクトのSQL Editorに1ファイルずつ貼り付けて実行する。SQL Editorで手動適用する場合は**複数ファイルを1回のクエリにまとめて流さない**（エラー発生時の切り分けを容易にするため）。
4. 各ファイル適用直後に4章の post-flight を実行し、想定結果と一致することを確認してから次に進む。異常があれば5章のロールバック/封じ込め手順に従い、それ以上進めない。
5. 全ファイル適用後、本番URLで2.2の目視確認と同じ項目を確認する（`docs/manual-smoke-test.md` の手順・禁止事項に従う。本番データを不可逆に変更しない）。
6. 問題なければ `docs/inspection-reminders.md` の「037〜041は本レポジトリ作成時点でまだ本番へ未適用です」という記述を「適用済み」に更新する（ドキュメント更新のみ、コード変更ではない）。

## 3. Pre-flight SQL チェック（各適用前に実行）

### 共通ベースライン（20260630000000実行前に一度だけ）

```sql
-- 035/036が適用済みであること（未適用ならこれらを先に適用する）
select to_regclass('public.inspection_reminder_events') is not null as has_inspection_reminder_events;
select to_regprocedure('public.generate_inspection_reminder_events(uuid,date)') is not null as has_generate_fn;
select exists (
  select 1 from information_schema.role_table_grants
  where table_schema='public' and table_name='vehicles' and grantee='authenticated' and privilege_type='UPDATE'
) as has_036_vehicles_grant;

-- 037〜041が未適用であることの確認（すべてfalse/0件が期待値）
select pg_get_constraintdef(oid) as current_check
from pg_constraint
where conrelid = 'public.inspection_reminder_events'::regclass
  and conname = 'inspection_reminder_events_type_check';
  -- 037未適用なら 'inspection_reminder' 単独のはず

select exists (
  select 1 from information_schema.tables
  where table_schema='public' and table_name='repair_part_stock_movements'
) as has_038_table; -- false expected

select exists (
  select 1 from information_schema.columns
  where table_schema='public' and table_name='customers' and column_name='last_contact_at'
) as has_039_customers_col; -- false expected

select to_regprocedure('public.generate_followup_candidate_events(uuid,date)') is not null as has_040_fn; -- false expected

select exists (
  select 1 from information_schema.columns
  where table_schema='public' and table_name='vehicles' and column_name='purchase_date'
) as has_041_vehicles_cols; -- false expected
```

### 20260630000000（037）実行前

```sql
-- 現行CHECKが単独制約であること、既存行がすべてinspection_reminderであること
select event_type, count(*) from public.inspection_reminder_events group by 1;
-- inspection_reminder以外の行が出た場合は既に別途データが投入されている＝要調査してから適用
```

### 20260630000100（038）実行前

```sql
-- 依存テーブル/列の存在確認（010/031/032/033が適用済みである前提の再確認）
select to_regclass('public.repair_parts') is not null as has_repair_parts;
select exists (select 1 from information_schema.columns where table_schema='public' and table_name='invoice_items' and column_name='part_id') as has_part_id;
select exists (select 1 from information_schema.columns where table_schema='public' and table_name='invoices' and column_name='maintenance_job_id') as has_maintenance_job_id;
select exists (select 1 from information_schema.role_table_grants where table_schema='public' and table_name='invoices' and grantee='authenticated' and privilege_type='UPDATE') as has_invoices_grant;
select exists (select 1 from information_schema.role_table_grants where table_schema='public' and table_name='repair_parts' and grantee='authenticated' and privilege_type='UPDATE') as has_repair_parts_grant;
```

### 20260630000200（039）実行前

```sql
select to_regclass('public.deals') is not null as has_deals;
select to_regclass('public.customers') is not null as has_customers;
```

### 20260701000000（040）実行前（20260630000000・20260630000200が直前に成功していること）

```sql
select pg_get_constraintdef(oid) from pg_constraint
where conrelid = 'public.inspection_reminder_events'::regclass and conname = 'inspection_reminder_events_type_check';
-- 037適用後の6種別が含まれていることを確認

select exists (select 1 from information_schema.columns where table_schema='public' and table_name='customers' and column_name='last_contact_at') as has_last_contact_at;
-- true であること
```

### 20260701000100（041）実行前

```sql
select to_regclass('public.vehicles') is not null as has_vehicles;
select to_regclass('public.stores') is not null as has_stores;
select exists (select 1 from information_schema.columns where table_schema='public' and table_name='vehicles' and column_name='purchase_price') as has_purchase_price; -- true expected（001由来）
```

### 20260702000000 実行前

```sql
select to_regprocedure('public.get_inspection_reminder_eligibility_summary(uuid)') is not null as has_eligibility_fn;
-- true であること（20260627000000が未適用ならこの新migrationは先に20260627を適用してから流す。
-- falseの場合でも create or replace は新規作成として成功するが、
-- API route（settings/customer-follow-up配下）は元々このRPCの存在を前提にしているため、
-- 20260627が未適用ならそちらの適用有無を先に確認すること）
```

### 20260703000000 実行前

```sql
-- generate_inspection_reminder_events（035）が現状クロステナント検証を持たないことの確認
-- （適用後にこのクエリを再実行すると search_path が public, pg_temp に変わっているはず）
select prosecdef, proconfig from pg_proc where proname = 'generate_inspection_reminder_events';
-- proconfig に "search_path=public" のみが含まれ、"search_path=public, pg_temp" ではないこと（適用前）

select to_regprocedure('public.generate_followup_candidate_events(uuid,date)') is not null as has_040_fn;
-- 040が未適用ならfalse。その場合でもこのmigrationは成功する（関数を新規作成するのみ）が、
-- 040適用前は candidate 生成ロジック自体が存在しないため、この認可強化は040適用まで機能しない。
```

## 4. Post-flight SQL チェック（各適用直後に実行）

### 20260630000000（037）適用後

```sql
select pg_get_constraintdef(oid) from pg_constraint
where conrelid = 'public.inspection_reminder_events'::regclass and conname = 'inspection_reminder_events_type_check';
-- 期待値: inspection_reminder / periodic_inspection / post_delivery_follow_up / long_no_contact / repurchase / review_request の6値を含む

select count(*) from public.inspection_reminder_events; -- 037適用前後で件数が変わっていないこと（DDLのみ、DML無し）
```

### 20260630000100（038）適用後

```sql
-- テーブル・RLS・インデックス
select relrowsecurity from pg_class where oid = 'public.repair_part_stock_movements'::regclass; -- true
select polname from pg_policies where tablename = 'repair_part_stock_movements'; -- stock_movements_select_member / stock_movements_insert_member の2件
select indexname from pg_indexes where tablename = 'repair_part_stock_movements'; -- idx_stock_movements_store_part / idx_stock_movements_source

-- 列追加
select column_name, data_type, column_default from information_schema.columns
where table_schema='public' and table_name='invoices'
  and column_name in ('parts_stock_adjusted','parts_stock_committed','parts_stock_adjusted_at');

-- 関数
select to_regprocedure('public.confirm_invoice_part_stock(uuid,uuid)') is not null as has_confirm_fn;
select to_regprocedure('public.cancel_invoice_part_stock(uuid,uuid)') is not null as has_cancel_fn;

-- 既存の整備案件在庫関数を再定義していないこと（既存データ非破壊の確認）
select prosrc is not null from pg_proc where proname = 'adjust_repair_part_stock';
```

### 20260630000200（039）適用後

```sql
select column_name from information_schema.columns
where table_schema='public' and table_name='deals' and column_name in ('lost_reason','last_contact_at');
select column_name from information_schema.columns
where table_schema='public' and table_name='customers' and column_name = 'last_contact_at';
select indexname from pg_indexes where tablename='customers' and indexname='idx_customers_last_contact';

-- 既存行が破壊されていないこと（新列は全てNULL/デフォルトのはず）
select count(*) filter (where last_contact_at is not null) as non_null_count, count(*) as total from public.customers;
```

### 20260701000000（040）適用後

```sql
select to_regprocedure('public.generate_followup_candidate_events(uuid,date)') is not null as has_fn;

-- 権限: authenticatedにEXECUTEが付与されていること（service_role経由でも問題ないが035と同じパターンを踏襲）
select has_function_privilege('authenticated', 'public.generate_followup_candidate_events(uuid,date)', 'EXECUTE');

-- ドライラン: 実データを書かずに件数だけ試す場合は必ずトランザクションをROLLBACKすること
begin;
select public.generate_followup_candidate_events(); -- 全店舗
-- 生成件数を確認したら必ず rollback（本番で誤ってcommitしない）
rollback;

-- event_type別の内訳確認（実行後にジョブを本番稼働させた後の検証用）
select event_type, status, count(*) from public.inspection_reminder_events group by 1,2 order by 1,2;
```

### 20260701000100（041）適用後

```sql
select column_name from information_schema.columns
where table_schema='public' and table_name='vehicles'
  and column_name in ('purchase_date','listing_price','sale_price','sold_date','market_value');
select column_name, column_default from information_schema.columns
where table_schema='public' and table_name='stores' and column_name='long_stay_threshold_days';
-- 期待値: column_default が 90

select to_regprocedure('public.inventory_dashboard_metrics(uuid)') is not null as has_fn;
select has_function_privilege('authenticated', 'public.inventory_dashboard_metrics(uuid)', 'EXECUTE');

-- 実店舗1件でRPCを試す（読み取りのみ・副作用なし）
select public.inventory_dashboard_metrics('<既知のstore_id>'::uuid);
```

### 20260702000000 適用後

```sql
select to_regprocedure('public.get_inspection_reminder_eligibility_summary(uuid)') is not null as has_fn;
select has_function_privilege('authenticated', 'public.get_inspection_reminder_eligibility_summary(uuid)', 'EXECUTE');

-- event_type=inspection_reminderのみで集計されることの確認は、040適用後に
-- 実際にperiodic_inspection等の行が存在する状態で events_by_status の合計と
-- 「where event_type='inspection_reminder'」の手動集計を突き合わせて検証する:
select status, count(*) from public.inspection_reminder_events
where store_id = '<既知のstore_id>' and event_type = 'inspection_reminder'
group by 1;
-- ↑ の結果と、認証済みセッションから叩いた get_inspection_reminder_eligibility_summary の
--   events_by_status が一致することを確認する（他event_typeの件数が混入していないこと）。
```

### 20260703000000 適用後

```sql
-- search_pathの強化を確認
select proconfig from pg_proc where proname in ('generate_inspection_reminder_events','generate_followup_candidate_events');
-- 両方とも {search_path=public, pg_temp} を含むこと

-- grantが従来どおりauthenticatedのみであることを確認（拡大縮小なし）
select has_function_privilege('authenticated', 'public.generate_inspection_reminder_events(uuid,date)', 'EXECUTE'); -- true
select has_function_privilege('authenticated', 'public.generate_followup_candidate_events(uuid,date)', 'EXECUTE'); -- true

-- service_role / SQL Editor からの呼び出しが従来どおり動作すること（副作用を残さずロールバック）
begin;
  select public.generate_inspection_reminder_events();
  select public.generate_followup_candidate_events(); -- 040未適用ならエラーになるが、それは040未適用が原因であり本migrationのせいではない
rollback;
```

クロステナント拒否の実地確認（ブラウザ/APIクライアント経由。SQL Editorでは実施不可 — auth.uid()を偽装できないため）:

1. Store A の owner/admin としてログインした状態で、ブラウザの開発者コンソールから
   `supabase.rpc('generate_inspection_reminder_events', { p_store_id: '<Store BのUUID>' })` を実行する。
2. 期待結果: `error.message` に「アクセスが拒否されました。」、`error.code`/`details` に `insufficient_privilege` 相当の情報が含まれる。
   `inspection_reminder_events` に新規行が作成されていないこと（Store Bの管理画面で確認するか、`created_at`の直近件数を比較）。
3. 同一ユーザーで `p_store_id` を自店舗のUUIDに変えて再実行し、正常に完了する（0件以上のcreatedが返る）ことを確認する。
4. `generate_followup_candidate_events` についても同様に確認する（040適用後のみ実施可能）。

### 共通: PostgREST スキーマキャッシュ

Supabase Dashboard の SQL Editor 経由のDDL、および `supabase db push` によるDDLは通常自動でPostgRESTの
スキーマキャッシュを更新するが、反映が遅れる場合は以下を実行して手動リロードする（読み取り専用、データ変更なし）:

```sql
notify pgrst, 'reload schema';
```

新しい列・関数を追加した直後にアプリ側で `column not found` や `function not found` に見えるエラーが出た場合は、まずこれを疑う。

## 5. ロールバック / 封じ込め

各migrationファイル末尾のコメント（元となった `supabase/schema/` ファイルと同内容）に準拠。
**本番で一度適用した後に安易にロールバックしない**（下位互換のため通常は「前方修正」を優先し、ロールバックは深刻な問題発生時のみ）。

### 20260630000000（037）ロールバック
```sql
alter table public.inspection_reminder_events drop constraint if exists inspection_reminder_events_type_check;
alter table public.inspection_reminder_events add constraint inspection_reminder_events_type_check
  check (event_type in ('inspection_reminder'));
```
**注意**: 040適用後に他event_typeの行が既に存在する場合、このロールバックは失敗する（該当行を先にstatus変更/削除する必要あり）。037単独ロールバックは040より前の段階でのみ安全。

### 20260630000100（038）ロールバック
```sql
drop function if exists public.cancel_invoice_part_stock(uuid, uuid);
drop function if exists public.confirm_invoice_part_stock(uuid, uuid);
alter table public.invoices drop column if exists parts_stock_adjusted, drop column if exists parts_stock_committed, drop column if exists parts_stock_adjusted_at;
drop table if exists public.repair_part_stock_movements;
```
**注意**: 適用後に単品販売請求の在庫確定が実行されていた場合、列削除で「在庫確定済みかどうか」の記録ごと失われる。ロールバック前に `repair_part_stock_movements` の該当行数を確認し、必要なら別テーブルへ退避してから実行する。

### 20260630000200（039）ロールバック
```sql
alter table public.customers drop column if exists last_contact_at;
alter table public.deals drop column if exists lost_reason, drop column if exists last_contact_at;
```
**注意**: 040適用後は040内部でこの列を参照しているため、039を先に単独ロールバックすると040の`generate_followup_candidate_events`実行時にエラーになる（040も併せてロールバックするか、040の呼び出しを先に停止する）。

### 20260701000000（040）ロールバック（封じ込めが基本）
```sql
drop function if exists public.generate_followup_candidate_events(uuid, date);
```
**封じ込め優先の代替案**（関数を消さず生成だけ止めたい場合）: `inspection_reminder_settings.enabled` を対象店舗で `false` にする。040の生成ロジックは全種別ともこのフラグを共有しているため、これだけで車検案内・フォロー候補すべての新規生成を即時停止できる（既存pending行は残る）。

### 20260701000100（041）ロールバック
```sql
drop function if exists public.inventory_dashboard_metrics(uuid);
alter table public.stores drop column if exists long_stay_threshold_days;
alter table public.vehicles drop column if exists purchase_date, drop column if exists listing_price,
  drop column if exists sale_price, drop column if exists sold_date, drop column if exists market_value;
```
**注意**: ロールバックすると `/vehicles`・`/customers/[id]` が再び壊れる（0章参照）。アプリコードのデプロイと歩調を合わせない限りロールバックしない。

### 20260702000000 ロールバック
```sql
-- 20260627000000_inspection_reminder_eligibility_fn.sql の内容を再実行し、
-- event_type絞り込み無しの版に戻す（drop functionは不要、create or replaceで十分）。
```

### 20260703000000 ロールバック
```sql
-- generate_inspection_reminder_events を 20260628 時点の定義（認可チェックなし）に戻す:
-- supabase/migrations/20260628000000_inspection_reminder_stale_event_invalidation.sql の
-- create or replace function 〜 grant execute 部分をそのまま再実行する。

-- generate_followup_candidate_events は 20260701000000（040のプロモーション）自体に
-- 同じ認可チェックが含まれているため、この関数だけを認可チェックなしに戻したい場合は
-- 040ロールバック（前項）を先に行ってから、認可チェックを除いた版を再作成する必要がある。
```
**注意**: このロールバックは店舗越境保護そのものを外す操作であり、実施する場合は理由をインシデント記録に残すこと。通常は「ロールバックしない」が正しい選択（何らかの正当な呼び出しがこの認可チェックで誤ってブロックされた場合は、ロールバックではなく `store_members` のロール割り当てを確認・修正する方を先に検討する）。

## 6. ブロッカー・要判断事項

- **20260630000000（037）とセットでなければ20260701000000（040）は適用しない。** 037なしで040を流すと、点検案内・納車後フォロー等のINSERTがCHECK制約違反でエラーになる（車検案内のINSERT自体は037なしでも成功するため、ジョブ全体は落ちないが、フォロー候補が一切生成されない状態が続く）。
- **20260630000200（039）とセットでなければ20260701000000（040）は適用しない。** `customers.last_contact_at` が無い状態で040を流すと `column "last_contact_at" does not exist` で040全体（関数定義自体は成功するが実行時）がエラーになる。`supabase db push` を使えば7ファイルまとめてタイムスタンプ順に適用されるため、この順序ミスは自動的に防げる。
- **039・041は「機能追加」ではなく「既にデプロイ済みのコードが必要としている前提」**。0章の表の通り、未適用状態は既に本番で /vehicles・/customers/[id] を壊している可能性が高い。他の作業より先に検証・適用すべき。
- **セキュリティ上の注意点（解消済み）**: 店舗越境問題（`generate_inspection_reminder_events`／`generate_followup_candidate_events` が `authenticated` からの直接RPC呼び出し時に `p_store_id` を検証していなかった件）は
  `supabase/migrations/20260703000000_generate_events_store_authorization.sql`
  （`20260701000000_followup_candidate_generation.sql` にも同内容を反映済み）で解消した。両関数とも `auth.uid()` が非nullの場合のみ
  `store_members` で対象 `p_store_id` の owner/admin membership を要求し、`p_store_id = null`（全店舗）も
  拒否するようになった。service_role（本Runbook対象の `/api/jobs/inspection-reminders` job route）や
  SQL Editorからの呼び出しは `auth.uid()` が null になるため従来どおり動作する（本Runbookの pre-flight/post-flight
  ドライラン手順は変更不要）。詳細は
  `20260703000000_generate_events_store_authorization.sql` 冒頭のコメントと
  `tests/security/generate-events-tenant-authorization.test.ts` を参照。
- **移行チェーンの欠落（解消済み）**: 037〜041が `supabase/schema/` にのみ存在し `supabase/migrations/` に対応物が無かったため、`supabase db push` が20260702000000/20260703000000へ直接ジャンプしてしまう不整合があった。本Runbookの1章に記載の5ファイル（20260630000000〜20260701000100）を追加して解消済み。`tests/security/migration-chain-037-041.test.ts` が、この7ファイルの存在・並び順・`supabase/schema/`ファイルとの内容一致を継続的に検証する。
- **040の`repurchase`（買替提案）は生成条件が未確定のまま**。テストでも明示的に「買替は生成しない」ことを確認済み。条件を決めるまでは意図的な未実装として扱う。
- **stagingでの実データ検証環境の有無**: `docs/staging-migration-checklist.md` 相当のstaging Supabaseが今回の037〜041検証にも使えることを確認できていない（このセッションでは接続情報にアクセスしていない）。stagingが存在しない場合は用意してから本番適用に進むこと。
