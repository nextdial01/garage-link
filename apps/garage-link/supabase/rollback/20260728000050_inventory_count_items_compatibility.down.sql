-- DB-007 security-preserving rollback.
-- The compatibility columns and indexes are intentionally retained because G7
-- functions, restrictive visibility policy and snapshot guards depend on them.
-- Removing them would make rollback destructive and would reintroduce the
-- upgrade failure. This rollback therefore verifies the safe retained contract.

do $rollback_contract$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='inventory_count_items'
      and column_name='deleted_at' and data_type='timestamp with time zone' and is_nullable='YES'
  ) then raise exception 'DB007_ROLLBACK_DELETED_AT_CONTRACT'; end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='inventory_count_items'
      and column_name='is_archived' and data_type='boolean' and is_nullable='YES'
  ) then raise exception 'DB007_ROLLBACK_IS_ARCHIVED_CONTRACT'; end if;
end
$rollback_contract$;
