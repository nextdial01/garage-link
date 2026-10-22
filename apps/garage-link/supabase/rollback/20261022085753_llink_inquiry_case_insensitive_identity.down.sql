-- Remove only the reviewed additive index. Receipt/audit data and old identity index remain.
begin;
do $rollback$
declare v_index regclass;
begin
 v_index := to_regclass('public.line_form_responses_llink_response_uuid_unique');
 if v_index is null then return; end if;
 if pg_get_indexdef(v_index) <> 'CREATE UNIQUE INDEX line_form_responses_llink_response_uuid_unique ON public.line_form_responses USING btree (store_id, lower(external_response_id)) WHERE ((external_source = ''l-link''::text) AND (external_response_id IS NOT NULL))' then
  raise exception 'l-link response identity rollback index drift';
 end if;
 drop index public.line_form_responses_llink_response_uuid_unique;
end;
$rollback$;
commit;
