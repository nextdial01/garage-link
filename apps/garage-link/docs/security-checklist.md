# GARAGE LINK 本番前セキュリティチェックリスト

GARAGE LINKを本番運用へ進める前に、以下を確認してください。

## Supabase RLS

- `stores`, `store_members`, `vehicles`, `customers`, `deals` など、店舗データを持つテーブルで Row Level Security が有効になっている。
- `store_id in (select public.current_user_store_ids())` を基本に、所属店舗のデータだけ参照・更新できる。
- `owner` / `admin` / `implementer` / `staff` / `viewer` の権限差が画面とAPIの両方で効いている。
- `service_role key` を使うAPIは、必ずサーバー側だけで実行する。

## APIキーと秘密情報

- `SUPABASE_SERVICE_ROLE_KEY` をフロントエンドコードに書かない。
- `.env.local` の値を画面やログに表示しない。
- LINE Channel Secret / Channel Access Token をログ出力しない。
- Stripe Secret Key / Webhook Secret を画面やログに表示しない。
- 秘密情報を含む設定は、後工程でサーバー側管理や暗号化保存へ移行する。

## 設定エクスポート

設定エクスポートには、以下を含めないでください。

- 顧客情報
- 車両情報
- 商談情報
- 見積書・請求書
- LINE友だち
- LINE送信ログ
- LINE Webhookイベント
- LINEフォーム回答
- メンバー情報
- APIキー、Channel ID、Channel Secret、Channel Access Token
- 会社住所、電話番号、銀行口座
- ロゴ画像、角印画像

## 削除と復元

- 主要データは物理削除ではなく、`deleted_at`, `deleted_by`, `is_archived` による論理削除を基本にする。
- 一覧画面では `deleted_at is null` のデータだけ表示する。
- 削除前に確認ダイアログを出す。
- 削除・復元は `audit_logs` に記録する。
- 完全削除は `owner` のみ許可し、運用ルールが固まるまでは無効化する。

## 監査ログ

- 誰が、いつ、何を作成・更新・削除・発行・送信したか確認できる。
- 設定エクスポート / インポートは、将来的に専用ログを追加する。
- 監査ログには秘密情報の値を入れない。

## オーナーアカウント

- `owner` 権限のユーザーを最低1人残す。
- `owner` 自身を誤って `staff` / `viewer` に変更しない。
- メンバー招待・権限変更は `owner` / `admin` のみ実行できる。

## リリース直前確認

- `/settings/security-check` で未設定・注意項目を確認する。
- `/settings/trash` で誤削除データが復元できることを確認する。
- `npm run lint` が通る。
- `tsc --noEmit` が通る。
- 本番環境の環境変数が、Vercel / Hosting側に安全に設定されている。
