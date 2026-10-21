-- Roll code back before removing the additive RPC; no table or data changes.
begin;
drop function if exists public.save_inspection_reminder_settings(uuid,jsonb);
commit;
