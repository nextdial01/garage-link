-- Mobile quote writes are a single idempotent transaction. The API validates the
-- bearer, active store and each related row before calling this service-only RPC.
create table if not exists public.garage_mobile_quote_operations (
  store_id uuid not null references public.stores(id),
  idempotency_key text not null,
  request_fingerprint text not null,
  quote_id uuid not null references public.quotes(id),
  created_at timestamptz not null default now(),
  primary key (store_id, idempotency_key)
);
alter table public.garage_mobile_quote_operations enable row level security;
revoke all on public.garage_mobile_quote_operations from public, anon, authenticated;

create or replace function public.garage_mobile_create_quote(
  p_store_id uuid, p_actor_user_id uuid, p_actor_role text,
  p_idempotency_key text, p_quote jsonb, p_items jsonb
) returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_existing public.garage_mobile_quote_operations%rowtype;
  v_fingerprint text;
  v_id uuid;
  v_item jsonb;
begin
  if p_store_id is null or p_actor_user_id is null or p_actor_role not in ('owner','admin','staff','implementer')
    or p_idempotency_key is null or length(p_idempotency_key) not between 8 and 200
    or jsonb_typeof(p_quote) <> 'object' or jsonb_typeof(p_items) <> 'array'
    or jsonb_array_length(p_items) not between 1 and 100 then
    raise exception 'invalid_mobile_quote' using errcode = '22023';
  end if;
  -- Serialize retries before writing the quote and its lines.
  perform pg_advisory_xact_lock(hashtext(p_store_id::text || ':' || p_idempotency_key));
  v_fingerprint := md5(p_quote::text || ':' || p_items::text);
  select * into v_existing from public.garage_mobile_quote_operations
    where store_id = p_store_id and idempotency_key = p_idempotency_key;
  if found then
    if v_existing.request_fingerprint <> v_fingerprint then
      raise exception 'mobile_quote_idempotency_conflict' using errcode = '23505';
    end if;
    return v_existing.quote_id;
  end if;
  if not exists(select 1 from public.customers where id = (p_quote->>'customerId')::uuid and store_id = p_store_id and deleted_at is null) then
    raise exception 'quote_customer_scope' using errcode = '23503';
  end if;
  if nullif(p_quote->>'vehicleId','') is not null and not exists(select 1 from public.vehicles where id = (p_quote->>'vehicleId')::uuid and store_id = p_store_id and deleted_at is null) then
    raise exception 'quote_vehicle_scope' using errcode = '23503';
  end if;
  if nullif(p_quote->>'dealId','') is not null and not exists(select 1 from public.deals where id = (p_quote->>'dealId')::uuid and store_id = p_store_id and deleted_at is null) then
    raise exception 'quote_deal_scope' using errcode = '23503';
  end if;
  if nullif(p_quote->>'maintenanceJobId','') is not null and not exists(select 1 from public.maintenance_jobs where id = (p_quote->>'maintenanceJobId')::uuid and store_id = p_store_id and deleted_at is null) then
    raise exception 'quote_maintenance_scope' using errcode = '23503';
  end if;
  v_id := gen_random_uuid();
  insert into public.quotes (
    id,store_id,quote_no,title,status,customer_id,vehicle_id,deal_id,maintenance_job_id,
    issue_date,expiry_date,customer_name,customer_phone,customer_email,customer_address,
    customer_honorific,vehicle_label,vehicle_maker,vehicle_model_name,vehicle_year,
    vehicle_mileage_km,vehicle_vin,vehicle_inspection_expiry_date,subtotal_amount,tax_amount,
    discount_amount,trade_in_amount,total_amount,customer_note
  ) values (
    v_id,p_store_id,p_quote->>'quoteNo',p_quote->>'title','draft',
    nullif(p_quote->>'customerId','')::uuid,nullif(p_quote->>'vehicleId','')::uuid,
    nullif(p_quote->>'dealId','')::uuid,nullif(p_quote->>'maintenanceJobId','')::uuid,
    nullif(p_quote->>'issueDate','')::date,nullif(p_quote->>'expiryDate','')::date,
    p_quote->>'customerName',p_quote->>'customerPhone',p_quote->>'customerEmail',
    p_quote->>'customerAddress',p_quote->>'customerHonorific',p_quote->>'vehicleLabel',
    p_quote->>'vehicleMaker',p_quote->>'vehicleModelName',nullif(p_quote->>'vehicleYear','')::integer,
    nullif(p_quote->>'vehicleMileageKm','')::integer,p_quote->>'vehicleVin',
    nullif(p_quote->>'vehicleInspectionExpiryDate','')::date,
    coalesce((p_quote->>'subtotalAmount')::integer,0),coalesce((p_quote->>'taxAmount')::integer,0),
    coalesce((p_quote->>'discountAmount')::integer,0),coalesce((p_quote->>'tradeInAmount')::integer,0),
    coalesce((p_quote->>'totalAmount')::integer,0),p_quote->>'customerNote'
  );
  for v_item in select value from jsonb_array_elements(p_items) loop
    insert into public.quote_items (
      store_id,quote_id,item_order,item_type,name,description,quantity,unit_price,tax_rate,tax_amount,amount
    ) values (
      p_store_id,v_id,(v_item->>'item_order')::integer,v_item->>'item_type',v_item->>'name',
      v_item->>'description',(v_item->>'quantity')::numeric,(v_item->>'unit_price')::integer,
      (v_item->>'tax_rate')::numeric,(v_item->>'tax_amount')::integer,(v_item->>'amount')::integer
    );
  end loop;
  insert into public.garage_mobile_quote_operations(store_id,idempotency_key,request_fingerprint,quote_id)
    values(p_store_id,p_idempotency_key,v_fingerprint,v_id);
  return v_id;
end $$;
revoke all on function public.garage_mobile_create_quote(uuid,uuid,text,text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.garage_mobile_create_quote(uuid,uuid,text,text,jsonb,jsonb) to service_role;

-- Rollback: remove the service grant and function only after callers have moved.
-- The receipt table can be dropped after all outstanding idempotency windows close.
