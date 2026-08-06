// Receives Pluggy webhook deliveries.
//
// Pluggy requires a 2XX inside 5 seconds and retries otherwise, so this does the
// least possible work: authenticate the caller, write the event to an inbox
// table, return. Pulling data for an updated item happens later, off this
// request, reading from public.pluggy_webhook_events.
//
// Deployed with --no-verify-jwt, because Pluggy cannot present a Supabase JWT.
// A shared secret in the query string takes its place — without it this would be
// an unauthenticated write endpoint open to the internet.

import { createClient } from "jsr:@supabase/supabase-js@2";

const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });

  const expected = Deno.env.get("PLUGGY_WEBHOOK_SECRET");
  if (!expected) {
    console.error("PLUGGY_WEBHOOK_SECRET not set — refusing to accept deliveries");
    return new Response("not configured", { status: 500 });
  }
  if (new URL(req.url).searchParams.get("secret") !== expected) {
    return new Response("forbidden", { status: 403 });
  }

  let event: Record<string, unknown>;
  try {
    event = await req.json();
  } catch {
    return new Response("invalid json", { status: 400 });
  }

  const { error } = await db.from("pluggy_webhook_events").insert({
    event:    String(event.event ?? "unknown"),
    event_id: event.eventId ? String(event.eventId) : null,
    item_id:  event.itemId ? String(event.itemId) : null,
    payload:  event,
  });

  // A duplicate eventId means Pluggy retried something we already have. That is
  // success from its point of view — anything but a 2XX earns another retry.
  if (error && !error.message.includes("duplicate key")) {
    console.error("webhook insert failed", error.message);
    // Still 200: a 5XX makes Pluggy retry, and if our database is unhappy the
    // retry will fail too. The delivery is in the logs either way.
  }

  return Response.json({ received: true });
});
