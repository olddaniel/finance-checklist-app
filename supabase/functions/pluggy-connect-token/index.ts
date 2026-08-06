// Mints a short-lived Pluggy Connect token so the browser can open the Pluggy
// Connect widget without ever seeing the client credentials.
//
// Ported from Pluggy's Next.js route example. The app is a static SPA, so there
// is no Node server — this edge function is the server side.

import { PluggyClient } from "npm:pluggy-sdk";
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  // A connect token can link a bank account, so only a signed-in user may mint
  // one. Supabase's verify_jwt alone would accept the anon key, which every
  // visitor has — this checks there is a real authenticated user behind it.
  const authHeader = req.headers.get("Authorization") ?? "";
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return json({ error: "not authenticated" }, 401);

  const clientId = Deno.env.get("PLUGGY_CLIENT_ID");
  const clientSecret = Deno.env.get("PLUGGY_CLIENT_SECRET");
  if (!clientId || !clientSecret) {
    return json({ error: "PLUGGY_CLIENT_ID / PLUGGY_CLIENT_SECRET not set" }, 500);
  }

  try {
    const pluggy = new PluggyClient({ clientId, clientSecret });

    // Tie the Pluggy item to the Supabase user, so a later webhook or pull can
    // be attributed without a separate mapping table.
    const connectToken = await pluggy.createConnectToken({
      clientUserId: user.id,
    });

    return json({ accessToken: connectToken.accessToken });
  } catch (e) {
    // Surface Pluggy's own message — during the trial the usual failure is a
    // plan/permission error rather than a bad request.
    const message = e instanceof Error ? e.message : String(e);
    console.error("createConnectToken failed", message);
    return json({ error: "could not create connect token", detail: message }, 502);
  }
});
