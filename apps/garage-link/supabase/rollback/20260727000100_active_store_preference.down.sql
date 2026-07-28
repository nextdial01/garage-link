-- G1-D security-preserving rollback.
-- Do not restore the legacy membership/store_members mutating switch and do not
-- broaden RLS back to every assigned store. Schema contraction requires a later,
-- operator-reviewed contract migration after application rollback.
begin;

revoke all on function public.switch_active_garage_store(uuid) from public, anon, authenticated;
revoke all on public.membership_store_assignments from public, anon;
revoke all on public.user_active_store_preferences from public, anon;

-- The compatibility view is application-facing and may be removed while the
-- pre-G1-D application is restored. Keeping it would make the earlier G1-C
-- idempotent migration treat the view as a triggerable table on reapply.
drop view if exists public.current_user_active_store_membership;

-- The v2 RPC remains available so old tabs cannot fall back to the unsafe switch.
grant execute on function public.switch_active_garage_store(uuid,uuid,text) to authenticated;

commit;
