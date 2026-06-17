-- GARAGE LINK company profile and document settings
-- Supabase SQL Editorで実行する会社情報・帳票設定用SQLです。
-- 見積書・請求書に表示する会社情報、振込先、ロゴ、角印の保存先をstoresに追加します。
-- 既存データは削除しません。

-- ==================================================
-- stores: 会社基本情報
-- ==================================================
alter table public.stores add column if not exists company_name text;
alter table public.stores add column if not exists company_kana text;
alter table public.stores add column if not exists representative_name text;
alter table public.stores add column if not exists invoice_registration_number text;

-- ==================================================
-- stores: 住所・連絡先
-- ==================================================
-- postal_code / address / phone / email は初期テーブルにもあります。
-- add column if not exists にしておくことで、既に存在する環境でも安全に実行できます。
alter table public.stores add column if not exists postal_code text;
alter table public.stores add column if not exists address text;
alter table public.stores add column if not exists building text;
alter table public.stores add column if not exists phone text;
alter table public.stores add column if not exists fax text;
alter table public.stores add column if not exists email text;
alter table public.stores add column if not exists website_url text;

-- ==================================================
-- stores: 振込先情報
-- ==================================================
alter table public.stores add column if not exists bank_name text;
alter table public.stores add column if not exists bank_branch_name text;
alter table public.stores add column if not exists bank_account_type text;
alter table public.stores add column if not exists bank_account_number text;
alter table public.stores add column if not exists bank_account_holder text;

-- ==================================================
-- stores: 帳票表示設定
-- ==================================================
alter table public.stores add column if not exists quote_note text;
alter table public.stores add column if not exists invoice_note text;
alter table public.stores add column if not exists logo_image_path text;
alter table public.stores add column if not exists seal_image_path text;
alter table public.stores add column if not exists document_primary_color text default '#2563eb';
alter table public.stores add column if not exists document_footer_text text;

comment on column public.stores.company_name is '見積書・請求書に表示する会社名または店舗名';
comment on column public.stores.invoice_registration_number is '適格請求書発行事業者登録番号';
comment on column public.stores.logo_image_path is 'Supabase Storage上のロゴ画像path';
comment on column public.stores.seal_image_path is 'Supabase Storage上の角印画像path';
comment on column public.stores.document_primary_color is '帳票に使うメインカラー';

-- Supabase Storage bucket:
-- company-assets
-- logo_image_path には stores/{store_id}/logo/{filename} を保存
-- seal_image_path には stores/{store_id}/seal/{filename} を保存
--
-- Storage bucketはSupabase管理画面で手動作成する想定です。
-- bucketをpublicにするか、アプリ側でsigned URLを使って表示してください。

-- 確認用:
-- select * from public.stores;
