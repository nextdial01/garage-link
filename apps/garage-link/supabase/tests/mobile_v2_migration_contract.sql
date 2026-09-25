do $$ begin
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='vehicles' and column_name='purchase_supplier_name') then raise exception 'missing supplier'; end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='vehicles' and column_name='direct_cost_repair') then raise exception 'missing repair cost'; end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='uploaded_files' and column_name='photo_category') then raise exception 'missing photo category'; end if;
  if not has_table_privilege('service_role','public.uploaded_files','SELECT') or not has_table_privilege('service_role','public.uploaded_files','INSERT') then raise exception 'mobile photo metadata service write unavailable'; end if;
  if has_table_privilege('authenticated','public.uploaded_files','INSERT') or has_table_privilege('anon','public.uploaded_files','INSERT') then raise exception 'direct photo metadata insert exposed'; end if;
  if not exists (select 1 from pg_class where oid='public.garage_mobile_quote_operations'::regclass and relrowsecurity) then raise exception 'quote operations RLS disabled'; end if;
  if not exists (select 1 from pg_class where oid='public.garage_mobile_sale_price_operations'::regclass and relrowsecurity) then raise exception 'sale operations RLS disabled'; end if;
  if not exists (select 1 from pg_class where oid='public.garage_mobile_maintenance_operations'::regclass and relrowsecurity) then raise exception 'maintenance operations RLS disabled'; end if;
  if has_function_privilege('authenticated','public.garage_mobile_create_quote(uuid,uuid,text,text,jsonb,jsonb)','execute') then raise exception 'quote RPC exposed to authenticated'; end if;
  if not has_function_privilege('service_role','public.garage_mobile_create_quote(uuid,uuid,text,text,jsonb,jsonb)','execute') then raise exception 'service cannot call quote RPC'; end if;
  if has_function_privilege('authenticated','public.garage_mobile_update_maintenance(uuid,uuid,uuid,text,text,text,text,boolean,timestamptz)','execute') then raise exception 'maintenance RPC exposed to authenticated'; end if;
  if not has_function_privilege('service_role','public.garage_mobile_update_maintenance(uuid,uuid,uuid,text,text,text,text,boolean,timestamptz)','execute') then raise exception 'service cannot call maintenance RPC'; end if;
end $$;
select 'MOBILE_V2_MIGRATION_CONTRACT_PASS' as result;
