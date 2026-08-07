-- Ids belong to a user, not to the database.
--
-- Group and item ids are client-supplied and identical for everyone: `mergeGroups`
-- seeds every account from the same `DEFAULT_PAYMENTS`, so every user's data
-- contains the literal group ids `monthly`, `card`, `savings`, `yearly` and the
-- item ids `comgas`, `aluguel`, `cpfl`… With `id` alone as the primary key, the
-- first account to import owns those strings for the whole table.
--
-- The second user does not merely get an error. `replaceAll` deletes the caller's
-- rows and then inserts, so `duplicate key value violates unique constraint
-- "groups_pkey"` arrives *after* the delete has succeeded: their data is gone and
-- the replacement never lands. RLS cannot prevent it, because unique constraints
-- are enforced beneath RLS, over every row in the table — a row the policy hides
-- still occupies its key.
--
-- The tables were already built for the fix. `groups` carries `unique (id, user_id)`
-- so `items` can reference it by the composite pair; promoting that pair to the
-- primary key on both tables makes an id unique per owner, which is all it ever
-- meant. Nothing in the client changes shape: it already sends ids and never sends
-- `user_id`, which `auth.uid()` fills in.
--
-- Safe against a populated database. The old key (id) was strictly narrower than
-- the new one (id, user_id), so every existing row already satisfies it — this can
-- only relax uniqueness, never reject data. One transaction, so a failure anywhere
-- leaves the old keys intact.

begin;

-- The composite FK is what holds `groups_id_user_id_key` in place, so it has to
-- come off before that constraint can be replaced by the new primary key. Dropped
-- with `if exists` throughout so a re-run is a no-op rather than an error.
alter table public.items drop constraint if exists items_group_id_user_id_fkey;

-- ── groups ───────────────────────────────────────────────────────────────────

alter table public.groups drop constraint if exists groups_pkey;
-- Redundant once the same pair is the primary key; it only ever existed to give
-- the items FK something to point at.
alter table public.groups drop constraint if exists groups_id_user_id_key;

alter table public.groups add primary key (id, user_id);

-- ── items ────────────────────────────────────────────────────────────────────

alter table public.items drop constraint if exists items_pkey;

alter table public.items add primary key (id, user_id);

alter table public.items
  add constraint items_group_id_user_id_fkey
  foreign key (group_id, user_id)
  references public.groups (id, user_id) on delete cascade;

-- ── Indexes ──────────────────────────────────────────────────────────────────
-- `group_id` on its own no longer identifies a group, so an index led by it is
-- now ambiguous across users: every account has a `monthly`. The replacement is
-- the pair the FK and the cascade delete actually search on, with `position`
-- still carried so the ordered read of one group stays index-only.
--
-- The dropped primary key index on `id` alone is not missed: `id` leads the new
-- composite key, so `.eq("id", …)` and `.in("id", …)` — the only single-id
-- lookups the client makes — still use it.

drop index if exists public.items_group_id_position_idx;
create index if not exists items_user_id_group_id_position_idx
  on public.items (user_id, group_id, position);

-- ── Realtime ─────────────────────────────────────────────────────────────────
-- Nothing to do, and that is worth recording rather than discovering later.
-- Publication membership is per table, not per key, so `supabase_realtime` keeps
-- both tables. And both are already `replica identity full` (see the init
-- migration), so replication identifies rows by their whole contents and never
-- depended on the primary key index we just replaced — had they been on the
-- default identity, dropping the key would have broken DELETE events.

commit;
