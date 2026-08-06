// Pulls transactions for every recorded item.
//
//   ?mode=probe (default)      — two pages, one account. Cheap; proves the cursor.
//   ?mode=probe&accountId=XYZ  — probe one specific account.
//   ?mode=full                 — 12 months, every account, every page. Spend once.
//
// The two modes exist because the 12-month historical search is capped at 4 per
// month per institution and is therefore effectively one-shot. Every page is
// written to pluggy_raw before anything reads it: if the parsing is wrong we fix
// the parser and re-read the table instead of paying again.

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

// Card descriptors are fixed-width: merchant, then city, then country.
// "PANIFICADORA BELA VIST CAMPINAS      BRA" -> "PANIFICADORA BELA VIST"
function guessMerchant(desc: string) {
  const head = desc.slice(0, 22).trim();
  return head.length >= 3 ? head.toUpperCase() : null;
}

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
  const guessed = new Map<string, number>();
  for (const tx of txs) {
    if (tx.merchant?.name) t.merchantName++;
    else if (tx.merchant?.businessName) t.merchantBusinessName++;
    else if (tx.paymentData?.receiver?.name || tx.paymentData?.payer?.name) t.pixCounterparty++;
    else {
      t.descriptionOnly++;
      const raw = String(tx.descriptionRaw ?? tx.description ?? "");
      if (unresolved.length < 40) unresolved.push(raw.slice(0, 60));
      const g = guessMerchant(raw);
      if (g) guessed.set(g, (guessed.get(g) ?? 0) + 1);
    }
    if (tx.merchant?.cnpj) t.cnpj++;
    if (tx.category) t.withCategory++;
    if (Number(tx.amount) > 0) t.credits++; else t.debits++;
  }
  const top = [...guessed.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25);
  return {
    ...t,
    unresolvedSamples: unresolved,
    distinctGuessedMerchants: guessed.size,
    topGuessedMerchants: top.map(([name, n]) => `${n}x ${name}`),
  };
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const mode = url.searchParams.get("mode") ?? "probe";
  const full = mode === "full";
  // Probe a specific account — the default picks the first per connection, which
  // is always a checking account, and cards are where the messy descriptors are.
  const onlyAccountId = url.searchParams.get("accountId");

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
    const targets = full
      ? accounts
      : onlyAccountId
        ? accounts.filter((a) => a.id === onlyAccountId)
        : accounts.slice(0, 1);

    for (const account of targets) {
      const pages: any[] = [];
      let pageCount = 0;
      // v2 only: /transactions was retired (410). v2 also validates strictly and
      // rejects from/to/pageSize, so send accountId alone and let the cursor
      // walk backwards through history — the window is enforced below, on dates
      // we read from the results rather than on parameters the API may not take.
      let path = `/v2/transactions?accountId=${account.id}`;

      // Bounded so a misread contract cannot loop away the rate limit.
      while (path && pageCount < (full ? 60 : 2)) {
        const r = await call(path, apiKey);
        pageCount++;
        await store(r.ok ? "transactions" : "error", r.body, { itemId: item_id, accountId: account.id });
        if (!r.ok) { pages.push({ error: r.body, status: r.status }); break; }

        const page = r.body;
        const batch: any[] = page.results ?? page.data ?? (Array.isArray(page) ? page : []);
        allTx.push(...batch);
        pages.push({ count: batch.length, next: page.next ?? null });

        // Only the full pull walks back to a date boundary; the probe just takes
        // two pages, which is enough to prove the cursor works.
        if (full) {
          const oldest = batch.reduce((min: string | null, tx: any) => {
            const d = String(tx.date ?? tx.createdAt ?? "").slice(0, 10);
            return d && (!min || d < min) ? d : min;
          }, null);
          if (oldest && oldest < isoDay(from)) break;
        }

        // `next` is a relative query string using `after`, e.g.
        // "?accountId=...&after=..." — append it to the v2 path as-is. Every
        // spelling I had guessed for a cursor field came back null; this is the
        // real one, confirmed from a probe response.
        const next = page.next ? String(page.next) : "";
        path = !next
          ? ""
          : next.startsWith("?")
            ? `/v2/transactions${next}`
            : next.startsWith("http")
              ? next.replace(PLUGGY, "")
              : `/v2/transactions?accountId=${account.id}&after=${encodeURIComponent(next)}`;
      }

      results.push({
        itemId: item_id,
        accountId: account.id,
        accountType: account.type,
        accountName: account.name,
        pagesFetched: pages.length,
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
    results,
    note: "Raw pages stored in public.pluggy_raw (kind='transactions').",
  });
});
