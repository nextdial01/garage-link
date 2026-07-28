-- GARAGE LINK G4-A: sale, invoice and payment accounting integrity.
-- Existing payment_items are payment-plan rows, not proof of money received.
-- Actual money movement is recorded in the append-only invoice_payment_ledger.
begin;

do $$
begin
  if to_regclass('public.invoice_payment_ledger') is null then
    if exists (select 1 from public.invoices where coalesce(paid_amount,0) <> 0) then
      raise exception 'G4A_PRECHECK_UNMIGRATABLE_PAID_AMOUNT';
    end if;
  else
    if to_regclass('public.sale_correction_refunds') is null then
      if exists (
        select 1 from public.invoices i
        where coalesce(i.paid_amount,0) <> coalesce((
          select sum(case when l.entry_type='payment' then l.amount else -l.amount end)
          from public.invoice_payment_ledger l where l.invoice_id=i.id
        ),0)
      ) then raise exception 'G4A_PRECHECK_PAYMENT_LEDGER_MISMATCH'; end if;
    elsif exists (
      select 1 from public.invoices i
      where coalesce(i.paid_amount,0) <> coalesce((
        select sum(case when l.entry_type='payment' then l.amount else -l.amount end)
        from public.invoice_payment_ledger l
        where l.invoice_id=i.id and not exists (
          select 1 from public.sale_correction_refunds cr where cr.refund_ledger_id=l.id
        )
      ),0)
    ) then raise exception 'G4A_PRECHECK_PAYMENT_LEDGER_MISMATCH'; end if;
  end if;
  if exists (
    select 1 from public.invoices
    where coalesce(issue_status,'draft') not in ('draft','issued','cancelled')
       or coalesce(status,'draft') not in ('draft','issued','partially_paid','paid','void','cancelled','overdue','sent')
  ) then raise exception 'G4A_PRECHECK_UNKNOWN_INVOICE_STATUS'; end if;
  if exists (
    select 1 from public.quotes
    where coalesce(issue_status,'draft') not in ('draft','issued','cancelled')
  ) then raise exception 'G4A_PRECHECK_UNKNOWN_QUOTE_ISSUE_STATUS'; end if;
end;
$$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname='g4a_invoice_issue_status_ck') then
    alter table public.invoices add constraint g4a_invoice_issue_status_ck
      check (coalesce(issue_status,'draft') in ('draft','issued','cancelled')) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname='g4a_invoice_status_ck') then
    alter table public.invoices add constraint g4a_invoice_status_ck
      check (coalesce(status,'draft') in ('draft','issued','partially_paid','paid','void','cancelled','overdue','sent')) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname='g4a_quote_issue_status_ck') then
    alter table public.quotes add constraint g4a_quote_issue_status_ck
      check (coalesce(issue_status,'draft') in ('draft','issued','cancelled')) not valid;
  end if;
end $$;
alter table public.invoices validate constraint g4a_invoice_issue_status_ck;
alter table public.invoices validate constraint g4a_invoice_status_ck;
alter table public.quotes validate constraint g4a_quote_issue_status_ck;

alter table public.vehicle_sale_claims add column if not exists quote_id uuid;
create unique index if not exists g4a_quotes_id_store_uidx on public.quotes(id,store_id);
do $$ begin
  if not exists (select 1 from pg_constraint where conname='vehicle_sale_claims_quote_store_fk') then
    alter table public.vehicle_sale_claims add constraint vehicle_sale_claims_quote_store_fk
      foreign key (quote_id,store_id) references public.quotes(id,store_id) on delete restrict;
  end if;
end $$;

create table if not exists public.invoice_payment_ledger (
  id uuid primary key default extensions.gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  store_id uuid not null,
  invoice_id uuid not null,
  deal_id uuid,
  vehicle_id uuid,
  entry_type text not null check (entry_type in ('payment','reversal','refund')),
  amount integer not null check (amount > 0),
  original_payment_id uuid references public.invoice_payment_ledger(id) on delete restrict,
  payment_method text,
  reason text,
  idempotency_key text not null check (char_length(idempotency_key) between 8 and 200),
  request_fingerprint text not null check (char_length(request_fingerprint)=64),
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  actor_role text not null check (actor_role in ('owner','admin','staff')),
  correlation_id text check (correlation_id is null or char_length(correlation_id) between 1 and 100),
  created_at timestamptz not null default now(),
  unique (tenant_id,idempotency_key),
  constraint invoice_payment_ledger_store_tenant_fk foreign key (store_id,tenant_id)
    references public.stores(id,tenant_id) on delete restrict,
  constraint invoice_payment_ledger_invoice_store_fk foreign key (invoice_id,store_id)
    references public.invoices(id,store_id) on delete restrict,
  constraint invoice_payment_ledger_deal_store_fk foreign key (deal_id,store_id)
    references public.deals(id,store_id) on delete restrict,
  constraint invoice_payment_ledger_vehicle_store_fk foreign key (vehicle_id,store_id)
    references public.vehicles(id,store_id) on delete restrict,
  constraint invoice_payment_ledger_direction_ck check (
    (entry_type='payment' and original_payment_id is null)
    or (entry_type in ('reversal','refund') and original_payment_id is not null and char_length(btrim(reason)) >= 3)
  )
);
create index if not exists invoice_payment_ledger_invoice_created_idx on public.invoice_payment_ledger(invoice_id,created_at,id);
create index if not exists invoice_payment_ledger_original_idx on public.invoice_payment_ledger(original_payment_id) where original_payment_id is not null;

create table if not exists public.accounting_operations (
  id uuid primary key default extensions.gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  store_id uuid not null,
  idempotency_key text not null check (char_length(idempotency_key) between 8 and 200),
  operation text not null check (operation in ('invoice_issue','invoice_void','payment_record','payment_reversal')),
  request_fingerprint text not null check (char_length(request_fingerprint)=64),
  invoice_id uuid,
  payment_id uuid,
  result jsonb not null,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (tenant_id,idempotency_key),
  constraint accounting_operations_store_tenant_fk foreign key (store_id,tenant_id)
    references public.stores(id,tenant_id) on delete restrict,
  constraint accounting_operations_invoice_store_fk foreign key (invoice_id,store_id)
    references public.invoices(id,store_id) on delete restrict
);
create index if not exists accounting_operations_invoice_idx on public.accounting_operations(invoice_id,created_at);

alter table public.invoice_payment_ledger enable row level security;
alter table public.accounting_operations enable row level security;
drop policy if exists g4a_payment_ledger_select on public.invoice_payment_ledger;
create policy g4a_payment_ledger_select on public.invoice_payment_ledger for select to authenticated
using (store_id in (select public.current_user_store_ids()));
revoke all on public.invoice_payment_ledger from public,anon,authenticated;
grant select on public.invoice_payment_ledger to authenticated;
revoke all on public.accounting_operations from public,anon,authenticated;

create or replace function public.guard_payment_ledger_append_only()
returns trigger language plpgsql set search_path=public,pg_temp as $$
begin raise exception 'G4A_PAYMENT_LEDGER_APPEND_ONLY' using errcode='42501'; end $$;
drop trigger if exists g4a_payment_ledger_append_only on public.invoice_payment_ledger;
create trigger g4a_payment_ledger_append_only before update or delete on public.invoice_payment_ledger
for each row execute function public.guard_payment_ledger_append_only();

create or replace function public.guard_legacy_payment_item_append_only()
returns trigger language plpgsql set search_path=public,pg_temp as $$
begin raise exception 'G4A_PAYMENT_ITEM_APPEND_ONLY' using errcode='42501'; end $$;
drop trigger if exists g4a_payment_item_append_only on public.payment_items;
create trigger g4a_payment_item_append_only before update or delete on public.payment_items
for each row execute function public.guard_legacy_payment_item_append_only();
revoke update,delete on public.payment_items from authenticated;

create or replace function public.guard_invoice_initial_accounting_state()
returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
  if coalesce(current_setting('app.g4a_accounting_rpc',true),'')='on'
     or current_setting('session_replication_role')='replica' then return new; end if;
  if coalesce(new.issue_status,'draft')<>'draft' or coalesce(new.status,'draft')<>'draft'
     or coalesce(new.paid_amount,0)<>0
     or coalesce(new.unpaid_amount,coalesce(new.total_amount,0))<>coalesce(new.total_amount,0)
  then raise exception 'G4A_INVOICE_MUST_START_DRAFT' using errcode='42501'; end if;
  return new;
end $$;
drop trigger if exists g4a_invoice_initial_state_guard on public.invoices;
create trigger g4a_invoice_initial_state_guard before insert on public.invoices
for each row execute function public.guard_invoice_initial_accounting_state();

create or replace function public.guard_invoice_accounting_state()
returns trigger language plpgsql set search_path=public,pg_temp as $$
declare v_internal boolean := coalesce(current_setting('app.g4a_accounting_rpc',true),'')='on';
begin
  if v_internal then return new; end if;
  if old.issue_status <> 'draft' and (
    new.invoice_no is distinct from old.invoice_no or new.quote_id is distinct from old.quote_id
    or new.deal_id is distinct from old.deal_id or new.customer_id is distinct from old.customer_id
    or new.vehicle_id is distinct from old.vehicle_id or new.subtotal_amount is distinct from old.subtotal_amount
    or new.tax_amount is distinct from old.tax_amount or new.discount_amount is distinct from old.discount_amount
    or new.trade_in_amount is distinct from old.trade_in_amount or new.total_amount is distinct from old.total_amount
  ) then raise exception 'G4A_ISSUED_INVOICE_IMMUTABLE' using errcode='42501'; end if;
  if new.paid_amount is distinct from old.paid_amount or new.unpaid_amount is distinct from old.unpaid_amount
     or new.status is distinct from old.status or new.issue_status is distinct from old.issue_status
     or new.issued_at is distinct from old.issued_at or new.cancelled_at is distinct from old.cancelled_at
  then raise exception 'G4A_PAYMENT_TOTAL_RPC_ONLY' using errcode='42501'; end if;
  return new;
end $$;
drop trigger if exists g4a_invoice_accounting_guard on public.invoices;
create trigger g4a_invoice_accounting_guard before update on public.invoices
for each row execute function public.guard_invoice_accounting_state();

create or replace function public.guard_invoice_item_accounting_state()
returns trigger language plpgsql set search_path=public,pg_temp as $$
declare v_invoice_id uuid:=coalesce(new.invoice_id,old.invoice_id); v_status text;
begin
  if coalesce(current_setting('app.g4a_accounting_rpc',true),'')='on' then return coalesce(new,old); end if;
  select issue_status into v_status from public.invoices where id=v_invoice_id;
  if v_status is distinct from 'draft' then raise exception 'G4A_ISSUED_INVOICE_IMMUTABLE' using errcode='42501'; end if;
  return coalesce(new,old);
end $$;
drop trigger if exists g4a_invoice_item_guard on public.invoice_items;
create trigger g4a_invoice_item_guard before insert or update or delete on public.invoice_items
for each row execute function public.guard_invoice_item_accounting_state();

create or replace function public.guard_sale_quote_snapshot()
returns trigger language plpgsql set search_path=public,pg_temp as $$
declare v_quote_id uuid:=coalesce(new.quote_id,old.quote_id);
begin
  if coalesce(current_setting('app.g4a_accounting_rpc',true),'')='on' then return coalesce(new,old); end if;
  if exists (select 1 from public.vehicle_sale_claims c where c.quote_id=v_quote_id and c.status in ('active','delivered')) then
    if tg_table_name='quotes' then
      if new.status is distinct from old.status or new.issue_status is distinct from old.issue_status
         or new.quote_no is distinct from old.quote_no or new.deal_id is distinct from old.deal_id
         or new.vehicle_id is distinct from old.vehicle_id or new.subtotal_amount is distinct from old.subtotal_amount
         or new.tax_amount is distinct from old.tax_amount or new.discount_amount is distinct from old.discount_amount
         or new.trade_in_amount is distinct from old.trade_in_amount or new.total_amount is distinct from old.total_amount
      then raise exception 'G4A_SALE_QUOTE_SNAPSHOT_IMMUTABLE' using errcode='42501'; end if;
      return new;
    end if;
    raise exception 'G4A_SALE_QUOTE_SNAPSHOT_IMMUTABLE' using errcode='42501';
  end if;
  return coalesce(new,old);
end $$;
drop trigger if exists g4a_quote_snapshot_guard on public.quotes;
create trigger g4a_quote_snapshot_guard before update on public.quotes for each row execute function public.guard_sale_quote_snapshot();
drop trigger if exists g4a_quote_item_snapshot_guard on public.quote_items;
create trigger g4a_quote_item_snapshot_guard before insert or update or delete on public.quote_items for each row execute function public.guard_sale_quote_snapshot();

create or replace function public.capture_sale_quote_snapshot()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare v_quote_id uuid; v_count integer;
begin
  if new.status<>'active' then return new; end if;
  select count(*),(array_agg(q.id order by q.updated_at desc,q.id))[1] into v_count,v_quote_id
  from public.quotes q where q.deal_id=new.deal_id and q.store_id=new.store_id
    and q.issue_status='issued' and q.status not in ('expired','lost','失注');
  if v_count>1 then raise exception 'G4A_QUOTE_SELECTION_REQUIRED' using errcode='23514'; end if;
  perform set_config('app.g4a_accounting_rpc','on',true);
  if v_quote_id is not null then
    update public.vehicle_sale_claims set quote_id=v_quote_id where id=new.id;
    update public.quotes set status='approved',updated_at=now() where id=v_quote_id;
  end if;
  update public.quotes set status='expired',cancel_reason='別商談で売約成立',cancelled_at=now(),updated_at=now()
  where vehicle_id=new.vehicle_id and store_id=new.store_id and deal_id is distinct from new.deal_id
    and status not in ('expired','lost','失注') and issue_status<>'cancelled';
  perform set_config('app.g4a_accounting_rpc','',true);
  return new;
end $$;
drop trigger if exists g4a_capture_sale_quote_snapshot on public.vehicle_sale_claims;
create trigger g4a_capture_sale_quote_snapshot after insert on public.vehicle_sale_claims
for each row execute function public.capture_sale_quote_snapshot();

create or replace function public.g4a_refresh_invoice_totals(p_invoice_id uuid)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare v_paid integer; v_total integer; v_issue text;
begin
  select total_amount,issue_status into v_total,v_issue from public.invoices where id=p_invoice_id for update;
  select coalesce(sum(case when entry_type='payment' then amount else -amount end),0)::integer into v_paid
  from public.invoice_payment_ledger where invoice_id=p_invoice_id;
  if v_paid<0 or v_paid>v_total then raise exception 'G4A_PAYMENT_TOTAL_INVALID' using errcode='23514'; end if;
  perform set_config('app.g4a_accounting_rpc','on',true);
  update public.invoices set paid_amount=v_paid,unpaid_amount=v_total-v_paid,
    status=case when v_issue='cancelled' then 'void' when v_paid=0 then 'issued' when v_paid<v_total then 'partially_paid' else 'paid' end,
    updated_at=now() where id=p_invoice_id;
  perform set_config('app.g4a_accounting_rpc','',true);
end $$;
revoke all on function public.g4a_refresh_invoice_totals(uuid) from public,anon,authenticated;

create or replace function public.issue_garage_invoice(p_invoice_id uuid,p_idempotency_key text,p_correlation_id text default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_actor uuid:=auth.uid(); v_i public.invoices%rowtype; v_tenant uuid; v_role text; v_fp text; v_op public.accounting_operations%rowtype; v_result jsonb;
begin
  if v_actor is null then return jsonb_build_object('ok',false,'code','UNAUTHENTICATED'); end if;
  select * into v_i from public.invoices where id=p_invoice_id for update;
  if not found then return jsonb_build_object('ok',false,'code','INVOICE_NOT_FOUND'); end if;
  select tenant_id into v_tenant from public.stores where id=v_i.store_id and status='active';
  select public.current_user_store_role(v_i.store_id) into v_role;
  if v_role is null or v_role not in ('owner','admin','staff') then return jsonb_build_object('ok',false,'code',case when v_role is null then 'SCOPE_FORBIDDEN' else 'ROLE_FORBIDDEN' end); end if;
  v_fp:=encode(extensions.digest(concat_ws(':','issue',v_tenant,v_i.store_id,v_i.id),'sha256'),'hex');
  select * into v_op from public.accounting_operations where tenant_id=v_tenant and idempotency_key=p_idempotency_key for update;
  if found then if v_op.request_fingerprint<>v_fp then return jsonb_build_object('ok',false,'code','IDEMPOTENCY_CONFLICT'); end if; return v_op.result; end if;
  if v_i.issue_status='issued' then v_result:=jsonb_build_object('ok',true,'code','ALREADY_COMPLETED','invoiceId',v_i.id);
  elsif v_i.issue_status<>'draft' or v_i.status<>'draft' then return jsonb_build_object('ok',false,'code','INVALID_STATUS');
  elsif coalesce(v_i.total_amount,0)<0 then return jsonb_build_object('ok',false,'code','INVALID_AMOUNT');
  else
    perform set_config('app.g4a_accounting_rpc','on',true);
    update public.invoices set issue_status='issued',status='issued',issued_at=coalesce(issued_at,now()),issued_by=v_actor::text,
      issue_date=coalesce(issue_date,current_date),paid_amount=0,unpaid_amount=coalesce(total_amount,0),updated_at=now() where id=v_i.id;
    perform set_config('app.g4a_accounting_rpc','',true);
    v_result:=jsonb_build_object('ok',true,'code','ISSUED','invoiceId',v_i.id);
    insert into public.audit_logs(store_id,user_id,user_role,action,target_type,target_id,before_data,after_data,metadata)
      values(v_i.store_id,v_actor,v_role,'issue_invoice','invoice',v_i.id,jsonb_build_object('status',v_i.status),jsonb_build_object('status','issued'),jsonb_build_object('amount',v_i.total_amount,'idempotencyKeyHash',encode(extensions.digest(p_idempotency_key,'sha256'),'hex'),'correlationId',left(p_correlation_id,100)));
  end if;
  insert into public.accounting_operations(tenant_id,store_id,idempotency_key,operation,request_fingerprint,invoice_id,result,actor_user_id)
    values(v_tenant,v_i.store_id,p_idempotency_key,'invoice_issue',v_fp,v_i.id,v_result,v_actor);
  return v_result;
exception when unique_violation then return jsonb_build_object('ok',false,'code','CONFLICT'); when serialization_failure or deadlock_detected then return jsonb_build_object('ok',false,'code','TEMPORARY_FAILURE'); end $$;

create or replace function public.void_garage_invoice(p_invoice_id uuid,p_reason text,p_idempotency_key text,p_correlation_id text default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_actor uuid:=auth.uid(); v_i public.invoices%rowtype; v_tenant uuid; v_role text; v_paid integer; v_fp text; v_op public.accounting_operations%rowtype; v_result jsonb;
begin
  if v_actor is null then return jsonb_build_object('ok',false,'code','UNAUTHENTICATED'); end if;
  if char_length(btrim(coalesce(p_reason,'')))<3 then return jsonb_build_object('ok',false,'code','REASON_REQUIRED'); end if;
  select * into v_i from public.invoices where id=p_invoice_id for update;
  if not found then return jsonb_build_object('ok',false,'code','INVOICE_NOT_FOUND'); end if;
  select tenant_id into v_tenant from public.stores where id=v_i.store_id and status='active'; select public.current_user_store_role(v_i.store_id) into v_role;
  if v_role is null or v_role not in ('owner','admin') then return jsonb_build_object('ok',false,'code',case when v_role is null then 'SCOPE_FORBIDDEN' else 'ROLE_FORBIDDEN' end); end if;
  select coalesce(sum(case when entry_type='payment' then amount else -amount end),0)::integer into v_paid from public.invoice_payment_ledger where invoice_id=v_i.id;
  if v_paid<>0 then return jsonb_build_object('ok',false,'code','PAYMENT_EXISTS'); end if;
  if exists(select 1 from public.vehicle_sale_claims c where c.deal_id=v_i.deal_id and c.status='delivered') then return jsonb_build_object('ok',false,'code','DELIVERED_CANNOT_CANCEL'); end if;
  v_fp:=encode(extensions.digest(concat_ws(':','void',v_tenant,v_i.store_id,v_i.id,p_reason),'sha256'),'hex');
  select * into v_op from public.accounting_operations where tenant_id=v_tenant and idempotency_key=p_idempotency_key for update;
  if found then if v_op.request_fingerprint<>v_fp then return jsonb_build_object('ok',false,'code','IDEMPOTENCY_CONFLICT'); end if; return v_op.result; end if;
  if v_i.issue_status='cancelled' then v_result:=jsonb_build_object('ok',true,'code','ALREADY_COMPLETED','invoiceId',v_i.id);
  else perform set_config('app.g4a_accounting_rpc','on',true); update public.invoices set issue_status='cancelled',status='void',cancelled_at=now(),cancel_reason=btrim(p_reason),updated_at=now() where id=v_i.id; perform set_config('app.g4a_accounting_rpc','',true);
    v_result:=jsonb_build_object('ok',true,'code','VOIDED','invoiceId',v_i.id);
    insert into public.audit_logs(store_id,user_id,user_role,action,target_type,target_id,before_data,after_data,metadata) values(v_i.store_id,v_actor,v_role,'cancel_invoice','invoice',v_i.id,jsonb_build_object('status',v_i.status),jsonb_build_object('status','void'),jsonb_build_object('reason',btrim(p_reason),'idempotencyKeyHash',encode(extensions.digest(p_idempotency_key,'sha256'),'hex'),'correlationId',left(p_correlation_id,100)));
  end if;
  insert into public.accounting_operations(tenant_id,store_id,idempotency_key,operation,request_fingerprint,invoice_id,result,actor_user_id) values(v_tenant,v_i.store_id,p_idempotency_key,'invoice_void',v_fp,v_i.id,v_result,v_actor); return v_result;
exception when unique_violation then return jsonb_build_object('ok',false,'code','CONFLICT'); when serialization_failure or deadlock_detected then return jsonb_build_object('ok',false,'code','TEMPORARY_FAILURE'); end $$;

create or replace function public.record_garage_payment(p_invoice_id uuid,p_amount integer,p_payment_method text,p_idempotency_key text,p_correlation_id text default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_actor uuid:=auth.uid(); v_i public.invoices%rowtype; v_tenant uuid; v_role text; v_paid integer; v_fp text; v_op public.accounting_operations%rowtype; v_payment uuid; v_result jsonb;
begin
  if v_actor is null then return jsonb_build_object('ok',false,'code','UNAUTHENTICATED'); end if;
  if coalesce(p_amount,0)<=0 then return jsonb_build_object('ok',false,'code','INVALID_AMOUNT'); end if;
  select * into v_i from public.invoices where id=p_invoice_id for update; if not found then return jsonb_build_object('ok',false,'code','INVOICE_NOT_FOUND'); end if;
  select tenant_id into v_tenant from public.stores where id=v_i.store_id and status='active'; select public.current_user_store_role(v_i.store_id) into v_role;
  if v_role is null or v_role not in ('owner','admin','staff') then return jsonb_build_object('ok',false,'code',case when v_role is null then 'SCOPE_FORBIDDEN' else 'ROLE_FORBIDDEN' end); end if;
  if v_i.issue_status<>'issued' or v_i.status in ('void','cancelled') then return jsonb_build_object('ok',false,'code','INVALID_STATUS'); end if;
  v_fp:=encode(extensions.digest(concat_ws(':','payment',v_tenant,v_i.store_id,v_i.id,p_amount,coalesce(p_payment_method,'')),'sha256'),'hex');
  select * into v_op from public.accounting_operations where tenant_id=v_tenant and idempotency_key=p_idempotency_key for update;
  if found then if v_op.request_fingerprint<>v_fp then return jsonb_build_object('ok',false,'code','IDEMPOTENCY_CONFLICT'); end if; return v_op.result; end if;
  select coalesce(sum(case when entry_type='payment' then amount else -amount end),0)::integer into v_paid from public.invoice_payment_ledger where invoice_id=v_i.id;
  if v_paid+p_amount>coalesce(v_i.total_amount,0) then return jsonb_build_object('ok',false,'code','OVERPAYMENT'); end if;
  insert into public.invoice_payment_ledger(tenant_id,store_id,invoice_id,deal_id,vehicle_id,entry_type,amount,payment_method,idempotency_key,request_fingerprint,actor_user_id,actor_role,correlation_id)
    values(v_tenant,v_i.store_id,v_i.id,v_i.deal_id,v_i.vehicle_id,'payment',p_amount,nullif(btrim(p_payment_method),''),p_idempotency_key,v_fp,v_actor,v_role,left(p_correlation_id,100)) returning id into v_payment;
  perform public.g4a_refresh_invoice_totals(v_i.id);
  v_result:=jsonb_build_object('ok',true,'code','PAYMENT_RECORDED','invoiceId',v_i.id,'paymentId',v_payment);
  insert into public.accounting_operations(tenant_id,store_id,idempotency_key,operation,request_fingerprint,invoice_id,payment_id,result,actor_user_id) values(v_tenant,v_i.store_id,p_idempotency_key,'payment_record',v_fp,v_i.id,v_payment,v_result,v_actor);
  insert into public.audit_logs(store_id,user_id,user_role,action,target_type,target_id,before_data,after_data,metadata) values(v_i.store_id,v_actor,v_role,'payment_recorded','invoice',v_i.id,jsonb_build_object('paidAmount',v_paid),jsonb_build_object('paidAmount',v_paid+p_amount),jsonb_build_object('paymentId',v_payment,'amount',p_amount,'idempotencyKeyHash',encode(extensions.digest(p_idempotency_key,'sha256'),'hex'),'correlationId',left(p_correlation_id,100)));
  return v_result;
exception when unique_violation then return jsonb_build_object('ok',false,'code','CONFLICT'); when serialization_failure or deadlock_detected then return jsonb_build_object('ok',false,'code','TEMPORARY_FAILURE'); end $$;

create or replace function public.record_garage_payment_reversal(p_payment_id uuid,p_amount integer,p_operation text,p_reason text,p_idempotency_key text,p_correlation_id text default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_actor uuid:=auth.uid(); v_original public.invoice_payment_ledger%rowtype; v_i public.invoices%rowtype; v_role text; v_reversed integer; v_fp text; v_op public.accounting_operations%rowtype; v_entry uuid; v_result jsonb;
begin
  if v_actor is null then return jsonb_build_object('ok',false,'code','UNAUTHENTICATED'); end if;
  if p_operation not in ('reversal','refund') or coalesce(p_amount,0)<=0 then return jsonb_build_object('ok',false,'code','INVALID_AMOUNT'); end if;
  if char_length(btrim(coalesce(p_reason,'')))<3 then return jsonb_build_object('ok',false,'code','REASON_REQUIRED'); end if;
  select * into v_original from public.invoice_payment_ledger where id=p_payment_id and entry_type='payment'; if not found then return jsonb_build_object('ok',false,'code','PAYMENT_NOT_FOUND'); end if;
  select * into v_i from public.invoices where id=v_original.invoice_id for update; if not found then return jsonb_build_object('ok',false,'code','INVOICE_NOT_FOUND'); end if;
  select * into v_original from public.invoice_payment_ledger where id=p_payment_id and entry_type='payment' for update;
  select public.current_user_store_role(v_original.store_id) into v_role; if v_role is null or v_role not in ('owner','admin') then return jsonb_build_object('ok',false,'code',case when v_role is null then 'SCOPE_FORBIDDEN' else 'ROLE_FORBIDDEN' end); end if;
  v_fp:=encode(extensions.digest(concat_ws(':',p_operation,v_original.tenant_id,v_original.store_id,v_original.invoice_id,v_original.id,p_amount,p_reason),'sha256'),'hex');
  select * into v_op from public.accounting_operations where tenant_id=v_original.tenant_id and idempotency_key=p_idempotency_key for update;
  if found then if v_op.request_fingerprint<>v_fp then return jsonb_build_object('ok',false,'code','IDEMPOTENCY_CONFLICT'); end if; return v_op.result; end if;
  select coalesce(sum(amount),0)::integer into v_reversed from public.invoice_payment_ledger where original_payment_id=v_original.id and entry_type in ('reversal','refund');
  if v_reversed+p_amount>v_original.amount then return jsonb_build_object('ok',false,'code','REFUND_EXCEEDS_PAYMENT'); end if;
  insert into public.invoice_payment_ledger(tenant_id,store_id,invoice_id,deal_id,vehicle_id,entry_type,amount,original_payment_id,reason,idempotency_key,request_fingerprint,actor_user_id,actor_role,correlation_id)
    values(v_original.tenant_id,v_original.store_id,v_original.invoice_id,v_original.deal_id,v_original.vehicle_id,p_operation,p_amount,v_original.id,btrim(p_reason),p_idempotency_key,v_fp,v_actor,v_role,left(p_correlation_id,100)) returning id into v_entry;
  perform public.g4a_refresh_invoice_totals(v_original.invoice_id);
  v_result:=jsonb_build_object('ok',true,'code',case when p_operation='refund' then 'REFUND_RECORDED' else 'REVERSAL_RECORDED' end,'invoiceId',v_original.invoice_id,'paymentId',v_entry,'originalPaymentId',v_original.id);
  insert into public.accounting_operations(tenant_id,store_id,idempotency_key,operation,request_fingerprint,invoice_id,payment_id,result,actor_user_id) values(v_original.tenant_id,v_original.store_id,p_idempotency_key,'payment_reversal',v_fp,v_original.invoice_id,v_entry,v_result,v_actor);
  insert into public.audit_logs(store_id,user_id,user_role,action,target_type,target_id,before_data,after_data,metadata) values(v_original.store_id,v_actor,v_role,case when p_operation='refund' then 'payment_refunded' else 'payment_reversed' end,'invoice',v_original.invoice_id,jsonb_build_object('originalPaymentId',v_original.id,'reversedAmount',v_reversed),jsonb_build_object('reversedAmount',v_reversed+p_amount),jsonb_build_object('paymentId',v_entry,'amount',p_amount,'reason',btrim(p_reason),'idempotencyKeyHash',encode(extensions.digest(p_idempotency_key,'sha256'),'hex'),'correlationId',left(p_correlation_id,100)));
  return v_result;
exception when unique_violation then return jsonb_build_object('ok',false,'code','CONFLICT'); when serialization_failure or deadlock_detected then return jsonb_build_object('ok',false,'code','TEMPORARY_FAILURE'); end $$;

-- Replace G3 cancellation without weakening its membership, role, scope or locks.
create or replace function public.cancel_vehicle_sale(p_deal_id uuid,p_idempotency_key text,p_correlation_id text default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_actor uuid:=auth.uid(); v_deal public.deals%rowtype; v_vehicle public.vehicles%rowtype; v_store public.stores%rowtype; v_role text; v_existing public.vehicle_sale_operations%rowtype; v_claim public.vehicle_sale_claims%rowtype; v_fingerprint text; v_result jsonb; v_paid integer;
begin
  if v_actor is null then return jsonb_build_object('ok',false,'code','UNAUTHENTICATED'); end if;
  select * into v_deal from public.deals where id=p_deal_id; if not found or v_deal.vehicle_id is null then return jsonb_build_object('ok',false,'code','DEAL_NOT_FOUND'); end if;
  select * into v_vehicle from public.vehicles where id=v_deal.vehicle_id for update; if not found then return jsonb_build_object('ok',false,'code','VEHICLE_NOT_FOUND'); end if;
  select * into v_deal from public.deals where id=p_deal_id for update; if not found or v_deal.vehicle_id is distinct from v_vehicle.id then return jsonb_build_object('ok',false,'code','CONFLICT'); end if;
  select * into v_store from public.stores where id=v_deal.store_id and status='active'; if not found or v_store.tenant_id is null or v_vehicle.store_id<>v_deal.store_id then return jsonb_build_object('ok',false,'code','SCOPE_FORBIDDEN'); end if;
  select public.current_user_store_role(v_deal.store_id) into v_role; if v_role is null or v_role not in ('owner','admin','staff') then return jsonb_build_object('ok',false,'code',case when v_role is null then 'SCOPE_FORBIDDEN' else 'ROLE_FORBIDDEN' end); end if;
  v_fingerprint:=encode(extensions.digest(concat_ws(':','cancel',v_store.tenant_id,v_deal.store_id,v_vehicle.id,v_deal.id),'sha256'),'hex');
  select * into v_existing from public.vehicle_sale_operations where tenant_id=v_store.tenant_id and idempotency_key=p_idempotency_key for update;
  if found then if v_existing.request_fingerprint<>v_fingerprint then return jsonb_build_object('ok',false,'code','IDEMPOTENCY_CONFLICT'); end if; return v_existing.result; end if;
  select * into v_claim from public.vehicle_sale_claims where vehicle_id=v_vehicle.id and deal_id=v_deal.id order by created_at desc limit 1 for update;
  if not found then return jsonb_build_object('ok',false,'code','SALE_NOT_FOUND'); end if;
  perform i.id from public.invoices i where i.deal_id=v_deal.id and i.deleted_at is null order by i.id for update;
  select coalesce(sum(case when l.entry_type='payment' then l.amount else -l.amount end),0)::integer into v_paid from public.invoice_payment_ledger l join public.invoices i on i.id=l.invoice_id where i.deal_id=v_deal.id;
  if v_claim.status='cancelled' then v_result:=jsonb_build_object('ok',true,'code','ALREADY_COMPLETED','vehicleId',v_vehicle.id,'dealId',v_deal.id,'claimId',v_claim.id);
  elsif v_claim.status='delivered' or v_vehicle.status in ('納車済み','delivered') then return jsonb_build_object('ok',false,'code','DELIVERED_CANNOT_CANCEL');
  elsif v_paid>0 then return jsonb_build_object('ok',false,'code','PAYMENT_EXISTS');
  else
    perform set_config('app.g4a_accounting_rpc','on',true);
    update public.invoices set issue_status='cancelled',status='void',cancelled_at=now(),cancel_reason='売約取消',updated_at=now() where deal_id=v_deal.id and deleted_at is null and issue_status<>'cancelled';
    perform set_config('app.g4a_accounting_rpc','',true);
    update public.vehicle_sale_claims set status='cancelled',cancelled_at=now(),updated_at=now() where id=v_claim.id;
    update public.vehicles set status=v_claim.previous_vehicle_status,sold_date=null,updated_at=now() where id=v_vehicle.id;
    update public.deals set status='失注',updated_at=now() where id=v_deal.id;
    v_result:=jsonb_build_object('ok',true,'code','CANCELLED','vehicleId',v_vehicle.id,'dealId',v_deal.id,'claimId',v_claim.id);
    insert into public.audit_logs(store_id,user_id,user_role,action,target_type,target_id,before_data,after_data,metadata) values(v_deal.store_id,v_actor,v_role,'vehicle_sale_cancelled','vehicle',v_vehicle.id,jsonb_build_object('vehicleStatus',v_vehicle.status,'dealStatus',v_deal.status),jsonb_build_object('vehicleStatus',v_claim.previous_vehicle_status,'dealStatus','失注'),jsonb_build_object('dealId',v_deal.id,'voidedInvoices',(select count(*) from public.invoices where deal_id=v_deal.id and issue_status='cancelled'),'idempotencyKeyHash',encode(extensions.digest(p_idempotency_key,'sha256'),'hex'),'correlationId',left(p_correlation_id,100)));
  end if;
  insert into public.vehicle_sale_operations(tenant_id,store_id,idempotency_key,operation,vehicle_id,deal_id,request_fingerprint,result,actor_user_id) values(v_store.tenant_id,v_deal.store_id,p_idempotency_key,'cancel',v_vehicle.id,v_deal.id,v_fingerprint,v_result,v_actor);
  return v_result;
exception when unique_violation then return jsonb_build_object('ok',false,'code','CONFLICT'); when serialization_failure or deadlock_detected then return jsonb_build_object('ok',false,'code','TEMPORARY_FAILURE'); end $$;

revoke all on function public.issue_garage_invoice(uuid,text,text) from public,anon;
revoke all on function public.void_garage_invoice(uuid,text,text,text) from public,anon;
revoke all on function public.record_garage_payment(uuid,integer,text,text,text) from public,anon;
revoke all on function public.record_garage_payment_reversal(uuid,integer,text,text,text,text) from public,anon;
grant execute on function public.issue_garage_invoice(uuid,text,text) to authenticated;
grant execute on function public.void_garage_invoice(uuid,text,text,text) to authenticated;
grant execute on function public.record_garage_payment(uuid,integer,text,text,text) to authenticated;
grant execute on function public.record_garage_payment_reversal(uuid,integer,text,text,text,text) to authenticated;

commit;
