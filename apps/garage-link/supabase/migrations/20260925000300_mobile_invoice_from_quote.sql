-- Create a draft invoice and all lines atomically from a store-scoped quote.
create or replace function public.garage_mobile_invoice_from_quote(
  p_store_id uuid, p_quote_id uuid, p_invoice_id uuid, p_due_date date
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_quote public.quotes%rowtype;
  v_existing public.invoices%rowtype;
  v_total integer;
begin
  if auth.uid() is null then return jsonb_build_object('ok',false,'code','UNAUTHENTICATED'); end if;
  if coalesce(public.current_user_store_role(p_store_id),'') not in ('owner','admin','staff') then
    return jsonb_build_object('ok',false,'code','ROLE_FORBIDDEN');
  end if;
  select * into v_quote from public.quotes where id = p_quote_id and store_id = p_store_id and deleted_at is null;
  if not found then return jsonb_build_object('ok',false,'code','QUOTE_NOT_FOUND'); end if;
  select * into v_existing from public.invoices where id = p_invoice_id and store_id = p_store_id;
  if found then
    if v_existing.quote_id = p_quote_id and v_existing.payment_due_date is not distinct from p_due_date then
      return jsonb_build_object('ok',true,'code','REPLAYED','invoiceId',p_invoice_id);
    end if;
    return jsonb_build_object('ok',false,'code','IDEMPOTENCY_CONFLICT');
  end if;
  if not exists(select 1 from public.quote_items where quote_id = p_quote_id and store_id = p_store_id) then
    return jsonb_build_object('ok',false,'code','EMPTY_QUOTE');
  end if;
  v_total := round(coalesce(v_quote.total_amount,0))::integer;
  if v_total < 0 or v_total > 100000000 then return jsonb_build_object('ok',false,'code','INVALID_TOTAL'); end if;
  insert into public.invoices(
    id,store_id,quote_id,deal_id,maintenance_job_id,customer_id,vehicle_id,invoice_no,title,
    status,issue_status,issue_date,payment_due_date,customer_name,customer_phone,customer_email,
    customer_address,customer_honorific,vehicle_label,vehicle_maker,vehicle_model_name,vehicle_year,
    vehicle_mileage_km,vehicle_vin,subtotal_amount,tax_amount,discount_amount,trade_in_amount,
    total_amount,paid_amount,unpaid_amount,customer_note
  ) values (
    p_invoice_id,p_store_id,p_quote_id,v_quote.deal_id,v_quote.maintenance_job_id,v_quote.customer_id,
    v_quote.vehicle_id,'INV-'||p_invoice_id::text,v_quote.title,'draft','draft',current_date,p_due_date,
    v_quote.customer_name,v_quote.customer_phone,v_quote.customer_email,v_quote.customer_address,
    v_quote.customer_honorific,v_quote.vehicle_label,v_quote.vehicle_maker,v_quote.vehicle_model_name,
    v_quote.vehicle_year,v_quote.vehicle_mileage_km,v_quote.vehicle_vin,
    round(coalesce(v_quote.subtotal_amount,0))::integer,round(coalesce(v_quote.tax_amount,0))::integer,
    round(coalesce(v_quote.discount_amount,0))::integer,round(coalesce(v_quote.trade_in_amount,0))::integer,
    v_total,0,v_total,v_quote.customer_note
  );
  insert into public.invoice_items(store_id,invoice_id,item_order,item_type,name,description,quantity,unit_price,tax_rate,tax_amount,amount)
    select p_store_id,p_invoice_id,item_order,item_type,name,description,quantity,
      round(unit_price)::integer,tax_rate,round(tax_amount)::integer,round(amount)::integer
    from public.quote_items where quote_id = p_quote_id and store_id = p_store_id order by item_order,id;
  return jsonb_build_object('ok',true,'code','CREATED','invoiceId',p_invoice_id);
end $$;
revoke all on function public.garage_mobile_invoice_from_quote(uuid,uuid,uuid,date) from public,anon;
grant execute on function public.garage_mobile_invoice_from_quote(uuid,uuid,uuid,date) to authenticated;

-- Rollback: revoke execute then drop this function after mobile callers move off it.
