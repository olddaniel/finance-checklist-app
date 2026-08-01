-- Ids arrive from the client, and the ones already in the wild are not uuids:
-- the seeded rows use slugs ("comgas", "aluguel") and user-created rows use
-- `${groupId}_${timestamp}`. Widen the key columns to text so an existing
-- device's data can be imported without rewriting every id.
--
-- Safe as a straight type change while the tables are still empty.

alter table public.items drop constraint items_group_id_user_id_fkey;

alter table public.groups alter column id type text;

alter table public.items
  alter column id       type text,
  alter column group_id type text;

alter table public.items
  add constraint items_group_id_user_id_fkey
  foreign key (group_id, user_id)
  references public.groups (id, user_id) on delete cascade;

-- Ids are client-supplied, so bound their length rather than trusting the client
alter table public.groups add constraint groups_id_length check (char_length(id) between 1 and 128);
alter table public.items  add constraint items_id_length  check (char_length(id) between 1 and 128);
