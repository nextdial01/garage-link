# G7 Current SQL Editor実行手順

## Gate

**READY — compatibility migrationとG7を同一transactionで実行します。**

- package: `02-current-sql-editor-apply.sql`
- package SHA-256: `72f71e202cb73a8008bda2d17896b19a142870c99ed15d7a724de2a8bdd76b92`
- compatibility: `20260728000050`
- G7: `20260728000100`
- 成功後ledger: 50件

## operator操作（1回のみ）

1. GARAGE LINK Supabase Dashboard（project ref `wmlpuzuskfiwdipluglz`）を開く
2. SQL Editorを開く
3. `02-current-sql-editor-apply.sql`の全文を貼り付ける
4. `Run`を1回押す

途中分割、再実行、terminal、CLI、PAT、Database Passwordは不要です。例外時はtransaction全体がrollbackされます。成功時は末尾の`g7_current_result`が`status=PASS`、`ledger=50`を返します。

Vercel deploy、外部送信、正式公開は別承認です。
