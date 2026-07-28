-- G1-C security-preserving rollback.
-- Scope constraints, line-link credential binding and guard_scope_columns_immutable deliberately remain active.
-- Removing them would restore cross-tenant service-role writes, so rollback changes only the migration ledger state.
do $$
begin
  if to_regprocedure('public.guard_scope_columns_immutable()') is null
     or to_regclass('public.line_link_connections') is null then
    raise exception 'G1C_SECURITY_GUARDS_MISSING';
  end if;
end;
$$;
