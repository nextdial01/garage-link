-- G4-B security-preserving rollback.
-- Keep case, refund, ownership and audit history and all append-only guards.
-- Disable new user-facing workflows without restoring delivered-sale cancellation.
begin;
revoke all on function public.create_sale_correction_case(uuid,text,text,integer,uuid,text,text) from public,anon,authenticated;
revoke all on function public.transition_sale_correction_case(uuid,text,text,integer,text,text,text) from public,anon,authenticated;
revoke all on function public.record_sale_correction_refund(uuid,uuid,integer,text,text,text) from public,anon,authenticated;
revoke all on function public.complete_sale_correction_inspection(uuid,text,text,text) from public,anon,authenticated;
revoke all on function public.resolve_sale_correction_ownership(uuid,text,text,text,text) from public,anon,authenticated;
revoke all on function public.confirm_sale_correction_restock(uuid,text,text) from public,anon,authenticated;
revoke all on function public.resolve_sale_correction_external_procedure(uuid,text,text,text,text) from public,anon,authenticated;
revoke insert,update,delete on public.sale_correction_cases,public.sale_correction_operations,
  public.sale_correction_events,public.customer_vehicle_ownership_history,public.sale_correction_refunds
  from public,anon,authenticated;
commit;
