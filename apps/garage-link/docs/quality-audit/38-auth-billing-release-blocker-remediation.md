# AUTH・Billing release blocker remediation

実施日: 2026-07-28

## 総合判定

AUTH-004、BILL-003、CRON-001のDB/runtime contractをforward-only migration `20260728000200_auth_billing_release_blocker_batch.sql`とアプリ修正へ集約した。fresh、Current ledger 50相当upgrade、rollback、再適用、application restore、2/10/100 worker、Security 243、API、L-LINK mock、問い合わせ管理、lint、typecheck、production buildはPASSした。CurrentではSQL Editor単一transactionがCOMMITし、ledgerは50から51、想定外business row変更と外部送信は0件だった。

## AUTH-004

根本原因は、管理者メールOTPを要求するpre-request hookが、OTP challenge作成前のcanonical admin context取得にも適用されるbootstrap循環である。恒久的なauth bypassは追加せず、service roleだけが実行できる固定`search_path`のDB helperへcanonical `memberships`照合を集約した。

- active canonical membership、tenant/store scope、active/trial storeを必須化
- `store_members` fallbackなし
- Preview QA helperは`[RELEASE QA]`、`.invalid` test identity、Preview purpose、owner/admin/implementerだけを許可
- implementerはassignment必須
- PUBLIC、anon、authenticatedのEXECUTEをrevokeし、service roleだけへgrant
- membership role/status/scope、assignment、store eligibility変更でtrusted sessionをatomic・idempotentに失効
- Preview sinkはVercel Preview・production build・専用secret・request host一致時だけ作動し、Production/Developmentではfail-closed
- OTP、secret、PIIをaudit/server logへ保存しない

## BILL-003

根本原因は、Stripe server routeがservice-role identityで`stores`を直接SELECTしていた一方、Current ACLはその読み取りを許可していなかったことである。ユーザー経路はcanonical membershipのtenant/store context、webhookはsubscriptionのtenant scopeを正本とし、直接`stores`参照を除去した。service operationにはservice-role限定scope helperを追加し、tenant scope、transaction lock、idempotency、stale event、reconciliationの既存G7保護を維持した。

## CRON-001

automationの直接`stores`列挙を廃止し、active/trial storeだけを返すservice-role限定RPCへ置換した。外部送信とautomationはrelease guardにより引き続き停止し、再開は別Gateとする。

## Full Discovery 24 REMEDIABLE

| # | 項目 | 修正・証拠 | 状態 |
|---:|---|---|---|
| 1 | canonical OTP bootstrap | service-only canonical helper | PASS |
| 2 | QA allowlist | DB metadata・email marker・environment照合 | PASS |
| 3 | Preview OTP sink | Preview限定、短TTL、一回利用、rate limit | PASS |
| 4 | role変更時失効 | membership trigger | PASS |
| 5 | membership停止・削除時失効 | membership trigger | PASS |
| 6 | assignment変更時失効 | assignment trigger | PASS |
| 7 | store eligibility変更時失効 | store trigger | PASS |
| 8 | Preview Auth callback | Supabase redirect allowlist追加 | PASS |
| 9 | Preview app URL | `VERCEL_URL`/request originの安全なfallback | PASS |
| 10 | Stripe test webhook | Preview secret＋ローカル署名mock | PASS |
| 11 | Previewメールscope | external-send denyを維持し、Preview sinkはメールprovider非依存 | PASS |
| 12 | owner fixture contract | canonical owner fixture | PASS |
| 13 | admin fixture contract | canonical admin fixture | PASS |
| 14 | implementer fixture contract | assignment必須fixture | PASS |
| 15 | staff/viewer negative fixture | sink/helper拒否 | PASS |
| 16 | inactive fixture | canonical inactive拒否 | PASS |
| 17 | legacy-only fixture | `store_members`非参照・拒否 | PASS |
| 18 | other-tenant fixture | tenant scope拒否 | PASS |
| 19 | assignment外fixture | implementer拒否 | PASS |
| 20 | fixture cleanup | least-privilege cleanup runbookへ固定 | PASS |
| 21 | legacy QA provisioner | 実行不能化、legacy write除去 | PASS |
| 22 | Production smoke account contract | sinkを使わず正式login、smoke後無効化 | READY / credentialはoperator管理 |
| 23 | BILL service scope | canonical/tenant-scoped helperへ置換 | PASS |
| 24 | CRON service enumeration | service-only eligible store RPCへ置換 | PASS |

## Current適用

- project ref: `wmlpuzuskfiwdipluglz`
- migration: `20260728000200`
- transaction: COMMIT
- ledger: 50 → 51
- package Run: 1回
- schema/RLS/policy/RPC/owner/grant postcheck: PASS
- unexpected business changes: 0
- external sends: 0

## 残存Gate

新commitのPreview deployと認証後Full Regressionを完了するまでProduction deploy不可。Production OTP sinkと外部送信は引き続き無効である。
