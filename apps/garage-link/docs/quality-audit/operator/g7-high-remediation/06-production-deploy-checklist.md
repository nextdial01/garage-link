# GARAGE LINK final production deploy checklist

- [ ] 再現可能なdeploy commit SHAを固定
- [x] Current-backed Preview方式をオーナー承認（test-only期間限定）
- [x] Current ledger 50・backup/restore Gate PASS
- [ ] Vercel PreviewのSupabase credentialを専用化
- [ ] Stripe test mode／test webhook PASS
- [ ] email／LINE／L-LINK／Pushの外部送信0
- [ ] role別・tenant/store browser/API回帰PASS
- [ ] 在庫・販売・整備・棚卸し・会計runtime PASS
- [ ] PII・Security・server log PASS
- [ ] staging rollback rehearsal PASS
- [ ] Current deploy前backupとledger 50を再確認
- [ ] production deployの別operator承認
- [ ] deploy直後smokeとmonitoring確認
- [ ] 外部送信開始の別承認
- [ ] 正式公開判定

現在はrelease commit `0cbae3f`まで作成済み。GitHub `nextdial01/garage-link`への292ファイルのpushが外部共有の明示承認不足で拒否され、Preview deploy前のためproduction deploy／正式公開は不可。
