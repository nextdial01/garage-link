-- GARAGE LINK auth onboarding policies
-- Supabase SQL Editorで実行する補助SQLです。
-- 初回登録時に、認証済みユーザーが自分の店舗とownerメンバーを作れるようにします。
-- Supabaseには直接接続せず、このファイルをSQL Editorに貼って実行してください。

drop policy if exists "stores_insert_authenticated" on public.stores;
create policy "stores_insert_authenticated"
on public.stores
for insert
to authenticated
with check (auth.uid() is not null);

drop policy if exists "store_members_insert_member_stores_or_self" on public.store_members;
create policy "store_members_insert_member_stores_or_self"
on public.store_members
for insert
to authenticated
with check (
  user_id = auth.uid()
  or store_id in (select public.current_user_store_ids())
);
