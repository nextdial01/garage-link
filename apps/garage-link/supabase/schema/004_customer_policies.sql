-- GARAGE LINK customer policies
-- Supabase SQL Editorで実行する補助SQLです。
-- 所属店舗のcustomersをselect/insert/update/deleteできるようにします。
-- Supabaseには直接接続せず、このファイルをSQL Editorに貼って実行してください。

alter table public.customers enable row level security;

drop policy if exists "customers_select_member_stores" on public.customers;
create policy "customers_select_member_stores"
on public.customers
for select
to authenticated
using (store_id in (select public.current_user_store_ids()));

drop policy if exists "customers_insert_member_stores" on public.customers;
create policy "customers_insert_member_stores"
on public.customers
for insert
to authenticated
with check (store_id in (select public.current_user_store_ids()));

drop policy if exists "customers_update_member_stores" on public.customers;
create policy "customers_update_member_stores"
on public.customers
for update
to authenticated
using (store_id in (select public.current_user_store_ids()))
with check (store_id in (select public.current_user_store_ids()));

drop policy if exists "customers_delete_member_stores" on public.customers;
create policy "customers_delete_member_stores"
on public.customers
for delete
to authenticated
using (store_id in (select public.current_user_store_ids()));
