-- No-op by design: these helpers are owned by the canonical lifecycle
-- framework migration. Its rollback removes them after dependent QA repairs
-- are rolled back; dropping them here would weaken an otherwise-valid
-- framework during a partial rollback.
begin;
notify pgrst, 'reload schema';
commit;
