begin;

drop function if exists public.ux_acceptance_admin_bootstrap_context(uuid, uuid, text);
drop function if exists public.ux_acceptance_prepare_store(uuid, uuid);

commit;
