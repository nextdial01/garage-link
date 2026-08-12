begin;
drop function if exists public.qa_lifecycle_reclaim_expired_release_fixture(uuid);
notify pgrst, 'reload schema';
commit;
