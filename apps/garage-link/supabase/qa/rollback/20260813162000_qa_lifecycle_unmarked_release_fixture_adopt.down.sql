begin;

revoke all on function public.qa_lifecycle_adopt_unmarked_release_fixture(uuid,uuid,uuid,text,uuid,uuid,uuid,text,timestamptz) from public, anon, authenticated, service_role;
drop function if exists public.qa_lifecycle_adopt_unmarked_release_fixture(uuid,uuid,uuid,text,uuid,uuid,uuid,text,timestamptz);

notify pgrst, 'reload schema';
commit;
