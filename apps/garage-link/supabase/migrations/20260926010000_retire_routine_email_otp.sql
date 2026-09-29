begin;
-- Keep the installed pre-request hook compatible while retiring only the extra
-- routine email challenge. Tenant RLS, membership and write gates are unchanged.
create or replace function public.enforce_administrator_email_otp()
returns void language plpgsql security definer set search_path = ''
as $$ begin return; end; $$;
comment on function public.enforce_administrator_email_otp() is
  'Compatibility no-op: routine email OTP retired; Supabase authentication and tenant RLS remain mandatory.';
notify pgrst, 'reload schema';
commit;
