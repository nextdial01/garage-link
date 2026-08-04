begin;
drop function if exists public.qa_owner_preview_reset_fixture(text,text,text,text);
drop function if exists public.qa_owner_preview_ensure_fixture(text,text,text,text,uuid);
drop function if exists public.qa_owner_preview_status(text,text,text,text);
drop table if exists qa_internal.owner_preview_fixtures;
commit;
