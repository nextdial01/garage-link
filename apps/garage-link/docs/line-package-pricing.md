# LINE単体パッケージ料金設計

## プラン

### FREE

- 月額: 0円 税抜
- 月間配信数: 1,000通
- リッチメニュー: 1個まで
- 回答フォーム: 1個まで
- 複数店舗: 不可
- 従量課金: 不可
- 通数無制限オプション: 不可

FREEで月間配信数を超過する場合は配信不可にする。

```txt
今月の無料配信数の上限に達しました。
配信を続けるには、LINE BASICへアップグレードしてください。
```

### LINE BASIC

- 月額: 9,800円 税抜
- 月間配信数: 5,000通
- リッチメニュー: 複数作成可能
- 回答フォーム: 複数作成可能
- 複数店舗: 不可
- 従量課金: 対応
- 超過時: 1,000通ごとに1,000円 税抜
- 通数無制限オプション: 月額9,800円 税抜
- 無制限込み月額: 19,600円 税抜

### LINE AUTO

- 月額: 29,800円 税抜
- 月間配信数: 30,000通
- リッチメニュー: 複数作成可能
- 回答フォーム: 複数作成可能
- 複数店舗: 対応
- 店舗別管理: 対応
- 店舗別配信: 対応
- 店舗別権限: 対応
- 従量課金: 対応
- 超過時: 1,000通ごとに1,000円 税抜
- 通数無制限オプション: 月額9,800円 税抜
- 無制限込み月額: 39,600円 税抜

## 通数無制限オプション

対象:

- LINE BASIC
- LINE AUTO

対象外:

- FREE

通数無制限オプション加入時は、本サービス上の月間配信数上限を無制限にする。従量課金ログは作成しない。

必ず以下を画面に表示する。

```txt
※本サービス上の配信通数上限が無制限になります。
※LINE公式アカウント側の料金・配信通数は別途発生する場合があります。
```

## 配信前確認で表示する内容

- 契約プラン
- 当月配信済み通数
- 今回配信予定通数
- 月間配信上限
- 超過見込み通数
- 追加料金見込み
- 通数無制限オプションの有無

FREEで上限超過する場合は、配信前確認・本配信ともに拒否する。

LINE BASIC / LINE AUTOで上限超過する場合は、配信前確認に追加料金見込みを表示し、本配信後に `delivery_overage_logs` へ保存する。

## 課金ログ

### tenant_subscriptions

tenant単位の契約状態を保存する。

- `tenant_id`
- `plan_code`
- `status`
- `unlimited_delivery_enabled`
- `current_period_start`
- `current_period_end`

### delivery_usage_logs

本配信成功後に、tenant単位の通数ログを保存する。

- `tenant_id`
- `store_id`
- `line_account_id`
- `message_id`
- `delivery_id`
- `delivery_count`
- `billing_month`

### delivery_overage_logs

LINE BASIC / LINE AUTOで従量課金対象になった場合だけ保存する。

- `tenant_id`
- `store_id`
- `line_account_id`
- `delivery_id`
- `included_limit`
- `used_before`
- `delivery_count`
- `overage_count`
- `overage_unit`
- `overage_unit_price`
- `estimated_overage_amount`
- `billing_month`
- `status`

## 保存しない情報

課金ログには以下を保存しない。

- メッセージ本文
- LINE userId
- 顧客名
- 電話番号
- 住所
- メール
- フォーム回答
- Webhook raw_event
- Channel Secret
- Channel Access Token
- Service Role Key

## 誤課金防止

- owner/adminのみ本配信可能
- staff/viewerは本配信不可
- FREEでは上限超過配信を実行しない
- BASIC/AUTOの超過料金は配信前確認に表示する
- 通数無制限オプション中は従量課金ログを作成しない
- AUTOの複数店舗でもtenant単位で集計する
- LINE公式アカウント側の料金は別で発生する可能性を明示する

## 本番前確認

`029_line_plan_billing.sql` は本番DBへ直接適用しない。022〜028のstaging確認後、staging Supabaseで適用し、以下を確認する。

- FREEで上限超過が拒否される
- BASIC/AUTOで従量課金見込みが表示される
- 無制限オプション時に従量課金ログが作成されない
- `delivery_usage_logs` / `delivery_overage_logs` に個人情報が入らない
- A社/B社 tenant分離が維持される
