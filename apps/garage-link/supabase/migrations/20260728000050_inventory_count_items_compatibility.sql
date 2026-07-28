-- GARAGE LINK DB-007 / G7 inventory_count_items compatibility.
-- Forward-only expand migration. No existing business row is updated.

do $contract_precheck$
declare
  v_type text;
  v_nullable text;
  v_default text;
  v_generated text;
begin
  if to_regclass('public.inventory_count_items') is null then
    raise exception 'DB007_INVENTORY_COUNT_ITEMS_MISSING';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='inventory_count_items' and column_name='deleted_at'
  ) then
    select data_type, is_nullable, column_default, is_generated
      into v_type, v_nullable, v_default, v_generated
    from information_schema.columns
    where table_schema='public' and table_name='inventory_count_items' and column_name='deleted_at';
    if v_type <> 'timestamp with time zone' or v_nullable <> 'YES'
       or v_default is not null or v_generated <> 'NEVER' then
      raise exception 'DB007_DELETED_AT_CONTRACT_MISMATCH';
    end if;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='inventory_count_items' and column_name='is_archived'
  ) then
    select data_type, is_nullable, column_default, is_generated
      into v_type, v_nullable, v_default, v_generated
    from information_schema.columns
    where table_schema='public' and table_name='inventory_count_items' and column_name='is_archived';
    if v_type <> 'boolean' or v_nullable <> 'YES'
       or coalesce(v_default,'') <> 'false'
       or v_generated <> 'NEVER' then
      raise exception 'DB007_IS_ARCHIVED_CONTRACT_MISMATCH';
    end if;
  end if;
end
$contract_precheck$;

alter table public.inventory_count_items
  add column if not exists deleted_at timestamptz,
  add column if not exists is_archived boolean default false;

create index if not exists idx_inventory_count_items_store_deleted_at
  on public.inventory_count_items(store_id, deleted_at);
create index if not exists idx_inventory_count_items_store_is_archived
  on public.inventory_count_items(store_id, is_archived);

do $contract_postcheck$
declare
  v_deleted_type text;
  v_deleted_nullable text;
  v_deleted_default text;
  v_deleted_generated text;
  v_archived_type text;
  v_archived_nullable text;
  v_archived_default text;
  v_archived_generated text;
begin
  select data_type, is_nullable, column_default, is_generated
    into v_deleted_type, v_deleted_nullable, v_deleted_default, v_deleted_generated
  from information_schema.columns
  where table_schema='public' and table_name='inventory_count_items' and column_name='deleted_at';

  select c.data_type, c.is_nullable, pg_get_expr(d.adbin,d.adrelid), c.is_generated
    into v_archived_type, v_archived_nullable, v_archived_default, v_archived_generated
  from information_schema.columns c
  join pg_class t on t.relname=c.table_name
  join pg_namespace n on n.oid=t.relnamespace and n.nspname=c.table_schema
  join pg_attribute a on a.attrelid=t.oid and a.attname=c.column_name and not a.attisdropped
  left join pg_attrdef d on d.adrelid=t.oid and d.adnum=a.attnum
  where c.table_schema='public' and c.table_name='inventory_count_items' and c.column_name='is_archived';

  if v_deleted_type <> 'timestamp with time zone' or v_deleted_nullable <> 'YES'
     or v_deleted_default is not null or v_deleted_generated <> 'NEVER' then
    raise exception 'DB007_DELETED_AT_POSTCHECK_FAILED';
  end if;
  if v_archived_type <> 'boolean' or v_archived_nullable <> 'YES'
     or coalesce(v_archived_default,'') <> 'false' or v_archived_generated <> 'NEVER' then
    raise exception 'DB007_IS_ARCHIVED_POSTCHECK_FAILED';
  end if;
  if to_regclass('public.idx_inventory_count_items_store_deleted_at') is null
     or to_regclass('public.idx_inventory_count_items_store_is_archived') is null then
    raise exception 'DB007_INDEX_POSTCHECK_FAILED';
  end if;
  if exists(select 1 from public.inventory_count_items where is_archived is distinct from false) then
    raise exception 'DB007_EXISTING_ROW_ARCHIVE_STATE_AMBIGUOUS';
  end if;
end
$contract_postcheck$;
