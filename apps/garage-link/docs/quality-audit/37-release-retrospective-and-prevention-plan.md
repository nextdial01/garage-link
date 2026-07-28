# GARAGE LINK release retrospective・再発防止計画

実施日: 2026-07-28

## 主要反省点

製品DBとローカル品質Gateは完了していたが、Preview環境をProduction credentialから分離するための専用Supabase project枠をrelease直前まで確保していなかった。PreviewへProduction Supabaseとメールcredentialが配布される構成を検出した点はfail-closedとして正しかった一方、staging capacityを開発初期の必須resourceとして管理できていなかった。

## 恒久的な再発防止

1. ProductionとstagingのSupabase、Vercel、Stripe、送信providerを常設environment matrixで管理する。
2. PreviewにProduction Supabase URL・anon・service role・送信credentialを設定できないrelease GateをCI/運用checklistへ固定する。
3. staging projectのplan、容量、pause状態、backup/restoreを週次確認する。
4. release branch作成前にstaging resource availabilityを確認し、未確保ならdeploy commitを作らない。
5. staging fixtureは架空データのみとし、Current DBをPreview書込試験へ流用しない。
6. 外部送信はenvironment別denyをdefaultにし、smoke後の明示再開とmonitoring確認を必須にする。

## 今回の安全成果

- Current DB変更0、追加migration0
- Vercel environment変更0、deploy0
- Production/L-LINK既存projectのpause/delete/流用0
- Stripe/LINE/L-LINK/email/Push送信0
- rollback不要
