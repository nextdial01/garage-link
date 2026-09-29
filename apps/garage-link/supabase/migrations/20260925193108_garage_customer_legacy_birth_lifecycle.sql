begin;
-- Existing unknown birthdays remain valid only for a pure archive/restore.
-- Role and store authorization still comes from the existing customer RLS.
create or replace function public.guard_customer_birth_date() returns trigger
language plpgsql set search_path=public,pg_temp as $$
begin
 if tg_op='UPDATE' and old.birth_date is null and new.birth_date is null then
  if (to_jsonb(new)-array['deleted_at','deleted_by','is_archived','updated_at'])
     = (to_jsonb(old)-array['deleted_at','deleted_by','is_archived','updated_at'])
     and (
      (old.deleted_at is null and new.deleted_at is not null and new.is_archived is true)
      or (old.deleted_at is not null and new.deleted_at is null and new.is_archived is false and new.deleted_by is null)
     ) then
   return new;
  end if;
 end if;
 if new.birth_date is null or new.birth_date>current_date then
  raise exception '有効な生年月日を入力してください' using errcode='22023';
 end if;
 return new;
end $$;
comment on function public.guard_customer_birth_date() is
 'Require birth date for creation and edits; permit only pure archive/restore of unchanged legacy NULL profiles. Customer RLS remains mandatory.';
commit;
