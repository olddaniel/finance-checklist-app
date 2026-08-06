-- Inbox for Pluggy webhook deliveries.
--
-- Pluggy requires a 2XX within 5 seconds, so the endpoint does nothing but write
-- the event here and return. Anything slow — pulling transactions for an updated
-- item — happens later, reading from this table.

create table public.pluggy_webhook_events (
  id           bigserial primary key,
  received_at  timestamptz not null default now(),
  event        text not null,
  event_id     text,
  item_id      text,
  payload      jsonb not null,
  processed_at timestamptz
);

-- The queue is read by "oldest unprocessed first"
create index pluggy_webhook_events_pending_idx
  on public.pluggy_webhook_events (received_at)
  where processed_at is null;

-- Pluggy retries on failure, so the same eventId can arrive more than once
create unique index pluggy_webhook_events_event_id_idx
  on public.pluggy_webhook_events (event_id)
  where event_id is not null;

-- Only the service role touches this; the client has no reason to read raw events.
alter table public.pluggy_webhook_events enable row level security;
