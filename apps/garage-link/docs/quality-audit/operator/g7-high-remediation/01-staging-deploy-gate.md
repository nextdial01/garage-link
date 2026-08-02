# G7 staging deploy Gate

## 現在の判定（2026-07-28更新）

**BLOCKED / Phase 1 environment separation**。Current DB Gateはledger 50でPASSしたが、Vercel PreviewとProductionが同一のSupabase URL・anon key・service role variableを共有し、メール送信credentialもPreviewへ配布されている。専用remote staging Supabaseが未構成のため、deploy前で停止した。

staging deploy 0、Current追加migration 0、Current data変更0、外部送信0。詳細は`35-staging-deploy-and-runtime-validation-report.md`と`evidence/staging-runtime-validation.json`を正本とする。

## staging deployへ進める条件

1. GARAGE LINK Current backup、SHA-256、restore範囲が確認済み
2. Current compatibility＋G7適用成功、ledger 50
3. Current schema/data postcheck PASS
4. RLS・policy・RPC・owner・grant・row/backfill Gate PASS
5. G1-A〜G4-B/G7、非owner境界、Security/API/build/browser回帰PASS
6. Current想定外変更0、外部送信0
7. staging deployの別operator承認

上記DB Gateとoperator承認は完了した。追加条件として、Currentと異なるremote staging Supabase、Preview専用credential、外向きdeny、再現可能なdeploy commitを確定するまでVercel deployを実行しない。
