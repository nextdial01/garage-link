begin;
create or replace function public.skip_inspection_reminder_event(p_store_id uuid,p_event_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_event public.inspection_reminder_events%rowtype;
begin
 if not public.current_user_can_admin_store(p_store_id) then raise exception 'reminder_skip_forbidden' using errcode='42501'; end if;
 select * into v_event from public.inspection_reminder_events where id=p_event_id and store_id=p_store_id for update;
 if not found then raise exception 'reminder_not_found' using errcode='42501'; end if;
 if v_event.status='skipped' then return jsonb_build_object('ok',true,'replayed',true); end if;
 if v_event.status<>'pending' then return jsonb_build_object('ok',false,'code','REMINDER_NOT_PENDING'); end if;
 update public.inspection_reminder_events set status='skipped',updated_at=now() where id=p_event_id and store_id=p_store_id and status='pending';
 if not found then return jsonb_build_object('ok',false,'code','REMINDER_NOT_PENDING'); end if;
 return jsonb_build_object('ok',true,'replayed',false);
end $$;
revoke all on function public.skip_inspection_reminder_event(uuid,uuid) from public,anon;
grant execute on function public.skip_inspection_reminder_event(uuid,uuid) to authenticated;
commit;
notify pgrst,'reload schema';
