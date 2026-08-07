# Supabase

## Migrations

Migrations live in `supabase/migrations/` and are named
`<UTC timestamp>_<description>.sql`. To change the schema, add a new file — never
edit one that has already been applied, since the CLI tracks applied migrations by
filename and will skip it.

Pushing a new migration file to `main` triggers `.github/workflows/migrate.yml`,
which applies any pending migrations. Nothing to run by hand.

Two repository secrets make that work:

| Secret | Where it comes from |
| --- | --- |
| `SUPABASE_ACCESS_TOKEN` | Supabase account → Access Tokens |
| `SUPABASE_DB_PASSWORD` | the database password set when the project was created |

## Keep migrations additive

The site deploy and the migration run are separate workflows, so a schema change
can reach the database before or after the client that needs it. Adding columns,
tables and indexes is safe either way. Renaming or dropping something is not —
split that into two releases: first ship a client that no longer depends on the
old shape, then drop it.

## Schema

- `groups` — one row per payment group, with `opening_balance` and `last_reset`
- `items` — one row per bill, carrying `value`, `kind`, `due_date`, `checked`, `snoozed`
- `prefs` — per-user settings (`sort_mode`)

`collapsedGroups` has no table on purpose: it is per-device UI state and stays in
`localStorage`.

Row level security is owner-scoped on every table. The publishable key ships in
the client bundle, so those policies are what actually protect the data — an
item's composite foreign key `(group_id, user_id)` additionally makes it
impossible to attach a row to another user's group.

Group and item ids are client-supplied and shared between accounts — every user
is seeded with `monthly`, `comgas`, `aluguel` — so the primary key on both tables
is `(id, user_id)`, not `id`. RLS could not have covered this: unique constraints
are enforced beneath it, across every row in the table.

## Edge functions

Every function except `pluggy-webhook` requires a signed-in user, checked with
`auth.getUser()` inside the handler. `verify_jwt` alone is not enough — it accepts
the publishable key, which is in the bundle of a public site. `pluggy-webhook` is
deployed `--no-verify-jwt` because Pluggy cannot present a Supabase JWT, and
authenticates with a shared secret instead.
