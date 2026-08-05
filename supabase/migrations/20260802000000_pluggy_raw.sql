-- Raw landing table for everything Pluggy returns.
--
-- Open Finance serves ~12 months of history and caps historical pulls at 4 per
-- month per institution, so a pull is expensive and unrepeatable. Every response
-- is stored verbatim here before anything parses it: if our parsing is wrong we
-- fix the parser and re-read this table, rather than spending another pull.

create table public.pluggy_raw (
  id          bigserial primary key,
  fetched_at  timestamptz not null default now(),
  kind        text not null check (kind in ('auth', 'items', 'accounts', 'transactions', 'investments', 'error')),
  item_id     text,
  account_id  text,
  payload     jsonb not null
);

create index pluggy_raw_kind_idx on public.pluggy_raw (kind, fetched_at desc);

-- No policies: only the service role (i.e. the edge function) touches this.
-- The client never reads raw payloads.
alter table public.pluggy_raw enable row level security;
