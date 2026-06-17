# LINE単体パッケージからGARAGE LINKへのアップグレード設計

GARAGE LINKは、LINE単体パッケージだけを先に導入した店舗が、後から車両管理・顧客管理・商談管理・帳票機能を追加できる構成にします。

## 基本方針

LINE単体利用とGARAGE LINK本体利用で `tenant_id` を分けません。

LINE単体利用時:

```txt
tenant_id = A社
enabled_features = line
```

GARAGE LINK導入後:

```txt
tenant_id = A社
enabled_features = line, customer, vehicle, deal, maintenance, invoice
```

既存LINEデータは移行せず、同じtenantに機能を追加します。

## 現状との互換

現在のGARAGE LINKは `stores` / `store_members` / `store_id` を中心に動作しています。

破壊的変更を避けるため、最初は以下の互換構成にします。

- `stores.tenant_id` を追加
- `store_members` は残す
- 新規に `tenants`, `tenant_features`, `memberships` を追加
- 既存画面/APIは `store_id` で動き続ける
- 新しいAPIから徐々に `tenant_id` を検証する

## tenant_features

利用可能な機能は `tenant_features` で管理します。

想定feature:

- `line`
- `customer`
- `vehicle`
- `deal`
- `maintenance`
- `invoice`
- `analytics`
- `settings_export`

LINE単体プラン:

- `line`

GARAGE LINKプラン:

- `line`
- `customer`
- `vehicle`
- `deal`
- `maintenance`
- `invoice`

## memberships

ユーザー権限はtenant単位の `memberships` へ移行します。

role:

- `owner`
- `admin`
- `staff`
- `viewer`

status:

- `active`
- `suspended`
- `invited`

退職者・外部委託者は削除ではなく `suspended` にします。

## 引き継ぎ対象

LINE単体からGARAGE LINKへアップグレードする場合、以下を同じtenantで引き継ぎます。

- LINE友だち
- LINEユーザーID
- タグ
- セグメント
- フォーム
- フォーム回答
- 問い合わせ履歴
- 配信履歴
- シナリオ
- リッチメニュー
- LINEアカウント設定
- ユーザー権限
- 監査ログ
- セキュリティイベント

## LINE友だちと顧客台帳

LINE友だちと正式な顧客台帳は分離します。

```txt
line_friends
= LINE上の友だち

customers
= 店舗の正式な顧客台帳

customer_line_links
= LINE友だちと顧客台帳の紐づけ
```

理由:

- LINE表示名は実名とは限らない
- 家族のLINEから問い合わせる場合がある
- 問い合わせだけの見込み客がいる
- 購入前後で顧客確定タイミングが違う

初期は自動確定ではなく、候補表示 + 手動確認にします。

## RLS移行方針

段階移行します。

フェーズ1:

- 既存RLSは `store_id` のまま維持
- tenant基盤テーブルだけ `tenant_id` RLSを導入

フェーズ2:

- 主要テーブルへ `tenant_id` を追加
- APIで `tenant_id` と `store_id` を両方検証

フェーズ3:

- RLSを `tenant_id` 主軸へ変更
- `store_id` は拠点・店舗単位の補助条件にする

## API認可方針

すべてのAPIで以下を確認します。

- ログイン済みか
- tenantに所属しているか
- 必要roleを持っているか
- 操作対象のtenant_idが一致しているか
- featureが有効か

共通ヘルパー:

- `requireAuthenticatedUser()`
- `requireTenantMembership(tenantId)`
- `requireTenantRole(tenantId, roles)`
- `requireFeature(tenantId, featureCode)`
- `assertSameTenant(resourceTenantId, currentTenantId)`
- `denyAndLogSecurityEvent()`

## Secret管理

LINE Channel Secret / Access Tokenは本番前に暗号化保存へ移行します。

短期:

- 画面表示はマスク
- ログに出さない
- APIレスポンスに含めない
- `line_settings` に暗号化カラムと末尾4文字カラムを追加する
- 既存平文カラムは互換用に残すが、ブラウザ権限からは直接読ませない

中期:

- `line_accounts` に暗号化済みsecretを保存
- `line_settings` から平文secretを段階的に廃止
- LINE単体からGARAGE LINKへアップグレードしても、同じ `tenant_id` とLINE設定を引き継ぐ

移行方針:

1. 新規保存・更新はサーバーAPIで暗号化して保存
2. 既存平文値が残っている場合は、Webhook/送信処理で一時fallbackする
3. バックアップ後、保守用API `/api/line/settings/migrate-secrets` で平文値を暗号化カラムへ移す
4. 動作確認後、平文カラムをNULL化する
5. 最終的に `line_accounts` へtenant単位で集約する

## 今後の実装フェーズ

1. tenant基盤SQL追加
2. tenant認可ヘルパー追加
3. Webhook署名検証強化
4. security_events記録
5. LINE Secret暗号化保存
6. customer_line_links追加
7. tenant_idを主要テーブルへ追加
8. tenant分離テスト追加
