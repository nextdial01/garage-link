# GARAGE LINK final production deploy checklist

- [x] 再現可能なdeploy commit SHAを固定（`16df90b...`、ただしAUTH-004修正後は再固定）
- [x] Current-backed Preview方式をオーナー承認（test-only期間限定）
- [x] Current ledger 50・backup/restore Gate PASS
- [x] Current-backed Previewの共有DB方式を正式承認（test-only期間限定）
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

Full Discovery更新: pushとPreview deployはPASS。ただしAUTH-004（管理者OTP bootstrap循環）がCurrent追加migrationを必要とするためProduction GateはFAIL。BILL-003、OPS-008、CRON-001も同一Remediation Batchへ含め、全回帰後に新commitを固定する。
