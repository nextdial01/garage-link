# GARAGE LINK 手動スモークテスト（認証後・実DB確認）

自動テスト（`npm test`）で確認できない「実ログイン・実DB更新・実Storageアップロード」を含む確認手順です。
main push後の本番デプロイ確認に使います。

## 前提・禁止事項

- **本番データを不可逆に変更しない。** 部品など編集した場合は確認後に元の値へ戻す。
- 申込作成・プラン反映（完了操作）・LINE本送信・請求確定は**実行しない**。
- ログ・スクリーンショットに Secret / Access Token / 顧客個人情報 / メッセージ本文を含めない。
- `l-link-images` bucket は参照・変更しない。private bucketは `company-assets`。
- 各画面で DevTools（Console / Network）を開き、赤いConsoleエラーと 4xx/5xx が無いことを確認する。

## 0. ヘルスチェック（認証不要）

- `GET /api/health` → `200 {"ok":true,"service":"garage-link"}`。
- 異常時は `503` ＋ `code`（`db_unavailable` / `config_missing`）。Secretは返らないこと。

## 1. ログイン

- 本番URLに owner / admin でログインできること。
- 自動テスト不可（認証情報が必要）なため手動。

## 2. 会社設定 `/settings/company`（ロゴ/角印アップロード）

1. ページが表示され、bucket案内が「company-assets」であること。
2. ロゴ画像（PNG/JPEG/WebP、5MB以下）を1件アップロード。
   - Network: `POST /api/storage/upload` が `200 {ok:true}`、`file.path` が `tenants/{tenant_id}/stores/{store_id}/company/logo/...` 形式。
   - 続く `POST /api/storage/signed-url` が `200`、プレビュー表示。
3. ページを再読込してロゴが残ること（`stores.logo_image_path` 永続化）。
4. （任意・読み取りのみ）Supabaseで `uploaded_files` に `bucket='company-assets'`・`path like 'tenants/%/stores/%/company/%'` の行が増えたことを確認（削除しない）。
   - 失敗時のエラーコード切り分けは `docs/operations-incident-response.md` を参照。

## 3. 部品在庫 `/parts`

1. 一覧表示 → 既存部品の「詳細」を開く。
2. **変更前の値を控える**。1項目（例: 保管場所）を編集して保存 → 「部品情報を更新しました」。
3. 一覧に変更が反映されること。
4. **確認後、控えた元の値へ戻して再保存。**（`updated_at` は当日に更新されるが値は原状復帰）

## 4. 整備案件 `/maintenance`

1. 一覧 → 既存案件の詳細を開く。
2. 使用部品明細（例: 2件）と部品合計が表示されること。
3. Console/Networkエラーが無いこと。保存は不要。

## 5. 見積 `/quotes` ・請求 `/invoices`

1. 既存の見積1件・請求1件を開く。
2. 明細・合計が表示され、整備案件との紐付け表示に破綻が無いこと。
3. 保存・更新・発行・確定は**しない**。

## 6. 料金 `/settings/billing`

1. 現在のプラン（例: Free）・プラン比較表・申込フォームが表示されること。
2. 「申し込む」は**押さない**（申込データを作らない）。

## 7. プラン申込管理 `/admin/plan-requests`

1. owner / admin で申込一覧が表示されること。
2. 「完了」操作は**実行しない**（契約反映 `complete_plan_change_request` を走らせない）。
   - 二重反映防止ロジック自体は `npm test` の `complete_plan_change_request` 契約テストで静的に確認済み。

## 自動テストとの対応

| 範囲 | 自動 (`npm test`) | 手動（本ファイル） |
|---|---|---|
| `/api/health` のconfig_missing契約 | ✅ | 実DB接続(200)は手動/curl |
| Storage path形式・危険文字拒否 | ✅ | 実アップロードの往復は手動 |
| company-assets / 026 / 034 整合 | ✅ | bucket実体確認は手動 |
| 主要画面のルーティング対象存在 | ✅ | 実描画・ログイン後表示は手動 |
| `complete_plan_change_request` 二重反映防止 | ✅（SQL静的） | 実DB実行は行わない |
| 部品編集/整備明細/見積・請求の実描画 | ✕ | ✅ |
