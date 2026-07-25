-- 20260724000200で、maintenance_jobsに存在しないreception_noを参照していたため、
-- 本番適用済みのダッシュボード関数をjob_no参照へ安全に置き換える。
do $migration$
declare
  v_function_definition text;
begin
  select pg_get_functiondef('public.get_garage_dashboard_payload()'::regprocedure)
    into v_function_definition;

  if position('job.reception_no' in v_function_definition) > 0 then
    execute replace(
      v_function_definition,
      'job.reception_no',
      'job.job_no as reception_no'
    );
  end if;
end;
$migration$;
