-- quotes identifies itself with id; quote_items refers to it with quote_id.
-- Keep the existing sale snapshot and internal accounting protections intact.
create or replace function public.guard_sale_quote_snapshot()
returns trigger language plpgsql set search_path=public,pg_temp as $$
declare v_quote_id uuid;
begin
  if tg_table_name='quotes' then
    v_quote_id := coalesce(new.id,old.id);
  else
    v_quote_id := coalesce(new.quote_id,old.quote_id);
  end if;
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
