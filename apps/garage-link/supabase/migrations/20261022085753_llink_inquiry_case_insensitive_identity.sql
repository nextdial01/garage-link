-- UUID response identity is case insensitive only for the L-LINK source.
-- Preserve legacy receipts and the existing general external-identity index.
begin;
do $guard$
begin
 if exists (select 1 from public.line_form_responses
   where external_source='l-link' and external_response_id is not null
   group by store_id,lower(external_response_id) having count(*)>1) then
  raise exception 'existing l-link response identity collisions; review required';
 end if;
end;
$guard$;
create unique index line_form_responses_llink_response_uuid_unique
 on public.line_form_responses (store_id,lower(external_response_id))
 where external_source='l-link' and external_response_id is not null;
commit;
