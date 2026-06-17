-- GARAGE LINK deal policies
-- Supabase SQL Editorで実行する補助SQLです。
-- 所属店舗のdealsをselect/insert/update/deleteできるようにします。
-- Supabaseには直接接続せず、このファイルをSQL Editorに貼って実行してください。

alter table public.deals enable row level security;

drop policy if exists "deals_select_member_stores" on public.deals;
create policy "deals_select_member_stores"
on public.deals
for select
to authenticated
using (store_id in (select public.current_user_store_ids()));

drop policy if exists "deals_insert_member_stores" on public.deals;
create policy "deals_insert_member_stores"
on public.deals
for insert
to authenticated
with check (store_id in (select public.current_user_store_ids()));

drop policy if exists "deals_update_member_stores" on public.deals;
create policy "deals_update_member_stores"
on public.deals
for update
to authenticated
using (store_id in (select public.current_user_store_ids()))
with check (store_id in (select public.current_user_store_ids()));

drop policy if exists "deals_delete_member_stores" on public.deals;
create policy "deals_delete_member_stores"
on public.deals
for delete
to authenticated
using (store_id in (select public.current_user_store_ids()));
