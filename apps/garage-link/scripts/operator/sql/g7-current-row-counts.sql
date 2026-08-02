\set ON_ERROR_STOP on
\pset tuples_only on
\pset format unaligned
select format('select %L||''|''||count(*) from %I.%I;',schemaname||'.'||tablename,schemaname,tablename)
from pg_tables
where schemaname='public' and tablename<>'billing_sync_operations'
order by schemaname,tablename
\gexec

