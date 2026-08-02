# GARAGE LINK release environment matrix

| 項目 | Production | Preview / pre-release | 判定 |
|---|---|---|---|
| Vercel project | `garage-link` | 同一projectのPreview | PASS |
| URL | `garage-link.tech` | `garage-link-jrtxe33gk-altos-projects-fa55063c.vercel.app` | PASS |
| Commit | `96c2805...` | `96c2805...` | PASS |
| Supabase | GARAGE LINK Current | 同一Current（test-only期間の承認方式） | PASS |
| Migration ledger | 51 | 51 | PASS |
| Preview OTP sink | 未設定・利用不能 | Previewのみ | PASS |
| Stripe | live処理停止 | mock/testのみ | PASS |
| Resend credential | Productionのみ | なし | PASS |
| LINE / L-LINK | 停止 | deny/mock | PASS |
| Cron / worker | 停止 | fail-closed | PASS |
| External sends | 0 | 0 | PASS |

専用Supabase stagingは作成しない。Currentに実顧客を投入する前のtest-only期間だけ本方式を利用する。外部送信解禁は別Gateとする。
