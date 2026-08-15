-- The repair changes only regex representation.  Keeping the POSIX form on
-- rollback preserves the prior strict alphanumeric-or-underscore contract
-- while avoiding a return to the transport-specific escaping defect.
begin;
notify pgrst, 'reload schema';
commit;
