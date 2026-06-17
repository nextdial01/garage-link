# LINE core / adapter design

このドキュメントは、GARAGE LINK本体内のLINE機能をLINE単体パッケージでも使い回せるように、共通処理とGARAGE LINK専用処理を分離するための設計です。

## 現状のGARAGE LINK依存

LINE機能には、まだ以下のGARAGE LINK本体依存があります。

- `store_id` / `store_members` を前提にした所属・権限取得
- `customers` との紐付け
- `deals` との紐付け
- `quotes` / `invoices` 連携
- `vehicles` 連携
- 車検満了日、整備フォロー、商談ステータスなどの業務条件
- GARAGE LINK本体の `AppShell` / 左メニュー
- `/deals/{id}/line/new` など商談起点の導線

LINE単体パッケージでは、これらへ直接依存しないようにadapterで吸収します。

## line-coreに置く責務

`line-core` は、LINE機能として共通に必要な型・検証・安全ルールを持ちます。

今回追加:

- `src/lib/line/core/types.ts`
  - `LineTenantContext`
  - `LineAccountContext`
  - `LineRecipient`
  - `LineSegmentCondition`
  - `LineDeliveryRequest`
  - `LineDeliveryResult`
  - `LineFeatureFlags`
- `src/lib/line/core/context.ts`
  - `createLineTenantContext`
  - `hasLineFeature`
- `src/lib/line/core/recipients.ts`
  - adapterを使った共通の対象者解決入口
  - tenant混入チェック
- `src/lib/line/core/delivery.ts`
  - tenant混入チェック
  - 配信件数上限チェック
  - owner/admin本配信制限
  - staff/viewer本配信不可
  - 配信前確認の再確認判定

line-coreに置くべきもの:

- 配信実行の共通検証
- 配信対象のtenant混入チェック
- 配信件数上限チェック
- 配信前確認の共通処理
- テスト配信の共通処理
- LINE API送信処理
- Webhook基本処理
- Secret復号・非返却方針
- redaction

## garage-link adapterに置く責務

今回追加:

- `src/lib/line/adapters/garageLinkAdapter.ts`

役割:

- `stores` から `tenant_id` を補完
- `customers` が同じ `store_id` に属するか確認
- `line_friends` が同じ `store_id` / `tenant_id` に属するか確認
- ブロック済み・配信不許可の友だちを拒否
- 既存の `store_id` ベース互換を維持

garage-link adapterに置くべきもの:

- customersとの紐づけ
- dealsとの紐づけ
- quotes / invoices連携
- vehicles連携
- 車検満了日対象者抽出
- 整備・点検フォロー対象者抽出
- 商談ステータス対象者抽出
- store_id互換処理

## line-package adapterに置く責務

今回追加:

- `src/lib/line/adapters/linePackageAdapter.ts`

現段階ではinterfaceの受け皿のみです。実装は次フェーズで行います。

line-package adapterに置くべきもの:

- タグ条件での対象抽出
- フォーム回答条件での対象抽出
- 友だち属性での対象抽出
- 手動セグメント対象抽出
- LINE単体プランのfeature制御

## adapter共通interface

今回追加:

- `src/lib/line/adapters/types.ts`

主要interface:

```ts
export interface LineAdapter {
  resolveRecipients(
    context: LineTenantContext,
    condition: LineSegmentCondition
  ): Promise<LineRecipient[]>

  canUseFeature(
    context: LineTenantContext,
    feature: string
  ): Promise<boolean>
}
```

## tenant_id / store_id の段階移行方針

現状は `store_id` ベースの画面/API/RLSが多く残っています。
破壊的変更を避けるため、今回の段階では以下にします。

- `LineTenantContext` は `tenantId` と `storeId` の両方を持つ
- LINE単体では `storeId` をoptionalとして扱う
- GARAGE LINK本体では `storeId` を引き続き使う
- `tenantId` がある場合はtenant混入チェックを必ず行う
- `store_id` は削除しない
- 022〜027 migrationのstaging適用確認後、主要テーブルのtenant主軸化を進める

## 今回実装した範囲

- line-coreの型・context・recipient・delivery検証を追加
- adapter interfaceを追加
- GARAGE LINK adapterを追加
- LINE単体package adapterの受け皿を追加
- 既存 `resolveDraftRecipients` の外部APIは変えず、中身をGARAGE LINK adapter経由へ変更

既存動作維持:

- メッセージ本文空チェック
- LINE userId未設定チェック
- 顧客の別店舗混入拒否
- LINE友だちの別店舗混入拒否
- tenant混入拒否
- ブロック/配信不許可拒否
- message hash / length保存

## 次フェーズで移行する範囲

1. `sendMessage.ts` を `LineMessageSender` interfaceへ分離
2. `getLineChannelAccessToken` を `LineAccountSecretProvider` へ分離
3. `/api/line/send` のcontext生成を `LineTenantContext` に統一
4. `resolveRecipients` を複数条件対応へ拡張
5. `LineCrudPage` / `LineRecordDetailPage` のSupabase直結処理をadapterへ分離
6. LINE単体パッケージ用adapterでタグ・フォーム回答・手動セグメント対象抽出を実装

## 第11段階でline-package adapterへ寄せた範囲

`src/lib/line/adapters/linePackageAdapter.ts` に `listFriends()` を追加し、LINE単体パッケージの友だち一覧取得をadapter経由にした。

`listFriends()` の方針:

- `LineTenantContext` を受け取る
- 既存互換として `storeId` がある場合は `store_id` で絞る
- `tenantId` のみの場合は `tenant_id` で絞る
- 取得する列は表示用の最小項目に限定する
- `line_user_id`、`raw_event`、本文、フォーム回答全文は取得しない

この変更により、LINE単体画面側はGARAGE LINK専用のcustomers/deals/vehicles等を参照せず、LINE友だち表示に必要な最小データだけを扱う。

## 第11段階で実データ化したLINE単体画面

- `/line-package/dashboard`
  - 友だち数、今月の配信数、フォーム回答数、直近配信履歴、直近Webhookイベント
- `/line-package/friends`
  - adapter経由の友だち一覧
- `/line-package/messages`
  - 既存の配信安全化APIを利用したテスト配信・確認・本配信導線
- `/line-package/settings`
  - 既存の安全なLINE設定APIとSecretマスク表示を利用

## LINE単体パッケージとして残る未対応

- `LinePackageAdapter.resolveRecipients()` のタグ条件、フォーム回答条件、手動セグメント条件対応
- LINE単体向け問い合わせ管理adapter
- 配信履歴ページの専用adapter
- `LineTenantContext` 生成処理の完全共通化
- featureが無効なページ/APIをサーバー側で拒否する共通guard

## セキュリティ維持条件

adapter化で弱めてはいけない条件:

- tenant混入防止
- owner/adminのみ本配信
- staff/viewer本配信不可
- Secret非返却
- LINE Token復号失敗時のsecurity_events
- CSV制限
- Storage制限
- Redaction

今回のadapter化では、権限・Secret・送信API・CSV・Storageの実装は変更していません。
配信対象解決だけをadapter経由にし、既存の安全チェックを維持しています。

## 残リスク

- 多くの画面/APIはまだ `store_members` / `store_id` を直接参照している
- LINE単体adapterはまだ実対象抽出を持たない
- 複数セグメント・タグ条件・フォーム回答条件の対象抽出は未実装
- 022〜027 migrationはstaging実適用が必要
- 028 cleanup planは件数確認から始め、本番でいきなりUPDATEしない
