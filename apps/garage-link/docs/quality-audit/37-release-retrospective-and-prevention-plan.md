# GARAGE LINK release retrospective・再発防止計画

実施日: 2026-07-28

## 主要反省点

1. OTP sink不足に見えた問題の本質は、DB pre-request enforcementより前にcanonical admin contextを取得できないbootstrap循環だった。
2. service roleを「常に参照可能」と誤認せずCurrent ACLを照合したことで、billingとCronのdirect `stores` read不整合を公開前に検出できた。
3. PreviewとProductionのcredential scopeが広すぎた。外部送信denyだけでなくcredential自体を環境別に縮小すべきだった。
4. Browser role切替でlogout完了待ちが短く、stale sessionを生じる検査コードがあった。最終判定はfresh loginで再確認した。
5. Currentはtest-onlyという承認済み前提を途中で一般的な専用staging論へ戻し、不要な停止が発生した。

## 恒久的な再発防止

1. environment matrixを単一正本にし、Current-backed Previewの適用条件と終了条件を固定する。
2. admin OTPはcanonical membership helper、短TTL、一回利用、rate limit、trusted-session invalidationを統合fixtureで検証する。
3. Preview credentialはPreview-only、Production credentialはProduction-onlyをCIで検査する。
4. 外部送信、Stripe live、Cron、workerはapplication guardとenvironment variableの二層でdefault denyにする。
5. service-role SQLは許可RPCを通し、table direct accessを静的検査で拒否する。
6. role E2Eはlogout完了とrole表示をauthoritative signalにし、stale sessionをFAILさせる。
7. migration checksumはSQL実体とmanifestだけを正本にする。
8. release前にbackup、rollback候補、external-send停止、runtime logsを機械可読evidenceへ固定する。
9. QA fixtureは`[RELEASE QA]`命名、送信対象外、cleanup/disable手順を必須にする。
10. 外部送信解禁はProduction smoke後の別Gateとして維持する。

## 結果

- Current migration ledger: 51
- Preview Full Regression: PASS
- Production deploy / smoke: PASS
- Critical / High: 0 / 0
- external sends: 0
- rollback: not required
