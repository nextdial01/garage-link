-- REVIEW-ONLY candidate. Not an applied migration; no production execution.
begin;
create table public.garage_link_notice_settings (
 store_id uuid primary key references public.stores(id),
 repurchase_enabled boolean not null default false,
 repurchase_before_months integer not null default 3 check(repurchase_before_months between 0 and 60),
 templates jsonb not null default '{"deal_notice":"{{customer_name}}様\n{{deal_title}}についてご案内します。","quote_notice":"{{customer_name}}様\nお見積書をご確認ください。\n{{document_url}}","invoice_notice":"{{customer_name}}様\nご請求書をご確認ください。\n{{document_url}}","price_reduction":"{{customer_name}}様\n{{vehicle_name}}の販売価格が{{old_price}}から{{new_price}}に変更されました。","repurchase":"{{customer_name}}様\n{{vehicle_name}}の車検満了日（{{inspection_expiry_date}}）が近づいています。お買替えのご相談を承ります。"}'::jsonb,
 updated_at timestamptz not null default clock_timestamp(),
 check(jsonb_typeof(templates)='object' and templates ?& array['deal_notice','quote_notice','invoice_notice','price_reduction','repurchase'])
);
create table public.garage_link_vehicle_price_changes (
 id uuid primary key default gen_random_uuid(), store_id uuid not null references public.stores(id),
 vehicle_id uuid not null references public.vehicles(id), old_base_price numeric,new_base_price numeric,
 old_total_price numeric,new_total_price numeric,vehicle_version timestamptz not null,created_at timestamptz not null default clock_timestamp()
);
create index on public.garage_link_vehicle_price_changes(store_id,vehicle_id,created_at desc,id desc);
create table public.garage_link_handoffs (
 id uuid primary key default gen_random_uuid(),store_id uuid not null references public.stores(id),
 customer_id uuid not null references public.customers(id), kind text not null check(kind in('deal_notice','quote_notice','invoice_notice','price_reduction','repurchase')),
 source_id uuid not null,source_version text not null check(source_version ~ '^[0-9a-f]{64}$'), vehicle_id uuid references public.vehicles(id),
 payload jsonb not null check(jsonb_typeof(payload)='object' and payload->>'version'='1' and jsonb_typeof(payload->'sourceGuards')='array' and jsonb_array_length(payload->'sourceGuards') between 1 and 1100),
 idempotency_key text not null check(idempotency_key ~ '^[0-9a-f]{64}$'),
 status text not null default 'pending' check(status in('pending','imported','invalidated')),
 created_at timestamptz not null default clock_timestamp(),imported_at timestamptz,l_broadcast_id uuid,revoked_at timestamptz,
 unique(store_id,idempotency_key),check((status='imported')=(l_broadcast_id is not null and imported_at is not null))
);
create index on public.garage_link_handoffs(store_id,created_at desc,id desc);
create function public.garage_link_notice_settings_touch() returns trigger language plpgsql set search_path=pg_catalog,public as $$
declare k text;value text;allowed text[];m text[];
begin
 if jsonb_typeof(new.templates) is distinct from 'object' or (select count(*) from jsonb_object_keys(new.templates))<>5 or not(new.templates ?& array['deal_notice','quote_notice','invoice_notice','price_reduction','repurchase']) then raise exception 'INVALID_NOTICE_TEMPLATES';end if;
 for k in select jsonb_object_keys(new.templates) loop
 if jsonb_typeof(new.templates->k) is distinct from 'string' then raise exception 'INVALID_NOTICE_TEMPLATE_TYPE';end if;
 value:=new.templates->>k;
 if btrim(value)='' or length(value)>4000 then raise exception 'INVALID_NOTICE_TEMPLATE_LENGTH';end if;
 allowed:=case k when 'deal_notice' then array['customer_name','vehicle_name','deal_title','store_name'] when 'quote_notice' then array['customer_name','vehicle_name','deal_title','document_url','document_number','total_amount','store_name'] when 'invoice_notice' then array['customer_name','vehicle_name','deal_title','document_url','document_number','total_amount','store_name'] when 'price_reduction' then array['customer_name','vehicle_name','old_price','new_price','inspection_expiry_date','store_name'] else array['customer_name','vehicle_name','inspection_expiry_date','store_name'] end;
 for m in select regexp_matches(value,'\{\{([a-z_]+)\}\}','g') loop if not(m[1]=any(allowed)) then raise exception 'UNAVAILABLE_NOTICE_MERGE_FIELD';end if;end loop;
 if regexp_replace(value,'\{\{([a-z_]+)\}\}','','g') ~ '[{}]' then raise exception 'INVALID_NOTICE_MERGE_FIELD';end if;
 end loop;new.updated_at:=clock_timestamp();return new;
end$$;
create trigger garage_link_notice_settings_touch before insert or update on public.garage_link_notice_settings for each row execute function public.garage_link_notice_settings_touch();
create function public.garage_link_record_price_reduction() returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 if old.store_id=new.store_id and ((old.base_price is not null and new.base_price is not null and new.base_price<old.base_price) or (old.total_price is not null and new.total_price is not null and new.total_price<old.total_price)) then
 insert into public.garage_link_vehicle_price_changes(store_id,vehicle_id,old_base_price,new_base_price,old_total_price,new_total_price,vehicle_version)
 values(new.store_id,new.id,old.base_price,new.base_price,old.total_price,new.total_price,new.updated_at);
 end if;return new;
end$$;
create trigger garage_link_record_price_reduction after update of base_price,total_price on public.vehicles for each row execute function public.garage_link_record_price_reduction();
-- source_version is an opaque producer fingerprint, never a permission token.
-- Every current source is checked below; transport HMAC binds the full snapshot.
-- Fixed relation whitelist. No caller-provided SQL or expanded service table access.
create function public.garage_link_source_guard_matches(p_store_id uuid,p_guard jsonb) returns boolean language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare r jsonb;v_id uuid;v_values jsonb;v_at text;
begin
 if jsonb_typeof(p_guard)<>'object' or not(p_guard ?& array['table','id']) or exists(select 1 from jsonb_object_keys(p_guard) k where k not in('table','id','updatedAt','values')) then return false;end if;
 v_id:=(p_guard->>'id')::uuid;v_values:=p_guard->'values';v_at:=p_guard->>'updatedAt';
 if coalesce(v_at,'')='' and (jsonb_typeof(v_values) is distinct from 'object' or not exists(select 1 from jsonb_object_keys(v_values) k where k<>'id')) then return false;end if;
 if v_values is not null then
 if jsonb_typeof(v_values)<>'object' or exists(select 1 from jsonb_each(v_values) e where e.key not in('id','store_id','quote_id','invoice_id','name','description','quantity','unit_price','amount','tax_rate','tax_category','line_discount_input_amount','unit','item_order') or jsonb_typeof(e.value) not in('string','number','boolean','null')) then return false;end if;end if;
 case p_guard->>'table'
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
create function public.garage_link_validate_handoff(p_store_id uuid,p_request_id uuid) returns boolean language plpgsql stable security definer set search_path=pg_catalog,public as $$
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
create function public.garage_link_ack_handoff(p_store_id uuid,p_request_id uuid,p_broadcast_id uuid) returns void language plpgsql security definer set search_path=pg_catalog,public as $$
declare h public.garage_link_handoffs%rowtype;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'FORBIDDEN';end if;
 select * into h from public.garage_link_handoffs where store_id=p_store_id and id=p_request_id for update;
 if not found or not public.garage_link_validate_handoff(p_store_id,p_request_id) then raise exception 'SOURCE_CHANGED';end if;
 if h.status='imported' then if h.l_broadcast_id is distinct from p_broadcast_id then raise exception 'ACK_CONFLICT';end if;return;end if;
 if p_broadcast_id is null then raise exception 'BROADCAST_REQUIRED';end if;
 update public.garage_link_handoffs set status='imported',l_broadcast_id=p_broadcast_id,imported_at=clock_timestamp() where id=h.id;
end$$;
alter table public.garage_link_notice_settings enable row level security;
alter table public.garage_link_vehicle_price_changes enable row level security;
alter table public.garage_link_handoffs enable row level security;
create policy settings_read on public.garage_link_notice_settings for select to authenticated using(exists(select 1 from public.current_user_active_store_membership m where m.store_id=garage_link_notice_settings.store_id and m.role in('owner','admin')));
create policy settings_insert on public.garage_link_notice_settings for insert to authenticated with check(exists(select 1 from public.current_user_active_store_membership m where m.store_id=garage_link_notice_settings.store_id and m.role in('owner','admin')));
create policy settings_update on public.garage_link_notice_settings for update to authenticated using(exists(select 1 from public.current_user_active_store_membership m where m.store_id=garage_link_notice_settings.store_id and m.role in('owner','admin'))) with check(exists(select 1 from public.current_user_active_store_membership m where m.store_id=garage_link_notice_settings.store_id and m.role in('owner','admin')));
create policy prices_read on public.garage_link_vehicle_price_changes for select to authenticated using(exists(select 1 from public.current_user_active_store_membership m where m.store_id=garage_link_vehicle_price_changes.store_id and m.role in('owner','admin')));
create policy handoffs_read on public.garage_link_handoffs for select to authenticated using(exists(select 1 from public.current_user_active_store_membership m where m.store_id=garage_link_handoffs.store_id and m.role in('owner','admin')));
-- Insert is checked against the same source and scope as pre-send validation.
create function public.garage_link_check_handoff_insert() returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 if not public.garage_link_validate_handoff(new.store_id,new.id) then raise exception 'INVALID_HANDOFF_SOURCE';end if;return new;
end$$;
create constraint trigger garage_link_check_handoff_insert after insert on public.garage_link_handoffs deferrable initially immediate for each row execute function public.garage_link_check_handoff_insert();
create policy handoffs_insert on public.garage_link_handoffs for insert to authenticated with check(status='pending' and revoked_at is null and imported_at is null and l_broadcast_id is null and exists(select 1 from public.current_user_active_store_membership m where m.store_id=garage_link_handoffs.store_id and m.role in('owner','admin')));
revoke all on public.garage_link_notice_settings,public.garage_link_vehicle_price_changes,public.garage_link_handoffs from public,anon,authenticated,service_role;
grant select,insert,update on public.garage_link_notice_settings to authenticated;
grant select on public.garage_link_vehicle_price_changes to authenticated;
grant select,insert on public.garage_link_handoffs to authenticated;
grant select on public.garage_link_handoffs to service_role;
revoke all on function public.garage_link_notice_settings_touch(),public.garage_link_record_price_reduction(),public.garage_link_source_guard_matches(uuid,jsonb),public.garage_link_validate_handoff(uuid,uuid),public.garage_link_ack_handoff(uuid,uuid,uuid),public.garage_link_check_handoff_insert() from public,anon,authenticated,service_role;
grant execute on function public.garage_link_validate_handoff(uuid,uuid) to service_role;
grant execute on function public.garage_link_ack_handoff(uuid,uuid,uuid) to service_role;

-- Generating candidates has no provider/network side effect. Calendar months are
-- subtracted from each current inspection expiry date (month end is clamped).
create function public.garage_link_generate_repurchase(p_store_id uuid) returns integer language plpgsql security definer set search_path=pg_catalog,public as $$
declare cfg public.garage_link_notice_settings%rowtype;r record;guards jsonb;body text;pl jsonb;version text;key text;inserted integer:=0;n integer;today date:=(now() at time zone 'Asia/Tokyo')::date;store_name text;
begin
 if auth.role() is distinct from 'service_role' and not exists(select 1 from public.current_user_active_store_membership m where m.store_id=p_store_id and m.role in('owner','admin')) then raise exception 'FORBIDDEN';end if;
 if not exists(select 1 from public.stores st join public.tenants t on t.id=st.tenant_id join public.company_subscriptions cs on cs.tenant_id=t.id and cs.status='active' and cs.l_link_integration_enabled where st.id=p_store_id and st.status='active' and t.status='active') then return 0;end if;
 select * into cfg from public.garage_link_notice_settings where store_id=p_store_id;
 if not found or not cfg.repurchase_enabled then return 0;end if;
 select name into store_name from public.stores where id=p_store_id;
 for r in
 select v.id vehicle_id,c.id customer_id,to_jsonb(v) vehicle,to_jsonb(c) customer,
 (select jsonb_agg(jsonb_build_object('table','deals','id',d.id,'updatedAt',d.updated_at) order by d.id) from public.deals d where d.store_id=p_store_id and d.vehicle_id=v.id and d.customer_id=c.id and d.status='成約' and d.deleted_at is null) deals
 from public.vehicles v join public.customers c on c.store_id=p_store_id
 where v.store_id=p_store_id and v.deleted_at is null and not coalesce(v.is_archived,false) and coalesce(v.status,'') not in('廃車','scrapped')
 and v.inspection_expiry_date is not null and today between (v.inspection_expiry_date-make_interval(months=>cfg.repurchase_before_months))::date and v.inspection_expiry_date
 and c.deleted_at is null and not coalesce(c.is_archived,false) and coalesce(c.delivery_permission,'') in('allowed','許可') and coalesce(c.customer_status,'') not in('blocked','配信停止') and coalesce(c.line_friend_status,'') not in('blocked','ブロック')
 and exists(select 1 from public.deals d where d.store_id=p_store_id and d.vehicle_id=v.id and d.customer_id=c.id and d.status='成約' and d.deleted_at is null)
 and (select count(distinct d.customer_id) from public.deals d where d.store_id=p_store_id and d.vehicle_id=v.id and d.status='成約' and d.deleted_at is null)=1
 loop
 guards:=jsonb_build_array(jsonb_build_object('table','customers','id',r.customer_id,'updatedAt',r.customer->>'updated_at'),jsonb_build_object('table','vehicles','id',r.vehicle_id,'updatedAt',r.vehicle->>'updated_at'))||r.deals;
 body:=cfg.templates->>'repurchase';
 body:=replace(replace(replace(replace(body,'{{customer_name}}',coalesce(r.customer->>'name','')),'{{vehicle_name}}',trim(coalesce(r.vehicle->>'maker','')||' '||coalesce(r.vehicle->>'model_name',''))),'{{inspection_expiry_date}}',r.vehicle->>'inspection_expiry_date'),'{{store_name}}',coalesce(store_name,''));
 if body is null or btrim(body)='' or length(body)>5000 or body ~ '[{}]' then raise exception 'REPURCHASE_TEMPLATE_REQUIRES_AVAILABLE_FIELDS';end if;
 pl:=jsonb_build_object('version',1,'bodyText',body,'customerName',coalesce(r.customer->>'name',''),'vehicleName',trim(coalesce(r.vehicle->>'maker','')||' '||coalesce(r.vehicle->>'model_name','')),'sourceGuards',guards,'repurchaseMonths',cfg.repurchase_before_months);
 version:=encode(sha256(convert_to(guards::text,'UTF8')),'hex');
 key:=encode(sha256(convert_to('repurchase|'||p_store_id::text||'|'||r.customer_id::text||'|'||r.vehicle_id::text||'|'||(r.vehicle->>'inspection_expiry_date')||'|'||cfg.repurchase_before_months::text,'UTF8')),'hex');
 insert into public.garage_link_handoffs(store_id,customer_id,kind,source_id,source_version,vehicle_id,payload,idempotency_key)
 values(p_store_id,r.customer_id,'repurchase',r.vehicle_id,version,r.vehicle_id,pl,key) on conflict(store_id,idempotency_key) do nothing;
 get diagnostics n=row_count;inserted:=inserted+n;
 end loop;return inserted;
end$$;
revoke all on function public.garage_link_generate_repurchase(uuid) from public,anon,authenticated,service_role;
grant execute on function public.garage_link_generate_repurchase(uuid) to authenticated,service_role;

commit;
