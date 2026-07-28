# GARAGE LINK Current-backed Preview validation report

実施日: 2026-07-28

## 総合判定

**PASS**。test-only Current Supabaseを承認済みのPreview検証DBとして使用し、外部送信を停止した状態で、commit `96c28052e8e2ff505588c3f26144c4bd3383335a` のPreviewを検証した。

- Preview deployment: `dpl_CFA9yj5ZgnnfSRvbAcfeNVD3TXWK`
- URL: `https://garage-link-jrtxe33gk-altos-projects-fa55063c.vercel.app`
- Current migration ledger: 51
- Current想定外変更: 0（承認済み`[RELEASE QA]` fixtureを除く）
- 外部送信: 0

## AUTH-004 / role / scope

- owner・admin・implementer: canonical membershipをDB helperで照合後、Preview限定OTP sinkを用いてログインPASS
- staff・viewer: 正式roleでログインPASS
- OTP replay・TTL・rate limit: 分離DB回帰PASS。Previewで連続試行の429を確認
- inactive・old-only・他tenant・assignment外: Current同一schemaの分離DB動的試験およびCurrent policy/RPC照合PASS
- `store_members` authorization fallback: 0
- owner主要10 route: PASS
- staff主要7 route: PASS

## 業務・品質

- G1-A〜G4-B、G7、DB-003: PASS
- 在庫・販売・整備・部品・棚卸し・請求・入金・返金: 分離DB動的回帰＋Preview主要route PASS
- 2/10/100 worker、process kill、retry: 分離DB PASS
- Stripe: Preview mock/test contract PASS。live key・live webhook不使用
- PII: Security suiteとPreview console/runtime logで漏洩0
- L-LINK: mockのみ、実通信0
- Security: 244/244 PASS
- API smoke、L-LINK mock、問い合わせ管理、lint、typecheck、production build: PASS
- build routes: 130
- Preview runtime errors: 0

## Environment control

- `GARAGE_PREVIEW_OTP_SINK_SECRET`: Previewのみ
- `GARAGE_STRIPE_MOCK_MODE`: Previewのみ
- Stripe test webhook fixture secret: Previewのみ
- Resend credential / security from address: Productionのみへ縮小
- LINE・L-LINK・メール・Push: deny/mock
- Cron・worker: fail-closed

## Production Gate

Preview GateはPASS。rollback候補と外部送信停止を確認し、commit `96c2805` のProduction昇格を許可した。
