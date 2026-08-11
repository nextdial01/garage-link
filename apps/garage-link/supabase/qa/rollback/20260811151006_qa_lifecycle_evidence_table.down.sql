-- No-op by design: qa_internal.evidence is owned by the canonical lifecycle
-- framework. Dropping it during a partial repair rollback would destroy
-- cleanup evidence; the framework rollback removes the complete schema.
begin;
notify pgrst, 'reload schema';
commit;
