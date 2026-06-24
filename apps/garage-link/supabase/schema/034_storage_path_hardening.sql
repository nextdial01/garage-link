-- GARAGE LINK storage path hardening
-- uploaded_files.path にパストラバーサル文字列が混入しないようDB側でも防御します。
-- 既存データは削除せず、CHECK 制約のみ追加します。

alter table public.uploaded_files
drop constraint if exists uploaded_files_path_no_traversal_check;

alter table public.uploaded_files
add constraint uploaded_files_path_no_traversal_check check (
  path is not null
  and length(path) between 1 and 1024
  and position('..' in path) = 0
  and position('\\' in path) = 0
  and position(E'\0' in path) = 0
  and position('//' in path) = 0
  and path not like '/%'
  and path like 'tenants/%/stores/%/%'
);

comment on constraint uploaded_files_path_no_traversal_check on public.uploaded_files is
  'パストラバーサル文字や絶対pathを禁止し、tenants/{tenant_id}/stores/{store_id}/... 形式のみ許可';

-- 既存行の検証用クエリ（参考）:
-- select id, path from public.uploaded_files
-- where path ~ '\.\.' or path ~ '//' or path !~ '^tenants/[^/]+/stores/[^/]+/';
