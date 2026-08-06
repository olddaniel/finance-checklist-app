// Pulls transactions for every recorded item.
//
// Two modes, because the 12-month historical search is capped at 4 per month per
// institution and is therefore effectively one-shot:
//
//   ?mode=probe (default) — last 7 days, one page, one account. Cheap, and it
//                           reveals the real response and pagination shape.
//   ?mode=full            — 12 months, every account, every page. Spend once.
//
// Every page is written to pluggy_raw before anything reads it. If the parsing
// is wrong we fix the parser and re-read the table instead of paying again.

import { createClient } from "jsr:@supabase/supabase-js@2";

const PLUGGY = "https://api.pluggy.ai";

const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

async function store(kind: string, payload: unknown, ids: { itemId?: string; accountId?: string } = {}) {
  const { error } = await db.from("pluggy_raw").insert({
    kind, item_id: ids.itemId ?? null, account_id: ids.accountId ?? null, payload,
  });
  if (error) console.error("store failed", kind, error.message);
}

async function call(path: string, apiKey: string) {
  const res = await fetch(`${PLUGGY}${path}`, { headers: { "X-API-KEY": apiKey } });
  const text = await res.text();
  let body: unknown;
  try { body = JSON.parse(text); } catch { body = { raw: text.slice(0, 2000) }; }
  return { ok: res.ok, status: res.status, body: body as any };
}

const isoDay = (d: Date) => d.toISOString().slice(0, 10);

// What fraction of transactions could get a clean merchant name, and from where.
// This is the number that decides whether categorisation can beat the current
// tool — measured on real data rather than assumed.
function tally(txs: any[]) {
  const t = {
    total: txs.length,
    merchantName: 0, merchantBusinessName: 0, cnpj: 0,
    pixCounterparty: 0, descriptionOnly: 0,
    withCategory: 0, credits: 0, debits: 0,
  };
  const unresolved: string[] = [];
  for (const tx of txs) {
    if (tx.merchant?.name) t.merchantName++;
    else if (tx.merchant?.businessName) t.merchantBusinessName++;
    else if (tx.paymentData?.receiver?.name || tx.paymentData?.payer?.name) t.pixCounterparty++;
    else {
      t.descriptionOnly++;
      if (unresolved.length < 40) unresolved.push(String(tx.descriptionRaw ?? tx.description ?? "").slice(0, 60));
    }
    if (tx.merchant?.cnpj) t.cnpj++;
    if (tx.category) t.withCategory++;
    if (Number(tx.amount) > 0) t.credits++; else t.debits++;
  }
  return { ...t, unresolvedSamples: unresolved };
}

Deno.serve(async (req) => {
  const mode = new URL(req.url).searchParams.get("mode") ?? "probe";
  const full = mode === "full";

  const clientId = Deno.env.get("PLUGGY_CLIENT_ID");
  const clientSecret = Deno.env.get("PLUGGY_CLIENT_SECRET");
  if (!clientId || !clientSecret) {
    return Response.json({ error: "PLUGGY_CLIENT_ID / PLUGGY_CLIENT_SECRET not set" }, { status: 500 });
  }

  const authRes = await fetch(`${PLUGGY}/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clientId, clientSecret }),
  });
  const authBody = await authRes.json().catch(() => ({}));
  if (!authBody.apiKey) return Response.json({ step: "auth", body: authBody }, { status: 502 });
  const apiKey = authBody.apiKey as string;

  const { data: rows } = await db.from("pluggy_items").select("item_id");
  if (!rows?.length) return Response.json({ error: "no items recorded" }, { status: 400 });

  const to = new Date();
  const from = new Date(to);
  if (full) from.setMonth(from.getMonth() - 12);
  else from.setDate(from.getDate() - 7);

  const results = [];
  const allTx: any[] = [];

  for (const { item_id } of rows) {
    const accRes = await call(`/accounts?itemId=${item_id}`, apiKey);
    const accounts: any[] = accRes.ok ? (accRes.body.results ?? accRes.body ?? []) : [];
    // In probe mode one account is enough to learn the contract
    const targets = full ? accounts : accounts.slice(0, 1);

    for (const account of targets) {
      const pages: any[] = [];
      let pageCount = 0;
      let path = `/transactions?accountId=${account.id}&from=${isoDay(from)}&to=${isoDay(to)}&pageSize=${full ? 500 : 20}`;

      // Follow whichever pagination style the API answers with. Bounded so a
      // misread contract cannot loop away the rate limit.
      while (path && pageCount < (full ? 60 : 1)) {
        const r = await call(path, apiKey);
        pageCount++;
        await store(r.ok ? "transactions" : "error", r.body, { itemId: item_id, accountId: account.id });
        if (!r.ok) { pages.push({ error: r.body, status: r.status }); break; }

        const page = r.body;
        const batch: any[] = page.results ?? page.data ?? (Array.isArray(page) ? page : []);
        allTx.push(...batch);
        pages.push({ count: batch.length, keys: Object.keys(page) });

        if (!full) break;
        const nextCursor = page.nextCursor ?? page.cursor ?? null;
        const hasMorePages = page.page && page.totalPages && page.page < page.totalPages;
        path = nextCursor
          ? `/transactions?accountId=${account.id}&from=${isoDay(from)}&to=${isoDay(to)}&pageSize=500&cursor=${nextCursor}`
          : hasMorePages
            ? `/transactions?accountId=${account.id}&from=${isoDay(from)}&to=${isoDay(to)}&pageSize=500&page=${page.page + 1}`
            : "";
      }

      results.push({
        itemId: item_id,
        accountId: account.id,
        accountType: account.type,
        accountName: account.name,
        pages,
      });
    }
  }

  return Response.json({
    ok: true,
    mode,
    window: { from: isoDay(from), to: isoDay(to) },
    accountsQueried: results.length,
    resolution: tally(allTx),
    // Probe mode returns one anonymised example so the field layout is visible
    // without putting a real amount in the response.
    sampleShape: !full && allTx[0] ? Object.keys(allTx[0]) : undefined,
    results,
    note: "Raw pages stored in public.pluggy_raw (kind='transactions').",
  });
});
