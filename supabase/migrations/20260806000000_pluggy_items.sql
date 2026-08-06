-- Items created through Pluggy Connect.
--
-- Pluggy has no "list my items" endpoint — item ids come back from the Connect
-- widget and it is the integrator's job to remember them. This table is that
-- memory; without it a connection made today is unreachable tomorrow.

create table public.pluggy_items (
  item_id        text primary key,
  user_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  connector_id   integer,
  connector_name text,
  status         text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index pluggy_items_user_id_idx on public.pluggy_items (user_id);

create trigger pluggy_items_touch_updated_at
  before update on public.pluggy_items
  for each row execute function public.touch_updated_at();

alter table public.pluggy_items enable row level security;

create policy pluggy_items_select on public.pluggy_items for select to authenticated using (user_id = auth.uid());
create policy pluggy_items_insert on public.pluggy_items for insert to authenticated with check (user_id = auth.uid());
create policy pluggy_items_update on public.pluggy_items for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy pluggy_items_delete on public.pluggy_items for delete to authenticated using (user_id = auth.uid());

grant select, insert, update, delete on public.pluggy_items to authenticated;
