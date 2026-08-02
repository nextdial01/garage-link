# GARAGE LINK Production deploy checklist

- [x] Preview Full Regression PASS
- [x] AUTH-004 / BILL-003 / CRON-001 PASS
- [x] Current ledger 51
- [x] Critical 0 / High 0
- [x] deploy commit `96c28052e8e2ff505588c3f26144c4bd3383335a`
- [x] Preview OTP sinkはProductionで利用不能
- [x] 外部送信・Cron・worker停止
- [x] rollback候補確認
- [x] Production deploy READY
- [x] `garage-link.tech`公開面PASS
- [x] test smoke account login PASS
- [x] 主要9 route PASS
- [x] runtime error 0
- [x] external send 0

外部送信解禁は別Gate。一般顧客の受け入れ開始前にQA fixture cleanupと送信先・監視の確認を行う。
