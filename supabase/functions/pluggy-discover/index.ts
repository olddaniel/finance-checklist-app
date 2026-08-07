// Discovery step: authenticate against Pluggy, find the connected items and
// their accounts, and store every response verbatim.
//
// Deliberately does NOT fetch transactions. Historical transaction pulls are
// capped at 4 per month per institution, so we spend one only once the item and
// account shapes are confirmed.

import { createClient } from "jsr:@supabase/supabase-js@2";

const PLUGGY = "https://api.pluggy.ai";

const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

async function store(kind: string, payload: unknown, ids: { itemId?: string; accountId?: string } = {}) {
  const { error } = await db.from("pluggy_raw").insert({
    kind,
    item_id: ids.itemId ?? null,
    account_id: ids.accountId ?? null,
    payload,
  });
  if (error) console.error("store failed", kind, error.message);
}

// Pluggy returns JSON on success and on most errors; keep the body either way so
// a failed call is still diagnosable without spending another request.
async function call(path: string, apiKey: string) {
  const res = await fetch(`${PLUGGY}${path}`, { headers: { "X-API-KEY": apiKey } });
  const text = await res.text();
  let body: unknown;
  try { body = JSON.parse(text); } catch { body = { raw: text.slice(0, 2000) }; }
  return { ok: res.ok, status: res.status, body };
}

Deno.serve(async (req) => {
  // This spends Pluggy calls and reports the connected items and accounts.
  // Supabase's verify_jwt accepts the anon key, and that key is hard-coded in the
  // bundle of a public static site, so it establishes nothing about the caller.
  // Same check as pluggy-connect-token: there has to be a real signed-in user
  // behind the key.
  const authHeader = req.headers.get("Authorization") ?? "";
  const caller = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user }, error: authError } = await caller.auth.getUser();
  if (authError || !user) return Response.json({ error: "not authenticated" }, { status: 401 });

  const clientId = Deno.env.get("PLUGGY_CLIENT_ID");
  const clientSecret = Deno.env.get("PLUGGY_CLIENT_SECRET");
  if (!clientId || !clientSecret) {
    return Response.json({ error: "PLUGGY_CLIENT_ID / PLUGGY_CLIENT_SECRET not set" }, { status: 500 });
  }

  // ── 1. Authenticate ──
  const authRes = await fetch(`${PLUGGY}/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clientId, clientSecret }),
  });
  const authBody = await authRes.json().catch(() => ({}));
  if (!authRes.ok || !authBody.apiKey) {
    await store("error", { step: "auth", status: authRes.status, body: authBody });
    return Response.json({ step: "auth", status: authRes.status, body: authBody }, { status: 502 });
  }
  const apiKey = authBody.apiKey as string;

  // ── 2. Items. Pluggy has no listing endpoint, so the ids come from our own
  // table, populated from Meu Pluggy's "Acesse seus dados via API" page. ──
  const { data: rows, error: rowsError } = await db.from("pluggy_items").select("item_id");
  if (rowsError) {
    await store("error", { step: "pluggy_items", message: rowsError.message });
    return Response.json({ step: "pluggy_items", error: rowsError.message }, { status: 500 });
  }
  if (!rows?.length) {
    return Response.json({
      ok: true,
      itemCount: 0,
      message: "No items recorded yet. Add your Meu Pluggy item ids in the app (Dados → Conexões Meu Pluggy).",
    });
  }

  const items: any[] = [];
  for (const { item_id } of rows) {
    const r = await call(`/items/${item_id}`, apiKey);
    await store(r.ok ? "items" : "error", r.body, { itemId: item_id });
    if (r.ok) items.push(r.body);
    else items.push({ id: item_id, error: r.body, status: `HTTP ${r.status}` });
  }

  // ── 3. Accounts per item ──
  const summary = [];
  for (const item of items) {
    const itemId = item.id;
    const r = await call(`/accounts?itemId=${itemId}`, apiKey);
    await store(r.ok ? "accounts" : "error", r.body, { itemId });

    const accounts = r.ok ? ((r.body as any).results ?? r.body ?? []) : [];
    summary.push({
      itemId,
      connector: item.connector?.name ?? item.connector?.id ?? null,
      status: item.status,
      executionStatus: item.executionStatus,
      lastUpdatedAt: item.lastUpdatedAt,
      // Which products this connection actually carries — this is what tells us
      // whether investments are available for Inter.
      products: item.products ?? item.connector?.products ?? null,
      accounts: (accounts as any[]).map((a) => ({
        id: a.id,
        type: a.type,
        subtype: a.subtype,
        name: a.name,
        currency: a.currencyCode,
        // balance intentionally omitted from the response body; it is stored raw
      })),
      accountCount: (accounts as any[]).length,
    });
  }

  return Response.json({
    ok: true,
    itemCount: items.length,
    items: summary,
    note: "No transactions were fetched. Raw responses stored in public.pluggy_raw.",
  });
});
