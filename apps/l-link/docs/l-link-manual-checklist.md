# L-Link 実機確認チェックリスト

本番DBへ直接適用せず、staging SupabaseまたはローカルSupabaseで確認します。

## 1. Supabase SQL適用確認

- `apps/l-link/supabase/schema/010_l_link_core.sql` をstagingに適用する
- 同じSQLを複数回実行してエラーにならないことを確認する
- `ll_products` / `ll_orders` / `ll_payments` / `ll_product_pages` / `ll_affiliates` が作成されていないことを確認する
- `ll_line_friends` が作成されていることを確認する
- `ll_line_accounts` が作成されていることを確認する
- `ll_line_webhook_events` が作成されていることを確認する
- `ll_message_logs` が作成されていることを確認する

## 2. RLS policies確認

- `ll_line_friends` にselect / insert / update / deleteのpolicyがある
- `ll_line_accounts` にowner/admin/staff編集、viewer閲覧中心のpolicyがある
- `ll_staff_roles` に会社単位のpolicyがある
- A社ユーザーでB社の友だちが見えない
- viewerは閲覧中心で、編集操作は次フェーズでUI上も無効化する

## 3. 環境変数確認

- `L_LINK_APP_ENCRYPTION_KEY` または `APP_ENCRYPTION_KEY` を設定する
- 暗号化キー未設定の場合、`/settings/line` で赤い注意が表示され、Secret/Tokenは保存されない
- stagingでは本番Secretを使わない
- `L_LINK_DEMO_COMPANY_ID` を検証用company_idにする
- Webhook URLを固定したい場合は `L_LINK_WEBHOOK_BASE_URL` にngrokまたはstaging URLを設定する
- LINE検証用の環境変数はサーバー側だけに設定する
  - `L_LINK_LINE_CHANNEL_SECRET`
  - `L_LINK_LINE_CHANNEL_ACCESS_TOKEN`
  - `L_LINK_LINE_TEST_USER_ID`
- service role keyはサーバー側だけで使い、ブラウザに出さない
- `apps/l-link/.env.example` を参考にし、実値をGitへコミットしない

## 4. /settings/line 保存確認

- 初回利用時は先に `/settings/organization` を開く
- 会社名を入力して保存する
- 店舗名は任意。未入力の場合は内部的に会社名を `stores.name` として保存する
- 店舗名に `本店` や `-` を入力した場合も保存できる
- 担当者名、電話番号、メールアドレス、業種、都道府県、住所は運用上の管理項目として入力できる
- 保存後、現在ログインユーザーが `owner` として `store_members` と `ll_staff_roles` に登録される
- 会社・店舗設定後に `/settings/line` へ進む
- LINE公式アカウント名を保存できる
- Channel IDを保存できる
- Basic IDを保存できる
- Channel secretを保存できる
- Channel access tokenを保存できる
- Secret/Token入力欄は保存後も空欄で表示される
- 画面には「設定済み」またはマスク表示だけが出る
- 平文Secret/Tokenが画面、console、ログ、エラーに出ない
- Webhook最終受信日時、最後のイベント種別、受信メッセージログ件数が表示される
- テストユーザーIDは「環境変数で設定済み / 未設定」のみ表示され、値そのものは表示しない
- 単体テスト送信は1ユーザー限定で、送信前に確認ダイアログが出る
- テスト送信は `push` のみを使い、`broadcast` / `multicast` は使わない

### 単体テスト送信の確認

`/settings/line` の単体テスト送信は、LINE公式アカウントとの疎通を確認するための限定機能です。本番一斉配信ではありません。

- `L_LINK_LINE_TEST_USER_ID` がある場合、そのユーザー以外には送信できない
- 管理画面で友だちを明示選択する場合も、送信先は1人だけ
- 送信ログは `ll_message_logs.direction = 'outbound_test'` として保存される
- 成功/失敗は画面に表示される
- Token本文やSecret本文は画面・ログに出さない
- `api.line.me/v2/bot/message/broadcast` と `api.line.me/v2/bot/message/multicast` は未実装のままにする

確認SQL例:

```sql
select company_id, direction, message_type, message_hash, status, sent_at
from public.ll_message_logs
where direction = 'outbound_test'
order by created_at desc
limit 10;
```

### `会社情報が取得できません` / `会社・店舗情報が未作成です` が出る場合

L-Linkは `company_id` 単位でLINE公式アカウント設定を保存します。現在は段階移行のため、以下の順で会社情報を解決します。

1. `ll_staff_roles` にログインユーザーの `company_id` がある場合、それを利用する
2. 既存GARAGE LINK互換として `store_members.store_id` がある場合、それを `company_id` として利用する
3. 検証用途として `L_LINK_DEMO_COMPANY_ID` が設定されている場合、それを利用する

いずれも存在しない場合、`/settings/line` では保存できません。staging確認時は以下を確認してください。

- Supabase Authでログインしている
- `ll_staff_roles` に `company_id / user_id / role / status='active'` がある
- または既存互換として `store_members` に `store_id / user_id / role / status='active'` がある
- 検証用に `L_LINK_DEMO_COMPANY_ID` を使う場合は、存在する検証用IDを設定している
- `SUPABASE_SERVICE_ROLE_KEY` または `L_LINK_SUPABASE_SERVICE_ROLE_KEY` はサーバー側だけに設定している

初期導入時は、会社/店舗とメンバー所属を先に作成してからLINE接続設定を保存します。Secret/Tokenはエラー画面やログには表示しません。

初期設定保存に失敗する場合の確認項目:

- ログイン中のSupabase Authユーザーが取得できている
- `stores.name` など既存DBの必須カラムに値が入っている
- `stores` に `prefecture` カラムがない古いDBでは、アプリ側が自動でprefectureなし保存にfallbackする
- `store_members` に `store_id, user_id` の一意制約がある
- `ll_staff_roles` に `company_id, user_id` の一意制約がある
- service role keyはブラウザではなくサーバー側だけに設定している
- 開発環境では `stores insert failed` / `store_members insert failed` / `ll_staff_roles insert failed` の詳細を画面で確認する
- `PGRST204` で `Could not find the 'prefecture' column of 'stores' in the schema cache` が出る場合、DBに補助カラムが未追加、またはPostgRESTのschema cacheが古い可能性があります
- L-LinkのSQLには `alter table if exists public.stores add column if not exists prefecture text;` 相当の補助カラム追加が含まれています
- カラム追加後も `PGRST204` が続く場合は、Supabase SQL Editorで以下を実行してschema cacheを更新します

```sql
notify pgrst, 'reload schema';
```

- `stores insert failed 42501 / permission denied for table stores` が出る場合、server actionで使う `service_role` に既存共通テーブルへの権限が不足しています
- `apps/l-link/supabase/schema/010_l_link_core.sql` のgrantをstaging Supabaseで適用します

```sql
grant select, insert, update on table public.stores to service_role;
grant select, insert, update on table public.store_members to service_role;
grant select, insert, update on table public.ll_line_accounts to service_role;
grant select, insert, update on table public.ll_line_webhook_events to service_role;
grant select, insert, update on table public.ll_line_friends to service_role;
grant select, insert, update on table public.ll_friend_profiles to service_role;
grant select, insert, update on table public.ll_message_logs to service_role;
grant select, insert, update on table public.ll_staff_roles to service_role;
grant select, insert, update on table public.ll_permissions to service_role;
grant usage, select on all sequences in schema public to service_role;
```

- service role keyはサーバー側の環境変数だけに設定し、ブラウザやNEXT_PUBLIC系には絶対に入れません

### `/settings/line` で `権限がありません` が出る場合

LINE接続設定はserver actionからservice role clientで保存します。Secret/Tokenは画面やログに出さず、`ll_line_accounts` に暗号化済みの値だけを保存します。

`保存に失敗しました：権限がありません` または開発環境で `ll_line_accounts insert failed: permission denied` が出る場合は、以下を確認してください。

- `SUPABASE_SERVICE_ROLE_KEY` または `L_LINK_SUPABASE_SERVICE_ROLE_KEY` がサーバー側だけに設定されている
- `service_role` に `ll_line_accounts` への `select, insert, update` 権限がある
- Webhookや友だち作成も確認する場合、関連する `ll_line_webhook_events` / `ll_line_friends` / `ll_friend_profiles` / `ll_message_logs` にもservice role権限がある
- ログインユーザーが `ll_staff_roles` または `store_members` で `owner` / `admin` / `staff` として登録されている
- `viewer` は閲覧中心のため、LINE接続設定の保存はできません
- `company_id` が取得できない場合は、先に `/settings/organization` で会社・店舗設定を作成します

権限不足時は、staging SupabaseのSQL Editorで以下を適用します。本番DBへ直接適用する前にstagingで確認してください。

```sql
grant select, insert, update on table public.ll_line_accounts to service_role;
grant select, insert, update on table public.ll_line_webhook_events to service_role;
grant select, insert, update on table public.ll_line_friends to service_role;
grant select, insert, update on table public.ll_friend_profiles to service_role;
grant select, insert, update on table public.ll_message_logs to service_role;
grant usage, select on all sequences in schema public to service_role;
```

role確認SQL例:

```sql
select company_id, user_id, role, status from public.ll_staff_roles order by created_at desc;
select store_id, user_id, role, status from public.store_members order by created_at desc;
select company_id, account_name, channel_id, basic_id, line_bot_user_id, connection_status from public.ll_line_accounts order by created_at desc;
```

確認SQL例:

```sql
select id, name, business_type, prefecture, status from public.stores order by created_at desc;
select store_id, user_id, role, status from public.store_members order by created_at desc;
select company_id, user_id, role, status from public.ll_staff_roles order by created_at desc;
```

## 5. 接続確認ボタン確認

- Channel access tokenが正しい場合、接続状態が `verified` になる
- Tokenが不正な場合、Secret/Token本文を含まない安全なエラーになる
- `ll_line_accounts.verified_at` が更新される

## 6. ngrok起動手順

ローカルでWebhookを受ける場合、LINE Developersからlocalhostへ直接送信できないためngrokなどを使います。

```bash
pnpm dev:l-link
ngrok http 3001
```

ngrokで発行されたURLを使い、Webhook URLを以下の形式にします。

```txt
https://xxxx.ngrok-free.app/api/line/webhook
```

## 7. LINE Developers Webhook URL設定

- Messaging API設定を開く
- Webhook URLにstagingまたはngrok URLを設定する
- Webhook利用をONにする
- 応答メッセージのON/OFFは運用方針に合わせる

Vercel本番例:

```txt
https://your-l-link-domain.com/api/line/webhook
```

## 8. Webhook Verify確認

- LINE DevelopersのWebhook検証を実行する
- 成功しない場合はChannel secret、URL、署名検証、ngrokの期限を確認する
- `/settings/line/diagnostics` で最新Webhook受信日時と直近イベントを確認する
- LINE DevelopersのVerifyは空の `events` 配列で届くことがある。この場合も `/api/line/webhook` は署名検証後に200を返す
- `ll_line_webhook_events` に行がない場合でも、Verify自体は通ることがある。友だち追加やメッセージ送信で実イベント保存を確認する

### 診断ページのテストイベントボタンが反応しない場合

`/settings/line/diagnostics` のテストイベント作成ボタンは開発環境限定です。productionではUI非表示かつサーバー側でも拒否します。

ボタンを押しても件数や直近10件が更新されない場合は、以下を確認してください。

- 診断ページに表示される `NODE_ENV` が `production` ではない
- 診断ページに表示される `company_id` が `取得済み` になっている
- `company_id` が未取得の場合、先に `/settings/organization` で会社・店舗設定を作成する
- `SUPABASE_SERVICE_ROLE_KEY` または `L_LINK_SUPABASE_SERVICE_ROLE_KEY` がサーバー側だけに設定されている
- `service_role` に `ll_line_webhook_events` / `ll_line_friends` / `ll_friend_profiles` / `ll_message_logs` / `ll_line_accounts` への権限がある
- ボタン押下後に画面上部へ成功/失敗メッセージが出ている
- `ll_line_accounts` が未設定でも、開発用テストアカウントが自動作成される
- Secret/TokenやLINE APIはテストイベント作成では使用しない

確認SQL例:

```sql
select company_id, account_name, connection_status from public.ll_line_accounts order by created_at desc;
select company_id, event_type, source_user_hash, raw_event_hash, status, received_at from public.ll_line_webhook_events order by received_at desc limit 10;
select company_id, line_account_id, line_user_id, friend_status, last_interaction_at from public.ll_line_friends order by updated_at desc limit 10;
select company_id, direction, message_type, message_hash, status, received_at from public.ll_message_logs order by created_at desc limit 10;
```

## 9. 友だち追加テスト

- 検証用LINE公式アカウントを友だち追加する
- `ll_line_webhook_events` に `follow` が入る
- `ll_line_friends` に友だちが作成される
- `ll_line_friends.line_user_id` にLINE userIdが保存される
- 取得できる場合は `display_name` / `picture_url` / `status_message` / `language` が保存される
- `ll_friend_profiles` が作成される
- LINEプロフィール取得に失敗してもWebhook全体が落ちない
- メッセージを送ると `ll_message_logs.direction = 'inbound'` に本文と `webhook_event_id` が保存される
- `/line/messages` で受信メッセージログを確認する

### `/friends` が0件になる場合

診断ページにWebhookイベントが表示され、Supabaseの `ll_line_friends` に行があるのに `/friends` が0件になる場合は、以下を確認します。

- `/friends` が旧 `line_friends` ではなく `ll_line_friends` を参照している
- `/friends` の `company_id` 解決が `/settings/line/diagnostics` と同じ現在ログインユーザーの会社になっている
- `ll_line_friends.company_id` と `ll_staff_roles.company_id` または `store_members.store_id` が一致している

## 10. セグメント・配信下書き確認

LINEテスト友だちが保存されたら、以下を確認します。

- `/segments` を開く
- `/segments/new` でタグ、友だち状態、顧客ステータス、流入経路、問い合わせ種別、興味カテゴリの条件を作成する
- `/segments/[id]` で対象者一覧にテスト友だちが表示される
- 複数条件はAND条件として絞り込まれる
- `/broadcasts/new` で配信対象を全友だち、タグ、セグメントから選ぶ
- 保存後、`ll_broadcast_targets` に対象者プレビューが保存される
- `ll_broadcasts.target_count` と `ll_broadcast_targets` 件数が一致する
- 詳細画面では本番送信ボタンがない、またはdisabledである

確認SQL例:

```sql
select id, name, target_type, target_count, status from public.ll_broadcasts order by created_at desc limit 10;
select broadcast_id, line_friend_id, line_user_id, status from public.ll_broadcast_targets order by created_at desc limit 20;
```

## 11. 受信ログ確認

- `/line/messages` を開く
- テストユーザーから送った本文が表示される
- `webhook_event_id` が保存されている場合は画面にも表示される
- `outbound_test` は単体テスト送信ログであり、本番一斉配信ではない
- Token / Secret は表示されない
- `display_name` がNULLでも `line_user_id` で代替表示される
- `ll_friend_profiles` が未作成または空でも一覧に表示される
- friend_statusフィルターが `全て` になっている、または対象データの状態と一致している
- RLSやgrant不足で取得が失敗していない。開発環境では `/friends` 画面上部のエラーを確認する

確認SQL例:

```sql
select company_id, user_id, role, status from public.ll_staff_roles order by created_at desc;
select store_id, user_id, role, status from public.store_members order by created_at desc;
select company_id, id, line_user_id, display_name, friend_status, line_account_id from public.ll_line_friends order by updated_at desc;
select company_id, line_friend_id, real_name, phone, email from public.ll_friend_profiles order by updated_at desc;
```

### `/friends` で `friend tags fetch failed` が出る場合

友だち本体は取得できていても、タグ数取得に使う `ll_friend_tags` または `ll_tags` の権限/RLSが不足している可能性があります。この場合、L-Linkは友だち一覧を表示し続け、タグ数は0として扱います。

確認項目:

- `apps/l-link/supabase/schema/010_l_link_core.sql` の最新grantをstaging Supabaseで再適用している
- `service_role` に `ll_friend_tags` / `ll_tags` の `select, insert, update, delete` 権限がある
- `ll_friend_tags` / `ll_tags` のRLS policyが作成されている
- `ll_friend_tags.company_id` が現在ユーザーの `company_id` と一致している

更新SQL例:

```sql
grant select, insert, update, delete on table public.ll_friend_tags to service_role;
grant select, insert, update, delete on table public.ll_tags to service_role;
grant usage, select on all sequences in schema public to service_role;
```

確認SQL例:

```sql
select company_id, id, name from public.ll_tags order by created_at desc;
select company_id, line_friend_id, tag_id from public.ll_friend_tags order by created_at desc;
```

### `/friends/[id]` 詳細ページの保存・メモ・タグが動かない場合

詳細ページでは、`ll_line_friends.id` を使って友だちを取得し、顧客情報・メモ・タグ・メッセージ履歴を同じ `company_id` 配下で扱います。

確認項目:

- URLの `[id]` が `ll_line_friends.id` になっている
- `ll_line_friends.company_id` が現在ログインユーザーの `company_id` と一致している
- `ll_friend_profiles` が未作成でも詳細ページが表示される
- `ll_friend_notes` にservice roleの `select, insert, update, delete` 権限がある
- `ll_friend_tags` / `ll_tags` にservice roleの `select, insert, update, delete` 権限がある
- `ll_message_logs` にservice roleの `select, insert, update` 権限がある
- 保存・メモ追加・タグ付与/解除に失敗した場合、開発環境では画面上部のエラー詳細を確認する

更新SQL例:

```sql
grant select, insert, update, delete on table public.ll_friend_notes to service_role;
grant select, insert, update, delete on table public.ll_friend_tags to service_role;
grant select, insert, update, delete on table public.ll_tags to service_role;
grant select, insert, update on table public.ll_message_logs to service_role;
grant usage, select on all sequences in schema public to service_role;
```

確認SQL例:

```sql
select company_id, id, line_user_id, friend_status from public.ll_line_friends order by updated_at desc;
select company_id, line_friend_id, real_name, phone, email from public.ll_friend_profiles order by updated_at desc;
select company_id, line_friend_id, body, deleted_at from public.ll_friend_notes order by created_at desc;
select company_id, line_friend_id, tag_id from public.ll_friend_tags order by created_at desc;
select company_id, line_friend_id, direction, message_type, message_hash from public.ll_message_logs order by created_at desc;
```

## 10. メッセージ送信テスト

- 友だちからテキストメッセージを送信する
- `ll_line_webhook_events` に `message` が入る
- `ll_line_friends.last_message_at` が更新される
- `ll_message_logs` に受信ログが入る
- raw_event全文は保存されない

## 11. 回答フォーム確認

- `/forms` を開く
- `/forms/new` でフォームを作成する
- 質問タイプ、必須/任意、選択肢、友だち情報への反映先を設定する
- 回答後に付与する固定タグを設定する
- 公開状態をONにして保存する
- `/forms/[id]` で公開URLを確認する
- `/f/[formId]?line_user_id=test_user_follow` を開いて回答する
- 必須項目未入力では保存されない
- 回答完了画面が表示される
- `/forms/[id]/answers` で回答内容が表示される
- `/friends/[id]` のフォーム回答履歴に表示される
- line_user_idで友だちを特定できる場合、`ll_friend_profiles` が更新される
- 固定タグがある場合、`ll_friend_tags` に重複なく付与される

確認SQL例:

```sql
select company_id, id, title, is_public, auto_tag_ids from public.ll_forms order by created_at desc;
select company_id, form_id, label, question_type, profile_mapping, auto_tag_id from public.ll_form_questions order by sort_order;
select company_id, form_id, line_friend_id, line_user_id, submitted_at from public.ll_form_answers order by submitted_at desc;
select company_id, form_answer_id, question_id, answer_text, answer_values from public.ll_form_answer_items order by created_at desc;
select company_id, line_friend_id, real_name, phone, email, inquiry_type, interest_category from public.ll_friend_profiles order by updated_at desc;
select company_id, line_friend_id, tag_id from public.ll_friend_tags order by created_at desc;
```

権限不足が出る場合は、最新の `010_l_link_core.sql` をstagingに再適用し、以下のgrantがあることを確認します。

```sql
grant select, insert, update, delete on table public.ll_forms to service_role;
grant select, insert, update, delete on table public.ll_form_questions to service_role;
grant select, insert, update, delete on table public.ll_form_answers to service_role;
grant select, insert, update, delete on table public.ll_form_answer_items to service_role;
grant select, insert, update on table public.ll_friend_profiles to service_role;
grant select, insert, update, delete on table public.ll_friend_tags to service_role;
```

## 12. 友だち詳細の選択式プロフィール項目

`/friends/[id]` の顧客情報編集では、以下の項目は自由入力ではなく選択式です。画面表示は日本語ラベル、DB保存値は英数字コードです。

### 顧客ステータス

- 未設定: `null` または空文字
- 見込み客: `prospect`
- 商談中: `negotiating`
- 既存顧客: `customer`
- リピート候補: `repeat_candidate`
- 休眠: `dormant`
- 対応不要: `no_follow`

### 流入経路

- 未設定: `null` または空文字
- 店頭QR: `store_qr`
- Instagram: `instagram`
- ホームページ: `website`
- Google検索: `google_search`
- Googleマップ: `google_map`
- 紹介: `referral`
- チラシ: `flyer`
- 既存顧客: `existing_customer`
- その他: `other`

### 希望連絡方法

- 未設定: `null` または空文字
- LINE: `line`
- 電話: `phone`
- メール: `email`
- どれでも可: `any`

### 興味カテゴリ

- 未設定: `null` または空文字
- 購入相談: `purchase`
- 買取査定: `assessment`
- 車検: `inspection`
- 修理: `repair`
- カスタム: `custom`
- 点検: `maintenance`
- 保険: `insurance`
- 乗り換え: `trade_in`
- その他: `other`

### 問い合わせ種別

- 未設定: `null` または空文字
- 購入相談: `purchase_consultation`
- 買取査定: `assessment`
- 車検・修理・カスタム: `inspection_repair_custom`
- 来店予約: `visit_reservation`
- 試乗相談: `test_ride`
- 在庫確認: `stock_check`
- その他: `other`

フォーム回答から友だち情報へ反映する場合も、上記項目は日本語ラベルまたは保存値を受け取り、保存時に保存値へ正規化します。

担当スタッフIDは現時点では自由入力です。次フェーズで `ll_staff_roles` または `store_members` から現在company_idのスタッフ候補を取得し、選択式に変更します。

## 13. リッチメニュー管理確認

今回のリッチメニュー管理は、LINE APIへの本番反映を行いません。現在はL-Link内での設計・保存・プレビュー・タップ領域管理のみです。

### 作成手順

- `/rich-menus` を開く
- `新規作成` から `/rich-menus/new` を開く
- リッチメニュー名、説明、サイズ、ステータス、画像URL、表示対象メモを入力する
- サイズは以下から選択する
  - 大: `2500 x 1686`
  - 小: `2500 x 843`
- 保存後、`/rich-menus/[id]` に遷移する
- 画像URLがある場合は画像が表示される
- 画像URLがない場合はグレーの比率プレビューが表示される

### タップ領域

詳細画面で以下を入力してタップ領域を追加します。

- エリア名
- x
- y
- width
- height
- アクション種別
- アクション値
- 並び順

アクション種別:

- URLを開く: `uri`
- テキスト送信: `message`
- フォームを開く: `form`
- 電話をかける: `tel`
- 何もしない: `none`

`form` を選ぶ場合は、現在company_idの `ll_forms` からフォームを選択します。選択したフォームの公開URLが `action_value` に保存されます。フォームが0件の場合は、先に `/forms` で回答フォームを作成してください。

### 確認SQL例

```sql
select company_id, id, name, title, status, size_type, width, height, is_default, image_url, line_rich_menu_id, published_at
from public.ll_rich_menus
order by updated_at desc;

select company_id, rich_menu_id, label, x, y, width, height, action_type, action_value, sort_order
from public.ll_rich_menu_areas
order by sort_order;
```

`line_rich_menu_id` と `published_at` は、LINE公式アカウント反映フェーズまで空で問題ありません。

権限不足が出る場合は、最新の `010_l_link_core.sql` をstagingに再適用し、以下のgrantがあることを確認します。

```sql
grant select, insert, update, delete on table public.ll_rich_menus to service_role;
grant select, insert, update, delete on table public.ll_rich_menu_areas to service_role;
```

## 14. セグメント管理確認

今回のセグメント管理は、配信対象者の確認に使う条件保存と対象者抽出までです。

### 作成手順

- `/segments` を開く
- `新規作成` から `/segments/new` を開く
- セグメント名、説明、ステータスを入力する
- 条件タイプを選ぶ
  - タグを含む
  - タグを含まない
  - 友だち状態
  - 顧客ステータス
  - 流入経路
  - 問い合わせ種別
  - 興味カテゴリ
  - 車検満了日
  - 最終メッセージ日時
  - 最終接触日時
  - フォーム回答あり
  - フォーム回答なし
- 初期確認では、タグを含む、友だち状態、顧客ステータス、問い合わせ種別、興味カテゴリを優先確認する
- `/segments/[id]` で対象者一覧を確認する
- display_nameがない友だちは `line_user_id` で表示される
- `ll_friend_profiles` が未作成でも友だち自体は表示対象になります

確認SQL例:

```sql
select company_id, id, name, description, status, created_at, updated_at
from public.ll_segments
order by updated_at desc;

select company_id, segment_id, field, condition_type, operator, value, value_json, sort_order
from public.ll_segment_conditions
order by sort_order;
```

## 15. 一斉配信下書き確認

今回の一斉配信は、下書き作成、予約予定保存、配信対象者確認、配信ログ土台までです。LINE公式アカウントへの本送信は行いません。

### 作成手順

- `/broadcasts` を開く
- `下書き作成` から `/broadcasts/new` を開く
- 配信名、メッセージ本文、配信対象、配信予定日時、ステータスを入力する
- 配信対象は以下から選ぶ
  - 全友だち
  - タグ指定
  - セグメント指定
- 保存後、`/broadcasts/[id]` で対象者数と対象者一覧を確認する
- 送信ボタンはdisabledで、本送信未実装の表示が出ていることを確認する

確認SQL例:

```sql
select company_id, id, name, title, status, target_type, target_tag_ids, target_segment_id, target_count, scheduled_at
from public.ll_broadcasts
order by updated_at desc;

select company_id, broadcast_id, line_friend_id, line_user_id, status, target_snapshot
from public.ll_broadcast_targets
order by created_at desc;
```

禁止事項:

- LINE push APIを呼ばない
- LINE multicast APIを呼ばない
- LINE broadcast APIを呼ばない
- Secret / Tokenを画面やログに表示しない

権限不足が出る場合は、最新の `010_l_link_core.sql` をstagingに再適用し、以下のgrantがあることを確認します。

```sql
grant select, insert, update, delete on table public.ll_segments to service_role;
grant select, insert, update, delete on table public.ll_segment_conditions to service_role;
grant select, insert, update, delete on table public.ll_broadcasts to service_role;
grant select, insert, update, delete on table public.ll_broadcast_targets to service_role;
```

## 16. 診断ページ確認

- `/settings/line/diagnostics` を開く
- Channel secret / access token の平文が表示されない
- Webhook URLが確認できる
- 今日のWebhook受信件数が増える
- follow件数、message件数が確認できる
- 直近10件にevent_type、hash、LINE userId、received_atが表示される

## 17. 開発環境限定テストイベント

`NODE_ENV !== 'production'` のときだけ、診断ページに以下のボタンが表示されます。

- テストfollowイベント作成
- テストmessageイベント作成
- テストpostbackイベント作成
- テストunfollowイベント作成

本番では表示されません。

## 18. よくあるエラーと原因

- `invalid_signature`: Channel secret不一致、raw body以外で検証している、LINE DevelopersのChannelが違う
- `webhook not reached`: ngrok停止、Webhook URL間違い、Vercel未デプロイ
- `token_missing`: Channel access token未保存
- `line_api_401`: Token不正または期限切れ
- `profile_fetch_failed_404`: ユーザーがブロック済み、またはプロフィール取得対象外
- RLSで見えない: `ll_staff_roles` に対象ユーザーとcompany_idがない

## 19. 個人情報の注意

- 友だち情報には氏名、電話番号、メール、住所、車検満了日、問い合わせ内容が含まれる可能性があります
- raw_event全文、Secret、Tokenは保存・表示しません
- フォーム回答や問い合わせ本文のexportは別フェーズで権限制御を追加します
