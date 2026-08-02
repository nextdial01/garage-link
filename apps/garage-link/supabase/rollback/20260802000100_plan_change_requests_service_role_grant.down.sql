-- Revert plan_change_requests service_role grant to its pre-fix state (as left by
-- 20260731000300_application_privilege_contract.sql). Revoke exactly the four
-- privileges this migration granted, not ALL, so no unrelated future grant on this
-- table is clobbered by a rollback.
revoke DELETE, INSERT, SELECT, UPDATE on table public."plan_change_requests" from service_role;
