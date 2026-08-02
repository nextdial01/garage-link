# GARAGE LINK deployment rollback runbook

## 基本方針

- Current ledger 51はforward-onlyで維持する。
- app rollbackでcanonical membership、OTP enforcement、RLS、G7保護を巻き戻さない。
- 外部送信・Cron・workerはrollback中も停止する。

## 対象

- current Production: `dpl_CHxKMKxdRGuwNayP4F2ezZy8cmTY` / commit `96c2805...`
- rollback候補: 直前のsecurity-compatible Production deployment

## 手順

1. Stripe webhook、LINE/L-LINK、メール/Push、Cron/workerを停止したままにする。
2. Vercelで直前のsecurity-compatible deploymentをProductionへ昇格する。
3. schema互換性を確認し、非互換機能はroute denyまたはfeature stopにする。
4. `/`、`/login`、認証、主要route、runtime error、tenant/store境界を確認する。
5. Current DBはrollbackしない。必要時は別のsecurity-preserving forward fixを作る。

## 発動条件

tenant越境、認可漏れ、PII漏洩、在庫負数、二重処理、二重課金、login不能、重大500、schema非互換。

## 今回の結果

発動条件なし。rollbackは実行していない。
