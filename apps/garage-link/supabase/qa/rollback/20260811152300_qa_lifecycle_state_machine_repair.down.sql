-- No-op by design: the repaired objects belong to the canonical lifecycle
-- framework. Its rollback removes the complete private QA schema.
begin;
notify pgrst, 'reload schema';
commit;
