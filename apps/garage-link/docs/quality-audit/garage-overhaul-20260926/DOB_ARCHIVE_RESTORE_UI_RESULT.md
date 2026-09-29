# 旧NULL生年月日顧客の削除・復元 実UI検査

2026-09-26 JST、専用audit認証、local Supabase/Webのみ。補修migration `20260925193108_garage_customer_legacy_birth_lifecycle.sql` 適用後の追加検査です。既存候補04の実操作証拠とは別に記録します。

結果: PASS。合成顧客 `a9260000-0000-4000-8000-000000000096` を詳細で開く→生年月日空を確認→通常保存は安全エラー・customers PATCH未送信→削除確認→一覧から非表示→ゴミ箱に表示→設定へ戻る→ゴミ箱再開→復元確認→ゴミ箱から消える→再読込でも消失→顧客詳細再開・再読込で生年月日空を保持→通常保存は引き続きエラー・PATCH未送信。削除/復元のPATCHは成功を明示検査しました。

console error 0、pageerror 0、failed request 0、HTTP>=400 0。多店舗membership `.single()` の406懸念はこの実経路では再現せず、製品UIは変更していません。

fixtureは専用local transaction内でDOB triggerのみ一時disable→当該合成ID/store/name一致の1件NULL化→enable→commit、NULLとtrigger有効Oをread-backして準備。検査後は復元済み・DOBNULLのまま維持。一般編集の必須条件を弱めていません。

証拠: `runtime/dob-archive-restore.cjs`、`runtime/dob-archive-restore-results.json`、`runtime/dob-archive-restore-verification.json`。migration hash/日時/HEADをverificationへ記録。Native/E2E全体結果へ混在させません。
