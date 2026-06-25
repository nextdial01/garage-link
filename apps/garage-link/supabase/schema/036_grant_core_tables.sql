-- 036 コアテーブルの authenticated 権限付与（migration再現性の修正）
--
-- 背景:
--   現行Supabaseの secure-by-default では public スキーマの新規テーブルに対し
--   authenticated ロールへ DML 権限が自動付与されない。001〜035 は stores / vehicles /
--   customers / deals / store_members に明示 GRANT を行っていないため、クリーンな
--   Supabaseプロジェクトに migration だけを適用すると authenticated がこれらを参照/更新できず、
--   role判定（store_members）やアプリUI全般、車検案内の設定変更・スキップ（write policyが
--   store_members を参照）が permission denied になる。
--   既存本番は作成時点の広いデフォルト権限を保持しているため動作しているが、これは Git migration の
--   再現性欠如（ドリフト）であり、本ファイルで明示 GRANT を補う。
--
-- 安全性:
--   いずれの表も RLS 有効＋ポリシー定義済みのため、GRANT してもアクセス制御は RLS で担保される。
--   line_settings は 023 で意図的に authenticated から revoke 済み（Secret保護）のため対象に含めない。

grant select, insert, update, delete on public.stores        to authenticated;
grant select, insert, update, delete on public.vehicles      to authenticated;
grant select, insert, update, delete on public.customers     to authenticated;
grant select, insert, update, delete on public.deals         to authenticated;
grant select, insert, update, delete on public.store_members to authenticated;

-- 確認用:
-- select table_name, string_agg(privilege_type,'/' order by privilege_type)
-- from information_schema.role_table_grants
-- where table_schema='public' and grantee='authenticated'
--   and table_name in ('stores','vehicles','customers','deals','store_members')
-- group by 1 order by 1;
