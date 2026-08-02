# GARAGE LINK post-R1 manual backup report

- 実施日: 2026-07-27
- 実施時刻: 21:30 JST
- 対象: GARAGE LINK Current Supabase
- project fingerprint: `5b41e1af2add`
- 判定: **BLOCKED / backup未取得**

## 1. 対象project

- repository root: `/Users/ksk/garage-link/apps/garage-link`
- linked project fingerprint: `5b41e1af2add`
- 直前のSQL Editor R1 postcheck: PASS
- migration ledger: 39
- migration適用: 0
- L-LINK: 別project。接続・変更なし

## 2. 実行日時

- JST: 2026-07-27 21:30
- 新規保存先候補: `/Users/ksk/Library/Application Support/Codex/garage-link-backups/post-r1-20260727-213001`

## 3. 使用を試みたbackup方式

- Supabase CLI: `2.107.0`
- `supabase db dump --help`で`--linked`、`--role-only`、`--data-only`、`--schema`、`--file`を確認
- credentialをコマンドラインへ渡さず、既存linked接続によるroles dumpを最初に試行

結果:

- CLI API認証: 401 Unauthorized
- CLI判定: 実行環境に既存Current DB passwordが未設定
- database dump接続: 開始前停止
- DB query: 0件
- DB write: 0件
- migration: 0件

credential調査、再発行、revoke、rotation、別project確認へは進んでいない。

## 4. 保存先

新規directoryをpermission `700`で作成したが、dump開始前に停止しファイルは0件だった。空directoryをbackupと誤認しないよう削除した。

- durable backup directory: 未作成
- 既存backupの上書き: なし
- 一時領域backup: なし

## 5. File一覧・size・SHA-256

| 項目 | 結果 |
|---|---|
| backup file数 | 0 |
| 合計容量 | 0 bytes |
| SHA-256 | 未作成 |
| backup set SHA-256 | 未作成 |
| directory permission | 候補directory作成時`700`、空のため削除 |
| file permission | 対象fileなし |

0バイトfileや空directoryは成功扱いにしていない。

## 6. Public schema・data

- public schema: 未取得
- public data: 未取得

## 7. Migration ledger

- dump: 未取得
- 直前R1 postcheckのread-only結果: 39件
- 今回のmigration適用: 0件

## 8. RLS・policy・RPC

- catalog dump: 未取得
- 直前R1 postcheck: RLS table 103、policy 364
- 今回のRLS/policy/RPC変更: 0件

## 9. Auth・Storage

- Auth schema/data: 未取得
- Storage schema/metadata: 未取得
- managed Auth完全復元: 未確認
- Storage object実体: 未保全

成功範囲には含めない。

## 10. Local restore

backup setが存在しないためNOT TESTED。Current DBへのrestoreは行っていない。

## 11. Current側変更確認

dumpはAPI認証前に停止した。

| 項目 | 結果 |
|---|---:|
| dump DB query | 0 |
| Current DB write | 0 |
| migration適用 | 0 |
| rollback | 0 |
| C5 | 0 |
| external provider通信 | 0 |
| L-LINK接続 | 0 |

R1後の最終確認値は`26-db004-r1-sql-editor-execution-report.md`のpostcheckを正本とする。

## 12. 残存リスク

- post-R1時点のschema/data/ledger/catalog backupが存在しない
- Auth/Storageが未保全
- restore可能性未確認
- backupがないためC5へ進めない

## 13. C5開始可否

**不可**。`08-post-r1-backup-checklist.md`を満たす耐久backupとSHA-256が完成するまでC5は禁止する。

## 14. Operatorが行う具体的な1操作

Codex起動元の承認済みsecret管理機構へ、既存GARAGE LINK Current DB passwordを`SUPABASE_DB_PASSWORD`として設定し、Codexを再起動する。

passwordの実値はチャット、shell引数、監査文書へ記載しない。Codexはこの1操作が完了するまで認証調査を行わない。

## 15. Operator完了backupの追認（2026-07-27）

operatorが`/Users/ksk/garage-link-backups/post-r1-20260727-214232`へ論理backupを取得した。Codexのread-only検査でdirectory 700、files 600、5 dump全件非0 byte、SHA256SUMS 5/5一致を確認した。dump合計759,593 bytes、backup set SHA-256は`f88c814c8bb1253f15c635ced14637874fb54872dfdcf001da704240653eec00`。

backup GateはPASSへ更新した。後続C5は別途実行し、SQL defect `TEST-003`によりFAILした。詳細は`28-post-r1-c5-read-only-report.md`。
