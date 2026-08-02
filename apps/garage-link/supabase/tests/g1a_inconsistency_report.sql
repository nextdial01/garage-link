-- Read-only detection query for memberships / legacy store_members divergence.
with legacy as (
  select sm.*, s.tenant_id
  from public.store_members sm
  left join public.stores s on s.id = sm.store_id
), comparison as (
  select
    coalesce(m.tenant_id, l.tenant_id) as tenant_id,
    coalesce(m.user_id, l.user_id) as user_id,
    m.id as membership_id,
    l.id as legacy_id,
    m.store_id as membership_store_id,
    l.store_id as legacy_store_id,
    m.role as membership_role,
    l.role as legacy_role,
    m.status as membership_status,
    l.status as legacy_status,
    case
      when m.id is null then 'STORE_MEMBERS_ONLY'
      when l.id is null then 'MEMBERSHIPS_ONLY'
      when m.store_id is distinct from l.store_id then 'STORE_MISMATCH'
      when m.role is distinct from l.role then 'ROLE_MISMATCH'
      when (m.status = 'active') is distinct from (l.status = 'active') then 'ACTIVE_STATUS_MISMATCH'
      else 'MATCH'
    end as comparison
  from public.memberships m
  full join legacy l
    on l.tenant_id = m.tenant_id
   and l.user_id = m.user_id
)
select *
from comparison
where comparison <> 'MATCH'
order by tenant_id, user_id, comparison;
