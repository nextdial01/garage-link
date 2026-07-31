\set ON_ERROR_STOP on

-- GARAGE LINK only depends on stable Supabase Auth semantics. Provider body
-- hashes, raw OIDs and bootstrap RLS state are intentionally not app truth.
with required_functions(name, result_type) as (
  values ('uid'::text,'uuid'::text),('jwt'::text,'jsonb'::text),('role'::text,'text'::text)
), actual as (
  select p.oid,p.proname::text name,pg_get_function_identity_arguments(p.oid) args,
         pg_get_function_result(p.oid) result_type,p.prokind,p.prosecdef,p.proleakproof
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='auth' and p.proname in ('uid','jwt','role')
), violations as (
  select 'MISSING_OR_INCOMPATIBLE_FUNCTION' code,r.name object_name
  from required_functions r left join actual a on a.name=r.name and a.args=''
  where a.oid is null or a.result_type<>r.result_type or a.prokind<>'f' or a.prosecdef or a.proleakproof
  union all
  select 'MISSING_EFFECTIVE_EXECUTE',r.name||'@'||role_name
  from required_functions r cross join unnest(array['anon','authenticated','service_role']::text[]) role_name
  left join actual a on a.name=r.name and a.args=''
  where a.oid is null or not has_function_privilege(role_name,a.oid,'EXECUTE')
  union all
  select 'MISSING_AUTH_USERS','auth.users' where to_regclass('auth.users') is null
  union all
  select 'MISSING_AUTH_USERS_ID','auth.users.id' where not exists (
    select 1 from pg_attribute where attrelid=to_regclass('auth.users') and attname='id'
      and attnum>0 and not attisdropped and format_type(atttypid,atttypmod)='uuid' and attnotnull)
  union all
  select 'MISSING_AUTH_USERS_EMAIL','auth.users.email' where not exists (
    select 1 from pg_attribute where attrelid=to_regclass('auth.users') and attname='email'
      and attnum>0 and not attisdropped and format_type(atttypid,atttypmod) in ('text','character varying','character varying(255)'))
  union all
  select 'EXCESSIVE_DATA_API_GRANT','auth.users@'||role_name||':'||privilege_name
  from unnest(array['anon','authenticated','service_role']::text[]) role_name
  cross join unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']::text[]) privilege_name
  where has_table_privilege(role_name,to_regclass('auth.users'),privilege_name)
)
select case when count(*)=0 then 'BATCH_1E_PROVIDER_DEPENDENCY_PASS'
            else 'BATCH_1E_PROVIDER_DEPENDENCY_FAIL:'||string_agg(code||':'||object_name,',' order by code,object_name) end
from violations;
