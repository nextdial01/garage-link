\set ON_ERROR_STOP on

select 'relations|' || md5(coalesce(string_agg(
  concat_ws('|', n.nspname, c.relname, c.relkind, r.rolname, c.relrowsecurity, c.relforcerowsecurity,
    (select string_agg(concat_ws(':', a.grantor, a.grantee, a.privilege_type, a.is_grantable), ','
       order by a.grantor, a.grantee, a.privilege_type, a.is_grantable)
     from aclexplode(coalesce(c.relacl, acldefault(case when c.relkind='S' then 'S'::"char" else 'r'::"char" end, c.relowner))) a)),
  E'\n' order by n.nspname, c.relname, c.relkind
), ''))
from pg_class c join pg_namespace n on n.oid=c.relnamespace join pg_roles r on r.oid=c.relowner
where n.nspname in ('public','supabase_migrations') and c.relkind in ('r','p','v','m','S');

select 'functions|' || md5(coalesce(string_agg(
  concat_ws('|', n.nspname, p.proname, pg_get_function_identity_arguments(p.oid), r.rolname, p.prosecdef,
    coalesce(array_to_string(p.proconfig,','),''), coalesce(p.proacl::text,''), md5(pg_get_functiondef(p.oid))),
  E'\n' order by n.nspname, p.proname, pg_get_function_identity_arguments(p.oid)
), ''))
from pg_proc p join pg_namespace n on n.oid=p.pronamespace join pg_roles r on r.oid=p.proowner
where n.nspname='public' and p.prokind='f';

select 'policies|' || md5(coalesce(string_agg(
  concat_ws('|', n.nspname, c.relname, p.polname, p.polcmd, p.polpermissive,
    coalesce(pg_get_expr(p.polqual,p.polrelid),''), coalesce(pg_get_expr(p.polwithcheck,p.polrelid),'')),
  E'\n' order by n.nspname, c.relname, p.polname
), ''))
from pg_policy p join pg_class c on c.oid=p.polrelid join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public';

select 'constraints|' || md5(coalesce(string_agg(
  concat_ws('|', n.nspname, c.relname, x.conname, x.contype, pg_get_constraintdef(x.oid)),
  E'\n' order by n.nspname, c.relname, x.conname
), ''))
from pg_constraint x join pg_class c on c.oid=x.conrelid join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public';

select 'triggers|' || md5(coalesce(string_agg(
  concat_ws('|', n.nspname, c.relname, t.tgname, pg_get_triggerdef(t.oid)),
  E'\n' order by n.nspname, c.relname, t.tgname
), ''))
from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and not t.tgisinternal;

select 'extensions|' || md5(coalesce(string_agg(
  concat_ws('|', e.extname, n.nspname, r.rolname, e.extversion), E'\n' order by e.extname
), ''))
from pg_extension e join pg_namespace n on n.oid=e.extnamespace join pg_roles r on r.oid=e.extowner;

select 'roles|' || md5(coalesce(string_agg(
  concat_ws('|', rolname, rolsuper, rolinherit, rolcreaterole, rolcreatedb, rolcanlogin, rolreplication, rolbypassrls),
  E'\n' order by rolname
), ''))
from pg_roles where rolname in ('postgres','supabase_admin','authenticator','anon','authenticated','service_role');

select 'schemas|' || md5(coalesce(string_agg(
  concat_ws('|', n.nspname, r.rolname,
    (select string_agg(concat_ws(':', a.grantor, a.grantee, a.privilege_type, a.is_grantable), ','
       order by a.grantor, a.grantee, a.privilege_type, a.is_grantable)
     from aclexplode(coalesce(n.nspacl, acldefault('n', n.nspowner))) a)),
  E'\n' order by n.nspname
), ''))
from pg_namespace n join pg_roles r on r.oid=n.nspowner
where n.nspname in ('public','supabase_migrations');

select 'default_acl|' || md5(coalesce(string_agg(
  concat_ws('|', r.rolname, coalesce(n.nspname,''), d.defaclobjtype, d.defaclacl::text),
  E'\n' order by r.rolname, coalesce(n.nspname,''), d.defaclobjtype
), ''))
from pg_default_acl d join pg_roles r on r.oid=d.defaclrole left join pg_namespace n on n.oid=d.defaclnamespace
where n.nspname in ('public','supabase_migrations') or n.nspname is null;

select 'ledger|' || md5(coalesce(string_agg(
  concat_ws('|', m.version, m.name, i.checksum, i.kind, i.state), E'\n' order by i.execution_order
), ''))
from supabase_migrations.schema_migrations m join supabase_migrations.migration_integrity i using(version);
