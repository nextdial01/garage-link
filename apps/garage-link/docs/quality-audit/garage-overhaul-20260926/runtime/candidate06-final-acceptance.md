# 最終固定候補06

Snapshot SHA256: f0aeecadeae801e1eb6180a9f8c5b4c1d68cb198c4d42e0200458bbca38e31ab
Source HEAD: a7cf7d75fb0dadcf3439c1565ad3e5a612fe08d5（追加修正commitは親担当）
検証終了時の原本drift0。stage/commit/pushは本担当では行っていません。

## 標準試験の継続実行

package.json test:db:fresh → scripts/db/run-g0b-ci.sh →専用overhaul fresh/upgrade lane → overhaul_birth_lifecycle_contract.sqlを含む8契約全て。
既存baseline/権限/並行/復旧試験を保持し、追加コンテナ2件もnetwork none、終了時自身の5件だけcleanup。外部一時runnerなしでPR内の標準コマンドから再実行可能です。

実行: `pnpm --filter @apps/garage-link run test:db:fresh` exit0。
standard-db-overhaul-integration.log:2516 fresh、3156 upgrade、3143/3717 DOB lifecycle PASS、3730全体PASS。
構文bash -n PASS、DBrunner unit4/4 PASS、8契約の一覧漏れ0。

## 候補05との関係

DB SQLは05と全件hash一致。05で実行した6DBsuite結果を保持し、06は変更した標準runnerの全経路を追加再実行。
実装・設定・資産・unit等は変更runnerとdocs/supabaseを除く699filesが05と全件一致。runtime digest c1365f48fc9a6cf04c6d7ade90909910b1bb9f08e43b3e7f727615717341cc73。
よって04build/Weblint/type/security388/QA99、03Mobilelint/type/14testfile/SSR144の証拠を継承。06でbuildを再実行したという主張ではありません。

## DOB実UI

authagent最終確認でNULL顧客削除→ごみ箱→復元→再開/reloadNULL保持PASS。削除前/復元後とも通常NULL編集のPATCH送信0、console/pageerror/failedrequest/HTTPerror各0。DOB_ARCHIVE_RESTORE_UI_RESULT.mdとruntime/dob-archive-restore-verification.json参照。

本番/main変更なし。実CAPTCHA・実機cameraなど他の未確認は親の最終台帳に従い、本書でPASSへ変更しません。
