# GARAGE LINK staging environment matrix

| 項目 | Production | Preview / staging | 判定 |
|---|---|---|---|
| Vercel project | `garage-link` | 同一projectのPreview | 許容候補 |
| Hostname | `garage-link.tech` | 未作成 | BLOCKED |
| Deploy source | `main` / `f45b0e9...` | dirty worktree、commit未固定 | BLOCKED |
| Supabase URL | Current | Productionと同一variable | FAIL |
| Supabase anon key | Current | Productionと同一variable | FAIL |
| Supabase service role | Current | Productionと同一variable | FAIL |
| Local staging Supabase | 対象外 | `127.0.0.1` | Vercelから利用不能 |
| Preview DB | GARAGE LINK Current（test-only） | 同じGARAGE LINK Current | オーナー承認済み。実顧客投入前だけ許可 |
| Stripe secret | Production entry | Preview専用entryあり | test mode未確認 |
| Stripe webhook secret | Productionのみ | 未構成 | BLOCKED |
| Email | Production/Preview共有credential | 実送信可能性あり | FAIL |
| LINE / L-LINK | 本番送信禁止 | staging/mock未証明 | BLOCKED |
| Cron / worker | Production設定あり | Preview自動実行なしを要確認 | BLOCKED |

値やsecretは本書へ保存しない。専用Supabase stagingは作成せずPro課金もしない。Preview/Productionは同じtest-only Currentを使用し、`GARAGE_EXTERNAL_SENDS_DISABLED`、`GARAGE_AUTOMATION_DISABLED`、`GARAGE_STRIPE_TEST_MODE_REQUIRED`とアプリguardで外向きを停止する。実顧客投入後はこの方式を再利用しない。
