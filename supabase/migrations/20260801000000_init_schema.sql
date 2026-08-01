-- Finance Tracker — initial schema
--
-- Mirrors the shape the app used in localStorage, normalised:
--   groups  → one row per payment group (was `groups` + `lastResets` + `openingBalances`)
--   items   → one row per bill (was `items` + `checked`/`snoozed`/`values`/`kinds`/`dates`)
--   prefs   → per-user settings (was `sortMode`)
--
-- `collapsedGroups` deliberately has no table: it is per-device UI state and
-- stays in localStorage.

-- ── Helpers ──────────────────────────────────────────────────────────────────

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ── groups ───────────────────────────────────────────────────────────────────

create table public.groups (
  id              uuid primary key,
  user_id         uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title           text not null check (char_length(trim(title)) between 1 and 40),
  date_mode       text not null default 'days' check (date_mode in ('none', 'days', 'months')),
  position        integer not null default 0,
  opening_balance numeric(12, 2) not null default 0,
  last_reset      timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  -- lets items carry a composite FK, so an item can never point at a group
  -- belonging to a different user
  unique (id, user_id)
);

create index groups_user_id_position_idx on public.groups (user_id, position);

create trigger groups_touch_updated_at
  before update on public.groups
  for each row execute function public.touch_updated_at();

-- ── items ────────────────────────────────────────────────────────────────────

create table public.items (
  id         uuid primary key,
  group_id   uuid not null,
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  label      text not null check (char_length(trim(label)) between 1 and 60),
  value      numeric(12, 2) not null default 0,
  kind       text not null default 'expense' check (kind in ('expense', 'revenue')),
  -- day of month (1-31) or month of year (1-12), depending on the group's date_mode
  due_date   integer check (due_date between 1 and 31),
  checked    boolean not null default false,
  snoozed    boolean not null default false,
  position   integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  foreign key (group_id, user_id)
    references public.groups (id, user_id) on delete cascade
);

create index items_group_id_position_idx on public.items (group_id, position);
create index items_user_id_idx on public.items (user_id);

create trigger items_touch_updated_at
  before update on public.items
  for each row execute function public.touch_updated_at();

-- ── prefs ────────────────────────────────────────────────────────────────────

create table public.prefs (
  user_id    uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  sort_mode  text not null default 'manual' check (sort_mode in ('manual', 'value', 'date')),
  updated_at timestamptz not null default now()
);

create trigger prefs_touch_updated_at
  before update on public.prefs
  for each row execute function public.touch_updated_at();

-- ── Row level security ───────────────────────────────────────────────────────
-- Every table is owner-scoped. The anon/publishable key ships in the client
-- bundle, so these policies are what actually protect the data.

alter table public.groups enable row level security;
alter table public.items  enable row level security;
alter table public.prefs  enable row level security;

create policy groups_select on public.groups for select to authenticated using (user_id = auth.uid());
create policy groups_insert on public.groups for insert to authenticated with check (user_id = auth.uid());
create policy groups_update on public.groups for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy groups_delete on public.groups for delete to authenticated using (user_id = auth.uid());

create policy items_select on public.items for select to authenticated using (user_id = auth.uid());
create policy items_insert on public.items for insert to authenticated with check (user_id = auth.uid());
create policy items_update on public.items for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy items_delete on public.items for delete to authenticated using (user_id = auth.uid());

create policy prefs_select on public.prefs for select to authenticated using (user_id = auth.uid());
create policy prefs_insert on public.prefs for insert to authenticated with check (user_id = auth.uid());
create policy prefs_update on public.prefs for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Supabase's default privileges usually cover this, but granting explicitly keeps
-- the migration self-contained. RLS above is what restricts rows; these grants
-- only decide which tables the signed-in role may touch at all.
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on public.groups to authenticated;
grant select, insert, update, delete on public.items  to authenticated;
grant select, insert, update                on public.prefs  to authenticated;

-- ── Realtime ─────────────────────────────────────────────────────────────────
-- REPLICA IDENTITY FULL so DELETE events carry the whole old row, which is what
-- lets RLS be evaluated on deletes and lets the client know what disappeared.

alter table public.groups replica identity full;
alter table public.items  replica identity full;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'groups'
    ) then
      alter publication supabase_realtime add table public.groups;
    end if;

    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'items'
    ) then
      alter publication supabase_realtime add table public.items;
    end if;
  end if;
end;
$$;
