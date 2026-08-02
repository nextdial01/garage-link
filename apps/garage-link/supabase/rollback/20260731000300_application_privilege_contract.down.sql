-- Batch 1D is an irreversible least-privilege hardening migration.
-- Reintroducing provider-default grants is not a safe SQL rollback.
-- A true rollback must restore the verified pre-Batch-1D staging backup.
-- This down file is a fail-closed history/reapply guard and changes no ACL.

do $$
begin
  if exists (
    select 1 from information_schema.role_table_grants
    where table_schema='public' and grantee='anon'
      and privilege_type in ('INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN')
  ) then raise exception 'BATCH1D_ROLLBACK_REQUIRES_VERIFIED_BACKUP_RESTORE'; end if;
  if exists (
    select 1 from information_schema.routine_privileges
    where routine_schema='public' and grantee='PUBLIC'
  ) then raise exception 'BATCH1D_ROLLBACK_REQUIRES_VERIFIED_BACKUP_RESTORE'; end if;
end
$$;
