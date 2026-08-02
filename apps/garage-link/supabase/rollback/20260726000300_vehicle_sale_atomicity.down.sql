-- G3 security-preserving rollback.
-- The RPC entry points are disabled, while the transition guards and unique claim remain.
begin;
revoke execute on function public.reserve_vehicle_sale(uuid, text, text) from authenticated, anon, public;
revoke execute on function public.cancel_vehicle_sale(uuid, text, text) from authenticated, anon, public;
revoke execute on function public.complete_vehicle_delivery(uuid, text, text) from authenticated, anon, public;
-- Deliberately retain guard_deal_sale_transition and guard_vehicle_sale_transition.
-- Restoring direct status writes would recreate VEHICLE-001 during rollback.
revoke insert, update, delete on public.vehicle_sale_claims from authenticated, anon;
revoke insert, update, delete on public.vehicle_sale_operations from authenticated, anon;
commit;
