-- GARAGE LINK -> L-LINK S2S 候補取得は service_role のみで inspection_reminder_events を読む。
-- 通常クライアント向け権限や RLS は広げない。
grant select on table public.inspection_reminder_events to service_role;
