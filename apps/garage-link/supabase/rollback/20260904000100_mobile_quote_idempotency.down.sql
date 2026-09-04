begin;
revoke execute on function public.garage_mobile_create_quote(uuid,uuid,text,text,jsonb,jsonb) from service_role;
drop function if exists public.garage_mobile_create_quote(uuid,uuid,text,text,jsonb,jsonb);
drop index if exists public.garage_mobile_quotes_store_idempotency_uidx;
alter table public.quotes drop column if exists mobile_idempotency_key;
commit;
