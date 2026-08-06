// Reads what has already been pulled and reports on it. Spends no Pluggy calls.
//
// The full pull is one-shot (4 historical calls per month per institution), and
// an edge function can time out halfway through eight accounts. But every page is
// written to pluggy_raw as it arrives, so the table — not the curl output — is the
// record of what we actually have. This reads it back and answers the two
// questions that matter:
//
//   1. Did the pull complete? Per account: how many transactions, and how far back.
//   2. How much categorisation work is there? Distinct merchants, and how much of
//      the volume the top ones cover — i.e. how many rules buy how much coverage.

import { createClient } from "jsr:@supabase/supabase-js@2";

const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

// Same fixed-width parse the pull uses: "PANIFICADORA BELA VIST CAMPINAS   BRA".
function guessMerchant(desc: string) {
  const head = desc.slice(0, 22).trim();
  return head.length >= 3 ? head.toUpperCase() : null;
}

// A transaction resolves to a merchant from one of four places, in descending
// order of trust. Which one it came from decides whether a rule is even needed.
function resolve(tx: any): { source: string; name: string | null } {
  if (tx.merchant?.name) return { source: "merchantName", name: String(tx.merchant.name).toUpperCase() };
  if (tx.merchant?.businessName) return { source: "merchantBusinessName", name: String(tx.merchant.businessName).toUpperCase() };
  const party = tx.paymentData?.receiver?.name ?? tx.paymentData?.payer?.name;
  if (party) return { source: "pixCounterparty", name: String(party).toUpperCase() };
  return { source: "descriptionOnly", name: guessMerchant(String(tx.descriptionRaw ?? tx.description ?? "")) };
}

type AccountStat = {
  accountId: string;
  itemId: string | null;
  pages: number;
  transactions: number;
  oldest: string | null;
  newest: string | null;
};

Deno.serve(async () => {
  const seen = new Set<string>();                    // transaction ids, so re-runs don't double-count
  const accounts = new Map<string, AccountStat>();
  const merchants = new Map<string, number>();
  const bySource: Record<string, number> = {
    merchantName: 0, merchantBusinessName: 0, pixCounterparty: 0, descriptionOnly: 0,
  };
  const categories = new Map<string, number>();
  let withCategory = 0, withCnpj = 0, unnamed = 0, total = 0;

  // Chunked so a year of eight accounts does not have to be one response.
  const CHUNK = 50;
  for (let offset = 0; ; offset += CHUNK) {
    const { data, error } = await db
      .from("pluggy_raw")
      .select("item_id, account_id, payload")
      .eq("kind", "transactions")
      .order("id")
      .range(offset, offset + CHUNK - 1);

    if (error) return Response.json({ step: "read pluggy_raw", error: error.message }, { status: 500 });
    if (!data?.length) break;

    for (const row of data) {
      const page = row.payload as any;
      const batch: any[] = page?.results ?? page?.data ?? (Array.isArray(page) ? page : []);

      const key = row.account_id ?? "unknown";
      const stat = accounts.get(key) ?? {
        accountId: key, itemId: row.item_id, pages: 0, transactions: 0, oldest: null, newest: null,
      };
      stat.pages++;
      accounts.set(key, stat);

      for (const tx of batch) {
        const id = String(tx.id ?? "");
        if (id && seen.has(id)) continue;
        if (id) seen.add(id);

        total++;
        stat.transactions++;

        const day = String(tx.date ?? tx.createdAt ?? "").slice(0, 10);
        if (day) {
          if (!stat.oldest || day < stat.oldest) stat.oldest = day;
          if (!stat.newest || day > stat.newest) stat.newest = day;
        }

        const { source, name } = resolve(tx);
        bySource[source] = (bySource[source] ?? 0) + 1;
        if (name) merchants.set(name, (merchants.get(name) ?? 0) + 1);
        else unnamed++;

        if (tx.merchant?.cnpj) withCnpj++;
        if (tx.category) {
          withCategory++;
          const c = String(tx.category);
          categories.set(c, (categories.get(c) ?? 0) + 1);
        }
      }
    }

    if (data.length < CHUNK) break;
  }

  const ranked = [...merchants.entries()].sort((a, b) => b[1] - a[1]);

  // How many rules buy how much coverage. This is the number that says whether
  // recategorisation converges or runs forever.
  const coverage: Record<string, string> = {};
  for (const n of [10, 25, 50, 100, 200]) {
    const rows = ranked.slice(0, n).reduce((s, [, c]) => s + c, 0);
    coverage[`top${n}`] = total ? `${rows} rows (${Math.round((rows / total) * 100)}%)` : "0";
  }

  return Response.json({
    ok: true,
    totals: {
      transactions: total,
      accounts: accounts.size,
      distinctMerchants: merchants.size,
      unnamed,
      withCategory,
      withCnpj,
    },
    resolvedFrom: bySource,
    coverage,
    accounts: [...accounts.values()].sort((a, b) => b.transactions - a.transactions),
    topMerchants: ranked.slice(0, 40).map(([name, n]) => `${n}x ${name}`),
    topCategories: [...categories.entries()]
      .sort((a, b) => b[1] - a[1]).slice(0, 25)
      .map(([name, n]) => `${n}x ${name}`),
  });
});
