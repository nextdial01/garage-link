# GARAGE LINK UX受入監査 Coverage Matrix

## 判定記号

- `PASS`: staging実ブラウザで合格
- `BLOCKED`: 認証fixtureの管理者メールOTPが403となり、実利用者として到達不能
- `NOT RUN`: 実行環境が成立しないため未判定

## 実行結果

| 対象 | Chromium 1280×720 | 1440×900 | 1920×1080 | 1024×1366 | 390×844 | WebKit 1440×900 |
|---|---:|---:|---:|---:|---:|---:|
| 公開14 route | PASS | PASS | PASS | PASS | PASS | NOT RUN |
| 認証必須9 routeの未認証fail-safe | PASS | PASS | PASS | PASS | PASS | NOT RUN |
| 認証後ページ／主要8業務／role差分 | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | NOT RUN |

Chromium remote regressionは23ケース×5 viewport＝115/115 PASS。対象は `/`, `/features`, `/pricing`, `/faq`, `/industries/{used-car,motorcycle,maintenance}`, `/login`, `/signup`, `/forgot-password`, `/help`, `/legal/{terms,privacy,tokusho}` と、`/dashboard`, `/vehicles`, `/customers`, `/deals`, `/maintenance`, `/appointments`, `/parts`, `/inventory-counts`, `/settings` の未認証時安全遷移。

## 全ページroute inventory（Full Discovery）

122個の `page.tsx` を抽出し、以下のfamilyに分類した。

| family | route |
|---|---|
| Public/Auth | `/`, `/features`, `/pricing`, `/faq`, `/help`, `/industries/*`, `/legal/*`, `/login`, `/logout`, `/signup`, `/forgot-password`, `/auth/*`, `/membership/accept`, `/onboarding`, `/security/*` |
| Core | `/dashboard*`, `/vehicles*`, `/customers*`, `/deals*`, `/maintenance*`, `/appointments`, `/parts*`, `/inventory-counts*`, `/invoices*`, `/quotes*`, `/inquiries`, `/analytics`, `/vehicle-management`, `/customer-follow-up/*` |
| LINE | `/line`, `/line/analytics`, `/line/auto-replies*`, `/line/campaigns*`, `/line/delivery-settings`, `/line/drafts`, `/line/forms*`, `/line/friends*`, `/line/message-logs`, `/line/reservations`, `/line/rich-menus*`, `/line/routes*`, `/line/settings`, `/line/steps*`, `/line/tags*`, `/line/templates*`, `/line/webhook-*` |
| LINE package | `/line-package*`（billing/dashboard/delivery-logs/forms/friends/inquiries/messages/rich-menus/scenarios/settings/steps/users） |
| Settings/Admin | `/settings*`, `/admin/plan-requests`, `/menu`, `/supabase-test` |

認証後familyはfixture blockerにより「inventory済み／受入未実施」であり、PASSへ読み替えない。

## 操作・品質coverage

| 項目 | 結果 | 証拠 |
|---|---|---|
| console/page error | PASS（公開・未認証） | `route-smoke.spec.ts` |
| horizontal overflow | PASS（公開・未認証） | `route-smoke.spec.ts` |
| axe serious/critical | PASS（公開・未認証） | axe attachment |
| Modal focus/Escape/scroll lock | component contract PASS、remote認証後 BLOCKED | `modal-layering.spec.ts`、unit tests |
| 200% zoom | BLOCKED | 認証fixtureなし |
| Safari/WebKit | NOT RUN | WebKit起動時 Abort trap 6、trace保存 |
| role owner/admin/member | BLOCKED | OTP 403 |
