-- Line-level discounts are mode-specific integer yen; header discounts remain separate.
begin;
alter table public.quote_items add column if not exists line_discount_input_amount numeric not null default 0
 check (line_discount_input_amount>=0 and line_discount_input_amount=trunc(line_discount_input_amount) and line_discount_input_amount::text not in ('NaN','Infinity','-Infinity'));
alter table public.invoice_items add column if not exists line_discount_input_amount numeric not null default 0
 check (line_discount_input_amount>=0 and line_discount_input_amount=trunc(line_discount_input_amount) and line_discount_input_amount::text not in ('NaN','Infinity','-Infinity'));
create or replace function public.save_document(p_store_id uuid,p_kind text,p_header jsonb,p_items jsonb,p_document_id uuid default null)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare
 v_id uuid; v_quote public.quotes%rowtype; v_invoice public.invoices%rowtype;
 v_q public.quotes%rowtype; v_i public.invoices%rowtype; v_line jsonb; v_line_row public.quote_items%rowtype;
 v_header jsonb; v_subtotal numeric; v_tax numeric;
 v_order integer:=0; v_issue boolean:=false; v_old_flag text;
begin
 if p_kind not in ('quote','invoice') or p_kind is null or jsonb_typeof(p_header) is distinct from 'object'
    or jsonb_typeof(p_items) is distinct from 'array' then raise exception 'invalid_document' using errcode='22023'; end if;
 if not public.current_user_can_write_store(p_store_id) then raise exception 'document_write_forbidden' using errcode='42501'; end if;
 if jsonb_array_length(p_items)>500 then raise exception 'document_items_limit' using errcode='22023'; end if;
 if exists(select 1 from jsonb_object_keys(p_header) k where not(k=any(case when p_kind='quote' then array['deal_id','maintenance_job_id','customer_id','vehicle_id','title','issue_date','assigned_user_name','customer_name','customer_phone','customer_email','customer_address','customer_honorific','vehicle_label','vehicle_maker','vehicle_model_name','vehicle_year','vehicle_mileage_km','vehicle_vin','subtotal_amount','tax_amount','discount_amount','trade_in_amount','total_amount','payment_method','payment_due_date','customer_note','internal_memo','tax_display_mode','discount_input_amount','quote_no','expiry_date','vehicle_inspection_expiry_date','loan_request','down_payment','installment_count','status','issue_status'] else array['deal_id','maintenance_job_id','customer_id','vehicle_id','title','issue_date','assigned_user_name','customer_name','customer_phone','customer_email','customer_address','customer_honorific','vehicle_label','vehicle_maker','vehicle_model_name','vehicle_year','vehicle_mileage_km','vehicle_vin','subtotal_amount','tax_amount','discount_amount','trade_in_amount','total_amount','payment_method','payment_due_date','customer_note','internal_memo','tax_display_mode','discount_input_amount','invoice_no','quote_id','customer_postal_code','vehicle_registration_no','bank_name','bank_branch_name','bank_account_type','bank_account_number','bank_account_holder','status','issue_status'] end))) then
  raise exception 'forbidden_document_field' using errcode='22023';
 end if;
 if p_kind='quote' and p_header ? 'status' and p_header->>'status' not in ('draft','issued','下書き','送付済み','承認済み','失注','期限切れ') then raise exception 'invalid_quote_status' using errcode='22023'; end if;
 if p_header ? 'issue_status' and coalesce(p_header->>'issue_status','draft') not in ('draft','issued') then raise exception 'invalid_issue_status' using errcode='22023'; end if;
 if p_kind='invoice' and coalesce(p_header->>'issue_status','draft')<>'draft' then raise exception 'invoice_requires_issue_rpc' using errcode='42501'; end if;
 if p_document_id is not null then
  if p_kind='quote' then
   select * into v_quote from public.quotes where id=p_document_id and store_id=p_store_id and deleted_at is null for update;
   if not found then raise exception 'quote_not_found' using errcode='42501'; end if;
   if v_quote.issue_status='cancelled' or exists(select 1 from public.invoices where quote_id=p_document_id and store_id=p_store_id and deleted_at is null and issue_status<>'cancelled') then raise exception 'quote_locked' using errcode='42501'; end if;
   if p_header ? 'issue_status' and p_header->>'issue_status' is distinct from v_quote.issue_status then raise exception 'quote_issue_state_immutable' using errcode='42501'; end if;
  else
   select * into v_invoice from public.invoices where id=p_document_id and store_id=p_store_id and deleted_at is null for update;
   if not found or v_invoice.issue_status is distinct from 'draft' or coalesce(v_invoice.paid_amount,0)<>0
      or exists(select 1 from public.invoice_payment_ledger where invoice_id=p_document_id) then raise exception 'invoice_locked' using errcode='42501'; end if;
  end if;
 end if;
 v_issue:=p_kind='quote' and p_document_id is null and p_header->>'issue_status'='issued';
 if coalesce(v_issue,false) and not public.current_user_can_admin_store(p_store_id) then raise exception 'quote_issue_forbidden' using errcode='42501'; end if;
 -- Explicit relation guards also cover service-side schema drift; composite FKs remain in force.
 if nullif(p_header->>'customer_id','') is not null and not exists(select 1 from public.customers where id=(p_header->>'customer_id')::uuid and store_id=p_store_id and deleted_at is null) then raise exception 'customer_scope' using errcode='23503'; end if;
 if nullif(p_header->>'vehicle_id','') is not null and not exists(select 1 from public.vehicles where id=(p_header->>'vehicle_id')::uuid and store_id=p_store_id and deleted_at is null) then raise exception 'vehicle_scope' using errcode='23503'; end if;
 if nullif(p_header->>'deal_id','') is not null and not exists(select 1 from public.deals where id=(p_header->>'deal_id')::uuid and store_id=p_store_id and deleted_at is null) then raise exception 'deal_scope' using errcode='23503'; end if;
 if nullif(p_header->>'maintenance_job_id','') is not null and not exists(select 1 from public.maintenance_jobs where id=(p_header->>'maintenance_job_id')::uuid and store_id=p_store_id and deleted_at is null) then raise exception 'maintenance_scope' using errcode='23503'; end if;
 if nullif(p_header->>'quote_id','') is not null and not exists(select 1 from public.quotes where id=(p_header->>'quote_id')::uuid and store_id=p_store_id and deleted_at is null) then raise exception 'quote_scope' using errcode='23503'; end if;
 if p_kind='quote' then
  select * into v_q from jsonb_populate_record(null::public.quotes,p_header);
  if p_document_id is null then
   if nullif(btrim(v_q.quote_no),'') is null then raise exception 'quote_number_required' using errcode='22023'; end if;
   insert into public.quotes(store_id,quote_no,status,issue_status) values(p_store_id,v_q.quote_no,'draft','draft') returning id into v_id;
  else v_id:=p_document_id; end if;
  update public.quotes set status=case when p_header ? 'status' then v_q.status else quotes.status end,deal_id=case when p_header ? 'deal_id' then v_q.deal_id else quotes.deal_id end,maintenance_job_id=case when p_header ? 'maintenance_job_id' then v_q.maintenance_job_id else quotes.maintenance_job_id end,customer_id=case when p_header ? 'customer_id' then v_q.customer_id else quotes.customer_id end,vehicle_id=case when p_header ? 'vehicle_id' then v_q.vehicle_id else quotes.vehicle_id end,title=case when p_header ? 'title' then v_q.title else quotes.title end,issue_date=case when p_header ? 'issue_date' then v_q.issue_date else quotes.issue_date end,assigned_user_name=case when p_header ? 'assigned_user_name' then v_q.assigned_user_name else quotes.assigned_user_name end,customer_name=case when p_header ? 'customer_name' then v_q.customer_name else quotes.customer_name end,customer_phone=case when p_header ? 'customer_phone' then v_q.customer_phone else quotes.customer_phone end,customer_email=case when p_header ? 'customer_email' then v_q.customer_email else quotes.customer_email end,customer_address=case when p_header ? 'customer_address' then v_q.customer_address else quotes.customer_address end,customer_honorific=case when p_header ? 'customer_honorific' then v_q.customer_honorific else quotes.customer_honorific end,vehicle_label=case when p_header ? 'vehicle_label' then v_q.vehicle_label else quotes.vehicle_label end,vehicle_maker=case when p_header ? 'vehicle_maker' then v_q.vehicle_maker else quotes.vehicle_maker end,vehicle_model_name=case when p_header ? 'vehicle_model_name' then v_q.vehicle_model_name else quotes.vehicle_model_name end,vehicle_year=case when p_header ? 'vehicle_year' then v_q.vehicle_year else quotes.vehicle_year end,vehicle_mileage_km=case when p_header ? 'vehicle_mileage_km' then v_q.vehicle_mileage_km else quotes.vehicle_mileage_km end,vehicle_vin=case when p_header ? 'vehicle_vin' then v_q.vehicle_vin else quotes.vehicle_vin end,subtotal_amount=case when p_header ? 'subtotal_amount' then v_q.subtotal_amount else quotes.subtotal_amount end,tax_amount=case when p_header ? 'tax_amount' then v_q.tax_amount else quotes.tax_amount end,discount_amount=case when p_header ? 'discount_amount' then v_q.discount_amount else quotes.discount_amount end,trade_in_amount=case when p_header ? 'trade_in_amount' then v_q.trade_in_amount else quotes.trade_in_amount end,total_amount=case when p_header ? 'total_amount' then v_q.total_amount else quotes.total_amount end,payment_method=case when p_header ? 'payment_method' then v_q.payment_method else quotes.payment_method end,payment_due_date=case when p_header ? 'payment_due_date' then v_q.payment_due_date else quotes.payment_due_date end,customer_note=case when p_header ? 'customer_note' then v_q.customer_note else quotes.customer_note end,internal_memo=case when p_header ? 'internal_memo' then v_q.internal_memo else quotes.internal_memo end,tax_display_mode=case when p_header ? 'tax_display_mode' then v_q.tax_display_mode else quotes.tax_display_mode end,discount_input_amount=case when p_header ? 'discount_input_amount' then v_q.discount_input_amount else quotes.discount_input_amount end,quote_no=case when p_header ? 'quote_no' then v_q.quote_no else quotes.quote_no end,expiry_date=case when p_header ? 'expiry_date' then v_q.expiry_date else quotes.expiry_date end,vehicle_inspection_expiry_date=case when p_header ? 'vehicle_inspection_expiry_date' then v_q.vehicle_inspection_expiry_date else quotes.vehicle_inspection_expiry_date end,loan_request=case when p_header ? 'loan_request' then v_q.loan_request else quotes.loan_request end,down_payment=case when p_header ? 'down_payment' then v_q.down_payment else quotes.down_payment end,installment_count=case when p_header ? 'installment_count' then v_q.installment_count else quotes.installment_count end where id=v_id and store_id=p_store_id;
  delete from public.quote_items where quote_id=v_id and store_id=p_store_id;
 else
  select * into v_i from jsonb_populate_record(null::public.invoices,p_header);
  if p_document_id is null then
   if nullif(btrim(v_i.invoice_no),'') is null then raise exception 'invoice_number_required' using errcode='22023'; end if;
   insert into public.invoices(store_id,invoice_no,status,issue_status,total_amount,paid_amount,unpaid_amount)
    values(p_store_id,v_i.invoice_no,'draft','draft',coalesce(v_i.total_amount,0),0,coalesce(v_i.total_amount,0)) returning id into v_id;
  else v_id:=p_document_id; end if;
  update public.invoices set deal_id=case when p_header ? 'deal_id' then v_i.deal_id else invoices.deal_id end,maintenance_job_id=case when p_header ? 'maintenance_job_id' then v_i.maintenance_job_id else invoices.maintenance_job_id end,customer_id=case when p_header ? 'customer_id' then v_i.customer_id else invoices.customer_id end,vehicle_id=case when p_header ? 'vehicle_id' then v_i.vehicle_id else invoices.vehicle_id end,title=case when p_header ? 'title' then v_i.title else invoices.title end,issue_date=case when p_header ? 'issue_date' then v_i.issue_date else invoices.issue_date end,assigned_user_name=case when p_header ? 'assigned_user_name' then v_i.assigned_user_name else invoices.assigned_user_name end,customer_name=case when p_header ? 'customer_name' then v_i.customer_name else invoices.customer_name end,customer_phone=case when p_header ? 'customer_phone' then v_i.customer_phone else invoices.customer_phone end,customer_email=case when p_header ? 'customer_email' then v_i.customer_email else invoices.customer_email end,customer_address=case when p_header ? 'customer_address' then v_i.customer_address else invoices.customer_address end,customer_honorific=case when p_header ? 'customer_honorific' then v_i.customer_honorific else invoices.customer_honorific end,vehicle_label=case when p_header ? 'vehicle_label' then v_i.vehicle_label else invoices.vehicle_label end,vehicle_maker=case when p_header ? 'vehicle_maker' then v_i.vehicle_maker else invoices.vehicle_maker end,vehicle_model_name=case when p_header ? 'vehicle_model_name' then v_i.vehicle_model_name else invoices.vehicle_model_name end,vehicle_year=case when p_header ? 'vehicle_year' then v_i.vehicle_year else invoices.vehicle_year end,vehicle_mileage_km=case when p_header ? 'vehicle_mileage_km' then v_i.vehicle_mileage_km else invoices.vehicle_mileage_km end,vehicle_vin=case when p_header ? 'vehicle_vin' then v_i.vehicle_vin else invoices.vehicle_vin end,subtotal_amount=case when p_header ? 'subtotal_amount' then v_i.subtotal_amount else invoices.subtotal_amount end,tax_amount=case when p_header ? 'tax_amount' then v_i.tax_amount else invoices.tax_amount end,discount_amount=case when p_header ? 'discount_amount' then v_i.discount_amount else invoices.discount_amount end,trade_in_amount=case when p_header ? 'trade_in_amount' then v_i.trade_in_amount else invoices.trade_in_amount end,total_amount=case when p_header ? 'total_amount' then v_i.total_amount else invoices.total_amount end,payment_method=case when p_header ? 'payment_method' then v_i.payment_method else invoices.payment_method end,payment_due_date=case when p_header ? 'payment_due_date' then v_i.payment_due_date else invoices.payment_due_date end,customer_note=case when p_header ? 'customer_note' then v_i.customer_note else invoices.customer_note end,internal_memo=case when p_header ? 'internal_memo' then v_i.internal_memo else invoices.internal_memo end,tax_display_mode=case when p_header ? 'tax_display_mode' then v_i.tax_display_mode else invoices.tax_display_mode end,discount_input_amount=case when p_header ? 'discount_input_amount' then v_i.discount_input_amount else invoices.discount_input_amount end,invoice_no=case when p_header ? 'invoice_no' then v_i.invoice_no else invoices.invoice_no end,quote_id=case when p_header ? 'quote_id' then v_i.quote_id else invoices.quote_id end,customer_postal_code=case when p_header ? 'customer_postal_code' then v_i.customer_postal_code else invoices.customer_postal_code end,vehicle_registration_no=case when p_header ? 'vehicle_registration_no' then v_i.vehicle_registration_no else invoices.vehicle_registration_no end,bank_name=case when p_header ? 'bank_name' then v_i.bank_name else invoices.bank_name end,bank_branch_name=case when p_header ? 'bank_branch_name' then v_i.bank_branch_name else invoices.bank_branch_name end,bank_account_type=case when p_header ? 'bank_account_type' then v_i.bank_account_type else invoices.bank_account_type end,bank_account_number=case when p_header ? 'bank_account_number' then v_i.bank_account_number else invoices.bank_account_number end,bank_account_holder=case when p_header ? 'bank_account_holder' then v_i.bank_account_holder else invoices.bank_account_holder end where id=v_id and store_id=p_store_id;
  -- Only the derived balance is maintained under the existing accounting flag.
  -- Header mutations above and item mutations below still execute their guards.
  v_old_flag:=current_setting('app.g4a_accounting_rpc',true);
  perform set_config('app.g4a_accounting_rpc','on',true);
  update public.invoices set unpaid_amount=total_amount where id=v_id and store_id=p_store_id;
  perform set_config('app.g4a_accounting_rpc',coalesce(v_old_flag,''),true);
  delete from public.invoice_items where invoice_id=v_id and store_id=p_store_id;
 end if;
 for v_line in select value from jsonb_array_elements(p_items) loop
  if jsonb_typeof(v_line)<>'object' or exists(select 1 from jsonb_object_keys(v_line) k where not(k=any(array['item_type','name','description','part_id','cost_price','unit','note','quantity','unit_price','tax_rate','tax_category','amount','tax_amount','line_discount_input_amount']))) then raise exception 'invalid_document_item_fields' using errcode='22023'; end if;
  select * into v_line_row from jsonb_populate_record(null::public.quote_items,v_line);
  if nullif(btrim(v_line_row.name),'') is null or v_line_row.quantity is null or v_line_row.quantity<0
     or v_line_row.quantity<>round(v_line_row.quantity,3) or v_line_row.unit_price is null or v_line_row.unit_price<0 or v_line_row.unit_price<>round(v_line_row.unit_price,4)
     or v_line_row.quantity::text in ('NaN','Infinity','-Infinity') or v_line_row.unit_price::text in ('NaN','Infinity','-Infinity') then raise exception 'invalid_document_item' using errcode='22023'; end if;
  v_line_row.line_discount_input_amount:=coalesce(v_line_row.line_discount_input_amount,0);
  if v_line_row.line_discount_input_amount<0 or v_line_row.line_discount_input_amount<>trunc(v_line_row.line_discount_input_amount) or v_line_row.line_discount_input_amount>round(v_line_row.quantity*v_line_row.unit_price) then raise exception 'invalid_line_discount' using errcode='22023'; end if;
  if v_line_row.part_id is not null and not exists(select 1 from public.repair_parts where id=v_line_row.part_id and store_id=p_store_id and deleted_at is null) then raise exception 'part_scope' using errcode='23503'; end if;
  v_order:=v_order+1;
  if p_kind='quote' then
   insert into public.quote_items(store_id,quote_id,item_order,item_type,name,description,part_id,cost_price,unit,note,quantity,unit_price,tax_rate,tax_category,amount,tax_amount,line_discount_input_amount) values(p_store_id,v_id,v_order,v_line_row.item_type,v_line_row.name,v_line_row.description,v_line_row.part_id,v_line_row.cost_price,v_line_row.unit,v_line_row.note,v_line_row.quantity,v_line_row.unit_price,v_line_row.tax_rate,v_line_row.tax_category,v_line_row.amount,v_line_row.tax_amount,v_line_row.line_discount_input_amount);
  else
   insert into public.invoice_items(store_id,invoice_id,item_order,item_type,name,description,part_id,cost_price,unit,note,quantity,unit_price,tax_rate,tax_category,amount,tax_amount,line_discount_input_amount) values(p_store_id,v_id,v_order,v_line_row.item_type,v_line_row.name,v_line_row.description,v_line_row.part_id,v_line_row.cost_price,v_line_row.unit,v_line_row.note,v_line_row.quantity,v_line_row.unit_price,v_line_row.tax_rate,v_line_row.tax_category,v_line_row.amount,v_line_row.tax_amount,v_line_row.line_discount_input_amount);
  end if;
 end loop;
 if p_kind='quote' then
  select to_jsonb(q) into v_header from public.quotes q where id=v_id;
  select coalesce(sum(amount),0),coalesce(sum(tax_amount),0) into v_subtotal,v_tax from public.quote_items where quote_id=v_id;
 else
  select to_jsonb(i) into v_header from public.invoices i where id=v_id;
  select coalesce(sum(amount),0),coalesce(sum(tax_amount),0) into v_subtotal,v_tax from public.invoice_items where invoice_id=v_id;
 end if;
 if v_header->>'tax_display_mode' is not null and (
   (v_header->>'subtotal_amount')::numeric is distinct from v_subtotal or (v_header->>'tax_amount')::numeric is distinct from v_tax
   or (v_header->>'total_amount')::numeric is distinct from v_subtotal+v_tax-coalesce((v_header->>'discount_amount')::numeric,0)-coalesce((v_header->>'trade_in_amount')::numeric,0)
   or coalesce((v_header->>'total_amount')::numeric,-1)<0
 ) then raise exception 'document_totals_mismatch' using errcode='22023'; end if;

 if coalesce(v_issue,false) then update public.quotes set issue_status='issued',status='issued',issued_at=now(),issued_by=auth.uid()::text where id=v_id and store_id=p_store_id; end if;
 return jsonb_build_object('id',v_id);
end $$;
revoke all on function public.save_document(uuid,text,jsonb,jsonb,uuid) from public,anon;
grant execute on function public.save_document(uuid,text,jsonb,jsonb,uuid) to authenticated;

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
    discount_amount,trade_in_amount,total_amount,customer_note,tax_display_mode,discount_input_amount,internal_memo,payment_method,loan_request,down_payment,installment_count,payment_due_date
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
    coalesce((p_quote->>'totalAmount')::integer,0),p_quote->>'customerNote',p_quote->>'taxDisplayMode',nullif(p_quote->>'discountInputAmount','')::numeric,p_quote->>'internalMemo',p_quote->>'paymentMethod',p_quote->>'loanRequest',coalesce(nullif(p_quote->>'downPayment','')::numeric,0),nullif(p_quote->>'installmentCount','')::integer,nullif(p_quote->>'paymentDueDate','')::date
  );
  for v_item in select value from jsonb_array_elements(p_items) loop
    if nullif(v_item->>'part_id','') is not null and not exists(select 1 from public.repair_parts where id=(v_item->>'part_id')::uuid and store_id=p_store_id and deleted_at is null) then raise exception 'part_scope' using errcode='23503'; end if;
    insert into public.quote_items (
      store_id,quote_id,item_order,item_type,name,description,quantity,unit_price,tax_rate,tax_amount,amount,unit,note,tax_category,part_id,cost_price,line_discount_input_amount
    ) values (
      p_store_id,v_id,(v_item->>'item_order')::integer,v_item->>'item_type',v_item->>'name',
      v_item->>'description',(v_item->>'quantity')::numeric,(v_item->>'unit_price')::numeric,
      (v_item->>'tax_rate')::numeric,(v_item->>'tax_amount')::integer,(v_item->>'amount')::integer,v_item->>'unit',v_item->>'note',v_item->>'tax_category',nullif(v_item->>'part_id','')::uuid,nullif(v_item->>'cost_price','')::numeric,coalesce(nullif(v_item->>'line_discount_input_amount','')::numeric,0)
    );
  end loop;
  insert into public.garage_mobile_quote_operations(store_id,idempotency_key,request_fingerprint,quote_id)
    values(p_store_id,p_idempotency_key,v_fingerprint,v_id);
  return v_id;
end $$;
revoke all on function public.garage_mobile_create_quote(uuid,uuid,text,text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.garage_mobile_create_quote(uuid,uuid,text,text,jsonb,jsonb) to service_role;


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
    total_amount,paid_amount,unpaid_amount,customer_note,internal_memo,tax_display_mode,discount_input_amount
  ) values (
    p_invoice_id,p_store_id,p_quote_id,v_quote.deal_id,v_quote.maintenance_job_id,v_quote.customer_id,
    v_quote.vehicle_id,'INV-'||p_invoice_id::text,v_quote.title,'draft','draft',current_date,p_due_date,
    v_quote.customer_name,v_quote.customer_phone,v_quote.customer_email,v_quote.customer_address,
    v_quote.customer_honorific,v_quote.vehicle_label,v_quote.vehicle_maker,v_quote.vehicle_model_name,
    v_quote.vehicle_year,v_quote.vehicle_mileage_km,v_quote.vehicle_vin,
    round(coalesce(v_quote.subtotal_amount,0))::integer,round(coalesce(v_quote.tax_amount,0))::integer,
    round(coalesce(v_quote.discount_amount,0))::integer,round(coalesce(v_quote.trade_in_amount,0))::integer,
    v_total,0,v_total,v_quote.customer_note,v_quote.internal_memo,v_quote.tax_display_mode,v_quote.discount_input_amount
  );
  insert into public.invoice_items(store_id,invoice_id,item_order,item_type,name,description,quantity,unit_price,tax_rate,tax_amount,amount,unit,note,tax_category,part_id,cost_price,line_discount_input_amount)
    select p_store_id,p_invoice_id,item_order,item_type,name,description,quantity,
      unit_price,tax_rate,round(tax_amount)::integer,round(amount)::integer,unit,note,tax_category,part_id,cost_price,line_discount_input_amount
    from public.quote_items where quote_id = p_quote_id and store_id = p_store_id order by item_order,id;
  return jsonb_build_object('ok',true,'code','CREATED','invoiceId',p_invoice_id);
end $$;
revoke all on function public.garage_mobile_invoice_from_quote(uuid,uuid,uuid,date) from public,anon;
grant execute on function public.garage_mobile_invoice_from_quote(uuid,uuid,uuid,date) to authenticated;


commit;
notify pgrst, 'reload schema';
