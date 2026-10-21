-- Preserve the existing authenticated/RLS authorization; make settings + timings one transaction.
begin;
create or replace function public.save_inspection_reminder_settings(p_store_id uuid, p_settings jsonb)
returns void language plpgsql security invoker set search_path = '' as $function$
declare v_actor uuid := auth.uid(); v_count integer;
begin
 if v_actor is null or not exists (
   select 1 from public.current_user_active_store_membership m
   where m.user_id=v_actor and m.store_id=p_store_id and m.status='active' and m.role in ('owner','admin')
 ) then raise exception 'inspection_settings_forbidden' using errcode='42501'; end if;
 if jsonb_typeof(p_settings) is distinct from 'object'
   or jsonb_typeof(p_settings->'timings') is distinct from 'array'
 then raise exception 'inspection_settings_invalid' using errcode='22023'; end if;
 if exists (select 1 from unnest(array['enabled','exclude_sold','exclude_scrapped','exclude_reserved_or_in_service','require_customer_link']) k where jsonb_typeof(p_settings->k) is distinct from 'boolean') then
   raise exception 'inspection_settings_invalid' using errcode='22023';
 end if;
 if jsonb_array_length(p_settings->'timings')>365 or exists (
   select 1 from jsonb_array_elements(p_settings->'timings') t
   where jsonb_typeof(t->'offset_days') is distinct from 'number'
     or (t->>'offset_days') !~ '^[0-9]{1,3}$'
     or jsonb_typeof(t->'enabled') is distinct from 'boolean'
 ) then raise exception 'inspection_timings_invalid' using errcode='22023'; end if;
 if exists(select 1 from jsonb_array_elements(p_settings->'timings') t where (t->>'offset_days')::integer not between 1 and 365)
   or exists(select 1 from jsonb_array_elements(p_settings->'timings') t group by (t->>'offset_days')::integer having count(*)>1)
   or ((p_settings->>'enabled')::boolean and not exists(select 1 from jsonb_array_elements(p_settings->'timings') t where (t->>'enabled')::boolean))
 then raise exception 'inspection_timings_invalid' using errcode='22023'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('inspection-settings:'||p_store_id::text,0));
 insert into public.inspection_reminder_settings(store_id,enabled,exclude_sold,exclude_scrapped,exclude_reserved_or_in_service,require_customer_link,updated_by)
 values(p_store_id,(p_settings->>'enabled')::boolean,(p_settings->>'exclude_sold')::boolean,(p_settings->>'exclude_scrapped')::boolean,(p_settings->>'exclude_reserved_or_in_service')::boolean,(p_settings->>'require_customer_link')::boolean,v_actor)
 on conflict(store_id) do update set enabled=excluded.enabled,exclude_sold=excluded.exclude_sold,exclude_scrapped=excluded.exclude_scrapped,exclude_reserved_or_in_service=excluded.exclude_reserved_or_in_service,require_customer_link=excluded.require_customer_link,updated_by=v_actor;
 delete from public.inspection_reminder_timings where store_id=p_store_id;
 insert into public.inspection_reminder_timings(store_id,offset_days,enabled)
 select p_store_id,(t->>'offset_days')::integer,(t->>'enabled')::boolean from jsonb_array_elements(p_settings->'timings') t;
 get diagnostics v_count=row_count;
 if v_count<>jsonb_array_length(p_settings->'timings') then raise exception 'inspection_timings_count_mismatch';end if;
end;
$function$;
revoke all on function public.save_inspection_reminder_settings(uuid,jsonb) from public,anon,service_role;
grant execute on function public.save_inspection_reminder_settings(uuid,jsonb) to authenticated;
commit;
