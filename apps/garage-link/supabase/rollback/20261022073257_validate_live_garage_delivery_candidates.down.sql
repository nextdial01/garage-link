-- Roll back the application calls with this function; no business rows changed.
begin;
do $rollback$
declare v_hash text;
begin
 select md5(prosrc) into v_hash from pg_proc where oid=to_regprocedure('public.validate_garage_delivery_candidates(uuid,uuid,uuid[],text)');
 if v_hash is null then return; end if;
 if v_hash <> '17efb437a1551547f14bc3cabd170008' then raise exception 'live validator rollback source drift'; end if;
 drop function public.validate_garage_delivery_candidates(uuid,uuid,uuid[],text);
end;
$rollback$;
commit;
