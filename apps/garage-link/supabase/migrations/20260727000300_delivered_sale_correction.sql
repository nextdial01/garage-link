-- GARAGE LINK G4-B: delivered-sale return and contract-correction cases.
-- This migration never rewrites or deletes the original sale, deal, invoice,
-- payment or delivery history. External refunds and external messaging are out of scope.
begin;

do $$
begin
  if to_regclass('public.sale_correction_cases') is null then
    if exists (
      select 1 from public.vehicle_sale_claims c
      join public.vehicles v on v.id=c.vehicle_id
      join public.deals d on d.id=c.deal_id
      where c.status='delivered'
        and (c.store_id<>v.store_id or c.store_id<>d.store_id
          or v.status not in ('納車済み','delivered') or d.status<>'成約')
    ) then raise exception 'G4B_PRECHECK_DELIVERED_SALE_SCOPE_OR_STATUS_MISMATCH'; end if;
  else
    -- A prior, explicit G4-B restock preserves the delivered claim and deal.
    -- Only that scoped case history is exempt; every ambiguous mismatch still stops.
    if exists (
      select 1 from public.vehicle_sale_claims c
      join public.vehicles v on v.id=c.vehicle_id
      join public.deals d on d.id=c.deal_id
      where c.status='delivered'
        and (
          c.store_id<>v.store_id or c.store_id<>d.store_id or d.status<>'成約'
          or (
            v.status not in ('納車済み','delivered')
            and not exists (
              select 1
              from public.sale_correction_cases correction
              where correction.original_sale_claim_id=c.id
                and correction.vehicle_id=c.vehicle_id
                and correction.deal_id=c.deal_id
                and correction.store_id=c.store_id
                and correction.tenant_id=c.tenant_id
                and correction.status in ('processing','completed')
                and correction.restock_status='completed'
            )
          )
        )
    ) then raise exception 'G4B_PRECHECK_DELIVERED_SALE_SCOPE_OR_STATUS_MISMATCH'; end if;
  end if;
end $$;

create unique index if not exists g4b_sale_claim_scope_uidx
  on public.vehicle_sale_claims(id,store_id,tenant_id);

create table if not exists public.sale_correction_cases (
  id uuid primary key default extensions.gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  store_id uuid not null,
  original_sale_claim_id uuid not null,
  vehicle_id uuid not null,
  deal_id uuid not null,
  customer_id uuid,
  invoice_id uuid,
  case_type text not null check (case_type in (
    'customer_return','contract_correction','delivery_cancellation',
    'vehicle_exchange','administrative_correction'
  )),
  status text not null default 'requested' check (status in (
    'requested','under_review','approved','rejected','processing','completed','cancelled'
  )),
  reason text not null check (char_length(btrim(reason)) between 3 and 2000),
  requested_refund_amount integer not null default 0 check (requested_refund_amount>=0),
  approved_refund_amount integer check (approved_refund_amount is null or approved_refund_amount>=0),
  vehicle_inspection_status text not null default 'pending' check (vehicle_inspection_status in ('pending','in_progress','completed','not_required')),
  restock_decision text not null default 'pending' check (restock_decision in ('pending','restock','repair_required','not_for_sale','not_applicable')),
  restock_status text not null default 'pending' check (restock_status in ('pending','completed','not_applicable')),
  ownership_status text not null default 'active' check (ownership_status in ('active','return_pending','returned','transferred','corrected','not_applicable')),
  followup_status text not null default 'active' check (followup_status in ('active','suppressed','completed','ambiguous')),
  external_procedure_status text not null default 'pending' check (external_procedure_status in ('pending','completed','not_required','ambiguous')),
  inspection_note text,
  internal_notes text,
  requested_by uuid not null references auth.users(id) on delete restrict,
  approved_by uuid references auth.users(id) on delete restrict,
  approved_at timestamptz,
  completed_by uuid references auth.users(id) on delete restrict,
  completed_at timestamptz,
  idempotency_key text not null check (char_length(idempotency_key) between 8 and 200),
  request_fingerprint text not null check (char_length(request_fingerprint)=64),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id,idempotency_key),
  unique (id,store_id,tenant_id),
  constraint sale_correction_cases_store_tenant_fk foreign key (store_id,tenant_id)
    references public.stores(id,tenant_id) on delete restrict,
  constraint sale_correction_cases_claim_scope_fk foreign key (original_sale_claim_id,store_id,tenant_id)
    references public.vehicle_sale_claims(id,store_id,tenant_id) on delete restrict,
  constraint sale_correction_cases_vehicle_store_fk foreign key (vehicle_id,store_id)
    references public.vehicles(id,store_id) on delete restrict,
  constraint sale_correction_cases_deal_store_fk foreign key (deal_id,store_id)
    references public.deals(id,store_id) on delete restrict,
  constraint sale_correction_cases_customer_store_fk foreign key (customer_id,store_id)
    references public.customers(id,store_id) on delete restrict,
  constraint sale_correction_cases_invoice_store_fk foreign key (invoice_id,store_id)
    references public.invoices(id,store_id) on delete restrict
);
create unique index if not exists sale_correction_cases_one_active_sale_uidx
  on public.sale_correction_cases(original_sale_claim_id)
  where status in ('requested','under_review','approved','processing');
create index if not exists sale_correction_cases_store_status_idx on public.sale_correction_cases(store_id,status,created_at desc);
create index if not exists sale_correction_cases_vehicle_idx on public.sale_correction_cases(vehicle_id,created_at desc);

create table if not exists public.sale_correction_operations (
  id uuid primary key default extensions.gen_random_uuid(),
  tenant_id uuid not null,
  store_id uuid not null,
  case_id uuid,
  operation text not null check (operation in ('create','begin_review','approve','reject','start_processing','cancel','refund','inspection','ownership','external_procedure','restock','complete')),
  idempotency_key text not null check (char_length(idempotency_key) between 8 and 200),
  request_fingerprint text not null check (char_length(request_fingerprint)=64),
  result jsonb not null,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (tenant_id,idempotency_key),
  constraint sale_correction_operations_store_tenant_fk foreign key (store_id,tenant_id)
    references public.stores(id,tenant_id) on delete restrict,
  constraint sale_correction_operations_case_scope_fk foreign key (case_id,store_id,tenant_id)
    references public.sale_correction_cases(id,store_id,tenant_id) on delete restrict
);

create table if not exists public.sale_correction_events (
  id uuid primary key default extensions.gen_random_uuid(),
  tenant_id uuid not null,
  store_id uuid not null,
  case_id uuid not null,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  actor_role text not null check (actor_role in ('owner','admin','staff')),
  event_type text not null,
  before_status text,
  after_status text,
  amount integer check (amount is null or amount>=0),
  reason text,
  correlation_id text check (correlation_id is null or char_length(correlation_id)<=100),
  idempotency_key_hash text check (idempotency_key_hash is null or char_length(idempotency_key_hash)=64),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint sale_correction_events_case_scope_fk foreign key (case_id,store_id,tenant_id)
    references public.sale_correction_cases(id,store_id,tenant_id) on delete restrict
);
create index if not exists sale_correction_events_case_idx on public.sale_correction_events(case_id,created_at,id);

create table if not exists public.customer_vehicle_ownership_history (
  id uuid primary key default extensions.gen_random_uuid(),
  tenant_id uuid not null,
  store_id uuid not null,
  case_id uuid not null,
  original_sale_claim_id uuid not null,
  vehicle_id uuid not null,
  customer_id uuid not null,
  ownership_status text not null check (ownership_status in ('active','return_pending','returned','transferred','corrected')),
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  reason text,
  created_at timestamptz not null default now(),
  unique(case_id,ownership_status),
  constraint customer_vehicle_ownership_case_scope_fk foreign key (case_id,store_id,tenant_id)
    references public.sale_correction_cases(id,store_id,tenant_id) on delete restrict,
  constraint customer_vehicle_ownership_claim_scope_fk foreign key (original_sale_claim_id,store_id,tenant_id)
    references public.vehicle_sale_claims(id,store_id,tenant_id) on delete restrict,
  constraint customer_vehicle_ownership_vehicle_store_fk foreign key (vehicle_id,store_id)
    references public.vehicles(id,store_id) on delete restrict,
  constraint customer_vehicle_ownership_customer_store_fk foreign key (customer_id,store_id)
    references public.customers(id,store_id) on delete restrict
);
create index if not exists customer_vehicle_ownership_vehicle_idx on public.customer_vehicle_ownership_history(vehicle_id,created_at,id);
create index if not exists customer_vehicle_ownership_customer_idx on public.customer_vehicle_ownership_history(customer_id,created_at,id);

create table if not exists public.sale_correction_refunds (
  id uuid primary key default extensions.gen_random_uuid(),
  tenant_id uuid not null,
  store_id uuid not null,
  case_id uuid not null,
  refund_ledger_id uuid not null unique references public.invoice_payment_ledger(id) on delete restrict,
  original_payment_id uuid not null references public.invoice_payment_ledger(id) on delete restrict,
  amount integer not null check (amount>0),
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  reason text not null check (char_length(btrim(reason))>=3),
  created_at timestamptz not null default now(),
  constraint sale_correction_refunds_case_scope_fk foreign key (case_id,store_id,tenant_id)
    references public.sale_correction_cases(id,store_id,tenant_id) on delete restrict
);
create index if not exists sale_correction_refunds_case_idx on public.sale_correction_refunds(case_id,created_at,id);
create index if not exists sale_correction_refunds_original_idx on public.sale_correction_refunds(original_payment_id);

create or replace function public.g4b_guard_original_invoice_ledger()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if coalesce(current_setting('app.g4b_case_rpc',true),'')='on' then return new; end if;
  if exists (
    select 1 from public.sale_correction_cases c
    where c.invoice_id=new.invoice_id and c.status in ('approved','processing','completed')
  ) then raise exception 'G4B_ORIGINAL_INVOICE_LEDGER_LOCKED' using errcode='42501'; end if;
  return new;
end $$;
drop trigger if exists g4b_original_invoice_ledger_guard on public.invoice_payment_ledger;
create trigger g4b_original_invoice_ledger_guard before insert on public.invoice_payment_ledger
  for each row execute function public.g4b_guard_original_invoice_ledger();

-- Keep G4-A invoice snapshots historical: correction-case refund rows are
-- accounted by the case, not folded back into the original invoice snapshot.
create or replace function public.g4a_refresh_invoice_totals(p_invoice_id uuid)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare v_paid integer; v_total integer; v_issue text;
begin
  select total_amount,issue_status into v_total,v_issue from public.invoices where id=p_invoice_id for update;
  select coalesce(sum(case when l.entry_type='payment' then l.amount else -l.amount end),0)::integer into v_paid
  from public.invoice_payment_ledger l
  where l.invoice_id=p_invoice_id
    and not exists(select 1 from public.sale_correction_refunds cr where cr.refund_ledger_id=l.id);
  if v_paid<0 or v_paid>v_total then raise exception 'G4A_PAYMENT_TOTAL_INVALID' using errcode='23514'; end if;
  perform set_config('app.g4a_accounting_rpc','on',true);
  update public.invoices set paid_amount=v_paid,unpaid_amount=v_total-v_paid,
    status=case when v_issue='cancelled' then 'void' when v_paid=0 then 'issued' when v_paid<v_total then 'partially_paid' else 'paid' end,
    updated_at=now() where id=p_invoice_id;
  perform set_config('app.g4a_accounting_rpc','',true);
end $$;
revoke all on function public.g4a_refresh_invoice_totals(uuid) from public,anon,authenticated;

alter table public.sale_correction_cases enable row level security;
alter table public.sale_correction_operations enable row level security;
alter table public.sale_correction_events enable row level security;
alter table public.customer_vehicle_ownership_history enable row level security;
alter table public.sale_correction_refunds enable row level security;
drop policy if exists g4b_cases_select on public.sale_correction_cases;
create policy g4b_cases_select on public.sale_correction_cases for select to authenticated
  using (store_id in (select public.current_user_store_ids()));
drop policy if exists g4b_events_select on public.sale_correction_events;
create policy g4b_events_select on public.sale_correction_events for select to authenticated
  using (store_id in (select public.current_user_store_ids()));
drop policy if exists g4b_ownership_select on public.customer_vehicle_ownership_history;
create policy g4b_ownership_select on public.customer_vehicle_ownership_history for select to authenticated
  using (store_id in (select public.current_user_store_ids()));
drop policy if exists g4b_refunds_select on public.sale_correction_refunds;
create policy g4b_refunds_select on public.sale_correction_refunds for select to authenticated
  using (store_id in (select public.current_user_store_ids()));
revoke all on public.sale_correction_cases,public.sale_correction_operations,public.sale_correction_events,
  public.customer_vehicle_ownership_history,public.sale_correction_refunds from public,anon,authenticated;
grant select on public.sale_correction_cases,public.sale_correction_events,
  public.customer_vehicle_ownership_history,public.sale_correction_refunds to authenticated;

create or replace function public.g4b_append_only_guard()
returns trigger language plpgsql set search_path=public,pg_temp as $$
begin raise exception 'G4B_APPEND_ONLY' using errcode='42501'; end $$;
drop trigger if exists g4b_events_append_only on public.sale_correction_events;
create trigger g4b_events_append_only before update or delete on public.sale_correction_events
  for each row execute function public.g4b_append_only_guard();
drop trigger if exists g4b_ownership_append_only on public.customer_vehicle_ownership_history;
create trigger g4b_ownership_append_only before update or delete on public.customer_vehicle_ownership_history
  for each row execute function public.g4b_append_only_guard();
drop trigger if exists g4b_refunds_append_only on public.sale_correction_refunds;
create trigger g4b_refunds_append_only before update or delete on public.sale_correction_refunds
  for each row execute function public.g4b_append_only_guard();
drop trigger if exists g4b_operations_append_only on public.sale_correction_operations;
create trigger g4b_operations_append_only before update or delete on public.sale_correction_operations
  for each row when (coalesce(current_setting('app.g4b_case_rpc',true),'')<>'on') execute function public.g4b_append_only_guard();

create or replace function public.guard_sale_correction_case_mutation()
returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
  if coalesce(current_setting('app.g4b_case_rpc',true),'')<>'on' then
    raise exception 'G4B_CASE_RPC_ONLY' using errcode='42501';
  end if;
  if tg_op='UPDATE' and old.status='completed' and row(new.*) is distinct from row(old.*) then
    raise exception 'G4B_COMPLETED_CASE_IMMUTABLE' using errcode='42501';
  end if;
  return coalesce(new,old);
end $$;
drop trigger if exists g4b_case_mutation_guard on public.sale_correction_cases;
create trigger g4b_case_mutation_guard before insert or update or delete on public.sale_correction_cases
  for each row execute function public.guard_sale_correction_case_mutation();

create or replace function public.g4b_block_followup_candidate()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if exists (
    select 1 from public.sale_correction_cases c
    where c.store_id=new.store_id and c.vehicle_id=new.vehicle_id
      and (c.customer_id is null or c.customer_id=new.customer_id)
      and c.status in ('approved','processing','completed')
      and c.followup_status in ('suppressed','completed')
  ) then return null; end if;
  return new;
end $$;
drop trigger if exists g4b_block_followup_candidate on public.inspection_reminder_events;
create trigger g4b_block_followup_candidate before insert on public.inspection_reminder_events
  for each row execute function public.g4b_block_followup_candidate();

-- Extend the G3 transition guard only for the explicit, owner/admin G4-B restock RPC.
create or replace function public.guard_vehicle_sale_transition()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if coalesce(current_setting('app.g4b_case_rpc',true),'')='restock' then return new; end if;
  if old.status not in ('売約済み','sold') and new.status in ('売約済み','sold') and not exists (
    select 1 from public.vehicle_sale_claims c where c.vehicle_id=new.id and c.store_id=new.store_id and c.status='active'
  ) then raise exception 'SALE_TRANSITION_REQUIRES_ATOMIC_RPC'; end if;
  if old.status in ('売約済み','sold') and new.status in ('納車済み','delivered') and not exists (
    select 1 from public.vehicle_sale_claims c where c.vehicle_id=new.id and c.status='delivered'
  ) then raise exception 'SALE_TRANSITION_REQUIRES_ATOMIC_RPC'; end if;
  if old.status in ('売約済み','納車済み','sold','delivered') and new.status not in ('売約済み','納車済み','sold','delivered')
     and coalesce((select c.status from public.vehicle_sale_claims c where c.vehicle_id=old.id order by c.created_at desc,c.id desc limit 1),'')<>'cancelled'
  then raise exception 'SALE_TRANSITION_REQUIRES_ATOMIC_RPC'; end if;
  if exists (select 1 from public.vehicle_sale_claims c where c.vehicle_id=old.id and c.status in ('active','delivered'))
     and (new.store_id is distinct from old.store_id or new.deleted_at is distinct from old.deleted_at or new.is_archived is distinct from old.is_archived)
  then raise exception 'SALE_TRANSITION_REQUIRES_ATOMIC_RPC'; end if;
  return new;
end $$;

create or replace function public.create_sale_correction_case(
  p_sale_claim_id uuid,p_case_type text,p_reason text,p_requested_refund_amount integer,
  p_invoice_id uuid,p_idempotency_key text,p_correlation_id text default null
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_actor uuid:=auth.uid(); v_claim public.vehicle_sale_claims%rowtype; v_deal public.deals%rowtype;
  v_vehicle public.vehicles%rowtype; v_role text; v_customer uuid; v_invoice public.invoices%rowtype;
  v_tenant uuid; v_fp text; v_op_id uuid; v_existing public.sale_correction_operations%rowtype;
  v_case public.sale_correction_cases%rowtype; v_result jsonb; v_net integer;
begin
  if v_actor is null then return jsonb_build_object('ok',false,'code','UNAUTHENTICATED'); end if;
  if p_case_type not in ('customer_return','contract_correction','delivery_cancellation','vehicle_exchange','administrative_correction')
     or char_length(btrim(coalesce(p_reason,'')))<3 or coalesce(p_requested_refund_amount,-1)<0
     or char_length(coalesce(p_idempotency_key,'')) not between 8 and 200
  then return jsonb_build_object('ok',false,'code','INVALID_REQUEST'); end if;
  select * into v_claim from public.vehicle_sale_claims where id=p_sale_claim_id for update;
  if not found then return jsonb_build_object('ok',false,'code','SALE_NOT_FOUND'); end if;
  select * into v_vehicle from public.vehicles where id=v_claim.vehicle_id and store_id=v_claim.store_id for update;
  select * into v_deal from public.deals where id=v_claim.deal_id and store_id=v_claim.store_id for update;
  if not found or v_claim.status <> 'delivered' or v_vehicle.status not in ('納車済み','delivered') or v_deal.status<>'成約'
  then return jsonb_build_object('ok',false,'code','NOT_DELIVERED'); end if;
  select tenant_id into v_tenant from public.stores where id=v_claim.store_id and status='active';
  if v_tenant is null or v_tenant<>v_claim.tenant_id then return jsonb_build_object('ok',false,'code','SCOPE_FORBIDDEN'); end if;
  select public.current_user_store_role(v_claim.store_id) into v_role;
  if v_role is null then return jsonb_build_object('ok',false,'code','SCOPE_FORBIDDEN'); end if;
  if v_role not in ('owner','admin','staff') then return jsonb_build_object('ok',false,'code','ROLE_FORBIDDEN'); end if;
  v_customer:=v_deal.customer_id;
  if p_case_type in ('customer_return','delivery_cancellation','vehicle_exchange') and v_customer is null
  then return jsonb_build_object('ok',false,'code','CUSTOMER_REQUIRED'); end if;
  if p_invoice_id is not null then
    select * into v_invoice from public.invoices where id=p_invoice_id and store_id=v_claim.store_id and deal_id=v_deal.id and deleted_at is null;
    if not found then return jsonb_build_object('ok',false,'code','INVOICE_NOT_FOUND'); end if;
  elsif p_requested_refund_amount>0 then return jsonb_build_object('ok',false,'code','INVOICE_REQUIRED'); end if;
  if p_invoice_id is not null then
    select coalesce(sum(case when entry_type='payment' then amount else -amount end),0)::integer into v_net
    from public.invoice_payment_ledger where invoice_id=p_invoice_id;
    if p_requested_refund_amount>v_net then return jsonb_build_object('ok',false,'code','REFUND_EXCEEDS_PAYMENT'); end if;
  end if;
  v_fp:=encode(extensions.digest(concat_ws(':','create',v_tenant,v_claim.store_id,v_claim.id,p_case_type,p_requested_refund_amount,coalesce(p_invoice_id::text,''),btrim(p_reason)),'sha256'),'hex');
  select * into v_existing from public.sale_correction_operations where tenant_id=v_tenant and idempotency_key=p_idempotency_key;
  if found then if v_existing.request_fingerprint<>v_fp then return jsonb_build_object('ok',false,'code','IDEMPOTENCY_CONFLICT'); end if; return v_existing.result; end if;
  if exists (select 1 from public.sale_correction_cases where original_sale_claim_id=v_claim.id and status in ('requested','under_review','approved','processing'))
  then return jsonb_build_object('ok',false,'code','ACTIVE_CASE_EXISTS'); end if;
  insert into public.sale_correction_operations(tenant_id,store_id,case_id,operation,idempotency_key,request_fingerprint,result,actor_user_id)
    values(v_tenant,v_claim.store_id,null,'create',p_idempotency_key,v_fp,jsonb_build_object('ok',false,'code','IN_PROGRESS'),v_actor)
    on conflict(tenant_id,idempotency_key) do nothing returning id into v_op_id;
  if v_op_id is null then
    select * into v_existing from public.sale_correction_operations where tenant_id=v_tenant and idempotency_key=p_idempotency_key;
    if v_existing.request_fingerprint<>v_fp then return jsonb_build_object('ok',false,'code','IDEMPOTENCY_CONFLICT'); end if;
    return v_existing.result;
  end if;
  perform set_config('app.g4b_case_rpc','on',true);
  insert into public.sale_correction_cases(tenant_id,store_id,original_sale_claim_id,vehicle_id,deal_id,customer_id,invoice_id,case_type,reason,
    requested_refund_amount,vehicle_inspection_status,restock_decision,restock_status,ownership_status,external_procedure_status,requested_by,idempotency_key,request_fingerprint)
  values(v_tenant,v_claim.store_id,v_claim.id,v_claim.vehicle_id,v_claim.deal_id,v_customer,p_invoice_id,p_case_type,btrim(p_reason),p_requested_refund_amount,
    case when p_case_type='administrative_correction' then 'not_required' else 'pending' end,
    case when p_case_type in ('contract_correction','administrative_correction') then 'not_applicable' else 'pending' end,
    case when p_case_type in ('contract_correction','administrative_correction') then 'not_applicable' else 'pending' end,
    case when v_customer is null then 'not_applicable' else 'active' end,
    case when p_case_type='administrative_correction' then 'not_required' else 'pending' end,
    v_actor,p_idempotency_key,v_fp) returning * into v_case;
  if v_customer is not null then
    insert into public.customer_vehicle_ownership_history(tenant_id,store_id,case_id,original_sale_claim_id,vehicle_id,customer_id,ownership_status,actor_user_id,reason)
    values(v_tenant,v_claim.store_id,v_case.id,v_claim.id,v_claim.vehicle_id,v_customer,'active',v_actor,'納車済み履歴からcase開始時に参照記録');
  end if;
  insert into public.sale_correction_events(tenant_id,store_id,case_id,actor_user_id,actor_role,event_type,after_status,amount,reason,correlation_id,idempotency_key_hash)
  values(v_tenant,v_claim.store_id,v_case.id,v_actor,v_role,'case_requested','requested',p_requested_refund_amount,btrim(p_reason),left(p_correlation_id,100),encode(extensions.digest(p_idempotency_key,'sha256'),'hex'));
  v_result:=jsonb_build_object('ok',true,'code','CREATED','caseId',v_case.id,'status',v_case.status);
  update public.sale_correction_operations set case_id=v_case.id,result=v_result where id=v_op_id;
  perform set_config('app.g4b_case_rpc','',true);
  return v_result;
exception when unique_violation then return jsonb_build_object('ok',false,'code','ACTIVE_CASE_EXISTS');
when serialization_failure or deadlock_detected then return jsonb_build_object('ok',false,'code','TEMPORARY_FAILURE');
end $$;

create or replace function public.transition_sale_correction_case(
  p_case_id uuid,p_action text,p_reason text,p_approved_refund_amount integer,p_restock_decision text,
  p_idempotency_key text,p_correlation_id text default null
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_actor uuid:=auth.uid(); v_case public.sale_correction_cases%rowtype; v_role text; v_fp text;
  v_op_id uuid; v_existing public.sale_correction_operations%rowtype; v_next text; v_result jsonb; v_net integer; v_refunds integer;
begin
  if v_actor is null then return jsonb_build_object('ok',false,'code','UNAUTHENTICATED'); end if;
  if p_action not in ('begin_review','approve','reject','start_processing','cancel','complete')
     or char_length(coalesce(p_idempotency_key,'')) not between 8 and 200
  then return jsonb_build_object('ok',false,'code','INVALID_REQUEST'); end if;
  select * into v_case from public.sale_correction_cases where id=p_case_id for update;
  if not found then return jsonb_build_object('ok',false,'code','CASE_NOT_FOUND'); end if;
  select public.current_user_store_role(v_case.store_id) into v_role;
  if v_role is null then return jsonb_build_object('ok',false,'code','SCOPE_FORBIDDEN'); end if;
  if v_role not in ('owner','admin') then return jsonb_build_object('ok',false,'code','ROLE_FORBIDDEN'); end if;
  v_fp:=encode(extensions.digest(concat_ws(':',p_action,v_case.tenant_id,v_case.id,coalesce(p_reason,''),coalesce(p_approved_refund_amount::text,''),coalesce(p_restock_decision,'')),'sha256'),'hex');
  select * into v_existing from public.sale_correction_operations where tenant_id=v_case.tenant_id and idempotency_key=p_idempotency_key;
  if found then if v_existing.request_fingerprint<>v_fp then return jsonb_build_object('ok',false,'code','IDEMPOTENCY_CONFLICT'); end if; return v_existing.result; end if;
  if p_action='begin_review' then if v_case.status<>'requested' then return jsonb_build_object('ok',false,'code','INVALID_STATUS'); end if; v_next:='under_review';
  elsif p_action='approve' then
    if v_case.status<>'under_review' then return jsonb_build_object('ok',false,'code','INVALID_STATUS'); end if;
    if coalesce(p_approved_refund_amount,-1)<0 or p_approved_refund_amount>v_case.requested_refund_amount
       or coalesce(p_restock_decision,'') not in ('restock','repair_required','not_for_sale','not_applicable')
    then return jsonb_build_object('ok',false,'code','INVALID_APPROVAL'); end if;
    if v_case.invoice_id is not null then select coalesce(sum(case when entry_type='payment' then amount else -amount end),0)::integer into v_net from public.invoice_payment_ledger where invoice_id=v_case.invoice_id;
      if p_approved_refund_amount>v_net then return jsonb_build_object('ok',false,'code','REFUND_EXCEEDS_PAYMENT'); end if;
    elsif p_approved_refund_amount>0 then return jsonb_build_object('ok',false,'code','INVOICE_REQUIRED'); end if;
    v_next:='approved';
  elsif p_action='reject' then if v_case.status<>'under_review' or char_length(btrim(coalesce(p_reason,'')))<3 then return jsonb_build_object('ok',false,'code','REASON_REQUIRED'); end if; v_next:='rejected';
  elsif p_action='start_processing' then if v_case.status<>'approved' then return jsonb_build_object('ok',false,'code','INVALID_STATUS'); end if; v_next:='processing';
  elsif p_action='cancel' then if v_case.status not in ('requested','under_review') or char_length(btrim(coalesce(p_reason,'')))<3 then return jsonb_build_object('ok',false,'code','INVALID_STATUS'); end if; v_next:='cancelled';
  else
    if v_case.status <> 'processing' then return jsonb_build_object('ok',false,'code','INVALID_STATUS'); end if;
    select coalesce(sum(amount),0)::integer into v_refunds from public.sale_correction_refunds where case_id=v_case.id;
    if v_refunds<>coalesce(v_case.approved_refund_amount,0)
       or v_case.vehicle_inspection_status not in ('completed','not_required')
       or v_case.restock_status not in ('completed','not_applicable')
       or v_case.ownership_status not in ('returned','transferred','corrected','not_applicable')
       or v_case.followup_status not in ('suppressed','completed')
       or v_case.external_procedure_status not in ('completed','not_required')
    then return jsonb_build_object('ok',false,'code','SUBPROCESS_INCOMPLETE'); end if;
    v_next:='completed';
  end if;
  insert into public.sale_correction_operations(tenant_id,store_id,case_id,operation,idempotency_key,request_fingerprint,result,actor_user_id)
  values(v_case.tenant_id,v_case.store_id,v_case.id,p_action,p_idempotency_key,v_fp,jsonb_build_object('ok',false,'code','IN_PROGRESS'),v_actor)
  on conflict(tenant_id,idempotency_key) do nothing returning id into v_op_id;
  if v_op_id is null then select * into v_existing from public.sale_correction_operations where tenant_id=v_case.tenant_id and idempotency_key=p_idempotency_key;
    if v_existing.request_fingerprint<>v_fp then return jsonb_build_object('ok',false,'code','IDEMPOTENCY_CONFLICT'); end if; return v_existing.result; end if;
  perform set_config('app.g4b_case_rpc','on',true);
  update public.sale_correction_cases set status=v_next,
    approved_refund_amount=case when p_action='approve' then p_approved_refund_amount else approved_refund_amount end,
    restock_decision=case when p_action='approve' then p_restock_decision else restock_decision end,
    restock_status=case when p_action='approve' and p_restock_decision='not_applicable' then 'not_applicable' else restock_status end,
    approved_by=case when p_action='approve' then v_actor else approved_by end,
    approved_at=case when p_action='approve' then now() else approved_at end,
    completed_by=case when p_action='complete' then v_actor else completed_by end,
    completed_at=case when p_action='complete' then now() else completed_at end,
    followup_status=case when p_action='approve' then 'suppressed' else followup_status end,
    ownership_status=case when p_action='approve' and customer_id is not null then 'return_pending' else ownership_status end,
    updated_at=now() where id=v_case.id;
  if p_action='approve' then
    update public.inspection_reminder_events set status='skipped',error_detail='sale_correction_suppressed',updated_at=now()
      where store_id=v_case.store_id and vehicle_id=v_case.vehicle_id and status='pending';
    if v_case.customer_id is not null then
      insert into public.customer_vehicle_ownership_history(tenant_id,store_id,case_id,original_sale_claim_id,vehicle_id,customer_id,ownership_status,actor_user_id,reason)
      values(v_case.tenant_id,v_case.store_id,v_case.id,v_case.original_sale_claim_id,v_case.vehicle_id,v_case.customer_id,'return_pending',v_actor,'返品・訂正case承認') on conflict do nothing;
    end if;
  end if;
  insert into public.sale_correction_events(tenant_id,store_id,case_id,actor_user_id,actor_role,event_type,before_status,after_status,amount,reason,correlation_id,idempotency_key_hash)
  values(v_case.tenant_id,v_case.store_id,v_case.id,v_actor,v_role,'case_'||p_action,v_case.status,v_next,case when p_action='approve' then p_approved_refund_amount end,nullif(btrim(coalesce(p_reason,'')),''),left(p_correlation_id,100),encode(extensions.digest(p_idempotency_key,'sha256'),'hex'));
  v_result:=jsonb_build_object('ok',true,'code',upper(p_action),'caseId',v_case.id,'status',v_next);
  update public.sale_correction_operations set result=v_result where id=v_op_id;
  perform set_config('app.g4b_case_rpc','',true); return v_result;
exception when serialization_failure or deadlock_detected then return jsonb_build_object('ok',false,'code','TEMPORARY_FAILURE');
end $$;

create or replace function public.record_sale_correction_refund(
  p_case_id uuid,p_payment_id uuid,p_amount integer,p_reason text,p_idempotency_key text,p_correlation_id text default null
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_actor uuid:=auth.uid(); v_case public.sale_correction_cases%rowtype; v_payment public.invoice_payment_ledger%rowtype;
  v_role text; v_fp text; v_op_id uuid; v_existing public.sale_correction_operations%rowtype; v_reversed integer; v_case_refunded integer; v_ledger_id uuid; v_result jsonb;
begin
  if v_actor is null then return jsonb_build_object('ok',false,'code','UNAUTHENTICATED'); end if;
  if coalesce(p_amount,0)<=0 or char_length(btrim(coalesce(p_reason,'')))<3 or char_length(coalesce(p_idempotency_key,'')) not between 8 and 200
  then return jsonb_build_object('ok',false,'code','INVALID_REQUEST'); end if;
  select * into v_case from public.sale_correction_cases where id=p_case_id for update;
  if not found then return jsonb_build_object('ok',false,'code','CASE_NOT_FOUND'); end if;
  select public.current_user_store_role(v_case.store_id) into v_role;
  if v_role not in ('owner','admin') then return jsonb_build_object('ok',false,'code',case when v_role is null then 'SCOPE_FORBIDDEN' else 'ROLE_FORBIDDEN' end); end if;
  if v_case.status<>'processing' then return jsonb_build_object('ok',false,'code','INVALID_STATUS'); end if;
  select * into v_payment from public.invoice_payment_ledger where id=p_payment_id and entry_type='payment' for update;
  if not found then return jsonb_build_object('ok',false,'code','PAYMENT_NOT_FOUND'); end if;
  if v_case.invoice_id is null or v_payment.invoice_id<>v_case.invoice_id or v_payment.store_id<>v_case.store_id
  then return jsonb_build_object('ok',false,'code','SCOPE_FORBIDDEN'); end if;
  v_fp:=encode(extensions.digest(concat_ws(':','refund',v_case.tenant_id,v_case.id,v_payment.id,p_amount,btrim(p_reason)),'sha256'),'hex');
  select * into v_existing from public.sale_correction_operations where tenant_id=v_case.tenant_id and idempotency_key=p_idempotency_key;
  if found then if v_existing.request_fingerprint<>v_fp then return jsonb_build_object('ok',false,'code','IDEMPOTENCY_CONFLICT'); end if; return v_existing.result; end if;
  select coalesce(sum(amount),0)::integer into v_reversed from public.invoice_payment_ledger where original_payment_id=v_payment.id and entry_type in ('reversal','refund');
  select coalesce(sum(amount),0)::integer into v_case_refunded from public.sale_correction_refunds where case_id=v_case.id;
  if v_reversed+p_amount>v_payment.amount or v_case_refunded+p_amount>coalesce(v_case.approved_refund_amount,0)
  then return jsonb_build_object('ok',false,'code','REFUND_EXCEEDS_PAYMENT'); end if;
  insert into public.sale_correction_operations(tenant_id,store_id,case_id,operation,idempotency_key,request_fingerprint,result,actor_user_id)
  values(v_case.tenant_id,v_case.store_id,v_case.id,'refund',p_idempotency_key,v_fp,jsonb_build_object('ok',false,'code','IN_PROGRESS'),v_actor)
  on conflict(tenant_id,idempotency_key) do nothing returning id into v_op_id;
  if v_op_id is null then select * into v_existing from public.sale_correction_operations where tenant_id=v_case.tenant_id and idempotency_key=p_idempotency_key;
    if v_existing.request_fingerprint<>v_fp then return jsonb_build_object('ok',false,'code','IDEMPOTENCY_CONFLICT'); end if; return v_existing.result; end if;
  perform set_config('app.g4b_case_rpc','on',true);
  insert into public.invoice_payment_ledger(tenant_id,store_id,invoice_id,deal_id,vehicle_id,entry_type,amount,original_payment_id,reason,idempotency_key,request_fingerprint,actor_user_id,actor_role,correlation_id)
  values(v_case.tenant_id,v_case.store_id,v_payment.invoice_id,v_payment.deal_id,v_payment.vehicle_id,'refund',p_amount,v_payment.id,btrim(p_reason),
    'g4b:'||encode(extensions.digest(concat_ws(':',v_case.id,p_idempotency_key),'sha256'),'hex'),v_fp,v_actor,v_role,left(p_correlation_id,100)) returning id into v_ledger_id;
  insert into public.sale_correction_refunds(tenant_id,store_id,case_id,refund_ledger_id,original_payment_id,amount,actor_user_id,reason)
  values(v_case.tenant_id,v_case.store_id,v_case.id,v_ledger_id,v_payment.id,p_amount,v_actor,btrim(p_reason));
  insert into public.sale_correction_events(tenant_id,store_id,case_id,actor_user_id,actor_role,event_type,amount,reason,correlation_id,idempotency_key_hash)
  values(v_case.tenant_id,v_case.store_id,v_case.id,v_actor,v_role,'refund_recorded',p_amount,btrim(p_reason),left(p_correlation_id,100),encode(extensions.digest(p_idempotency_key,'sha256'),'hex'));
  v_result:=jsonb_build_object('ok',true,'code','REFUND_RECORDED','caseId',v_case.id,'refundId',v_ledger_id);
  perform set_config('app.g4b_case_rpc','on',true); update public.sale_correction_operations set result=v_result where id=v_op_id; perform set_config('app.g4b_case_rpc','',true);
  return v_result;
exception when unique_violation then return jsonb_build_object('ok',false,'code','CONFLICT');
when serialization_failure or deadlock_detected then return jsonb_build_object('ok',false,'code','TEMPORARY_FAILURE');
end $$;

create or replace function public.complete_sale_correction_inspection(
  p_case_id uuid,p_note text,p_idempotency_key text,p_correlation_id text default null
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_actor uuid:=auth.uid(); v_case public.sale_correction_cases%rowtype; v_role text; v_fp text; v_op_id uuid; v_existing public.sale_correction_operations%rowtype; v_result jsonb;
begin
  if v_actor is null then return jsonb_build_object('ok',false,'code','UNAUTHENTICATED'); end if;
  select * into v_case from public.sale_correction_cases where id=p_case_id for update; if not found then return jsonb_build_object('ok',false,'code','CASE_NOT_FOUND'); end if;
  select public.current_user_store_role(v_case.store_id) into v_role; if v_role not in ('owner','admin') then return jsonb_build_object('ok',false,'code',case when v_role is null then 'SCOPE_FORBIDDEN' else 'ROLE_FORBIDDEN' end); end if;
  v_fp:=encode(extensions.digest(concat_ws(':','inspection',v_case.id,coalesce(p_note,'')),'sha256'),'hex');
  select * into v_existing from public.sale_correction_operations where tenant_id=v_case.tenant_id and idempotency_key=p_idempotency_key;
  if found then if v_existing.request_fingerprint<>v_fp then return jsonb_build_object('ok',false,'code','IDEMPOTENCY_CONFLICT'); end if; return v_existing.result; end if;
  if v_case.status <> 'processing' or v_case.vehicle_inspection_status='not_required' then return jsonb_build_object('ok',false,'code','INVALID_STATUS'); end if;
  insert into public.sale_correction_operations(tenant_id,store_id,case_id,operation,idempotency_key,request_fingerprint,result,actor_user_id) values(v_case.tenant_id,v_case.store_id,v_case.id,'inspection',p_idempotency_key,v_fp,jsonb_build_object('ok',false,'code','IN_PROGRESS'),v_actor) on conflict(tenant_id,idempotency_key) do nothing returning id into v_op_id;
  if v_op_id is null then select * into v_existing from public.sale_correction_operations where tenant_id=v_case.tenant_id and idempotency_key=p_idempotency_key; if v_existing.request_fingerprint<>v_fp then return jsonb_build_object('ok',false,'code','IDEMPOTENCY_CONFLICT'); end if; return v_existing.result; end if;
  perform set_config('app.g4b_case_rpc','on',true); update public.sale_correction_cases set vehicle_inspection_status='completed',inspection_note=left(p_note,2000),updated_at=now() where id=v_case.id;
  v_result:=jsonb_build_object('ok',true,'code','INSPECTION_COMPLETED','caseId',v_case.id); update public.sale_correction_operations set result=v_result where id=v_op_id; perform set_config('app.g4b_case_rpc','',true);
  insert into public.sale_correction_events(tenant_id,store_id,case_id,actor_user_id,actor_role,event_type,after_status,reason,correlation_id) values(v_case.tenant_id,v_case.store_id,v_case.id,v_actor,v_role,'inspection_completed','completed',left(p_note,2000),left(p_correlation_id,100)); return v_result;
end $$;

create or replace function public.resolve_sale_correction_ownership(
  p_case_id uuid,p_ownership_status text,p_reason text,p_idempotency_key text,p_correlation_id text default null
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_actor uuid:=auth.uid(); v_case public.sale_correction_cases%rowtype; v_role text; v_fp text; v_op_id uuid; v_existing public.sale_correction_operations%rowtype; v_result jsonb;
begin
  if v_actor is null then return jsonb_build_object('ok',false,'code','UNAUTHENTICATED'); end if;
  if p_ownership_status not in ('returned','transferred','corrected') or char_length(btrim(coalesce(p_reason,'')))<3 then return jsonb_build_object('ok',false,'code','INVALID_REQUEST'); end if;
  select * into v_case from public.sale_correction_cases where id=p_case_id for update; if not found then return jsonb_build_object('ok',false,'code','CASE_NOT_FOUND'); end if;
  select public.current_user_store_role(v_case.store_id) into v_role; if v_role not in ('owner','admin') then return jsonb_build_object('ok',false,'code',case when v_role is null then 'SCOPE_FORBIDDEN' else 'ROLE_FORBIDDEN' end); end if;
  v_fp:=encode(extensions.digest(concat_ws(':','ownership',v_case.id,p_ownership_status,btrim(p_reason)),'sha256'),'hex');
  select * into v_existing from public.sale_correction_operations where tenant_id=v_case.tenant_id and idempotency_key=p_idempotency_key;
  if found then if v_existing.request_fingerprint<>v_fp then return jsonb_build_object('ok',false,'code','IDEMPOTENCY_CONFLICT'); end if; return v_existing.result; end if;
  if v_case.status<>'processing' or v_case.customer_id is null then return jsonb_build_object('ok',false,'code','INVALID_STATUS'); end if;
  insert into public.sale_correction_operations(tenant_id,store_id,case_id,operation,idempotency_key,request_fingerprint,result,actor_user_id) values(v_case.tenant_id,v_case.store_id,v_case.id,'ownership',p_idempotency_key,v_fp,jsonb_build_object('ok',false,'code','IN_PROGRESS'),v_actor) on conflict(tenant_id,idempotency_key) do nothing returning id into v_op_id;
  if v_op_id is null then select * into v_existing from public.sale_correction_operations where tenant_id=v_case.tenant_id and idempotency_key=p_idempotency_key; if v_existing.request_fingerprint<>v_fp then return jsonb_build_object('ok',false,'code','IDEMPOTENCY_CONFLICT'); end if; return v_existing.result; end if;
  perform set_config('app.g4b_case_rpc','on',true); update public.sale_correction_cases set ownership_status=p_ownership_status,updated_at=now() where id=v_case.id;
  insert into public.customer_vehicle_ownership_history(tenant_id,store_id,case_id,original_sale_claim_id,vehicle_id,customer_id,ownership_status,actor_user_id,reason) values(v_case.tenant_id,v_case.store_id,v_case.id,v_case.original_sale_claim_id,v_case.vehicle_id,v_case.customer_id,p_ownership_status,v_actor,btrim(p_reason)) on conflict do nothing;
  v_result:=jsonb_build_object('ok',true,'code','OWNERSHIP_RESOLVED','caseId',v_case.id,'ownershipStatus',p_ownership_status); update public.sale_correction_operations set result=v_result where id=v_op_id; perform set_config('app.g4b_case_rpc','',true);
  insert into public.sale_correction_events(tenant_id,store_id,case_id,actor_user_id,actor_role,event_type,after_status,reason,correlation_id) values(v_case.tenant_id,v_case.store_id,v_case.id,v_actor,v_role,'ownership_resolved',p_ownership_status,btrim(p_reason),left(p_correlation_id,100)); return v_result;
end $$;

create or replace function public.confirm_sale_correction_restock(
  p_case_id uuid,p_idempotency_key text,p_correlation_id text default null
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_actor uuid:=auth.uid(); v_case public.sale_correction_cases%rowtype; v_vehicle public.vehicles%rowtype; v_role text; v_fp text; v_op_id uuid; v_existing public.sale_correction_operations%rowtype; v_result jsonb;
begin
  if v_actor is null then return jsonb_build_object('ok',false,'code','UNAUTHENTICATED'); end if;
  select * into v_case from public.sale_correction_cases where id=p_case_id for update; if not found then return jsonb_build_object('ok',false,'code','CASE_NOT_FOUND'); end if;
  select public.current_user_store_role(v_case.store_id) into v_role; if v_role not in ('owner','admin') then return jsonb_build_object('ok',false,'code',case when v_role is null then 'SCOPE_FORBIDDEN' else 'ROLE_FORBIDDEN' end); end if;
  select * into v_vehicle from public.vehicles where id=v_case.vehicle_id and store_id=v_case.store_id for update;
  v_fp:=encode(extensions.digest(concat_ws(':','restock',v_case.tenant_id,v_case.id,v_case.vehicle_id),'sha256'),'hex');
  select * into v_existing from public.sale_correction_operations where tenant_id=v_case.tenant_id and idempotency_key=p_idempotency_key;
  if found then if v_existing.request_fingerprint<>v_fp then return jsonb_build_object('ok',false,'code','IDEMPOTENCY_CONFLICT'); end if; return v_existing.result; end if;
  if v_case.status <> 'processing' or v_case.restock_decision<>'restock' or v_case.vehicle_inspection_status <> 'completed'
     or v_case.ownership_status not in ('returned','corrected') then return jsonb_build_object('ok',false,'code','SUBPROCESS_INCOMPLETE'); end if;
  if exists(select 1 from public.vehicle_sale_claims where vehicle_id=v_case.vehicle_id and status='active')
     or exists(select 1 from public.sale_correction_cases where original_sale_claim_id=v_case.original_sale_claim_id and id<>v_case.id and status in ('requested','under_review','approved','processing'))
  then return jsonb_build_object('ok',false,'code','CONFLICT'); end if;
  insert into public.sale_correction_operations(tenant_id,store_id,case_id,operation,idempotency_key,request_fingerprint,result,actor_user_id) values(v_case.tenant_id,v_case.store_id,v_case.id,'restock',p_idempotency_key,v_fp,jsonb_build_object('ok',false,'code','IN_PROGRESS'),v_actor) on conflict(tenant_id,idempotency_key) do nothing returning id into v_op_id;
  if v_op_id is null then select * into v_existing from public.sale_correction_operations where tenant_id=v_case.tenant_id and idempotency_key=p_idempotency_key; if v_existing.request_fingerprint<>v_fp then return jsonb_build_object('ok',false,'code','IDEMPOTENCY_CONFLICT'); end if; return v_existing.result; end if;
  perform set_config('app.g4b_case_rpc','restock',true); update public.vehicles set status='在庫中',sold_date=null,updated_at=now() where id=v_case.vehicle_id;
  perform set_config('app.g4b_case_rpc','on',true); update public.sale_correction_cases set restock_status='completed',updated_at=now() where id=v_case.id;
  v_result:=jsonb_build_object('ok',true,'code','RESTOCKED','caseId',v_case.id,'vehicleId',v_case.vehicle_id); update public.sale_correction_operations set result=v_result where id=v_op_id; perform set_config('app.g4b_case_rpc','',true);
  insert into public.sale_correction_events(tenant_id,store_id,case_id,actor_user_id,actor_role,event_type,before_status,after_status,correlation_id) values(v_case.tenant_id,v_case.store_id,v_case.id,v_actor,v_role,'vehicle_restocked',v_vehicle.status,'在庫中',left(p_correlation_id,100)); return v_result;
end $$;

create or replace function public.resolve_sale_correction_external_procedure(
  p_case_id uuid,p_external_status text,p_reason text,p_idempotency_key text,p_correlation_id text default null
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_actor uuid:=auth.uid(); v_case public.sale_correction_cases%rowtype; v_role text; v_fp text; v_op_id uuid; v_existing public.sale_correction_operations%rowtype; v_result jsonb;
begin
  if v_actor is null then return jsonb_build_object('ok',false,'code','UNAUTHENTICATED'); end if;
  if p_external_status not in ('completed','not_required','ambiguous') or char_length(btrim(coalesce(p_reason,'')))<3 then return jsonb_build_object('ok',false,'code','INVALID_REQUEST'); end if;
  select * into v_case from public.sale_correction_cases where id=p_case_id for update; if not found then return jsonb_build_object('ok',false,'code','CASE_NOT_FOUND'); end if;
  select public.current_user_store_role(v_case.store_id) into v_role; if v_role not in ('owner','admin') then return jsonb_build_object('ok',false,'code',case when v_role is null then 'SCOPE_FORBIDDEN' else 'ROLE_FORBIDDEN' end); end if;
  v_fp:=encode(extensions.digest(concat_ws(':','external',v_case.id,p_external_status,btrim(p_reason)),'sha256'),'hex');
  select * into v_existing from public.sale_correction_operations where tenant_id=v_case.tenant_id and idempotency_key=p_idempotency_key;
  if found then if v_existing.request_fingerprint<>v_fp then return jsonb_build_object('ok',false,'code','IDEMPOTENCY_CONFLICT'); end if; return v_existing.result; end if;
  if v_case.status<>'processing' then return jsonb_build_object('ok',false,'code','INVALID_STATUS'); end if;
  insert into public.sale_correction_operations(tenant_id,store_id,case_id,operation,idempotency_key,request_fingerprint,result,actor_user_id) values(v_case.tenant_id,v_case.store_id,v_case.id,'external_procedure',p_idempotency_key,v_fp,jsonb_build_object('ok',false,'code','IN_PROGRESS'),v_actor) on conflict(tenant_id,idempotency_key) do nothing returning id into v_op_id;
  if v_op_id is null then select * into v_existing from public.sale_correction_operations where tenant_id=v_case.tenant_id and idempotency_key=p_idempotency_key; if v_existing.request_fingerprint<>v_fp then return jsonb_build_object('ok',false,'code','IDEMPOTENCY_CONFLICT'); end if; return v_existing.result; end if;
  perform set_config('app.g4b_case_rpc','on',true); update public.sale_correction_cases set external_procedure_status=p_external_status,updated_at=now() where id=v_case.id;
  v_result:=jsonb_build_object('ok',true,'code','EXTERNAL_PROCEDURE_RECORDED','caseId',v_case.id,'externalProcedureStatus',p_external_status); update public.sale_correction_operations set result=v_result where id=v_op_id; perform set_config('app.g4b_case_rpc','',true);
  insert into public.sale_correction_events(tenant_id,store_id,case_id,actor_user_id,actor_role,event_type,after_status,reason,correlation_id) values(v_case.tenant_id,v_case.store_id,v_case.id,v_actor,v_role,'external_procedure_recorded',p_external_status,btrim(p_reason),left(p_correlation_id,100)); return v_result;
end $$;

revoke all on function public.create_sale_correction_case(uuid,text,text,integer,uuid,text,text) from public,anon;
revoke all on function public.transition_sale_correction_case(uuid,text,text,integer,text,text,text) from public,anon;
revoke all on function public.record_sale_correction_refund(uuid,uuid,integer,text,text,text) from public,anon;
revoke all on function public.complete_sale_correction_inspection(uuid,text,text,text) from public,anon;
revoke all on function public.resolve_sale_correction_ownership(uuid,text,text,text,text) from public,anon;
revoke all on function public.confirm_sale_correction_restock(uuid,text,text) from public,anon;
revoke all on function public.resolve_sale_correction_external_procedure(uuid,text,text,text,text) from public,anon;
grant execute on function public.create_sale_correction_case(uuid,text,text,integer,uuid,text,text) to authenticated;
grant execute on function public.transition_sale_correction_case(uuid,text,text,integer,text,text,text) to authenticated;
grant execute on function public.record_sale_correction_refund(uuid,uuid,integer,text,text,text) to authenticated;
grant execute on function public.complete_sale_correction_inspection(uuid,text,text,text) to authenticated;
grant execute on function public.resolve_sale_correction_ownership(uuid,text,text,text,text) to authenticated;
grant execute on function public.confirm_sale_correction_restock(uuid,text,text) to authenticated;
grant execute on function public.resolve_sale_correction_external_procedure(uuid,text,text,text,text) to authenticated;

commit;
