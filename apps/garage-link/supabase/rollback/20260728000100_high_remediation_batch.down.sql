-- G7 security-preserving rollback.
-- Data constraints, canonical authorization, PII visibility protection, quota
-- serialization and append-only ledgers intentionally remain in force.
begin;

-- Stop newly introduced mutation features without restoring any vulnerable
-- direct-write path. Reapplying the forward migration restores these grants.
revoke execute on function public.cancel_maintenance_job(uuid,text,text) from authenticated;
revoke execute on function public.create_inventory_count(uuid,jsonb,jsonb,text) from authenticated;
revoke execute on function public.finalize_inventory_count(uuid,text) from authenticated;
revoke execute on function public.apply_ordered_stripe_subscription_event(uuid,text,text,text,text,text,bigint) from service_role;

-- Keep direct legacy membership writes, uploaded-file metadata writes and
-- inventory snapshot INSERT/DELETE denied. Keep all guards and indexes.
revoke insert,update,delete on public.store_members from anon,authenticated;
revoke insert on public.stores from anon,authenticated;
revoke insert,update,delete on public.uploaded_files from anon,authenticated;
revoke insert,delete on public.inventory_counts from authenticated;
revoke insert,delete on public.inventory_count_items from authenticated;

commit;
