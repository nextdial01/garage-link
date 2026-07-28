# GARAGE LINK Current-backed Preview validation report

実施日: 2026-07-28

## 総合判定

**BLOCKED at authenticated runtime Gate**。指定branchの通常pushとVercel Preview buildは成功した。公開トップ、ログイン画面、未認証route拒否、build、runtime error確認はPASSした。一方、外部送信を0件へ固定した構成ではowner/admin/implementerに必須の管理者メールOTPを配送できず、必須role別・主要業務の実ブラウザ回帰を完了できないためProduction deploy GateはFAIL-closedとした。

Vercelへ外部送信・自動処理・Stripe liveを止める3つのrelease safety variableをProduction and Preview scopeで追加し、アプリ側にもLINE、メール、Stripe live、Cronをfail-closedにするguardを実装した。Security 240、API、L-LINK mock、問い合わせ管理、lint、typecheck、production buildはPASS。release commit `0cbae3faabecbdfe47cba395af273995287a2a31`を作成し、worktreeはcleanである。

GitHub `nextdial01/garage-link`へbranch `codex/garage-link-release-20260728`、commit `16df90b846b278e9e03878e8efb077e8bcf027c8`をforceなしでpushした。Vercel Git連携が同commitをPreviewへdeployし、buildはREADYとなった。

## 環境前提

- Current Supabase migration ledger: 50
- Current想定外変更: 0（一時QA fixture以外）
- 実顧客・実送信対象: 0（オーナー確定前提と既存Current監査）
- Preview/Production DB: 同一GARAGE LINK Current（今回の正式方式）
- Current追加migration: 0

## 外部送信停止

Vercel Project environmentへ次を`Production and Preview`で追加した。値はsecretとして保存し、本書へ記録しない。

- `GARAGE_EXTERNAL_SENDS_DISABLED`
- `GARAGE_AUTOMATION_DISABLED`
- `GARAGE_STRIPE_TEST_MODE_REQUIRED`

アプリ側guardはLINE pushとResendをnetwork call前に拒否し、Stripe keyがtest modeでない場合はclient初期化を拒否し、Cron routeを503で停止する。専用security testを追加しPASSし、Preview deploymentへ反映済みである。

## Commit・品質

- branch: `codex/garage-link-release-20260728`
- 製品実装commit: `0cbae3faabecbdfe47cba395af273995287a2a31`
- deploy commit: `16df90b846b278e9e03878e8efb077e8bcf027c8`
- files: 292
- `.env`、secret、実backup: commit対象外
- secret scan: literal credential 0（test URI fixtureのみ）
- Security: 240/240 PASS
- API smoke: PASS
- L-LINK/ACK/inquiry mock: PASS
- lint/typecheck/build: PASS
- build routes: 130
- worktree: clean

## Preview・runtime

- GitHub push: PASS（通常push、forceなし）
- Preview deploy: PASS / READY
- Preview URL: `https://garage-link-73urei69j-altos-projects-fa55063c.vercel.app`
- `/`, `/login`: PASS
- 未認証`/dashboard`拒否: PASS（`/login?next=%2Fdashboard`へ転送）
- build errors: 0
- runtime errors: 0（deploy後1時間範囲）
- role/tenant/store、主要業務、Stripe test、PIIの認証後browser runtime: BLOCKED
- blocker: 外部送信deny下で管理者メールOTPを安全に受領するPreview専用sinkがなく、owner/admin/implementer login Gateを完了できない
- QA fixture: 明確な`[RELEASE QA]`識別子でowner 1 user / tenant 1 / store 1 / canonical membership 1 / assignment 1 / free subscription 1を作成。追加role作成はOTP Gate前で停止。削除ACLにより自動cleanup不可のため、公開前cleanup対象として隔離記録した。
- external sends: 0
- Current DB unexpected changes: 0（上記QA fixtureは承認済みテストデータ）

## 次のGate

Production deployは未実行。再開には、Previewだけで有効・Productionではfail-closedとなる管理者OTP sinkを正式実装し、deploy commitを更新したうえでrole別・主要業務Preview回帰を完了する必要がある。既存commit `16df90b`をProductionへ昇格しない。

## Full Discovery追補（14:50 JST）

A〜Hの164項目を、通常のFAILで中断せず最後まで確認した。集計はPASS 127、REMEDIATABLE 24、OPERATOR REQUIRED 2、RELEASE BLOCKER 11である。Git、Vercel、Supabase/Auth、認証後回帰の実行可能性、外部送信、主要route、Production前提、横断条件を確認し、Currentへのwrite・migration・push・deployは行っていない。

安全なPreview OTP sinkをアプリだけで実装できないことが確定した。管理者context取得はDB pre-request OTP enforcementより後段にあり、challenge作成前に拒否される。Auth metadataを認可正本にする、一般authenticated userへhelperを公開する、service roleを無制限化する、という回避はいずれも認可を弱めるため不採用とした。canonical membershipを読むservice-role限定DB helperと権限変更時のtrusted-session失効にはforward-only Current migrationが必要であり、今回の禁止事項に該当するため即時停止した。

同時に、Stripeの一部server routeとautomationがCurrent ACLで許可されない`stores` direct SELECTへ依存すること、Preview callback・app URL・test webhook・credential scope・role fixture cleanupが未完成であることも記録した。これらはAUTH-004解消後の同一Batchで処理する。Preview deploymentはREADYを維持するが、認証後Full RegressionはNOT RUN、Production GateはFAILである。
