\set ON_ERROR_STOP on

with required_functions(name, result_type) as (
  values ('uid'::text,'uuid'::text),('jwt'::text,'jsonb'::text),('role'::text,'text'::text)
), actual as (
  select p.oid,p.proname::text name,pg_get_function_identity_arguments(p.oid) args,
         pg_get_function_result(p.oid) result_type,p.prokind,p.prosecdef,p.proleakproof
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='auth' and p.proname in ('uid','jwt','role')
), violations as (
  select 'SECURITY_RELEVANT'::text classification,'MISSING_OR_INCOMPATIBLE_FUNCTION:'||r.name detail
  from required_functions r left join actual a on a.name=r.name and a.args=''
  where a.oid is null or a.result_type<>r.result_type or a.prokind<>'f' or a.prosecdef or a.proleakproof
  union all
  select 'SECURITY_RELEVANT','MISSING_EFFECTIVE_EXECUTE:'||r.name||'@'||role_name
  from required_functions r cross join unnest(array['anon','authenticated','service_role']::text[]) role_name
  left join actual a on a.name=r.name and a.args=''
  where a.oid is null or not has_function_privilege(role_name,a.oid,'EXECUTE')
  union all
  select 'SECURITY_RELEVANT','EXCESSIVE_DATA_API_GRANT:auth.users@'||role_name||':'||privilege_name
  from unnest(array['anon','authenticated','service_role']::text[]) role_name
  cross join unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']::text[]) privilege_name
  where has_table_privilege(role_name,to_regclass('auth.users'),privilege_name)
  union all
  select 'UNKNOWN','UNCLASSIFIED_AUTH_OBJECT:'||p.proname
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='auth' and p.proname='commercial_provider_unknown_probe'
)
select coalesce(jsonb_agg(jsonb_build_object('classification',classification,'detail',detail) order by classification,detail),'[]'::jsonb)::text
from violations;
