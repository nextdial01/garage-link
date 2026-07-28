\set ON_ERROR_STOP on
begin transaction read only;
select 'public_tables|'||count(*) from pg_tables where schemaname='public';
select 'rls_tables|'||count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in('r','p') and c.relrowsecurity;
select 'policies|'||count(*) from pg_policies where schemaname='public';
select 'functions|'||count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public';
select 'triggers|'||count(*) from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and not t.tgisinternal;
select 'constraints|'||count(*) from pg_constraint c join pg_namespace n on n.oid=c.connamespace where n.nspname='public';
select 'indexes|'||count(*) from pg_indexes where schemaname='public';
select 'ledger|'||count(*) from supabase_migrations.schema_migrations;
rollback;

