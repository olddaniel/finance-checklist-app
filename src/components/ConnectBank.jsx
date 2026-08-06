import { useState, useCallback } from "react";
import { PluggyConnect } from "react-pluggy-connect";
import { supabase, SUPABASE_URL } from "../lib/supabase";

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
      const body = await res.json();
      if (!res.ok) throw new Error(body.detail ?? body.error ?? "Falha ao obter token");

      setToken(body.accessToken);
    } catch (e) {
      setError(e.message);
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
          onError={(e) => { setToken(null); setError(e?.message ?? "Erro no Pluggy Connect"); }}
          onClose={() => setToken(null)}
        />
      )}
    </div>
  );
}
