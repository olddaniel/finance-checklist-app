import { useState, useCallback } from "react";
import { PluggyConnect } from "react-pluggy-connect";
import { supabase, SUPABASE_URL } from "../lib/supabase";

// Errors arrive in several shapes — a string, a nested object, an HTML page from
// a function that failed to boot. Render something readable for all of them
// rather than letting String(object) produce "[object Object]".
function describe(value) {
  if (value == null) return "erro desconhecido";
  if (typeof value === "string") return value;
  if (typeof value.detail === "string") return value.detail;
  if (typeof value.error === "string") return value.error;
  if (typeof value.message === "string") return value.message;
  try { return JSON.stringify(value).slice(0, 300); } catch { return String(value); }
}

// Opens Pluggy Connect and records whatever item it creates.
//
// Pluggy has no endpoint to list your items, so the id returned here is the only
// handle we will ever get for this connection — it is persisted before anything
// else happens.
export default function ConnectBank({ onConnected }) {
  const [token, setToken]   = useState(null);
  const [busy, setBusy]     = useState(false);
  const [error, setError]   = useState(null);

  const start = useCallback(async () => {
    setBusy(true); setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Sessão expirada. Entre novamente.");

      const res = await fetch(`${SUPABASE_URL}/functions/v1/pluggy-connect-token`, {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      // Read as text first: a function that fails to boot answers with HTML or a
      // plain string, and .json() would throw away the only useful diagnostic.
      const raw = await res.text();
      let body;
      try { body = JSON.parse(raw); } catch { body = { raw: raw.slice(0, 300) }; }

      if (!res.ok) throw new Error(`HTTP ${res.status} · ${describe(body)}`);
      if (!body.accessToken) throw new Error(`Sem accessToken na resposta · ${describe(body)}`);

      setToken(body.accessToken);
    } catch (e) {
      setError(typeof e?.message === "string" ? e.message : describe(e));
    } finally {
      setBusy(false);
    }
  }, []);

  async function handleSuccess(payload) {
    const item = payload?.item ?? payload;
    setToken(null);
    if (!item?.id) {
      setError("Conexão concluída, mas o Pluggy não devolveu um id de item.");
      return;
    }
    const { error: dbError } = await supabase.from("pluggy_items").upsert({
      item_id:        item.id,
      connector_id:   item.connector?.id ?? null,
      connector_name: item.connector?.name ?? null,
      status:         item.status ?? null,
    });
    if (dbError) setError(`Conectado, mas não foi possível salvar: ${dbError.message}`);
    else onConnected?.(item);
  }

  return (
    <div className="connect-bank">
      <button className="sheet-btn primary" onClick={start} disabled={busy} type="button">
        {busy ? "Abrindo..." : "Conectar banco"}
      </button>
      {error && <p className="sheet-error">{error}</p>}

      {token && (
        <PluggyConnect
          connectToken={token}
          includeSandbox={false}
          onSuccess={handleSuccess}
          onError={(e) => { setToken(null); setError(describe(e)); }}
          onClose={() => setToken(null)}
        />
      )}
    </div>
  );
}
