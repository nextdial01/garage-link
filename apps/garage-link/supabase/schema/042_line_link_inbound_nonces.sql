-- L-LINK → GARAGE LINK S2S API のリプレイ防止用 nonce ストア。
-- 役割:
--   - 直近 10 分以内の同一 nonce 再利用を物理的に拒否する。
--   - GARAGE LINK の他テーブル・他機能には一切影響しない。
--   - service_role からのみ読み書きされる前提（インバウンド S2S 認証経路内）。
-- 設計前提:
--   - 1 行 1 リクエスト。10 分超のレコードは cleanup function で削除する。
--   - 表は postgres レベルで完結。Redis 等の外部依存を持たない。
--   - inspection_reminder_events / RLS / GRANT 既存スキーマには触れない。

create table if not exists public.line_link_inbound_nonces (
  nonce text primary key,
  store_id uuid not null,
  key_id text not null,
  seen_at timestamptz not null default now()
);

comment on table public.line_link_inbound_nonces is
  'L-LINK からの S2S リクエストで使用済み nonce を 10 分保持する（リプレイ防止）。';

create index if not exists idx_line_link_inbound_nonces_seen_at
  on public.line_link_inbound_nonces(seen_at);

alter table public.line_link_inbound_nonces enable row level security;

-- 通常クライアントには非公開。service_role のみ書き込み・読み取り。
grant select, insert, delete on table public.line_link_inbound_nonces to service_role;

-- 10 分超の使用済み nonce を削除する cleanup function（cron で呼ぶ想定。今回 cron は登録しない）。
create or replace function public.cleanup_line_link_inbound_nonces()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_count integer;
begin
  delete from public.line_link_inbound_nonces
   where seen_at < now() - interval '10 minutes';
  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

revoke all on function public.cleanup_line_link_inbound_nonces() from public;
grant execute on function public.cleanup_line_link_inbound_nonces() to service_role;

-- 確認用:
-- select count(*) from public.line_link_inbound_nonces;
-- select public.cleanup_line_link_inbound_nonces();

-- ロールバック（必要時）:
-- drop function if exists public.cleanup_line_link_inbound_nonces();
-- drop table if exists public.line_link_inbound_nonces;
