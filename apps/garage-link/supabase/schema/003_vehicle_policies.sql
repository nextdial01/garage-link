-- GARAGE LINK vehicle policies
-- Supabase SQL Editorで実行する補助SQLです。
-- 所属店舗のvehiclesをselect/insert/update/deleteできるようにします。
-- Supabaseには直接接続せず、このファイルをSQL Editorに貼って実行してください。

alter table public.vehicles enable row level security;

drop policy if exists "vehicles_select_member_stores" on public.vehicles;
create policy "vehicles_select_member_stores"
on public.vehicles
for select
to authenticated
using (store_id in (select public.current_user_store_ids()));

drop policy if exists "vehicles_insert_member_stores" on public.vehicles;
create policy "vehicles_insert_member_stores"
on public.vehicles
for insert
to authenticated
with check (store_id in (select public.current_user_store_ids()));

drop policy if exists "vehicles_update_member_stores" on public.vehicles;
create policy "vehicles_update_member_stores"
on public.vehicles
for update
to authenticated
using (store_id in (select public.current_user_store_ids()))
with check (store_id in (select public.current_user_store_ids()));

drop policy if exists "vehicles_delete_member_stores" on public.vehicles;
create policy "vehicles_delete_member_stores"
on public.vehicles
for delete
to authenticated
using (store_id in (select public.current_user_store_ids()));
