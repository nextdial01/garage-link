# GARAGE LINK staging deploy・runtime validation report

実施日: 2026-07-28

## 総合判定

**BLOCKED（Phase 1 environment separation / Supabase project capacity）**。製品不具合ではない。Vercel PreviewのProduction credential共有を解消するため、空の`KANNAGI Staging` Supabase organizationで専用project作成を試みたが、管理者アカウントがFree Planのactive project上限2件に達しており、Dashboardの`Create new project`が無効だった。既存2 projectのpause/delete/流用はGARAGE LINK Currentまたは別製品への影響、L-LINK誤接続、staging分離違反を生むため実施していない。承認済み停止条件「専用または分離staging DBを安全に準備できない」に該当し、後続を安全停止した。

## 1. staging環境識別

- Vercel team: `ALTO's projects`
- Vercel project: `garage-link`
- Production hostname: `garage-link.tech`
- Production deployment source: `main` / `f45b0e924f611756e9f5d99e5534d73726f4c75a`
- Preview deploy URL: 未作成
- ローカルstaging Supabase: `127.0.0.1`（分離済みだがVercel runtimeから利用不能）
- 専用staging organization: `KANNAGI Staging`（Free Plan、project 0件）
- 専用remote staging Supabase: 作成不可（管理者のFree project上限2件。project作成button無効）
- 既存projectのpause/delete/流用: 未実施

## 2. Vercel environment分離

Dashboard上で次の単一variableが`Production and Preview`へ同じ値として展開されていることを確認した。

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `GARAGE_RESEND_API_KEY`

したがってPreviewはProductionと独立したSupabase identityを持たず、Current DBへの誤接続をfail-closedで排除できない。またメール送信credentialがPreview runtimeへ供給されるため、外部送信0件を保証できない。

StripeはProduction用とPreview用の`STRIPE_SECRET_KEY`が別entryで存在するが、Preview keyがtest modeであることは未確認。`STRIPE_WEBHOOK_SECRET`はProductionのみ。LINE/L-LINK本番接続は今回起動・送信していない。

## 3. Git・deploy対象

- branch: `main`
- HEAD: `f45b0e924f611756e9f5d99e5534d73726f4c75a`
- worktree: G1-A〜G7の大量の未コミット差分あり
- deploy対象commit: 未確定（HEADだけでは検証対象worktreeを再現しない）
- commit／push／merge: 0件

## 4. deploy結果

- staging deploy: 0件
- deploy URL: なし
- Vercel build: 未実行
- Current追加migration: 0件
- Current data変更: 0件
- 外部送信: 0件

## 5. runtime回帰

環境分離Gateで停止したため、staging上のrole、tenant/store、在庫、販売、整備、棚卸し、会計、Stripe、PII、L-LINK、browser/API smokeは**BLOCKED / NOT RUN**。既存の分離DB・localhost証拠（Security 239件、API、L-LINK mock、問い合わせ管理、lint、typecheck、production build）はPASSを維持するが、staging PASSへ読み替えない。

## 6. rollback

deploy前停止のためrollback不要。Current DB、Vercel deployment、Vercel environment variableはいずれも変更していない。将来のstaging deployでは`05-staging-rollback-runbook.md`を使用する。

## 7. 残存リスク

1. PreviewとProductionのSupabase credential共有
2. Previewへのメール送信credential配布
3. Stripe Preview keyのtest mode未確認
4. remote staging Supabase、backup、restore clone、架空fixtureが未構成
5. dirty worktreeを表すdeploy commitが存在しない
6. Free Plan project枠がなく専用staging DBを作成できない

## 8. 再開条件

1. `KANNAGI Staging` organizationでprojectを作成可能にする（推奨: organizationをProへ変更）し、Currentと異なる専用Supabase staging projectへ50 migrationを適用する。
2. staging DB backup／restore、project fingerprint、tester-only fixtureを確定する。
3. Vercel PreviewのSupabase 3変数をstaging専用値へ分離する。
4. `GARAGE_RESEND_API_KEY`をPreviewから外すかsink専用keyへ置換する。
5. Stripe Preview keyのtest modeとtest webhook secretを確認する。
6. LINE/L-LINK/email/Push/Cron/workerをdenyまたはmockへ固定する。
7. 検証対象worktreeをcommit SHAまたは同等の再現可能snapshotへ固定する。

## 9. 公開可否

- 未解消Critical: 0件
- コード未解消High: 0件
- staging Gate: BLOCKED
- production deploy: 不可
- 正式公開: 不可

## 10. 今回の追加実行結果

- Supabase Dashboard session: signed-in
- staging organization識別: PASS
- project作成可否: FAIL（Free project limit）
- Supabase/Vercel environment変更: 0件
- commit/push/deploy: 0件
- production deploy/smoke: NOT RUN
- Current DB変更/migration: 0件
- 外部送信: 0件
