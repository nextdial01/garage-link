# GARAGE LINK staging environment matrix

| 項目 | Production | Preview / staging | 判定 |
|---|---|---|---|
| Vercel project | `garage-link` | 同一projectのPreview | 許容候補 |
| Hostname | `garage-link.tech` | `garage-link-73urei69j-altos-projects-fa55063c.vercel.app` | PASS |
| Deploy source | `main` / `f45b0e9...` | `codex/garage-link-release-20260728` / `16df90b...` | PASS |
| Supabase URL | Current | Productionと同一variable | FAIL |
| Supabase anon key | Current | Productionと同一variable | FAIL |
| Supabase service role | Current | Productionと同一variable | FAIL |
| Local staging Supabase | 対象外 | `127.0.0.1` | Vercelから利用不能 |
| Preview DB | GARAGE LINK Current（test-only） | 同じGARAGE LINK Current | オーナー承認済み。実顧客投入前だけ許可 |
| Stripe secret | Production entry | Preview entryあり | test-mode guard有効、実値modeのruntime確認待ち |
| Stripe webhook secret | Productionのみ | 未構成 | REMEDIATABLE |
| Email | Production/Preview共有credential | external-send guard有効だがcredential scope過剰 | REMEDIATABLE |
| LINE / L-LINK | 本番送信禁止 | staging/mock未証明 | BLOCKED |
| Cron / worker | Production設定あり | automation guardで503停止 | PASS（解禁前にCRON-001修正必要） |

管理者OTPはPreview sink不足だけでなくDB bootstrap循環（AUTH-004）があり、Current追加migrationなしでは安全に実装できない。Productionではsinkを常時無効とし、AUTH-004解消前のProduction昇格を禁止する。

値やsecretは本書へ保存しない。専用Supabase stagingは作成せずPro課金もしない。Preview/Productionは同じtest-only Currentを使用し、`GARAGE_EXTERNAL_SENDS_DISABLED`、`GARAGE_AUTOMATION_DISABLED`、`GARAGE_STRIPE_TEST_MODE_REQUIRED`とアプリguardで外向きを停止する。実顧客投入後はこの方式を再利用しない。
