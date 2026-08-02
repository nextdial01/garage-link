-- GARAGE LINK: plan_change_requests was left out of the service_role grant list
-- in 20260731000300_application_privilege_contract.sql's blanket
-- `revoke all ... from public, anon, authenticated, service_role` reset. Every
-- write to this table (applyPlan.ts's upsert, change-plan/route.ts's insert and
-- update) goes through the admin/service_role client, which has had no INSERT,
-- UPDATE, or SELECT grant since that migration - every plan change request
-- (upgrade or downgrade) has been failing with a 42501 permission-denied error
-- after the Stripe-side mutation already succeeded, landing on the generic
-- 503 "reconciliation_required" path.
grant DELETE, INSERT, SELECT, UPDATE on table public."plan_change_requests" to service_role;
