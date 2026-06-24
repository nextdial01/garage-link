# 車検案内（顧客フォロー）

車検満了日をもとに案内対象を判定し、将来の外部連携（L-LINK等）に渡すためのイベントを記録する基盤です。
**今回は判定とイベント記録までで、LINE送信・外部API通信・配信下書き作成は行いません。**

## 画面

- 設定: `/settings/customer-follow-up/inspection-reminders`（owner / admin）
  - 車検案内 ON/OFF（初期OFF）、案内タイミング（1〜365日前・重複不可・追加/編集/削除）、対象除外ルール。
- 履歴: `/customer-follow-up/inspection-reminders`
  - 日付範囲・ステータス・顧客名/車両名で検索、ページネーション、詳細、pendingの手動スキップ。

## DB（migration: `supabase/schema/035_inspection_reminders.sql`）

- `inspection_reminder_settings`（店舗単位）/ `inspection_reminder_timings` / `inspection_reminder_events`
- RLS: 所属店舗のみ参照、変更は owner/admin。イベントINSERTは生成関数（SECURITY DEFINER）経由のみ。
- 冪等性: `inspection_reminder_events.idempotency_key`（`store_id:vehicle_id:満了日:日数`）の UNIQUE 制約で二重生成を防止。
- 既存テーブル（vehicles/customers/maintenance_jobs/deals/stores）は変更なし。rollbackはmigration末尾コメント参照。

> 本番適用は既存運用どおり Supabase SQL Editor で 035 を実行してください（このリポジトリでは本番DBへ適用しません）。

## ジョブ（イベント生成）

毎日1回の判定で、設定と車検満了日を照合してイベント（status=`pending`）を作成します。基準TZは `Asia/Tokyo`。

- 手動実行（自店舗のみ・owner/admin）: 設定画面の「今すぐ案内対象を判定」ボタン、または
  `POST /api/jobs/inspection-reminders`（ログインセッション）
- 自動実行（全店舗）: `vercel.json` の cron が毎日 `0 0 * * *`(UTC=JST 09:00) に
  `GET /api/jobs/inspection-reminders` を呼びます。
  - **環境変数 `CRON_SECRET` を設定**してください（未設定時はcronは401で実行されません。手動実行は可能）。
  - DB関数を直接実行することもできます: `select public.generate_inspection_reminder_events();`（全店舗）/
    `select public.generate_inspection_reminder_events('<store_id>'::uuid);`（特定店舗）

## 判定条件（イベント生成）

全て満たす場合に作成:
- 設定が有効 / 車検満了日あり / 残日数 = 設定タイミング
- 車両が有効（削除済み・アーカイブ除外、売約済み・廃車を除外）
- 顧客に紐づく（deals / maintenance_jobs の最新顧客）
- 車検予約済み・入庫済みでない（`車検`ジョブの未完了、または入庫予定/実入庫あり）
- 同一条件（store/vehicle/満了日/タイミング）のイベントが未作成

## 今後の接続範囲（未実装）

L-LINK APIへの実通信、配信下書き作成、LINE友だち/配信停止状態の判定、配信実績による除外、配信文/テンプレート管理、実際のLINE送信。
`inspection_reminder_events.external_reference_id` / `error_detail` は将来の外部連携用にnullableで用意済み。
