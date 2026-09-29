begin;
insert into public.inspection_reminder_events(id,store_id,inspection_expiry_date,reminder_offset_days,idempotency_key,status) values
('99000000-0000-0000-0000-000000000001','51100000-0000-0000-0000-000000000001',current_date+30,30,'overhaul-skip-1','pending'),
('99000000-0000-0000-0000-000000000002','51100000-0000-0000-0000-000000000001',current_date+30,30,'overhaul-skip-2','processing');
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','50000000-0000-0000-0000-000000000001',true);
do $$ declare v jsonb; begin
 begin update public.inspection_reminder_events set status='skipped' where id='99000000-0000-0000-0000-000000000001'; raise exception 'direct event update accepted'; exception when insufficient_privilege then null; end;
 v:=public.skip_inspection_reminder_event('51100000-0000-0000-0000-000000000001','99000000-0000-0000-0000-000000000001');
 if (v->>'ok')::boolean is distinct from true then raise exception 'pending skip failed'; end if;
 v:=public.skip_inspection_reminder_event('51100000-0000-0000-0000-000000000001','99000000-0000-0000-0000-000000000001');
 if (v->>'replayed')::boolean is distinct from true then raise exception 'skip replay failed'; end if;
 v:=public.skip_inspection_reminder_event('51100000-0000-0000-0000-000000000001','99000000-0000-0000-0000-000000000002');
 if (v->>'ok')::boolean is distinct from false then raise exception 'processing skip accepted'; end if;
 begin perform public.skip_inspection_reminder_event('51100000-0000-0000-0000-000000000002','99000000-0000-0000-0000-000000000001'); raise exception 'foreign scope accepted'; exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub','50000000-0000-0000-0000-000000000005',true);
do $$ begin
 begin perform public.skip_inspection_reminder_event('51100000-0000-0000-0000-000000000001','99000000-0000-0000-0000-000000000001'); raise exception 'viewer skip accepted'; exception when insufficient_privilege then null; end;
end $$;
rollback;
select 'OVERHAUL_REMINDER_SKIP_PASS' result;
