-- G4-A security-preserving rollback.
-- Do not restore direct payment mutation, issued invoice overwrite, or the
-- pre-G4 sale cancellation that could diverge from invoice/payment state.
begin;

revoke all on function public.issue_garage_invoice(uuid,text,text) from public,anon,authenticated;
revoke all on function public.void_garage_invoice(uuid,text,text,text) from public,anon,authenticated;
revoke all on function public.record_garage_payment(uuid,integer,text,text,text) from public,anon,authenticated;
revoke all on function public.record_garage_payment_reversal(uuid,integer,text,text,text,text) from public,anon,authenticated;
revoke insert,update,delete on public.invoice_payment_ledger from public,anon,authenticated;
revoke update,delete on public.payment_items from public,anon,authenticated;

-- Tables, append-only guards, snapshot guards, invoice guards, ledger data and
-- the accounting-aware sale cancellation remain in place. A destructive
-- contract rollback requires an operator-reviewed later migration.
commit;
