# LINE単体パッケージ最小UI構成

## 目的

GARAGE LINK本体のLINE管理機能を、将来的にLINE単体パッケージとして販売できるようにするため、既存Next.jsアプリ内に内部検証用の最小画面を追加する。

本段階では別アプリ化やmonorepo化は行わず、既存のGARAGE LINK本体を壊さない範囲で `/line-package` 配下にLINE単体用の画面枠を用意する。

## 画面構成

内部検証用ルートは以下とする。

- `/line-package`
- `/line-package/dashboard`
- `/line-package/friends`
- `/line-package/messages`
- `/line-package/steps`
- `/line-package/scenarios`
- `/line-package/forms`
- `/line-package/rich-menus`
- `/line-package/inquiries`
- `/line-package/delivery-logs`
- `/line-package/settings`
- `/line-package/users`
- `/line-package/billing`

最初に実用表示を持つページは以下。

- ダッシュボード
- 友だち管理
- メッセージ配信
- LINE設定

その他の画面は、GARAGE LINK専用導線を出さない「準備中」画面として配置する。

## GARAGE LINK本体との違い

GARAGE LINK本体は車両、顧客、商談、帳票、整備、棚卸し、LINE管理を含む。

LINE単体パッケージはLINE管理だけを扱う。

LINE単体パッケージでは以下を表示しない。

- 車両管理
- 顧客管理
- 商談
- 見積書
- 請求書
- 整備・車検
- 帳票設定
- 商談からのLINE案内
- 車検満了日配信

必要に応じて、GARAGE LINKへアップグレードすると利用できる旨だけを案内する。

## 使用する共通UI

既存のLINE共通UIから以下を利用する。

- `LinePageHeader`
- `LineSecretField`
- `LineDeliveryConfirmPanel`
- `LineTestDeliveryPanel`
- `LineWebhookEventTable`

LINE単体パッケージ用に以下を追加した。

- `LinePackageShell`
- `LinePackageSidebar`
- `LinePackageHeader`
- `LineMetricCard`
- `LineEmptyState` 相当の準備中表示として `LineFeatureComingSoon`
- `LineStatusBadge`

## feature制御

LINE単体パッケージの基本featureは `line` のみとする。

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

同じ `tenant_id` のままfeatureを追加するアップグレード方式を維持する。LINE単体側の画面は、`customer` / `vehicle` / `deal` / `maintenance` / `invoice` を前提にしない。

## セキュリティ方針

LINE単体パッケージ画面でも、既存のセキュリティ条件を弱めない。

- Channel Secret / Channel Access Tokenは平文表示しない
- Secret / TokenはAPIレスポンスに含めない
- 既存値はフォームstateに読み込まず、変更時のみ入力する
- LINE userIdは一覧に表示しない
- Webhook raw_eventは表示しない
- 本配信はowner/adminのみ許可する
- staff/viewerの危険操作はAPI側で拒否する
- CSV制限、Storage制限、Redaction、tenant/store分離を維持する

## 今回作成したページ

- `/line-package/dashboard`
  - 友だち数、今月の配信数、フォーム回答数、未対応問い合わせ数を表示する。
- `/line-package/friends`
  - LINE表示名、ステータス、タグ数、最終反応日時を表示する。
  - LINE userIdは表示しない。
- `/line-package/messages`
  - メッセージ一覧、テスト配信、配信前確認、本配信ボタンを配置する。
  - 本配信ボタンはowner/admin以外ではdisabledにする。
- `/line-package/settings`
  - Basic ID、Channel ID、Webhook URL、Secret/Tokenのマスク表示を行う。
  - Secret/Tokenは平文表示しない。

## 次フェーズ候補

- LINE単体向け問い合わせ管理の実データ表示
- 配信履歴の実データ表示
- ユーザー管理と契約・プラン画面の整理
- line-core / adapter設計を使った配信対象解決の共通化
- `packages/line-ui` への段階的な切り出し
- LINE単体プランで有効なfeatureだけを表示するサーバー側ガード

## 第11段階で実データ対応した範囲

以下を既存テーブルから取得する範囲で実データ表示に寄せた。

- `/line-package/dashboard`
  - 友だち数
  - 今月の配信数
  - フォーム回答数
  - 未対応問い合わせ数
  - 直近の配信履歴
  - 直近のWebhookイベント
- `/line-package/friends`
  - line-package adapter経由で友だち一覧を取得
  - 表示名、ステータス、配信許可、タグ数、最終反応日時、登録日時を表示
  - `line_user_id`、`raw_event`、本文、内部IDは表示しない
- `/line-package/messages`
  - 既存の `/api/line/send` と配信安全化フローを利用
  - テスト配信、配信前確認、本配信導線を表示
  - 本配信はowner/adminのみ
- `/line-package/settings`
  - 既存の `/api/line/settings` と `LineSecretField` を利用
  - Channel ID、Basic ID、Webhook URL、接続状態、最終更新日時を表示
  - Secret/Tokenはマスク表示のみ

## まだ準備中の画面

以下はLINE単体パッケージで利用予定だが、現段階では準備中画面のままにする。

- `/line-package/steps`
- `/line-package/scenarios`
- `/line-package/forms`
- `/line-package/rich-menus`
- `/line-package/inquiries`
- `/line-package/delivery-logs`
- `/line-package/users`
- `/line-package/messages/new`

準備中画面では、LINE単体パッケージで利用予定の機能であり、GARAGE LINK専用機能ではないことを明記する。

## line-core / adapterに寄せた箇所

`/line-package/friends` の友だち一覧取得を `LinePackageAdapter.listFriends()` 経由にした。

adapter側では安全な表示用項目のみを取得し、以下を取得しない。

- `line_user_id`
- `raw_event`
- メッセージ本文
- フォーム回答全文

現段階では `store_id` 互換を維持し、`tenant_id` が取得できる場合は `LineTenantContext` に入れる。022〜027 migrationのstaging適用後に、tenant主軸の取得へ段階的に寄せる。

## GARAGE LINKアップグレード導線案

LINE単体利用者がGARAGE LINKへアップグレードする場合も、tenantは分けない。

```txt
LINE単体:
tenant_id = A社
enabled_features = line

GARAGE LINK導入後:
tenant_id = A社
enabled_features = line, customer, vehicle, deal, maintenance, invoice
```

アップグレード後に利用可能になる機能は、契約・プラン画面で案内する。ただしLINE単体画面内では、車両・商談・帳票の実操作導線は出さない。

## LINE単体パッケージとして残っている未対応

- メッセージ新規作成画面の実装
- 問い合わせ管理の実データ化
- 配信履歴ページの実データ化
- ユーザー管理画面の実装
- featureによるサーバー側ページアクセス制御
- line-package adapterでのタグ条件・フォーム回答条件・手動セグメント対象抽出

## 第12段階で追加した料金・配信数制御

LINE単体パッケージのプランを以下の3つに整理した。

- FREE
- LINE BASIC
- LINE AUTO

料金表は `/line-package/billing` に表示する。

配信前確認では、契約プラン、当月配信済み通数、今回配信予定通数、月間配信上限、超過見込み通数、追加料金見込み、通数無制限オプションの有無を返す。

FREEは月間1,000通を超える配信を拒否する。LINE BASIC / LINE AUTOは上限超過時に従量課金見込みを表示し、本配信成功後に課金ログを記録する。通数無制限オプションが有効な場合は、本サービス上の月間配信数上限を無制限として扱い、従量課金ログは作成しない。

詳細は `docs/line-package-pricing.md` を参照する。

## 本番前に残る確認

本番DBにはまだ適用しない。以下は別ラインで必須とする。

- 022〜027 migrationのstaging Supabase実適用
- 028 cleanup planの件数確認
- A社/B社 tenant分離の実DB確認
- LINE単体画面でのtenant/store分離確認
