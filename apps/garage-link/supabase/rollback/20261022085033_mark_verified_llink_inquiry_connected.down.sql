-- Revert receiver application calls before removing this capability. Audit/receipt/marker rows remain.
begin;
do $rollback$
declare v_hash text;
begin
 select md5(prosrc) into v_hash from pg_proc where oid=to_regprocedure('public.mark_verified_llink_inquiry_connected(uuid,uuid,text,uuid,text)');
 if v_hash is null then return; end if;
 if v_hash <> '4b458583f6aa60808830ab0897b0702d' then raise exception 'inquiry marker rollback source drift'; end if;
 drop function public.mark_verified_llink_inquiry_connected(uuid,uuid,text,uuid,text);
end;
$rollback$;
commit;
