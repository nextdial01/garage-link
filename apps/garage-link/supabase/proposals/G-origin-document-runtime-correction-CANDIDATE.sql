-- LOCAL REVIEW CANDIDATE ONLY. Current-source store version binding; no table grants.
BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='15s';
DO $baseline$
BEGIN
 IF md5(pg_get_functiondef('public.garage_link_source_guard_matches(uuid,jsonb)'::regprocedure)) IS DISTINCT FROM 'e0708705869fb63896bbd00dcb77406b' OR md5(pg_get_functiondef('public.garage_link_validate_handoff(uuid,uuid)'::regprocedure)) IS DISTINCT FROM '32b66f6c3bb3355357a7dcef5f985552' THEN
  RAISE EXCEPTION 'DOCUMENT_GUARD_BASELINE_CHANGED';
 END IF;
END $baseline$;
create or replace function public.garage_link_source_guard_matches(p_store_id uuid,p_guard jsonb) returns boolean language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare r jsonb;v_id uuid;v_values jsonb;v_at text;
begin
 if jsonb_typeof(p_guard)<>'object' or not(p_guard ?& array['table','id']) or exists(select 1 from jsonb_object_keys(p_guard) k where k not in('table','id','updatedAt','values')) then return false;end if;
 v_id:=(p_guard->>'id')::uuid;v_values:=p_guard->'values';v_at:=p_guard->>'updatedAt';
 if coalesce(v_at,'')='' and (jsonb_typeof(v_values) is distinct from 'object' or not exists(select 1 from jsonb_object_keys(v_values) k where k<>'id')) then return false;end if;
 if v_values is not null then
 if jsonb_typeof(v_values)<>'object' or exists(select 1 from jsonb_each(v_values) e where e.key not in('id','store_id','quote_id','invoice_id','name','description','quantity','unit_price','amount','tax_rate','tax_category','line_discount_input_amount','unit','item_order') or jsonb_typeof(e.value) not in('string','number','boolean','null')) then return false;end if;end if;
 case p_guard->>'table'
 when 'stores' then
 if v_id is distinct from p_store_id or p_guard ? 'values' or coalesce(v_at,'')='' or v_at !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{1,9})?(Z|[+-][0-9]{2}:[0-9]{2})$' then return false;end if;
 select to_jsonb(t) into r from public.stores t where id=v_id and id=p_store_id and updated_at is not null;
 when 'customers' then select to_jsonb(t) into r from public.customers t where id=v_id and store_id=p_store_id;
 when 'vehicles' then select to_jsonb(t) into r from public.vehicles t where id=v_id and store_id=p_store_id;
 when 'deals' then select to_jsonb(t) into r from public.deals t where id=v_id and store_id=p_store_id;
 when 'quotes' then select to_jsonb(t) into r from public.quotes t where id=v_id and store_id=p_store_id;
 when 'invoices' then select to_jsonb(t) into r from public.invoices t where id=v_id and store_id=p_store_id;
 when 'quote_items' then select to_jsonb(t) into r from public.quote_items t join public.quotes d on d.id=t.quote_id where t.id=v_id and d.store_id=p_store_id;
 when 'invoice_items' then select to_jsonb(t) into r from public.invoice_items t join public.invoices d on d.id=t.invoice_id where t.id=v_id and d.store_id=p_store_id;
 else return false;end case;
 if r is null then return false;end if;
 -- Timestamp-bearing source relations require their real version; values cannot weaken it.
 if r ? 'updated_at' and r->>'updated_at' is not null and coalesce(v_at,'')='' then return false;end if;
 if coalesce(v_at,'')<>'' and (r->>'updated_at')::timestamptz is distinct from v_at::timestamptz then return false;end if;
 if v_values is not null and not(r @> v_values) then return false;end if;
 return true;
 exception when invalid_text_representation or datetime_field_overflow or invalid_datetime_format then return false;
end$$;
create or replace function public.garage_link_validate_handoff(p_store_id uuid,p_request_id uuid) returns boolean language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare h public.garage_link_handoffs%rowtype;c jsonb;v jsonb;d jsonb;s public.garage_link_notice_settings%rowtype;g jsonb;p public.garage_link_vehicle_price_changes%rowtype;today date:=(now() at time zone 'Asia/Tokyo')::date;n integer;
begin
 if auth.role() is distinct from 'service_role' and not exists(select 1 from public.current_user_active_store_membership m where m.store_id=p_store_id and m.role in('owner','admin')) then return false;end if;
 select * into h from public.garage_link_handoffs where id=p_request_id and store_id=p_store_id;
 if not found or h.revoked_at is not null or h.status not in('pending','imported') then return false;end if;
 if jsonb_typeof(h.payload) is distinct from 'object' or h.payload->>'version' is distinct from '1' or jsonb_typeof(h.payload->'sourceGuards') is distinct from 'array' or jsonb_typeof(h.payload->'bodyText') is distinct from 'string' or length(btrim(h.payload->>'bodyText'))<1 or length(h.payload->>'bodyText')>5000 or jsonb_typeof(h.payload->'customerName') is distinct from 'string' or length(h.payload->>'customerName')>300 or jsonb_typeof(h.payload->'vehicleName') is distinct from 'string' or length(h.payload->>'vehicleName')>300 then return false;end if;

 if not exists(select 1 from public.stores st join public.tenants t on t.id=st.tenant_id join public.company_subscriptions cs on cs.tenant_id=t.id and cs.status='active' and cs.l_link_integration_enabled where st.id=p_store_id and st.status='active' and t.status='active') then return false;end if;
 select to_jsonb(x) into c from public.customers x where id=h.customer_id and store_id=p_store_id;
 if c is null or c->>'deleted_at' is not null or coalesce((c->>'is_archived')::boolean,false) or coalesce(c->>'delivery_permission','') not in('allowed','許可') or (coalesce(c->>'customer_status','') in('blocked','配信停止') or coalesce(c->>'line_friend_status','') in('blocked','ブロック')) then return false;end if;
 if jsonb_array_length(h.payload->'sourceGuards')<1 then return false;end if;
 if not exists(select 1 from jsonb_array_elements(h.payload->'sourceGuards') x where x->>'table'='customers' and x->>'id'=h.customer_id::text) then return false;end if;
 if h.vehicle_id is not null and not exists(select 1 from jsonb_array_elements(h.payload->'sourceGuards') x where x->>'table'='vehicles' and x->>'id'=h.vehicle_id::text) then return false;end if;
 if h.kind in('deal_notice','quote_notice','invoice_notice') and not exists(select 1 from jsonb_array_elements(h.payload->'sourceGuards') x where x->>'table'=case h.kind when 'deal_notice' then 'deals' when 'quote_notice' then 'quotes' else 'invoices' end and x->>'id'=h.source_id::text) then return false;end if;
 if h.kind in('quote_notice','invoice_notice') and not exists(select 1 from jsonb_array_elements(h.payload->'sourceGuards') x where x->>'table'='stores' and x->>'id'=p_store_id::text) then return false;end if;
 if h.kind='quote_notice' and exists(select 1 from public.quote_items i where i.quote_id=h.source_id and not exists(select 1 from jsonb_array_elements(h.payload->'sourceGuards') x where x->>'table'='quote_items' and x->>'id'=i.id::text)) then return false;end if;
 if h.kind='invoice_notice' and exists(select 1 from public.invoice_items i where i.invoice_id=h.source_id and not exists(select 1 from jsonb_array_elements(h.payload->'sourceGuards') x where x->>'table'='invoice_items' and x->>'id'=i.id::text)) then return false;end if;

 for g in select value from jsonb_array_elements(h.payload->'sourceGuards') loop
 if not public.garage_link_source_guard_matches(p_store_id,g) then return false;end if;
 if g->>'table'='quote_items' and (h.kind<>'quote_notice' or not exists(select 1 from public.quote_items i where i.id=(g->>'id')::uuid and i.quote_id=h.source_id)) then return false;end if;
 if g->>'table'='invoice_items' and (h.kind<>'invoice_notice' or not exists(select 1 from public.invoice_items i where i.id=(g->>'id')::uuid and i.invoice_id=h.source_id)) then return false;end if;
 end loop;
 if h.vehicle_id is not null then
 select to_jsonb(x) into v from public.vehicles x where id=h.vehicle_id and store_id=p_store_id;
 if v is null or v->>'deleted_at' is not null or coalesce((v->>'is_archived')::boolean,false) or coalesce(v->>'status','') in('廃車','scrapped') then return false;end if;end if;
 if h.kind in('deal_notice','quote_notice','invoice_notice') then
 if h.kind='deal_notice' then select to_jsonb(x) into d from public.deals x where id=h.source_id and store_id=p_store_id;
 else
 if h.kind='quote_notice' then select to_jsonb(x) into d from public.quotes x where id=h.source_id and store_id=p_store_id;
 else select to_jsonb(x) into d from public.invoices x where id=h.source_id and store_id=p_store_id;end if;
 if d is null or d->>'issue_status'<>'issued' or d->>'deleted_at' is not null or coalesce((d->>'is_archived')::boolean,false) or (d->>'customer_id')::uuid is distinct from h.customer_id or (d->>'vehicle_id')::uuid is distinct from h.vehicle_id then return false;end if;
 -- Standalone issued documents use only their explicit customer relation. No name inference.
 if d->>'deal_id' is null then return true;end if;
 select to_jsonb(x) into d from public.deals x where id=(d->>'deal_id')::uuid and store_id=p_store_id;
 end if;
 if d is null or d->>'deleted_at' is not null or coalesce(d->>'status','') in('失注','cancelled','canceled') or (d->>'customer_id')::uuid is distinct from h.customer_id or (d->>'vehicle_id')::uuid is distinct from h.vehicle_id then return false;end if;
 elsif h.kind='price_reduction' then
 if h.source_id is distinct from h.vehicle_id or coalesce(v->>'status','') in('売約済','売約','sold') then return false;end if;
 select * into p from public.garage_link_vehicle_price_changes where store_id=p_store_id and vehicle_id=h.vehicle_id order by created_at desc,id desc limit 1;
 if not found or p.id is distinct from (h.payload->>'priceChangeId')::uuid or p.vehicle_version is distinct from (v->>'updated_at')::timestamptz or p.new_base_price is distinct from (v->>'base_price')::numeric or p.new_total_price is distinct from (v->>'total_price')::numeric then return false;end if;
 if not exists(select 1 from public.deals x where x.store_id=p_store_id and x.vehicle_id=h.vehicle_id and x.customer_id=h.customer_id and x.deleted_at is null and x.status in('新規','連絡済み','来店予定','見積済み','商談中')) then return false;end if;
 elsif h.kind='repurchase' then
 select * into s from public.garage_link_notice_settings where store_id=p_store_id;
 n:=(h.payload->>'repurchaseMonths')::integer;
 if not found or not s.repurchase_enabled or n is distinct from s.repurchase_before_months or v->>'inspection_expiry_date' is null or today>(v->>'inspection_expiry_date')::date or today<((v->>'inspection_expiry_date')::date-make_interval(months=>n))::date then return false;end if;
 if h.source_id is distinct from h.vehicle_id or not exists(select 1 from public.deals x where x.store_id=p_store_id and x.vehicle_id=h.vehicle_id and x.customer_id=h.customer_id and x.deleted_at is null and x.status='成約') or (select count(distinct x.customer_id) from public.deals x where x.store_id=p_store_id and x.vehicle_id=h.vehicle_id and x.deleted_at is null and x.status='成約')<>1 then return false;end if;
 else return false;end if;
 return true;
 exception when invalid_text_representation or datetime_field_overflow or invalid_datetime_format then return false;
end$$;

-- CREATE OR REPLACE preserves the existing function ACLs. No role/table grant changes.
COMMIT;
