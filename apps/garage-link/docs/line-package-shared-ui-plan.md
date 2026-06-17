# LINE単体パッケージ UI共通化計画

このドキュメントは、GARAGE LINK本体内のLINE管理機能を、将来のLINE単体パッケージでも再利用できるようにするための棚卸しと段階移行方針です。

## 目的

LINE機能を以下の2形態で使い回せるようにします。

1. GARAGE LINK本体の一機能
2. LINE単体パッケージ

LINE単体利用者が後からGARAGE LINKを導入する場合も、同じ `tenant_id` のまま `tenant_features` を追加するアップグレード方式を維持します。

## LINE関連画面の棚卸し

LINEトップ・分析:

- `src/app/line/page.tsx`
- `src/app/line/analytics/page.tsx`

配信・下書き:

- `src/app/line/drafts/page.tsx`
- `src/app/line/campaigns/page.tsx`
- `src/app/line/campaigns/[id]/page.tsx`
- `src/app/line/steps/page.tsx`
- `src/app/line/steps/[id]/page.tsx`

友だち・タグ・テンプレート:

- `src/app/line/friends/page.tsx`
- `src/app/line/friends/[id]/page.tsx`
- `src/app/line/tags/page.tsx`
- `src/app/line/tags/[id]/page.tsx`
- `src/app/line/templates/page.tsx`
- `src/app/line/templates/[id]/page.tsx`

フォーム・リッチメニュー・自動応答・流入経路:

- `src/app/line/forms/page.tsx`
- `src/app/line/forms/[id]/page.tsx`
- `src/app/line/rich-menus/page.tsx`
- `src/app/line/rich-menus/[id]/page.tsx`
- `src/app/line/auto-replies/page.tsx`
- `src/app/line/auto-replies/[id]/page.tsx`
- `src/app/line/routes/page.tsx`
- `src/app/line/routes/[id]/page.tsx`

設定・ログ:

- `src/app/line/settings/page.tsx`
- `src/app/line/webhook-settings/page.tsx`
- `src/app/line/delivery-settings/page.tsx`
- `src/app/line/message-logs/page.tsx`
- `src/app/line/webhook-events/page.tsx`
- `src/app/line/reservations/page.tsx`

LINE画面共通:

- `src/app/line/_components/LineModule.tsx`
- `src/app/line/_components/LineCrudPage.tsx`
- `src/app/line/_components/LineRecordDetailPage.tsx`
- `src/components/LineManagementLayout.tsx`
- `src/components/line/LineStepEditorLayout.tsx`

## LINE関連APIの棚卸し

- `src/app/api/line/settings/route.ts`
- `src/app/api/line/settings/migrate-secrets/route.ts`
- `src/app/api/line/send/route.ts`
- `src/app/api/line/webhook/route.ts`
- `src/app/api/line/friends/export/route.ts`

共通化候補:

- LINE設定取得・保存
- Secret暗号化・非返却
- Webhook署名検証
- 配信前確認・テスト配信・本配信
- line_friends最小CSV export

GARAGE LINK adapter化候補:

- 商談からLINE下書きを作る処理
- 見積書/請求書案内
- 車両・整備・車検・商談ステータスを使った配信対象抽出

## LINE関連libの棚卸し

LINE core候補:

- `src/lib/line/sendMessage.ts`
- `src/lib/line/resolveRecipients.ts`
- `src/lib/line/validateDelivery.ts`
- `src/lib/line/verifySignature.ts`

Security core候補:

- `src/lib/security/encryptionCore.ts`
- `src/lib/security/redact.ts`
- `src/lib/security/hash.ts`
- `src/lib/security/rateLimit.ts`
- `src/lib/security/csvCore.ts`

API / product adapter依存あり:

- `src/lib/auth/tenant.ts`
- `src/lib/auth/permissions.ts`
- `src/lib/audit/logAudit.ts`
- `src/lib/audit/logSecurityEvent.ts`
- `src/lib/security/csvHandlers.ts`
- `src/lib/security/csvApi.ts`
- `src/lib/storage/*`

## GARAGE LINK専用依存

現状LINE画面・APIには、LINE単体ではそのまま使いにくい依存があります。

- `store_id` 前提の所属・絞り込み
- `store_members` 前提のrole取得
- `customers` との紐付け
- `deals` へのリンク
- 見積書 `quotes`
- 請求書 `invoices`
- 車両提案・車検・整備案内などGARAGE LINK業務文脈
- `AppShell` / GARAGE LINK左メニュー
- `/deals/{id}/line/new` など本体商談導線

LINE単体パッケージでは、これらを直接依存にせずadapterで受ける必要があります。

## LINE単体でも必要な機能

- LINE設定
- 友だち管理
- タグ管理
- セグメント管理
- メッセージ配信
- ステップ配信
- シナリオ配信
- 回答フォーム
- リッチメニュー
- 問い合わせ管理
- 配信履歴
- Webhook
- セキュリティ
- ユーザー権限

## adapter方式

LINE共通機能は、GARAGE LINK専用テーブルへ直接依存しない方向へ寄せます。

line-core:

- `sendMessage`
- `resolveLineRecipients`
- `validateDelivery`
- `lineSettings`
- `formEngine`
- `richMenuEngine`
- `webhookHandler`

garage-link adapter:

- `resolveVehicleInspectionTargets`
- `resolveCustomerLinkedLineFriends`
- `resolveMaintenanceFollowupTargets`
- `resolveDealStatusTargets`
- `resolveQuoteInvoiceNoticeTargets`

line-package adapter:

- `resolveBasicTagTargets`
- `resolveFormAnswerTargets`
- `resolveManualSegmentTargets`
- `resolveInquiryTargets`

車検満了日配信や商談ステータス配信は、LINE共通機能ではなくGARAGE LINK側adapterで扱います。

## 共通化できるUI

今回切り出したUI:

- `src/components/line/shared/LinePageHeader.tsx`
- `src/components/line/shared/LineSecretField.tsx`
- `src/components/line/shared/LineDeliveryConfirmPanel.tsx`
- `src/components/line/shared/LineTestDeliveryPanel.tsx`
- `src/components/line/shared/LineWebhookEventTable.tsx`

既存画面への適用:

- `src/app/line/settings/page.tsx`
  - `LineSecretField` を利用
- `src/app/line/drafts/page.tsx`
  - `LinePageHeader`
  - `LineTestDeliveryPanel`
  - `LineDeliveryConfirmPanel`
- `src/app/line/webhook-events/page.tsx`
  - `LinePageHeader`
  - `LineWebhookEventTable`

## 共通化できるロジック

すでにcore化済み:

- `src/lib/security/csvCore.ts`
- `src/lib/security/encryptionCore.ts`
- `src/lib/storage/pathsCore.ts`
- `src/lib/storage/validateFileCore.ts`

次にcore化したいもの:

- LINE設定APIのsafe response変換
- Webhook event最小化処理
- 配信対象解決インターフェース
- メッセージテンプレート/シナリオのvalidation
- Rich menu action validation

## LINE単体パッケージ用メニュー案

- ダッシュボード
- 友だち管理
- タグ管理
- セグメント管理
- メッセージ配信
- ステップ配信
- シナリオ配信
- 回答フォーム
- リッチメニュー
- 問い合わせ管理
- 配信履歴
- LINE設定
- ユーザー管理
- 契約・プラン

GARAGE LINK本体側では、既存の車両管理/LINE管理切り替えと左メニュー構成を維持します。

## セキュリティ維持条件

UI共通化で弱めてはいけない条件:

- Secret非返却
- Webhook署名検証
- owner/adminのみ本配信
- CSV制限
- Storage制限
- Redaction
- tenant/store分離
- previewなしCSV commit不可
- signed URL制御

共通UIは表示だけを担当し、認可・署名検証・Secret処理・tenant検証はAPI/lib側で維持します。

## 次フェーズで切り出す候補

1. `LineModuleShell` をGARAGE LINK adapter付きshellとLINE単体shellへ分離
2. `LineManagementLayout` を `components/line/shared` へ移動
3. `LineCrudPage` / `LineRecordDetailPage` からSupabase直結部分をadapter化
4. `resolveRecipients` を `line-core` と `garage-link adapter` に分離
5. LINE単体用の `line-package adapter` を追加
6. `packages/line-ui` / `packages/line-core` へ段階移行

## 現時点の残リスク

- 多くのLINE画面がまだ `store_id` / `store_members` へ直接依存している
- `friends` 詳細は `customers` / `deals` などGARAGE LINK専用導線を含む
- `drafts` は商談・見積書・請求書導線を含む
- 実DBでのtenant RLS確認はstagingで未実施
- 022〜027 migrationはstaging適用確認が必要
- 028 cleanup planは本番でいきなりUPDATEしない

この段階では、既存GARAGE LINK本体の動作を優先し、破壊的なmonorepo化や大規模移動は行いません。
