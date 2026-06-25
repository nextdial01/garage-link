-- 037 配信候補イベント種別の拡張（L-LINK連携基盤・前方互換）
--
-- 目的:
--   035 の inspection_reminder_events は event_type を 'inspection_reminder'（車検案内）のみに
--   制限している。Phase 4 では点検・納車後フォロー・長期未接触・買替・口コミ依頼などの
--   「配信候補」も同じ基盤で扱えるようにするため、CHECK 制約を前方互換に緩和する。
--
-- 方針:
--   - 既存の 'inspection_reminder' はそのまま有効（035の生成関数・データに影響なし）。
--   - 追加種別を許可するのみ。テーブル構造・RLS・権限・既存行は変更しない。
--   - 実際の各種別の生成関数・実LINE送信は本migrationに含めない（送信責務はL-LINK側）。
--
-- 影響範囲: public.inspection_reminder_events の CHECK 制約のみ。データ更新なし。
-- ロールバック: 末尾コメント参照（'inspection_reminder' 単独制約へ戻す）。

alter table public.inspection_reminder_events
  drop constraint if exists inspection_reminder_events_type_check;

alter table public.inspection_reminder_events
  add constraint inspection_reminder_events_type_check
  check (event_type in (
    'inspection_reminder',     -- 車検案内（既存）
    'periodic_inspection',     -- 点検案内
    'post_delivery_follow_up', -- 納車後フォロー（30/90/180日 等）
    'long_no_contact',         -- 長期未接触
    'repurchase',              -- 買替提案
    'review_request'           -- 口コミ依頼
  ));

-- 確認用:
-- select conname, pg_get_constraintdef(oid) from pg_constraint
-- where conrelid = 'public.inspection_reminder_events'::regclass and conname like '%type_check%';

-- ロールバック（必要時）:
-- alter table public.inspection_reminder_events drop constraint if exists inspection_reminder_events_type_check;
-- alter table public.inspection_reminder_events add constraint inspection_reminder_events_type_check
--   check (event_type in ('inspection_reminder'));
-- ※ 追加種別の行が既に存在する場合、単独制約へ戻すと失敗する点に注意（先に該当行の扱いを決めること）。
