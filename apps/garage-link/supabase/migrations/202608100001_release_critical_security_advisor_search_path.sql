-- Release-critical security-advisor remediation.
-- Both functions are either a trigger or a non-client-executable implementation;
-- pin their lookup path without changing caller grants or RLS behavior.

alter function public.set_updated_at() set search_path = pg_catalog;
alter function public.adjust_repair_part_stock_g1b_impl(uuid, uuid, integer)
  set search_path = public, pg_temp;
