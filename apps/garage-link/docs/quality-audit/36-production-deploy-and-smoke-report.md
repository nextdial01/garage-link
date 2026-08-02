# GARAGE LINK production deploy・smoke report

実施日: 2026-07-28

## 総合判定

**DEPLOY PASS / SMOKE PASS**。Previewで検証したcommitをVercel Productionへ昇格し、公開面・認証・主要画面・runtime logを確認した。外部送信は停止を維持した。

## Deployment

- source commit: `96c28052e8e2ff505588c3f26144c4bd3383335a`
- source Preview: `dpl_CFA9yj5ZgnnfSRvbAcfeNVD3TXWK`
- Production deployment: `dpl_CHxKMKxdRGuwNayP4F2ezZy8cmTY`
- deployment URL: `https://garage-link-oure5b7do-altos-projects-fa55063c.vercel.app`
- production URL: `https://garage-link.tech`
- state: READY
- alias error: none
- rollback candidate: Production直前deploymentを保持

## Smoke

- `garage-link.tech`公開トップ: PASS（外部取得）
- deployment URL `/`、`/login`: PASS
- `[RELEASE QA]` staff正式ログイン: PASS
- dashboard、vehicles、deals、maintenance、parts、inventory-counts、quotes、invoices、settings/billing: 9/9 PASS
- role表示: staff
- 重大404/500: 0
- runtime error cluster: 0
- Production runtime status: 200=220、304=11（観測時点）
- Current migration ledger: 51
- Current想定外変更: 0
- external sends: 0

## Release decision

アプリとDBの正式公開GateはPASS。Stripe live、LINE、L-LINK、メール、Push、Cron、workerの解禁は未承認のため停止を維持する。これらに依存する機能の一般提供開始は、別の外部送信Gate後とする。

## Rollback

rollback未実行。tenant越境、認可漏れ、PII漏洩、二重処理、重大500は観測されなかった。問題発生時はVercelを直前のsecurity-compatible deploymentへ戻し、DB ledger 51をforward-onlyで維持し、外部処理を停止する。
