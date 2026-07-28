-- G1-A security-preserving operational rollback.
-- Critical経路を復活させないため、旧RLS・旧GRANT・store_members fallbackには戻さない。
-- membership変更と新規tenant作成を停止し、既存active membershipの読取だけを維持する。

begin;

revoke execute on function public.invite_membership(uuid, uuid, text, text, text, text) from authenticated;
revoke execute on function public.accept_membership_invite(uuid, text) from authenticated;
revoke execute on function public.reissue_membership_invite(uuid) from authenticated;
revoke execute on function public.cancel_membership_invite(uuid) from authenticated;
revoke execute on function public.change_membership_role(uuid, text) from authenticated;
revoke execute on function public.deactivate_membership(uuid) from authenticated;
revoke execute on function public.create_store_for_current_user(text, text) from authenticated;

-- 防壁は意図的に維持する。
revoke insert, update, delete on public.memberships from anon, authenticated;
revoke insert, update, delete on public.store_members from anon, authenticated;

commit;

notify pgrst, 'reload schema';
