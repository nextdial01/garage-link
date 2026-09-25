-- The authenticated mobile upload route verifies the bearer, role and store,
-- then persists metadata with the server-only service client. Earlier hardening
-- revoked table writes from users; it did not grant the service role the
-- SELECT/INSERT needed for INSERT ... RETURNING. Keep direct user writes closed.
grant select, insert on table public.uploaded_files to service_role;

-- Rollback: first confirm the pre-migration ACL and stop the upload route.
-- If these privileges were absent before this migration, revoke select, insert
-- on table public.uploaded_files from service_role. Retain existing photo rows.
