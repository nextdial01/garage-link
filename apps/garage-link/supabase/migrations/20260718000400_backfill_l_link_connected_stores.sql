update public.stores as store
set l_link_onboarding_completed_at = coalesce(store.l_link_onboarding_completed_at, now())
where store.l_link_onboarding_completed_at is null
  and exists (
    select 1
    from public.line_form_responses as response
    where response.store_id = store.id
      and response.external_source = 'l-link'
  );

