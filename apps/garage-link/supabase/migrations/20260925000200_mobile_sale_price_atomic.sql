-- Mobile sale price is committed with the existing atomic reservation RPC.
create table if not exists public.garage_mobile_sale_price_operations (
  store_id uuid not null references public.stores(id),
  idempotency_key text not null,
  deal_id uuid not null references public.deals(id),
  sale_price numeric(12,2) not null check (sale_price >= 0),
  result jsonb not null,
  created_at timestamptz not null default now(),
  primary key (store_id, idempotency_key)
);
alter table public.garage_mobile_sale_price_operations enable row level security;
revoke all on public.garage_mobile_sale_price_operations from public, anon, authenticated;

create or replace function public.garage_mobile_reserve_sale_with_price(
  p_deal_id uuid, p_sale_price numeric, p_idempotency_key text
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_deal public.deals%rowtype;
  v_existing public.garage_mobile_sale_price_operations%rowtype;
  v_result jsonb;
begin
  if auth.uid() is null then return jsonb_build_object('ok', false, 'code', 'UNAUTHENTICATED'); end if;
  if p_sale_price is null or p_sale_price < 0 or p_sale_price > 100000000 or p_sale_price <> trunc(p_sale_price)
     or p_idempotency_key is null or length(p_idempotency_key) not between 8 and 200 then
    return jsonb_build_object('ok', false, 'code', 'INVALID_REQUEST');
  end if;
  select * into v_deal from public.deals where id = p_deal_id and deleted_at is null;
  if not found or coalesce(public.current_user_store_role(v_deal.store_id),'') not in ('owner','admin','staff') then
    return jsonb_build_object('ok', false, 'code', 'SCOPE_FORBIDDEN');
  end if;
  perform pg_advisory_xact_lock(hashtext(v_deal.store_id::text || ':' || p_idempotency_key));
  select * into v_existing from public.garage_mobile_sale_price_operations
    where store_id = v_deal.store_id and idempotency_key = p_idempotency_key for update;
  if found then
    if v_existing.deal_id <> p_deal_id or v_existing.sale_price <> p_sale_price then
      return jsonb_build_object('ok', false, 'code', 'IDEMPOTENCY_CONFLICT');
    end if;
    return v_existing.result;
  end if;
  v_result := public.reserve_vehicle_sale(p_deal_id, p_idempotency_key, null);
  if coalesce((v_result->>'ok')::boolean, false) is false then return v_result; end if;
  if v_result->>'code' = 'RESERVED' then
    update public.vehicles set sale_price = p_sale_price where id = v_deal.vehicle_id and store_id = v_deal.store_id;
  end if;
  insert into public.garage_mobile_sale_price_operations(store_id,idempotency_key,deal_id,sale_price,result)
    values(v_deal.store_id,p_idempotency_key,p_deal_id,p_sale_price,v_result);
  return v_result;
end $$;
revoke all on function public.garage_mobile_reserve_sale_with_price(uuid,numeric,text) from public, anon;
grant execute on function public.garage_mobile_reserve_sale_with_price(uuid,numeric,text) to authenticated;

-- Rollback after migrating any in-flight operation receipts:
-- revoke execute on function public.garage_mobile_reserve_sale_with_price(uuid,numeric,text) from authenticated;
-- drop function public.garage_mobile_reserve_sale_with_price(uuid,numeric,text);
-- drop table public.garage_mobile_sale_price_operations;
