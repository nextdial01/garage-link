# GARAGE LINK final production deploy checklist

- [ ] 再現可能なdeploy commit SHAを固定
- [ ] staging SupabaseがCurrentと異なるfingerprint
- [ ] staging backup／restore PASS
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

現在はSupabase Free project上限により専用staging DBを作成できず、staging environment separationがFAILのため、production deploy／正式公開は不可。既存projectのpause/delete/流用は行わない。
