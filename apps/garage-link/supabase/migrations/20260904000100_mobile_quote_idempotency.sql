-- GARAGE LINK Native V1: service-only, retry-safe quote creation.
begin;

alter table public.quotes add column if not exists mobile_idempotency_key text;
create unique index if not exists garage_mobile_quotes_store_idempotency_uidx
  on public.quotes(store_id, mobile_idempotency_key)
  where mobile_idempotency_key is not null;

create or replace function public.garage_mobile_create_quote(
  p_store_id uuid,
  p_actor_user_id uuid,
  p_actor_role text,
  p_idempotency_key text,
  p_quote jsonb,
  p_items jsonb
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_quote_id uuid;
begin
  if p_store_id is null or p_actor_user_id is null
     or p_actor_role not in ('owner','admin','implementer','staff')
     or char_length(coalesce(p_idempotency_key,'')) not between 8 and 200
     or jsonb_typeof(p_quote) <> 'object' or jsonb_typeof(p_items) <> 'array' then
    raise exception using errcode='22023', message='invalid mobile quote request';
  end if;

  select id into v_quote_id
  from public.quotes
  where store_id=p_store_id and mobile_idempotency_key=p_idempotency_key;
  if v_quote_id is not null then return v_quote_id; end if;

  insert into public.quotes(
    store_id, deal_id, customer_id, vehicle_id, quote_no, title, status, issue_status,
    issue_date, expiry_date, customer_name, customer_phone, customer_email, customer_address,
    customer_honorific, vehicle_label, vehicle_maker, vehicle_model_name, vehicle_year,
    vehicle_mileage_km, vehicle_vin, vehicle_inspection_expiry_date, subtotal_amount,
    tax_amount, discount_amount, trade_in_amount, total_amount, customer_note,
    mobile_idempotency_key
  ) values (
    p_store_id, nullif(p_quote->>'dealId','')::uuid, nullif(p_quote->>'customerId','')::uuid,
    nullif(p_quote->>'vehicleId','')::uuid, p_quote->>'quoteNo', nullif(p_quote->>'title',''),
    'draft', 'draft', nullif(p_quote->>'issueDate','')::date, nullif(p_quote->>'expiryDate','')::date,
    nullif(p_quote->>'customerName',''), nullif(p_quote->>'customerPhone',''), nullif(p_quote->>'customerEmail',''),
    nullif(p_quote->>'customerAddress',''), nullif(p_quote->>'customerHonorific',''), nullif(p_quote->>'vehicleLabel',''),
    nullif(p_quote->>'vehicleMaker',''), nullif(p_quote->>'vehicleModelName',''), nullif(p_quote->>'vehicleYear','')::integer,
    nullif(p_quote->>'vehicleMileageKm','')::integer, nullif(p_quote->>'vehicleVin',''),
    nullif(p_quote->>'vehicleInspectionExpiryDate','')::date, (p_quote->>'subtotalAmount')::integer,
    (p_quote->>'taxAmount')::integer, (p_quote->>'discountAmount')::integer,
    (p_quote->>'tradeInAmount')::integer, (p_quote->>'totalAmount')::integer,
    nullif(p_quote->>'customerNote',''), p_idempotency_key
  ) returning id into v_quote_id;

  insert into public.quote_items(store_id, quote_id, item_order, item_type, name, description, quantity, unit_price, tax_rate, tax_amount, amount)
  select p_store_id, v_quote_id, item_order, item_type, name, description, quantity, unit_price, tax_rate, tax_amount, amount
  from jsonb_to_recordset(p_items) as item(item_order integer, item_type text, name text, description text, quantity numeric, unit_price integer, tax_rate numeric, tax_amount integer, amount integer);

  return v_quote_id;
end;
$$;

revoke all on function public.garage_mobile_create_quote(uuid,uuid,text,text,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.garage_mobile_create_quote(uuid,uuid,text,text,jsonb,jsonb) to service_role;

commit;
