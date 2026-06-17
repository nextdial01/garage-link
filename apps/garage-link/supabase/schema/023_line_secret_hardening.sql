-- GARAGE LINK LINE secret hardening
-- LINE Channel Secret / Channel Access Tokenを暗号化保存へ移行するためのSQLです。
-- 既存の平文カラムは段階移行のため残しますが、authenticatedから直接読めないようにします。

alter table public.line_settings
  add column if not exists channel_secret_encrypted text,
  add column if not exists channel_access_token_encrypted text,
  add column if not exists channel_secret_last4 text,
  add column if not exists channel_access_token_last4 text,
  add column if not exists secret_encrypted_at timestamptz,
  add column if not exists token_encrypted_at timestamptz,
  add column if not exists secret_rotated_at timestamptz,
  add column if not exists token_rotated_at timestamptz;

comment on column public.line_settings.channel_secret is '移行前互換用の平文Channel Secret。新規保存では使用しない';
comment on column public.line_settings.channel_access_token is '移行前互換用の平文Channel Access Token。新規保存では使用しない';
comment on column public.line_settings.channel_secret_encrypted is 'APP_ENCRYPTION_KEYで暗号化したChannel Secret';
comment on column public.line_settings.channel_access_token_encrypted is 'APP_ENCRYPTION_KEYで暗号化したChannel Access Token';
comment on column public.line_settings.channel_secret_last4 is 'Channel Secretの末尾4文字。画面表示用';
comment on column public.line_settings.channel_access_token_last4 is 'Channel Access Tokenの末尾4文字。画面表示用';

create index if not exists idx_line_settings_secret_encrypted_at
  on public.line_settings(secret_encrypted_at);

create index if not exists idx_line_settings_token_encrypted_at
  on public.line_settings(token_encrypted_at);

-- 既存のテーブル単位権限は平文カラムも読めてしまうため、列単位権限へ寄せます。
-- RLSは既存policyを維持し、所属店舗の行だけ見える状態を保ちます。
revoke select on public.line_settings from authenticated;
revoke insert on public.line_settings from authenticated;
revoke update on public.line_settings from authenticated;
revoke delete on public.line_settings from authenticated;

grant select (
  id,
  store_id,
  line_account_name,
  basic_id,
  channel_id,
  webhook_url,
  connection_status,
  webhook_enabled,
  signature_verification_enabled,
  last_webhook_tested_at,
  default_sender_name,
  unsubscribe_message,
  friend_add_message,
  block_handling,
  default_delivery_permission,
  quiet_hours_enabled,
  quiet_hours_start,
  quiet_hours_end,
  internal_memo,
  channel_secret_last4,
  channel_access_token_last4,
  secret_encrypted_at,
  token_encrypted_at,
  secret_rotated_at,
  token_rotated_at,
  created_at,
  updated_at
) on public.line_settings to authenticated;

grant insert (
  store_id,
  line_account_name,
  basic_id,
  channel_id,
  webhook_url,
  connection_status,
  webhook_enabled,
  signature_verification_enabled,
  default_sender_name,
  unsubscribe_message,
  friend_add_message,
  block_handling,
  default_delivery_permission,
  quiet_hours_enabled,
  quiet_hours_start,
  quiet_hours_end,
  internal_memo
) on public.line_settings to authenticated;

grant update (
  line_account_name,
  basic_id,
  channel_id,
  webhook_url,
  connection_status,
  webhook_enabled,
  signature_verification_enabled,
  default_sender_name,
  unsubscribe_message,
  friend_add_message,
  block_handling,
  default_delivery_permission,
  quiet_hours_enabled,
  quiet_hours_start,
  quiet_hours_end,
  internal_memo
) on public.line_settings to authenticated;

-- 暗号化カラムと既存平文カラムの更新は、サーバーAPIからservice roleで行います。
-- 既存平文データの暗号化移行は、APP_ENCRYPTION_KEYを使うサーバー側移行処理で実施してください。

-- 確認用:
-- select store_id, channel_secret_last4, channel_access_token_last4, secret_encrypted_at, token_encrypted_at from public.line_settings;
