-- GARAGE LINK legacy PII cleanup plan
-- 目的:
--   022〜027適用後、過去ログに残っている可能性があるPII/本文/raw payloadをstagingで洗い出すための計画SQLです。
--
-- 重要:
--   このファイルは本番即適用用ではありません。
--   デフォルトでは件数確認SELECTのみ実行され、データを変更しません。
--   UPDATE案はすべてコメントアウトしています。
--   本番では必ずバックアップ、staging検証、対象件数確認後に必要なUPDATEだけを明示的に有効化してください。
--
-- 方針:
--   - 業務データである line_message_drafts.body / line_form_responses.answers / 問い合わせ本文 / customers は削除しない
--   - 監査・security・webhook・配信ログに不要に残る本文・raw payload・LINE userIdを優先してマスク/削除する
--   - LINE userIdはhashへ移行してから生値をNULL化する
--   - message bodyはhash/lengthへ移行してから空文字化する

create extension if not exists "pgcrypto";

-- ============================================================
-- 1. 適用前の件数確認
-- ============================================================

-- Webhookログ内の本文・LINE userId・full raw payload候補
select
  'line_webhook_events.message_text_not_null' as check_name,
  count(*) as row_count
from public.line_webhook_events
where message_text is not null and btrim(message_text) <> '';

select
  'line_webhook_events.line_user_id_not_null' as check_name,
  count(*) as row_count
from public.line_webhook_events
where line_user_id is not null and btrim(line_user_id) <> '';

select
  'line_webhook_events.raw_event_full_payload_candidate' as check_name,
  count(*) as row_count
from public.line_webhook_events
where raw_event is not null
  and (
    raw_event ? 'source'
    or raw_event ? 'message'
    or raw_event ? 'replyToken'
    or raw_event::text ~* '(userId|message|text|address|phone|email)'
  );

-- 送信ログ内の本文・LINE userId・表示名候補
select
  'line_message_logs.body_not_empty' as check_name,
  count(*) as row_count
from public.line_message_logs
where body is not null and btrim(body) <> '';

select
  'line_message_logs.line_user_id_not_null' as check_name,
  count(*) as row_count
from public.line_message_logs
where line_user_id is not null and btrim(line_user_id) <> '';

select
  'line_message_logs.line_display_name_not_null' as check_name,
  count(*) as row_count
from public.line_message_logs
where line_display_name is not null and btrim(line_display_name) <> '';

-- 監査ログ・security log内にPII keyが残っていそうな候補
select
  'audit_logs.metadata_pii_candidate' as check_name,
  count(*) as row_count
from public.audit_logs
where coalesce(metadata::text, '') ~* '(email|phone|tel|address|line_user|message|body|content|raw_event|answer|inquiry|token|secret)';

select
  'audit_logs.before_after_pii_candidate' as check_name,
  count(*) as row_count
from public.audit_logs
where coalesce(before_data::text, '') ~* '(email|phone|tel|address|line_user|message|body|content|raw_event|answer|inquiry|token|secret)'
   or coalesce(after_data::text, '') ~* '(email|phone|tel|address|line_user|message|body|content|raw_event|answer|inquiry|token|secret)';

select
  'security_events.details_pii_candidate' as check_name,
  count(*) as row_count
from public.security_events
where coalesce(details::text, '') ~* '(email|phone|tel|address|line_user|message|body|content|raw_event|answer|inquiry|token|secret)';

-- 業務データは件数確認のみ。cleanup対象にはしません。
select
  'line_message_drafts.body_business_data' as check_name,
  count(*) as row_count
from public.line_message_drafts
where body is not null and btrim(body) <> '';

select
  'line_form_responses.answers_business_data' as check_name,
  count(*) as row_count
from public.line_form_responses
where answers is not null;

select
  'uploaded_files.original_filename_present' as check_name,
  count(*) as row_count
from public.uploaded_files
where original_filename is not null and btrim(original_filename) <> '';

-- ============================================================
-- 2. staging検証用UPDATE案
-- ============================================================
-- 以下は意図的にコメントアウトしています。
-- stagingで件数確認後、必要なブロックだけコメントを外して実行してください。
-- 本番では必ずバックアップ後に実行してください。

-- begin;

-- 2-1. Webhookログ: LINE userIdをhash化し、生値をNULL化する準備
-- update public.line_webhook_events
-- set source_user_hash = coalesce(source_user_hash, encode(digest(line_user_id, 'sha256'), 'hex'))
-- where line_user_id is not null
--   and btrim(line_user_id) <> ''
--   and source_user_hash is null;

-- 2-2. Webhookログ: raw_event hashを補完し、raw_eventを最小メタデータへ置換
-- update public.line_webhook_events
-- set raw_event_hash = coalesce(raw_event_hash, encode(digest(raw_event::text, 'sha256'), 'hex')),
--     raw_event = jsonb_strip_nulls(jsonb_build_object(
--       'eventId', coalesce(event_id, raw_event ->> 'webhookEventId'),
--       'type', coalesce(event_type, raw_event ->> 'type'),
--       'sourceType', coalesce(source_type, raw_event #>> '{source,type}'),
--       'messageType', coalesce(message_type, raw_event #>> '{message,type}'),
--       'rawEventHash', coalesce(raw_event_hash, encode(digest(raw_event::text, 'sha256'), 'hex')),
--       'redactedAt', now()
--     )),
--     message_text = null,
--     line_user_id = null
-- where raw_event is not null
--   and (
--     message_text is not null
--     or line_user_id is not null
--     or raw_event ? 'source'
--     or raw_event ? 'message'
--     or raw_event ? 'replyToken'
--     or raw_event::text ~* '(userId|message|text|address|phone|email)'
--   );

-- 2-3. 送信ログ: 本文とLINE userIdをhash/lengthへ移行し、生値を削除
-- update public.line_message_logs
-- set body_hash = case
--       when body is not null and btrim(body) <> '' then coalesce(body_hash, encode(digest(body, 'sha256'), 'hex'))
--       else body_hash
--     end,
--     body_length = case
--       when body is not null then coalesce(body_length, char_length(body))
--       else body_length
--     end,
--     line_user_hash = case
--       when line_user_id is not null and btrim(line_user_id) <> '' then coalesce(line_user_hash, encode(digest(line_user_id, 'sha256'), 'hex'))
--       else line_user_hash
--     end,
--     body = '',
--     line_user_id = null,
--     line_display_name = null,
--     body_redacted_at = coalesce(body_redacted_at, now())
-- where (body is not null and btrim(body) <> '')
--    or (line_user_id is not null and btrim(line_user_id) <> '')
--    or (line_display_name is not null and btrim(line_display_name) <> '');

-- 2-4. 監査ログ: suspicious keyを含むJSONは即時自動削除せず、stagingでサンプル確認後に個別対応する
-- 注意: before_data / after_data を一括NULL化すると監査証跡が弱くなるため、本番では個別方針決定後に実施してください。
-- update public.audit_logs
-- set metadata = coalesce(metadata, '{}'::jsonb) - array[
--   'email', 'phone', 'tel', 'address', 'line_user_id', 'message', 'message_text',
--   'body', 'content', 'raw_event', 'form_answer', 'answer', 'inquiry',
--   'token', 'secret', 'access_token', 'channel_secret'
-- ]
-- where coalesce(metadata::text, '') ~* '(email|phone|tel|address|line_user|message|body|content|raw_event|answer|inquiry|token|secret)';

-- 2-5. security_events: detailsから危険keyを除外
-- update public.security_events
-- set details = coalesce(details, '{}'::jsonb) - array[
--   'email', 'phone', 'tel', 'address', 'line_user_id', 'message', 'message_text',
--   'body', 'content', 'raw_event', 'form_answer', 'answer', 'inquiry',
--   'token', 'secret', 'access_token', 'channel_secret', 'signature', 'authorization'
-- ]
-- where coalesce(details::text, '') ~* '(email|phone|tel|address|line_user|message|body|content|raw_event|answer|inquiry|token|secret|signature|authorization)';

-- rollback;
-- stagingで確認できたら rollback を commit に変えて、対象ブロックごとに小さく実行してください。

-- ============================================================
-- 3. cleanup後の確認SQL
-- ============================================================

-- select 'line_webhook_events.message_text_remaining', count(*) from public.line_webhook_events where message_text is not null and btrim(message_text) <> '';
-- select 'line_webhook_events.line_user_id_remaining', count(*) from public.line_webhook_events where line_user_id is not null and btrim(line_user_id) <> '';
-- select 'line_message_logs.body_remaining', count(*) from public.line_message_logs where body is not null and btrim(body) <> '';
-- select 'line_message_logs.line_user_id_remaining', count(*) from public.line_message_logs where line_user_id is not null and btrim(line_user_id) <> '';
-- select 'line_message_drafts.retained', count(*) from public.line_message_drafts where body is not null and btrim(body) <> '';
-- select 'line_form_responses.retained', count(*) from public.line_form_responses where answers is not null;

-- ============================================================
-- 4. 本番適用前メモ
-- ============================================================
-- - このcleanupは本番DBへ直接適用しないでください。
-- - まずstagingで対象件数、画面、API、監査証跡への影響を確認してください。
-- - 業務データとして必要な下書き本文、フォーム回答、問い合わせ本文、顧客台帳は削除対象外です。
-- - 本番適用時はDBバックアップ、対象件数記録、実行後件数比較、rollback方針を必須にしてください。
