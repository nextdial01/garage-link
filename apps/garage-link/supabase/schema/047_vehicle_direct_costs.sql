-- 047 車両直接原価項目
alter table public.vehicles
  add column if not exists direct_cost_special numeric(12, 2),
  add column if not exists direct_cost_accessories numeric(12, 2),
  add column if not exists direct_cost_agency numeric(12, 2),
  add column if not exists direct_cost_legal numeric(12, 2);

comment on column public.vehicles.direct_cost_special is '特仕原価計';
comment on column public.vehicles.direct_cost_accessories is '付属品原価計';
comment on column public.vehicles.direct_cost_agency is '手続代行原価';
comment on column public.vehicles.direct_cost_legal is '預り法定原価';
