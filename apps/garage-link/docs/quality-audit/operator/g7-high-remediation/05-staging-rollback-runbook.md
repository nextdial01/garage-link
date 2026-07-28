# GARAGE LINK staging rollback runbook

## 前提

- Current DB migration ledger 50はforward-onlyで維持し、検証目的のDB rollbackは行わない。
- app rollbackでG1-A〜G7の脆弱な旧経路を復活させない。
- rollback対象deployment、直前deployment、環境変数revisionをdeploy前に記録する。

## 停止・rollback順序

1. Preview aliasとアクセスを停止する。
2. Cron、worker、webhook、Stripe test webhook、L-LINK mockを停止する。
3. Vercel Previewを直前のsecurity-compatible deploymentへ戻す。
4. Preview環境変数を記録済みrevisionへ戻す。ただしCurrent DB credential共有状態へは戻さない。
5. Current DBは変更しない。appがledger 50 schemaへ非互換ならfeature flag／route denyで機能停止する。
6. smoke、runtime log、tenant/store境界を再確認する。

## rollback条件

- tenant越境、認可漏れ、PII漏洩
- 在庫負数、二重消費、二重課金、金額不整合
- Stripe webhook誤処理
- Current DBへの誤接続
- 5xx増加、重大なruntime error

## 今回の結果

source push／deploy前停止のためrollback実行なし。Current DBとVercel deploymentの変更0件。Vercelへ追加した3つのsafety variableは新deploymentまで既存runtimeへ影響せず、そのまま維持する。

Full Discovery時点ではPreview `16df90b`がREADY、Productionは`f45b0e9...`を維持しrollback候補deploymentも存在する。追加deployは行っていないためrollback不要。AUTH-004解消後も、DBはforward-onlyを維持し、アプリrollbackでOTP enforcementやcanonical membership保護を外さない。
