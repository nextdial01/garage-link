# 車検案内・顧客フォロー（配信候補生成）

車検満了日・点検予定日・納車日・最終接触日をもとに案内/フォロー対象を判定し、L-LINK等の外部連携に渡すための
イベント（配信候補）を記録する基盤です。
**判定とイベント記録までが責務で、LINE送信・外部API通信・配信下書き作成そのものは行いません。**
配信候補の実際の取得・送信は、L-LINK側が `/api/s2s/line-link/delivery-candidates`（S2S・HMAC認証）経由で行います。

## 画面

- 設定: `/settings/customer-follow-up/inspection-reminders`（owner / admin）
  - 車検案内 ON/OFF（初期OFF）、案内タイミング（1〜365日前・重複不可・追加/編集/削除）、対象除外ルール。
  - このON/OFFは車検案内と、点検案内・納車後フォロー・口コミ依頼・長期未接触の配信候補生成の共通マスタスイッチ。
- 履歴（車検案内のみ）: `/customer-follow-up/inspection-reminders`
  - 日付範囲・ステータス・顧客名/車両名で検索、ページネーション、詳細、pendingの手動スキップ。
- 配信候補一覧（全種別）: `/customer-follow-up/delivery-candidates`
  - 種別（車検案内/点検案内/納車後フォロー/口コミ依頼/長期未接触/買替提案）・ステータスで絞り込み。

## DB（migration: `supabase/schema/035_inspection_reminders.sql`、`037`〜`041`）

- `inspection_reminder_settings`（店舗単位）/ `inspection_reminder_timings` / `inspection_reminder_events`
- RLS: 所属店舗のみ参照、変更は owner/admin。イベントINSERTは生成関数（SECURITY DEFINER）経由のみ。
- 冪等性: `inspection_reminder_events.idempotency_key` の UNIQUE 制約で二重生成を防止。
  車検案内（035）は `store_id:vehicle_id:満了日:日数`、その他フォロー（040）は
  `store_id:customer_id:vehicle_id(またはnone):event_type:基準日:日数` の形式。
- `event_type` は 035 では `inspection_reminder` のみ許可。037 で `periodic_inspection` / `post_delivery_follow_up` /
  `long_no_contact` / `repurchase` / `review_request` を追加許可するようCHECK制約を緩和（`repurchase` は040時点では未生成）。
- 既存テーブル（vehicles/customers/maintenance_jobs/deals/stores）は変更なし。rollbackは各schemaファイル末尾のコメントを参照。

> 以下の適用状況は導入時の履歴です。現在の本番適用状況は、この段落から判断せず、対象環境の migration・関数定義と配備版を照合してください。
> 本番適用は承認された運用手順に従ってください。
> `037`〜`041` は本レポジトリ作成時点でまだ本番へ未適用です。適用しない限り、車検案内（035）は従来どおり動作しますが、
> 点検案内・納車後フォロー等の生成はジョブ側で個別にエラーとして記録され、車検案内の生成自体は失敗しません。
> `supabase/migrations/20260702000000_inspection_reminder_eligibility_scope_event_type.sql` は
> `/settings/customer-follow-up/inspection-reminders` の対象診断（eligibility）の「案内イベント（累計）」を
> 車検案内（`inspection_reminder`）のみに限定する追加migrationです。040適用前に適用しても無害です。

## ジョブ（イベント生成）

毎日1回の判定で、車検案内（車検満了日）に加え、点検案内・納車後フォロー（30/90/180日）・口コミ依頼（納車7日後）・
長期未接触（最終接触180日以上）の配信候補を判定し、イベント（status=`pending`）を作成します。基準TZは `Asia/Tokyo`。

- 手動実行（自店舗のみ・owner/admin）: 設定画面の「今すぐ案内対象・フォロー候補を判定」ボタン、または
  `POST /api/jobs/inspection-reminders`（ログインセッション）
- 自動実行（全店舗）: `vercel.json` の cron が毎日 `0 0 * * *`(UTC=JST 09:00) に
  `GET /api/jobs/inspection-reminders` を呼びます。
  - **環境変数 `CRON_SECRET` を設定**してください（未設定時はcronは401で実行されません。手動実行は可能）。
  - `generate_inspection_reminder_events` と `generate_followup_candidate_events` を同一ジョブ実行内で順に呼びます。
    それぞれ独立したRPC呼び出しのため、一方が失敗（例: 040未適用でfunction不在）してももう一方の結果は失われません。
  - DB関数を直接実行することもできます: `select public.generate_inspection_reminder_events();` /
    `select public.generate_followup_candidate_events();`（全店舗。第1引数に `store_id` を渡すと特定店舗のみ）

## 判定条件（イベント生成）

車検案内（`inspection_reminder`）: 全て満たす場合に作成
- 設定が有効 / 車検満了日あり / 残日数 = 設定タイミング
- 車両が有効（削除済み・アーカイブ除外、売約済み・廃車を除外）
- 顧客に紐づく（deals / maintenance_jobs の最新顧客）
- 車検予約済み・入庫済みでない（`車検`ジョブの未完了、または入庫予定/実入庫あり）
- 同一条件（store/vehicle/満了日/タイミング）のイベントが未作成

その他フォロー（`periodic_inspection` / `post_delivery_follow_up` / `review_request` / `long_no_contact`）:
- 設定が有効（車検案内と共通のマスタスイッチ）
- 顧客が削除されておらず、`delivery_permission = 'allowed'` かつ `line_friend_status = 'linked'`
- 種別ごとの基準日から所定の経過/残日数（点検案内: 次回点検30日前 / 納車後フォロー: 納車30・90・180日後 /
  口コミ依頼: 納車7日後 / 長期未接触: 最終接触180日以上）
- 同一条件のイベントが未作成（`generate_inspection_reminder_events` と同じ冪等性の考え方）
- `repurchase`（買替提案）は判定条件が未確定のため、現時点では生成しない

## L-LINK 接続と候補取得

L-LINK が HMAC 認証付きの候補取得 API を呼び、取込下書きを作成します。ACK は取込結果を Garage の候補へ反映する処理で、LINE 配信完了の意味ではありません。候補生成・取得・ACK 自体は LINE 送信を行いません。送信対象の紐付け・友だち状態・送信可否は L-LINK 側で別途確認します。

以下はこのブランチの実装契約です。本番反映済みであることを意味しません。

- session GET と S2S POST は、対象店舗の `pending` を `created_at ASC, id ASC` で取得します。通常時刻の新規候補より既存候補を先に処理し、同時刻でも順序を固定します。任意の過去日時を持つ無制限の追加や、同時更新に対する固定スナップショットは保証しません。
- limit の既定値は50、上限200です。数値化できる小数は切り捨て、負数は1へ丸めます。0・非数は既定値へ戻します。
- S2S POST の空 body・解析不能な JSON は、現在は空オプションとして既定の取得になります。JSON の `null`・配列・文字列は400です。この非対称性を、更新 API の入力許可へ流用しないでください。
- 取得結果の取込後、L-LINK は ACK を送り、成功した候補に外部参照を記録します。失敗・不明な ACK は配信成功と扱いません。
- `repurchase`（買替提案）の生成条件は引き続き未実装です。
